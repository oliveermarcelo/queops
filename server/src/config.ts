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

import { existsSync } from 'node:fs';
import path from 'node:path';

function env(name: string, fallback = ''): string {
  const v = process.env[name];
  return v === undefined || v === '' ? fallback : v;
}

/**
 * Onde está a vitrine compilada, quando ninguém disse.
 *
 * Duas formas de rodar, e cada uma põe o front num lugar diferente:
 *   pacote de deploy  → public/   (o empacotar.mjs renomeia o dist para cá)
 *   projeto inteiro   → dist/     (é onde o Vite escreve)
 *
 * Errar isso dá uma página em branco sem nenhuma mensagem — o servidor sobe,
 * responde, e simplesmente não acha o index.html. Detectar em vez de exigir
 * PUBLIC_DIR elimina a pegadinha; quem quiser outra pasta ainda pode definir a
 * variável, que tem precedência.
 */
function detectPublicDir(): string {
  for (const pasta of ['public', 'dist']) {
    if (existsSync(path.join(process.cwd(), pasta, 'index.html'))) return pasta;
  }
  return 'public';
}

/**
 * Onde guardar conteúdo que NÃO pode morrer numa publicação.
 *
 * Esta função existe por causa de um prejuízo real: 1.398 fotos de produto
 * desapareceram de uma vez. A pasta era `midia/`, relativa ao diretório da
 * aplicação, e a hospedagem publica criando um diretório NOVO a cada versão
 * (`.../hbuilds/versions/<id>/nodejs/`) e descartando o anterior inteiro. O
 * banco continuava guardando `/midia/abc.png`, o arquivo não existia mais, e
 * cada produto ficava com um quadrado cinza. Subir a foto de novo resolvia até
 * a publicação seguinte.
 *
 * Depender de alguém lembrar de definir MIDIA_DIR não é correção: é a mesma
 * armadilha com um aviso em cima. Quando o caminho da aplicação tem a cara de
 * um diretório de versão, o padrão passa a ser uma pasta IRMÃ da raiz de
 * publicação — fora do alcance do deploy, e sem ninguém precisar configurar.
 *
 * Fora desse formato nada muda: continua relativo à aplicação, como sempre foi.
 */
export function pastaDuravel(nomeRelativo: string, nomeFora: string, cwd = process.cwd()): string {
  // Normaliza a barra: no Windows o caminho vem com '\\'.
  const caminho = cwd.replace(/\\/g, '/');
  const corte = caminho.indexOf('/hbuilds/versions/');
  /*
   * Fora desse formato, NADA muda: segue `midia/` relativo à aplicação, como
   * sempre foi. Mudar o padrão para todo mundo faria uma instalação que está
   * bem passar a procurar numa pasta vazia — trocar um sumiço por outro.
   */
  if (corte === -1) return nomeRelativo;
  return path.join(caminho.slice(0, corte), nomeFora);
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
  /**
   * Pasta das imagens enviadas pelo painel, servida em `/midia`.
   *
   * Fica FORA de `public/` de propósito. `public/` é a vitrine compilada, que
   * o deploy substitui inteira a cada publicação — foto de produto enviada à
   * mão lá dentro sumiria numa atualização de código, e ninguém ligaria uma
   * coisa à outra. Aqui é uma pasta só de conteúdo, que o deploy não toca.
   */
  midiaDir: string;
  /**
   * Pasta dos arquivos de nota fiscal (XML e DANFE), NUNCA servida estaticamente.
   *
   * A diferença para `midiaDir` é o motivo de existirem duas pastas: `midia/`
   * é servida em /midia porque foto de produto tem de aparecer para quem passa
   * na vitrine. O XML da NF-e traz CPF, nome e endereço do comprador — atrás
   * de uma URL pública seria vazamento de dado pessoal esperando um buscador
   * passar. Cada arquivo daqui sai por uma rota que confere quem está pedindo.
   */
  notasDir: string;
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
  publicDir: env('PUBLIC_DIR', '') || detectPublicDir(),
  midiaDir: env('MIDIA_DIR', '') || pastaDuravel('midia', 'queops_midia'),
  notasDir: env('NOTAS_DIR', '') || pastaDuravel('notas', 'queops_notas'),
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

/**
 * Problemas que NÃO impedem a loja de subir, mas custam caro em silêncio.
 *
 * Separado de `configProblems` de propósito: aquele derruba o processo, e
 * derrubar a loja porque as fotos vão sumir na próxima publicação trocaria um
 * prejuízo por outro maior. Estes são impressos no boot e ficam no log.
 */
export function configWarnings(): string[] {
  const avisos: string[] = [];

  const dentroDaVersao = (pasta: string): boolean =>
    /[/\\]hbuilds[/\\]versions[/\\]/.test(path.resolve(process.cwd(), pasta));

  for (const [nome, pasta] of [
    ['MIDIA_DIR', config.midiaDir],
    ['NOTAS_DIR', config.notasDir],
  ] as const) {
    if (!dentroDaVersao(pasta)) continue;
    avisos.push(
      `${nome} aponta para dentro do diretório de versão (${pasta}). `
      + 'A hospedagem descarta esse diretório inteiro a cada publicação, e tudo que '
      + 'estiver ali some junto — foi assim que 1.398 fotos de produto se perderam. '
      + 'Aponte para um caminho absoluto fora de hbuilds/.',
    );
  }

  return avisos;
}
