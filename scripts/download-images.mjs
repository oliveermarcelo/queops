/**
 * Baixa as imagens do catálogo para `public/produtos/` e reescreve as URLs em
 * `src/data.ts` e `server/db/catalog.json` para caminhos locais.
 *
 * Motivo: apontar para o site do cliente deixa a loja refém dele — se aquele
 * WordPress cair, a vitrine fica sem foto. Servindo do próprio domínio a
 * página também fica mais rápida (mesma conexão, cache com hash).
 *
 *   node scripts/download-images.mjs
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const outDir = resolve(root, 'public/produtos');
mkdirSync(outDir, { recursive: true });

/** Nome de arquivo estável e previsível a partir do produto + URL. */
function fileNameFor(product, url) {
  const ext = (extname(new URL(url).pathname) || '.jpg').toLowerCase();
  const slug = String(product.id)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .toLowerCase()
    .slice(0, 60);
  const short = createHash('sha1').update(url).digest('hex').slice(0, 6);
  return `${slug}-${short}${ext}`;
}

const catalogPath = resolve(root, 'server/db/catalog.json');
const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));

const mapping = new Map(); // url original -> caminho local
let downloaded = 0;
let reused = 0;
let failed = [];

for (const product of catalog.products) {
  const url = product.image;
  if (!url || !/^https?:\/\//i.test(url)) continue;
  if (mapping.has(url)) continue;

  const name = fileNameFor(product, url);
  const target = resolve(outDir, name);

  if (existsSync(target)) {
    mapping.set(url, `/produtos/${name}`);
    reused++;
    continue;
  }

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'queops-catalog-sync/1.0' },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length < 100) throw new Error('arquivo vazio');
    writeFileSync(target, buf);
    mapping.set(url, `/produtos/${name}`);
    downloaded++;
    process.stdout.write('.');
  } catch (err) {
    failed.push(`${product.id}: ${err.message}`);
    process.stdout.write('x');
  }
}
process.stdout.write('\n');

// ---- Reescreve o catálogo e o data.ts -------------------------------------
for (const product of catalog.products) {
  const local = mapping.get(product.image);
  if (local) product.image = local;
}
writeFileSync(catalogPath, JSON.stringify(catalog, null, 2), 'utf8');

const dataPath = resolve(root, 'src/data.ts');
let data = readFileSync(dataPath, 'utf8');
for (const [remote, local] of mapping) {
  data = data.split(remote).join(local);
}
writeFileSync(dataPath, data, 'utf8');

// ---- Imagens editoriais (banners da home e capas de categoria) ------------
const bannersDir = resolve(root, 'public/banners');
mkdirSync(bannersDir, { recursive: true });

const bannerSources = JSON.parse(
  readFileSync(resolve(here, 'banner-sources.json'), 'utf8'),
).arquivos;

for (const [name, url] of Object.entries(bannerSources)) {
  const target = resolve(bannersDir, name);
  if (existsSync(target)) {
    reused++;
    continue;
  }
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'queops-catalog-sync/1.0' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    downloaded++;
    process.stdout.write('.');
  } catch (err) {
    failed.push(`banner ${name}: ${err.message}`);
    process.stdout.write('x');
  }
}
process.stdout.write('\n');

console.log(`baixadas: ${downloaded} | já existiam: ${reused} | falhas: ${failed.length}`);
if (failed.length) {
  console.log(failed.join('\n'));
  console.log(
    '\nDica: imagens que falharem podem ser colocadas à mão em public/produtos/ ou public/banners/.',
  );
}
