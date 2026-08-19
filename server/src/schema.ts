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
 * Acerta a estrutura do banco: só colunas e índices que faltam.
 *
 * Devolve quantos foram criados. Não cria tabela, não carrega catálogo, não
 * mexe em dado nenhum — é seguro rodar a cada subida do servidor.
 */
export async function sincronizarEstrutura(say: Log): Promise<{ colunas: number; indices: number }> {
  const sql = readFileSync(path.join(dbDir(), 'schema.sql'), 'utf8');
  const { noComments } = splitStatements(sql);
  const colunas = await addMissingColumns(noComments, say);
  const indices = await addMissingIndexes(say);
  return { colunas, indices };
}
