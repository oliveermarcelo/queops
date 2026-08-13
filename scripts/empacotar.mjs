/**
 * Monta a pasta `deploy/` pronta para subir no gerenciador de Node.js da
 * Hostinger.
 *
 *   npm run build && npm run build:server && npm run empacotar
 *
 * Resultado:
 *   deploy/app.js          → o servidor inteiro num arquivo (entrada da aplicação)
 *   deploy/migrate.js      → instalador do banco, rodado uma vez pelo SSH
 *   deploy/diagnostico.js  → checagem da instalação, para quando algo não sobe
 *   deploy/package.json    → só as 4 dependências de runtime, para o npm install
 *   deploy/public/         → a vitrine compilada (index.html, assets, imagens)
 *   deploy/db/             → schema.sql e catalog.json, usados pelo migrate
 *   deploy/.env.example    → modelo das variáveis de ambiente
 *
 * O `.env` de verdade NÃO vai no pacote: guarda a senha do banco e a chave de
 * cifra das integrações. Ele é criado no servidor (ou preenchido na interface
 * do hPanel) e nunca é versionado.
 */

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dist = resolve(root, 'dist');
const build = resolve(root, '.build');
const out = resolve(root, 'deploy');

if (!existsSync(dist)) {
  console.error('dist/ não existe. Rode `npm run build` antes.');
  process.exit(1);
}
if (!existsSync(resolve(build, 'app.js'))) {
  console.error('.build/app.js não existe. Rode `npm run build:server` antes.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

// ---- servidor ----
for (const f of ['app.js', 'migrate.js', 'diagnostico.js',
  'app.js.map', 'migrate.js.map', 'diagnostico.js.map']) {
  const src = resolve(build, f);
  if (existsSync(src)) cpSync(src, resolve(out, f));
}

// ---- vitrine ----
cpSync(dist, resolve(out, 'public'), { recursive: true });

// ---- assets do banco ----
cpSync(resolve(root, 'server/db'), resolve(out, 'db'), { recursive: true });

/*
 * package.json mínimo.
 *
 * As versões vêm do package.json da raiz, para não haver duas listas para
 * manter em sincronia. Só as dependências de RUNTIME entram: nada de React,
 * Vite ou TypeScript — o front já vem compilado em public/, e instalar o
 * ferramental de build no servidor só gastaria disco e tempo de deploy.
 */
const raiz = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const runtime = ['express', 'mysql2', 'bcryptjs', 'compression'];
const dependencies = {};
for (const nome of runtime.sort()) {
  const versao = raiz.dependencies?.[nome];
  if (!versao) {
    console.error(`Dependência "${nome}" não está no package.json da raiz.`);
    process.exit(1);
  }
  dependencies[nome] = versao;
}

writeFileSync(
  resolve(out, 'package.json'),
  JSON.stringify(
    {
      name: 'queops-piramides-server',
      version: raiz.version ?? '1.0.0',
      private: true,
      description: 'Loja Quéops Pirâmides — servidor Node/Express + MySQL (pacote de produção).',
      // Sem "type": "module" — o app.js gerado é CommonJS, que é o que o
      // Passenger da Hostinger carrega sem configuração extra.
      main: 'app.js',
      engines: { node: '>=20' },
      scripts: {
        start: 'node app.js',
        migrar: 'node migrate.js',
        diagnostico: 'node diagnostico.js',
      },
      dependencies,
    },
    null,
    2,
  ) + '\n',
);

cpSync(resolve(root, '.env.example'), resolve(out, '.env.example'));

console.log('deploy/ pronto.\n');
console.log('  1. hPanel → Bancos de Dados → crie o banco e o usuário MySQL');
console.log('  2. hPanel → Avançado → Node.js → crie a aplicação');
console.log('       Application root:         queops        (a pasta onde você vai subir isto)');
console.log('       Application startup file: app.js');
console.log('  3. Suba TODO o conteúdo de deploy/ para essa pasta');
console.log('  4. Preencha as variáveis de ambiente (veja .env.example)');
console.log('  5. Clique em "Run NPM Install" e depois em "Restart"');
console.log('  6. Pelo SSH, uma vez só:');
console.log('       node migrate.js --admin-email=voce@dominio.com.br --admin-pass=SenhaForte');
console.log('\n  Detalhes e solução de problemas: DEPLOY.md');
