/**
 * Instalador / migrador do banco.
 *
 *   npm run migrar -- --admin-email=voce@dominio.com.br --admin-pass='SenhaForte123' [--demo]
 *
 * Cria as tabelas (idempotente), carrega o catálogo de server/db/catalog.json,
 * grava as configurações padrão e cadastra o primeiro administrador.
 *
 * Rodar de novo é seguro: as tabelas usam CREATE TABLE IF NOT EXISTS, o
 * catálogo usa ON DUPLICATE KEY UPDATE e as configurações só são escritas se
 * ainda não existirem.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { hashPassword } from './auth.ts';
import { configProblems } from './config.ts';
import { closePool, q, transaction } from './db.ts';
import { round2 } from './http.ts';
import {
  configSet, DEFAULT_RECOVERY, DEFAULT_SETTINGS, DEFAULT_SHIPPING, INTEGRATION_IDS,
} from './store.ts';

/** Onde ficam schema.sql e catalog.json, tanto em dev quanto no pacote. */
function dbDir(): string {
  const candidatos = [
    path.resolve(process.cwd(), 'server/db'),
    path.resolve(process.cwd(), 'db'),
  ];
  for (const c of candidatos) {
    try {
      readFileSync(path.join(c, 'schema.sql'));
      return c;
    } catch {
      /* tenta o próximo */
    }
  }
  throw new Error(
    'schema.sql não encontrado. Rode a migração da raiz do projeto (onde está a pasta server/db ou db).',
  );
}

const say = (m: string): void => console.log(m);

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const arg of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]] = m[2] ?? '1';
  }
  return out;
}

/**
 * Divide o schema em comandos.
 *
 * Os comentários `--` são removidos ANTES de dividir no `;`: um bloco que
 * começa com "-- ..." continua sendo um CREATE TABLE válido logo abaixo, e
 * descartá-lo inteiro deixaria tabelas faltando (e chaves estrangeiras
 * quebradas). Foi exatamente esse o bug que sumiu com a tabela `customers` na
 * primeira instalação.
 */
function splitStatements(sql: string): { statements: string[]; noComments: string } {
  const noComments = sql.replace(/^[ \t]*--.*$/gm, '');
  const statements = noComments
    .split(';')
    .map((s) => s.trim())
    .filter((s) => s !== '');
  return { statements, noComments };
}

const TIPOS_SQL =
  'VARCHAR|VARBINARY|BINARY|CHAR|TINYTEXT|TEXT|MEDIUMTEXT|LONGTEXT|TINYINT|SMALLINT'
  + '|MEDIUMINT|BIGINT|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|DATETIME|TIMESTAMP|DATE|TIME'
  + '|YEAR|ENUM|SET|JSON|BLOB|MEDIUMBLOB|LONGBLOB|BOOLEAN|BOOL';

/**
 * `CREATE TABLE IF NOT EXISTS` cria tabelas novas, mas ignora colunas novas em
 * tabelas que já existem — um deploy futuro que adicionasse uma coluna falharia
 * em silêncio até alguém abrir a tela que a usa. Aqui comparamos o schema.sql
 * com o banco e emitimos os ALTER que faltarem.
 */
async function addMissingColumns(noComments: string): Promise<number> {
  let adicionadas = 0;
  const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\)\s*ENGINE=/g;

  for (const [, tabela, corpo] of noComments.matchAll(re)) {
    // Só conta como coluna a linha cujo segundo token é um tipo SQL. Índices,
    // chaves e a continuação de um FOREIGN KEY ("REFERENCES ...") ficam de fora
    // — sem isso, "REFERENCES" viraria uma coluna e o ALTER falharia.
    const declaradas = new Map<string, string>();
    for (const linhaBruta of corpo.split('\n')) {
      const linha = linhaBruta.trim();
      if (linha === '') continue;
      const m = new RegExp(`^\`?(\\w+)\`?\\s+((?:${TIPOS_SQL})\\b.*?),?$`, 'i').exec(linha);
      if (m) declaradas.set(m[1], m[2].trim().replace(/,$/, ''));
    }

    const existentes = (await q.all(`SHOW COLUMNS FROM \`${tabela}\``)).map((r) => String(r.Field));
    let anterior: string | null = null;
    for (const [coluna, definicao] of declaradas) {
      if (!existentes.includes(coluna)) {
        const posicao = anterior === null ? 'FIRST' : `AFTER \`${anterior}\``;
        await q.run(`ALTER TABLE \`${tabela}\` ADD COLUMN \`${coluna}\` ${definicao} ${posicao}`);
        say(`  + coluna ${tabela}.${coluna}`);
        adicionadas++;
      }
      anterior = coluna;
    }
  }
  return adicionadas;
}

/**
 * Índices que precisam existir além dos criados junto da tabela.
 *
 * O `addMissingColumns` acima resolve colunas novas, mas não índices: num banco
 * que já existe, o `CREATE TABLE IF NOT EXISTS` não roda e a chave nova nunca
 * apareceria. Como índice esquecido não quebra nada na hora — só deixa a
 * consulta lenta, ou permite a duplicata que ele deveria barrar —, o erro passa
 * despercebido até o dia em que dói.
 */
const INDICES: { tabela: string; nome: string; definicao: string }[] = [
  {
    tabela: 'orders',
    nome: 'uq_order_payment_ref',
    // Único: é por ele que o webhook do provedor encontra o pedido, e o mesmo
    // pagamento não pode acabar vinculado a dois pedidos diferentes.
    definicao: 'UNIQUE KEY uq_order_payment_ref (payment_ref)',
  },
];

async function addMissingIndexes(): Promise<number> {
  let criados = 0;
  for (const { tabela, nome, definicao } of INDICES) {
    const existe = await q.one(
      `SELECT 1 AS ok FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
        LIMIT 1`,
      [tabela, nome],
    );
    if (existe) continue;
    try {
      await q.run(`ALTER TABLE \`${tabela}\` ADD ${definicao}`);
      say(`  + índice ${tabela}.${nome}`);
      criados++;
    } catch (e) {
      // Duplicata pré-existente impede a chave única. Avisar é melhor do que
      // abortar a migração inteira por causa de um índice.
      const err = e as { code?: string; message?: string };
      say(`  ! não consegui criar ${tabela}.${nome}: ${err.code ?? ''} ${err.message ?? ''}`.trimEnd());
    }
  }
  return criados;
}

interface CatalogProduct {
  id: string;
  sku?: string;
  name: string;
  category?: string;
  subcategory?: string;
  categoryLabel?: string;
  description?: string;
  longDescription?: string;
  price?: number;
  oldPrice?: number;
  stock?: number;
  image?: string;
  tag?: string;
  weight?: string;
  ingredients?: string;
  highlight?: boolean;
}

interface Catalog {
  products?: CatalogProduct[];
  categories?: { id: string; description?: string }[];
  menu?: {
    id: string;
    name: string;
    icon?: string;
    featured?: boolean;
    subcategories?: { id: string; name: string }[];
  }[];
}

async function importCatalog(dir: string): Promise<void> {
  let catalog: Catalog;
  try {
    catalog = JSON.parse(readFileSync(path.join(dir, 'catalog.json'), 'utf8')) as Catalog;
  } catch {
    say('catalog.json ausente — pulei a carga do catálogo.');
    return;
  }

  const descriptions = new Map<string, string>();
  for (const c of catalog.categories ?? []) descriptions.set(c.id, c.description ?? '');

  let pos = 0;
  for (const m of catalog.menu ?? []) {
    await q.run(
      `INSERT INTO categories (id, name, description, icon, featured, position)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description),
          icon=VALUES(icon), featured=VALUES(featured), position=VALUES(position)`,
      [m.id, m.name, descriptions.get(m.id) ?? '', m.icon ?? '', m.featured ? 1 : 0, pos++],
    );
    let subPos = 0;
    for (const s of m.subcategories ?? []) {
      await q.run(
        `INSERT INTO subcategories (parent_id, id, name, position) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), position=VALUES(position)`,
        [m.id, s.id, s.name, subPos++],
      );
    }
  }
  say('Categorias importadas.');

  // Estoque inicial determinístico para a loja não nascer zerada.
  const defaultStock = [12, 8, 25, 4, 7, 18, 33, 6, 15, 9];
  let i = 0;
  for (const p of catalog.products ?? []) {
    await q.run(
      `INSERT INTO products (
          id, sku, name, category, subcategory, category_label, description, long_description,
          price, old_price, stock, image, tag, weight, ingredients,
          highlight, active, position
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)
       ON DUPLICATE KEY UPDATE
          sku=VALUES(sku), name=VALUES(name), category=VALUES(category),
          subcategory=VALUES(subcategory), category_label=VALUES(category_label),
          description=VALUES(description), long_description=VALUES(long_description),
          price=VALUES(price), old_price=VALUES(old_price), image=VALUES(image),
          tag=VALUES(tag), weight=VALUES(weight), ingredients=VALUES(ingredients),
          highlight=VALUES(highlight), position=VALUES(position)`,
      [
        p.id, p.sku ?? '', p.name, p.category ?? '', p.subcategory ?? null,
        p.categoryLabel ?? '', p.description ?? '', p.longDescription ?? null,
        p.price ?? 0, p.oldPrice ?? null,
        p.stock ?? defaultStock[i % defaultStock.length],
        p.image ?? '', p.tag ?? null, p.weight ?? '', p.ingredients ?? null,
        p.highlight ? 1 : 0, i,
      ],
    );
    i++;
  }
  say(`Produtos importados: ${i}.`);
}

/**
 * Histórico de exemplo — só roda com `--demo`.
 *
 * Serve para apresentar o dashboard com curva de faturamento antes de a loja
 * ter vendas reais. Numa loja em produção, NÃO use esta opção.
 */
async function seedDemoOrders(): Promise<void> {
  const existe = await q.one("SELECT COUNT(*) AS n FROM orders WHERE id LIKE 'QPD-%'");
  if (Number(existe?.n ?? 0) > 0) {
    say('Pedidos de demonstração já existem — nada a fazer.');
    return;
  }

  const products = await q.all(
    'SELECT id, name, price FROM products WHERE active = 1 ORDER BY position LIMIT 20',
  );
  if (products.length === 0) {
    say('Sem produtos: pule o --demo até importar o catálogo.');
    return;
  }

  const pool: [string, string][] = [
    ['Maria Oliveira', 'maria.oliveira@email.com'],
    ['João Santos', 'joao.santos@email.com'],
    ['Ana Costa', 'ana.costa@email.com'],
    ['Pedro Lima', 'pedro.lima@email.com'],
    ['Espaço Terapêutico Luz Interior', 'compras@luzinterior.com.br'],
    ['Carla Mendes', 'carla.mendes@email.com'],
    ['Loja Caminho de Cristal', 'contato@caminhodecristal.com.br'],
    ['Lucas Ferreira', 'lucas.ferreira@email.com'],
    ['Juliana Prado', 'juliana.prado@email.com'],
    ['Terapias Harmonia Zen', 'pedidos@harmoniazen.com.br'],
  ];
  const statuses = ['paid', 'shipped', 'delivered', 'delivered', 'delivered', 'pending', 'canceled'];
  const payments = ['card', 'pix', 'boleto'];
  const channels = ['site', 'whatsapp', 'erp'];

  // PRNG determinístico: rodar de novo gera exatamente os mesmos números.
  let seed = 20240601;
  const rng = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  /** DATETIME do MySQL, no fuso de São Paulo (que é o fuso da sessão). */
  const mysqlDate = (offsetMs: number): string =>
    new Date(Date.now() + offsetMs - 3 * 3_600_000).toISOString().slice(0, 19).replace('T', ' ');

  /** Mesma data, com hora e minuto trocados pelos sorteados. */
  const comHora = (offsetMs: number, hora: number, minuto: number): string =>
    `${mysqlDate(offsetMs).slice(0, 10)} ${String(hora).padStart(2, '0')}:${String(minuto).padStart(2, '0')}:00`;

  await transaction(async (tx) => {
    const customerIds = new Map<string, number>();
    for (const [name, mail] of pool) {
      const row = await tx.one('SELECT id FROM customers WHERE email = ?', [mail]);
      if (row) {
        customerIds.set(mail, Number(row.id));
      } else {
        await tx.run('INSERT INTO customers (name, email, phone) VALUES (?,?,?)', [name, mail, '11999990000']);
        customerIds.set(mail, tx.lastId());
      }
    }

    const count = 140;
    for (let n = 0; n < count; n++) {
      // Distribuição enviesada para os dias recentes (curva de crescimento).
      const daysAgo = Math.floor(rng() ** 1.6 * 180);
      const horas = Math.floor(rng() * 24);
      const minutos = Math.floor(rng() * 60);
      const quando = comHora(-daysAgo * 86_400_000, horas, minutos);

      const [name, mail] = pool[Math.floor(rng() * pool.length)];
      const orderId = 'QPD-' + String(1000 + n).padStart(6, '0');

      const items: [string, string, number, number][] = [];
      let subtotal = 0;
      const linhas = 1 + Math.floor(rng() * 3);
      for (let j = 0; j < linhas; j++) {
        const p = products[Math.floor(rng() * products.length)];
        const qty = 1 + Math.floor(rng() * 3);
        items.push([String(p.id), String(p.name), qty, Number(p.price)]);
        subtotal += qty * Number(p.price);
      }
      subtotal = round2(subtotal);
      const ship = subtotal >= 199 ? 0 : 19.9;

      await tx.run(
        `INSERT INTO orders (id, customer_id, customer_name, customer_email, customer_phone,
            subtotal, shipping_cost, discount, total, status, payment, channel, ship_state, created_at)
         VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?)`,
        [
          orderId, customerIds.get(mail), name, mail, '11999990000',
          subtotal, ship, round2(subtotal + ship),
          statuses[Math.floor(rng() * statuses.length)],
          payments[Math.floor(rng() * 3)],
          channels[Math.floor(rng() * 3)],
          'SP', quando,
        ],
      );
      for (const [pid, pname, qty, price] of items) {
        await tx.run(
          'INSERT INTO order_items (order_id, product_id, name, quantity, unit_price) VALUES (?,?,?,?,?)',
          [orderId, pid, pname, qty, price],
        );
      }
    }

    // Alguns carrinhos abandonados para a tela de recuperação.
    const samples: [string, string, string, number][] = [
      ['Fernanda Alves', '5511988887777', 'fernanda@email.com', 2],
      ['Ricardo Souza', '5511977776666', 'ricardo@email.com', 8],
      ['Loja Caminho de Cristal', '5511966665555', 'contato@caminhodecristal.com.br', 26],
      ['Juliana Prado', '5511955554444', 'juliana@email.com', 50],
    ];
    for (let k = 0; k < samples.length; k++) {
      const [nm, phone, mail, hours] = samples[k];
      const cartId = 'ACD-' + String(k + 1).padStart(4, '0');
      const p = products[k % products.length];
      const qty = (k % 2) + 1;
      await tx.run(
        `INSERT INTO abandoned_carts (id, customer_name, customer_email, customer_phone, total, abandoned_at)
         VALUES (?,?,?,?,?,?)`,
        [cartId, nm, mail, phone, round2(qty * Number(p.price)), mysqlDate(-hours * 3_600_000)],
      );
      await tx.run(
        'INSERT INTO abandoned_cart_items (cart_id, product_id, name, quantity, unit_price) VALUES (?,?,?,?,?)',
        [cartId, p.id, p.name, qty, Number(p.price)],
      );
    }
  });

  say('Histórico de demonstração criado: 140 pedidos e 4 carrinhos abandonados.');
}

async function main(): Promise<void> {
  const problemas = configProblems();
  if (problemas.length) {
    console.error('Configuração incompleta:');
    for (const p of problemas) console.error('  · ' + p);
    process.exit(1);
  }

  const opts = parseArgs(process.argv.slice(2));
  const dir = dbDir();

  // -------------------------------------------------------------- schema ----
  const sql = readFileSync(path.join(dir, 'schema.sql'), 'utf8');
  const { statements, noComments } = splitStatements(sql);
  for (const stmt of statements) {
    await q.run(stmt);
  }
  say(`Tabelas criadas/verificadas: ${statements.length} comandos.`);

  const adicionadas = await addMissingColumns(noComments);
  say(adicionadas === 0 ? 'Nenhuma coluna nova a adicionar.' : `Colunas adicionadas: ${adicionadas}.`);

  const indices = await addMissingIndexes();
  say(indices === 0 ? 'Nenhum índice novo a adicionar.' : `Índices adicionados: ${indices}.`);

  // ------------------------------------------------------------ catálogo ----
  await importCatalog(dir);

  // --------------------------------------------------------- configuração ----
  const padroes: [string, unknown][] = [
    ['settings', DEFAULT_SETTINGS],
    ['shipping', DEFAULT_SHIPPING],
    ['recovery', DEFAULT_RECOVERY],
  ];
  for (const [k, v] of padroes) {
    if ((await q.one('SELECT config_key FROM store_config WHERE config_key = ?', [k])) === null) {
      await configSet(k, v);
    }
  }
  for (const id of INTEGRATION_IDS) {
    await q.run('INSERT IGNORE INTO integrations (id, enabled) VALUES (?, 0)', [id]);
  }
  await q.run(
    `INSERT IGNORE INTO coupons (id, code, type, value, active, min_order) VALUES
      ('c1','BEMVINDO10','percent',10,1,100),
      ('c2','VOLTA10','percent',10,1,NULL)`,
  );
  say('Configurações e cupons padrão prontos.');

  // ---------------------------------------------------------- administrador ----
  const adminCount = Number((await q.one('SELECT COUNT(*) AS n FROM admin_users'))?.n ?? 0);
  const email = (opts['admin-email'] ?? '').trim();
  const pass = opts['admin-pass'] ?? '';

  if (email !== '' && pass !== '') {
    if (pass.length < 10) {
      say('ERRO: a senha do administrador precisa ter pelo menos 10 caracteres.');
      process.exitCode = 1;
      return;
    }
    await q.run(
      `INSERT INTO admin_users (name, email, password_hash) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), active = 1`,
      ['Administrador', email.toLowerCase(), await hashPassword(pass)],
    );
    say(`Administrador pronto: ${email}`);
  } else if (adminCount === 0) {
    say('AVISO: nenhum administrador cadastrado. Rode de novo com --admin-email e --admin-pass.');
  }

  // ------------------------------------------------- histórico de exemplo ----
  if (opts.demo) await seedDemoOrders();

  say('Migração concluída.');
}

main()
  .catch((e) => {
    console.error('[queops] falha na migração:', e);
    process.exitCode = 1;
  })
  .finally(() => {
    void closePool();
  });
