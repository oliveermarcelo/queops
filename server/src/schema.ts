/**
 * Estrutura do banco: o que dá para acertar sozinho, e o que não dá.
 *
 * Este módulo cuida só da parte ADITIVA da migração — criar coluna e índice que
 * o código espera e o banco não tem. Nada aqui apaga coluna, transforma dado ou
 * carrega catálogo: essas coisas moram no `migrate.ts`, que roda quando alguém
 * manda, porque exigem decisão.
 *
 * A separação existe porque as duas metades têm riscos opostos. Adicionar
 * coluna que falta é seguro e o custo de NÃO fazer é caro: uma atualização que
 * acrescenta coluna não quebra a subida — o servidor liga, a loja abre, o
 * catálogo aparece — e só falha no meio de um pagamento, para um cliente de
 * verdade. Foi o que aconteceu aqui: o checkout devolvia erro porque
 * `stock_restored` não existia, e a correção era um comando que ninguém tinha
 * rodado.
 *
 * Por isso o servidor chama `sincronizarEstrutura()` na subida (ver index.ts).
 * Para desligar, `AUTO_MIGRAR=false` no ambiente.
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { q } from './db.ts';

/** Onde ficam schema.sql e catalog.json, tanto em dev quanto no pacote. */
export function dbDir(): string {
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

/**
 * Divide o schema em comandos.
 *
 * Os comentários `--` são removidos ANTES de dividir no `;`: um bloco que
 * começa com "-- ..." continua sendo um CREATE TABLE válido logo abaixo, e
 * descartá-lo inteiro deixaria tabelas faltando (e chaves estrangeiras
 * quebradas). Foi exatamente esse o bug que sumiu com a tabela `customers` na
 * primeira instalação.
 */
export function splitStatements(sql: string): { statements: string[]; noComments: string } {
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

type Log = (m: string) => void;

/** Tabela que ainda não existe: quem cria é o `migrate.js`, não este módulo. */
function tabelaAusente(e: unknown): boolean {
  return (e as { code?: string })?.code === 'ER_NO_SUCH_TABLE';
}

/**
 * Cria as tabelas do schema.sql que ainda não existem.
 *
 * Faltava, e a falta era do mesmo tipo que motivou este módulo: adicionar uma
 * TABELA nova num deploy não quebra a subida — o servidor liga, a loja abre —
 * e só falha quando alguém usa a função que depende dela. Numa hospedagem que
 * publica por `git clone` e reinício, sem passo de migração, isso significa a
 * funcionalidade nova respondendo erro em produção enquanto o código dela está
 * lá, inteiro.
 *
 * `CREATE TABLE IF NOT EXISTS` é tão aditivo quanto `ADD COLUMN`: não toca em
 * tabela que já existe e não olha para os dados. A ordem do arquivo é
 * respeitada, que é o que mantém as chaves estrangeiras válidas.
 */
export async function createMissingTables(statements: string[], say: Log): Promise<number> {
  let criadas = 0;
  for (const stmt of statements) {
    const m = /^CREATE TABLE IF NOT EXISTS\s+`?(\w+)`?/i.exec(stmt.trim());
    if (!m) continue;
    const tabela = m[1];

    const existe = await q.one(
      `SELECT 1 AS ok FROM information_schema.tables
        WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
      [tabela],
    );
    if (existe !== null) continue;

    await q.run(stmt);
    say(`  + tabela ${tabela}`);
    criadas++;
  }
  return criadas;
}

/**
 * `CREATE TABLE IF NOT EXISTS` cria tabelas novas, mas ignora colunas novas em
 * tabelas que já existem — um deploy futuro que adicionasse uma coluna falharia
 * em silêncio até alguém abrir a tela que a usa. Aqui comparamos o schema.sql
 * com o banco e emitimos os ALTER que faltarem.
 */
export async function addMissingColumns(noComments: string, say: Log): Promise<number> {
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

    let existentes: string[];
    try {
      existentes = (await q.all(`SHOW COLUMNS FROM \`${tabela}\``)).map((r) => String(r.Field));
    } catch (e) {
      // Banco novo, ainda sem tabelas: não é trabalho deste módulo criá-las.
      if (tabelaAusente(e)) continue;
      throw e;
    }

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

export async function addMissingIndexes(say: Log): Promise<number> {
  let criados = 0;
  for (const { tabela, nome, definicao } of INDICES) {
    const existe = await q.one(
      `SELECT 1 AS ok FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
        LIMIT 1`,
      [tabela, nome],
    );
    if (existe !== null) continue;
    try {
      await q.run(`ALTER TABLE \`${tabela}\` ADD ${definicao}`);
      say(`  + índice ${tabela}.${nome}`);
      criados++;
    } catch (e) {
      if (tabelaAusente(e)) continue;
      /*
       * Índice único num banco que já tem duplicatas falha aqui. Avisar e
       * seguir: a loja funciona sem ele, e vale mais a migração terminar do que
       * abortar tudo por causa de um índice.
       */
      const err = e as { code?: string; message?: string };
      say(`  ! não consegui criar ${tabela}.${nome}: ${err.code ?? ''} ${err.message ?? ''}`.trimEnd());
    }
  }
  return criados;
}

/**
 * Colunas que precisam de um tipo MAIOR do que o banco antigo tem.
 *
 * Este módulo é aditivo por princípio, e mudar tipo de coluna não é aditivo —
 * então a lista é explícita, curta, e cada item só entra aqui se a conversão
 * não perde dado nenhum: um INT cabe inteiro num DECIMAL(10,3), e o MySQL faz
 * a conversão sem tocar nos valores.
 *
 * O que NÃO pode entrar nesta lista: encurtar VARCHAR, trocar para tipo de
 * família diferente, ou qualquer coisa que arredonde. Migração que perde dado
 * exige alguém olhando, e o lugar dela é o `migrate.ts`.
 */
const ALARGAMENTOS: { tabela: string; coluna: string; de: RegExp; para: string }[] = [
  {
    tabela: 'products',
    coluna: 'stock',
    // "int", "int(11)", "int unsigned" — versões diferentes do MySQL relatam
    // de formas diferentes, e todas significam a mesma coluna a converter.
    de: /^(int|integer|smallint|mediumint|bigint)\b/i,
    para: 'DECIMAL(10,3) NOT NULL DEFAULT 0',
  },
];

export async function widenColumns(say: Log): Promise<number> {
  let convertidas = 0;
  for (const { tabela, coluna, de, para } of ALARGAMENTOS) {
    let atual: string;
    try {
      const row = await q.one(
        `SELECT COLUMN_TYPE AS tipo FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [tabela, coluna],
      );
      // Coluna ainda não existe: o addMissingColumns cria já no tipo certo.
      if (row === null) continue;
      atual = String(row.tipo);
    } catch (e) {
      if (tabelaAusente(e)) continue;
      throw e;
    }

    if (!de.test(atual)) continue; // já está no tipo novo — nada a fazer

    try {
      await q.run(`ALTER TABLE \`${tabela}\` MODIFY COLUMN \`${coluna}\` ${para}`);
      say(`  ~ ${tabela}.${coluna}: ${atual} → ${para}`);
      convertidas++;
    } catch (e) {
      /*
       * Falhar aqui não pode impedir a loja de subir. Um saldo lido como
       * inteiro é menos ruim do que uma loja fora do ar — o efeito é o ERP
       * mandar 7,5 e a loja guardar 7, que é exatamente o problema que esta
       * conversão resolve, mas ele já era o comportamento de ontem.
       */
      const err = e as { code?: string; message?: string };
      say(`  ! não consegui converter ${tabela}.${coluna}: ${err.code ?? ''} ${err.message ?? ''}`.trimEnd());
    }
  }
  return convertidas;
}

/**
 * Acerta a estrutura do banco: colunas e índices que faltam, mais os
 * alargamentos de tipo listados acima.
 *
 * Devolve quantos foram criados. Não cria tabela, não carrega catálogo e não
 * apaga dado — é seguro rodar a cada subida do servidor.
 */
export async function sincronizarEstrutura(
  say: Log,
): Promise<{ tabelas: number; colunas: number; indices: number; convertidas: number }> {
  const sql = readFileSync(path.join(dbDir(), 'schema.sql'), 'utf8');
  const { statements, noComments } = splitStatements(sql);
  // Tabela primeiro: não adianta procurar coluna faltando numa tabela que
  // ainda não existe.
  const tabelas = await createMissingTables(statements, say);
  const colunas = await addMissingColumns(noComments, say);
  const indices = await addMissingIndexes(say);
  const convertidas = await widenColumns(say);
  return { tabelas, colunas, indices, convertidas };
}
