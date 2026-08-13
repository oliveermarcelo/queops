/**
 * Pool de conexões MySQL e os quatro helpers usados por todo o servidor.
 *
 * ATENÇÃO: toda consulta do projeto usa prepared statements com parâmetros
 * (`execute`, não `query`). Nenhuma entrada do usuário é concatenada em SQL.
 *
 * Duas escolhas de configuração importam para o comportamento bater com a
 * versão PHP:
 *
 *   dateStrings   — DATETIME volta como 'YYYY-MM-DD HH:MM:SS', igual ao PDO.
 *                   Sem isso, o driver criaria um Date interpretado no fuso do
 *                   processo, e a data do pedido mudaria de dia dependendo de
 *                   onde o servidor está.
 *   timezone      — a sessão MySQL roda em -03:00, então NOW() e CURDATE() são
 *                   a hora de São Paulo, como no `SET time_zone` do PHP.
 *   decimalNumbers— DECIMAL volta como número, não string.
 */

import mysql, { type Pool, type PoolConnection, type RowDataPacket, type ResultSetHeader } from 'mysql2/promise';

import { config } from './config.ts';
import { fail } from './errors.ts';

export type Row = Record<string, any>;

/** Contrato comum ao pool e a uma conexão dentro de transação. */
export interface Q {
  all(sql: string, params?: unknown[]): Promise<Row[]>;
  one(sql: string, params?: unknown[]): Promise<Row | null>;
  run(sql: string, params?: unknown[]): Promise<number>;
  /** id gerado pelo último INSERT nesta conexão. */
  lastId(): number;
}

let pool: Pool | null = null;

export function getPool(): Pool {
  if (pool) return pool;
  pool = mysql.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: 'utf8mb4',
    timezone: '-03:00',
    dateStrings: true,
    decimalNumbers: true,
    waitForConnections: true,
    // A Hostinger limita conexões simultâneas por usuário de banco; 10 é
    // folgado para uma loja e continua longe do teto do plano.
    connectionLimit: Number(process.env.DB_POOL ?? 10) || 10,
    maxIdle: 4,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    namedPlaceholders: false,
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}

/** Traduz falhas de conexão na mesma resposta 503 que o PHP devolvia. */
function rethrow(e: unknown): never {
  const err = e as { code?: string; message?: string };
  const conexao = [
    'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', 'EHOSTUNREACH', 'ER_ACCESS_DENIED_ERROR',
    'ER_BAD_DB_ERROR', 'ER_DBACCESS_DENIED_ERROR', 'PROTOCOL_CONNECTION_LOST',
  ];
  if (err.code && conexao.includes(err.code)) {
    console.error('[queops] falha ao conectar no MySQL:', err.code, err.message);
    fail('Não foi possível conectar ao banco de dados.', 503, 'db_unavailable', e);
  }
  throw e;
}

function wrap(exec: (sql: string, params: unknown[]) => Promise<[any, any]>, lastIdRef: { value: number }): Q {
  return {
    async all(sql, params = []) {
      try {
        const [rows] = await exec(sql, params);
        return rows as Row[];
      } catch (e) {
        rethrow(e);
      }
    },
    async one(sql, params = []) {
      const rows = await this.all(sql, params);
      return rows.length ? rows[0] : null;
    },
    async run(sql, params = []) {
      try {
        const [res] = await exec(sql, params);
        const header = res as ResultSetHeader;
        if (header.insertId) lastIdRef.value = Number(header.insertId);
        return Number(header.affectedRows ?? 0);
      } catch (e) {
        rethrow(e);
      }
    },
    lastId() {
      return lastIdRef.value;
    },
  };
}

/**
 * Helpers sobre o pool. Cada chamada pode pegar uma conexão diferente, então
 * `lastId()` aqui não é confiável — quem precisa do id gerado usa `transaction`
 * ou lê de volta pelo campo único.
 */
const poolRef = { value: 0 };
export const q: Q = wrap(
  (sql, params) => getPool().execute(sql, params as any[]) as Promise<[any, any]>,
  poolRef,
);

/**
 * Executa um bloco em transação, numa única conexão.
 *
 * Qualquer exceção lançada dentro do bloco desfaz tudo — é assim que a criação
 * de pedido garante que estoque, cupom e itens só valem se o pedido inteiro
 * couber (mesma garantia do beginTransaction/rollBack do PDO).
 */
export async function transaction<T>(fn: (tx: Q, conn: PoolConnection) => Promise<T>): Promise<T> {
  let conn: PoolConnection;
  try {
    conn = await getPool().getConnection();
  } catch (e) {
    rethrow(e);
  }
  const ref = { value: 0 };
  const tx = wrap((sql, params) => conn.execute(sql, params as any[]) as Promise<[any, any]>, ref);
  try {
    await conn.beginTransaction();
    const out = await fn(tx, conn);
    await conn.commit();
    return out;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* conexão já perdida: o servidor desfaz sozinho */
    }
    throw e;
  } finally {
    conn.release();
  }
}

/**
 * Próximo valor de um contador, de forma atômica.
 *
 * Recebe o executor para poder participar da transação do pedido: se a
 * transação for desfeita, o número consumido também volta atrás.
 */
export async function nextCounter(exec: Q, name: string): Promise<number> {
  await exec.run(
    `INSERT INTO counters (name, value) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE value = value + 1`,
    [name],
  );
  const row = await exec.one('SELECT value FROM counters WHERE name = ?', [name]);
  return Number(row?.value ?? 1);
}

/** Monta `?,?,?` para cláusulas IN — sempre com parâmetros, nunca com valores. */
export function placeholders(n: number): string {
  return new Array(n).fill('?').join(',');
}

export type { RowDataPacket, PoolConnection };
