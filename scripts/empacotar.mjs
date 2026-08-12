/**
 * Monta a pasta `deploy/` pronta para subir na Hostinger.
 *
 *   npm run build && npm run empacotar
 *
 * Resultado:
 *   deploy/            → conteúdo do dist/ (index.html, assets, imagens, .htaccess)
 *   deploy/api/        → a API PHP, SEM o config.php local e SEM o migrate.php
 *
 * O `config.php` fica de fora de propósito: ele guarda a senha do banco e deve
 * ser criado direto no servidor a partir do `config.example.php`.
 */

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const dist = resolve(root, 'dist');
const out = resolve(root, 'deploy');

if (!existsSync(dist)) {
  console.error('dist/ não existe. Rode `npm run build` antes.');
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(dist, out, { recursive: true });

const apiOut = resolve(out, 'api');
cpSync(resolve(root, 'api'), apiOut, {
  recursive: true,
  filter: (src) => !/[/\\](config\.php|migrate\.php)$/.test(src),
});

console.log('deploy/ pronto.');
console.log('  1. Suba TODO o conteúdo de deploy/ para public_html/');
console.log('  2. Crie public_html/api/config.php a partir de config.example.php');
console.log('  3. Rode as migrações (veja DEPLOY.md)');
