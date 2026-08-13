/**
 * Configuração do servidor — lida do ambiente.
 *
 * Na Hostinger, as variáveis são cadastradas em hPanel → Avançado → Node.js,
 * na seção "Environment variables" da aplicação. Localmente, um arquivo `.env`
 * na raiz do projeto é carregado por `--env-file=.env` (ver package.json).
 *
 * Nada aqui tem valor-padrão de segredo: sem APP_KEY o servidor recusa subir,
 * em vez de rodar com uma chave previsível.
 */

// Precisa ser o primeiro import: popula process.env a partir do .env, se houver.
import './env.ts';

function env(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

function envBool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
}

export interface AppConfig {
  env: 'production' | 'development';
  isProd: boolean;
  port: number;
  host: string;
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
  };
  /** Chave de 32 bytes em base64 — cifra as credenciais das integrações. */
  appKey: string;
  appUrl: string;
  secureCookies: boolean;
  /** Pasta com o front-end compilado (index.html + assets). */
  publicDir: string;
  /** Confia em X-Forwarded-* (Passenger/nginx na Hostinger sempre põe). */
  trustProxy: boolean;
}

export const config: AppConfig = {
  env: env('APP_ENV', 'production') === 'development' ? 'development' : 'production',
  get isProd() {
    return this.env === 'production';
  },
  port: Number(env('PORT', '3000')) || 3000,
  host: env('HOST', '0.0.0.0'),
  db: {
    host: env('DB_HOST', 'localhost'),
    port: Number(env('DB_PORT', '3306')) || 3306,
    database: env('DB_NAME'),
    user: env('DB_USER'),
    password: env('DB_PASS'),
  },
  appKey: env('APP_KEY'),
  appUrl: env('APP_URL', 'https://queopspiramides.com.br'),
  secureCookies: envBool('SECURE_COOKIES', true),
  publicDir: env('PUBLIC_DIR', 'public'),
  trustProxy: envBool('TRUST_PROXY', true),
} as AppConfig;

/**
 * Falhas de configuração que impedem a loja de funcionar.
 *
 * Devolve uma lista de problemas em vez de lançar: o `index.ts` imprime todos
 * de uma vez, para quem está instalando não descobrir um erro por reinício.
 */
export function configProblems(): string[] {
  const p: string[] = [];
  if (!config.db.database) p.push('DB_NAME não definido.');
  if (!config.db.user) p.push('DB_USER não definido.');
  if (!config.db.password) p.push('DB_PASS não definido.');
  if (!config.appKey) {
    p.push('APP_KEY não definida. Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  } else {
    const raw = Buffer.from(config.appKey, 'base64');
    if (raw.length !== 32) p.push('APP_KEY inválida: precisa ser 32 bytes em base64.');
  }
  return p;
}
