/**
 * Gera `public/sitemap.xml` a partir do catálogo do banco.
 *
 *   npm run gerar:sitemap                      # usa a API local
 *   SITE_URL=https://queopspiramides.com.br \
 *   API_URL=https://queopspiramides.com.br/api npm run gerar:sitemap
 */

import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const SITE = (process.env.SITE_URL ?? 'https://queopspiramides.com.br').replace(/\/+$/, '');
const API = (process.env.API_URL ?? 'http://127.0.0.1:8080/api').replace(/\/+$/, '');

const escape = (s) =>
  String(s).replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

let catalog;
try {
  const res = await fetch(`${API}/catalog`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  catalog = await res.json();
} catch (err) {
  console.error(`Não foi possível ler ${API}/catalog: ${err.message}`);
  console.error('Suba a API (npm run dev:api) ou informe API_URL.');
  process.exit(1);
}

const today = new Date().toISOString().slice(0, 10);

const urls = [
  { loc: `${SITE}/`, priority: '1.0', changefreq: 'weekly' },
  ...catalog.menu.map((c) => ({
    loc: `${SITE}/?categoria=${encodeURIComponent(c.id)}`,
    priority: '0.7',
    changefreq: 'weekly',
  })),
  ...catalog.products.map((p) => ({
    loc: `${SITE}/?produto=${encodeURIComponent(p.id)}`,
    priority: '0.6',
    changefreq: 'monthly',
  })),
];

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls.map(
    (u) =>
      `  <url>\n    <loc>${escape(u.loc)}</loc>\n    <lastmod>${today}</lastmod>\n` +
      `    <changefreq>${u.changefreq}</changefreq>\n    <priority>${u.priority}</priority>\n  </url>`,
  ),
  '</urlset>',
  '',
].join('\n');

writeFileSync(resolve(root, 'public/sitemap.xml'), xml, 'utf8');
console.log(`sitemap.xml gerado com ${urls.length} URLs.`);
