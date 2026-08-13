/**
 * Compila o servidor TypeScript em um único arquivo JS.
 *
 *   node scripts/build-server.mjs
 *
 * Saída: `.build/app.js` e `.build/migrate.js` — CommonJS, porque é o formato
 * que o Passenger da Hostinger carrega sem exigir "type": "module" no
 * package.json do pacote.
 *
 * As dependências (express, mysql2, bcryptjs, compression) ficam EXTERNAS de
 * propósito: o `mysql2` carrega plugins de autenticação por require dinâmico, e
 * empacotá-lo dentro do bundle quebra em runtime, com erro que só aparece na
 * hora de conectar. Elas entram no pacote como `dependencies` normais, e o
 * gerenciador de Node do hPanel roda `npm install`.
 */

import { rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const out = resolve(root, '.build');

rmSync(out, { recursive: true, force: true });

await build({
  entryPoints: {
    app: resolve(root, 'server/src/index.ts'),
    migrate: resolve(root, 'server/src/migrate.ts'),
  },
  outdir: out,
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  packages: 'external',
  sourcemap: true,
  logLevel: 'info',
  // Mantém os nomes das funções nos rastros de pilha do log de erro.
  keepNames: true,
});

/*
 * O package.json da raiz tem "type": "module", o que faria o Node tratar
 * .build/app.js como ESM e falhar no primeiro `require`. Este package.json
 * local marca a pasta como CommonJS — assim o arquivo de entrada continua se
 * chamando `app.js`, que é o nome que o gerenciador de Node do hPanel espera.
 */
writeFileSync(resolve(out, 'package.json'), JSON.stringify({ type: 'commonjs' }, null, 2) + '\n');

console.log('servidor compilado em .build/ (app.js + migrate.js)');
