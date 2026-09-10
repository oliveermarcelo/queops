/**
 * Gera `public/sitemap.xml` a partir do catálogo do banco.
 *
 *   npm run gerar:sitemap                      # usa a API local
 *   SITE_URL=https://queopspiramides.com.br \
 *   API_URL=https://queopspiramides.com.br/api npm run gerar:sitemap
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
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

/*
 * Documentos legais.
 *
 * A lista é lida de `src/legal.ts` em vez de repetida aqui: quando a loja
 * publicar a política de privacidade e os termos de uso, eles entram no
 * sitemap sozinhos. Sitemap mantido à mão é sitemap que fica desatualizado.
 *
 * A leitura é por texto porque este script roda em Node puro, sem o
 * compilador de TypeScript da vitrine.
 */
const legal = [...readFileSync(join(here, '../src/legal.ts'), 'utf8')
  .matchAll(/slug:\s*'([^']+)'/g)].map((m) => m[1]);

const urls = [
  { loc: `${SITE}/`, priority: '1.0', changefreq: 'weekly' },
  ...legal.map((slug) => ({
    loc: `${SITE}/${slug}`,
    priority: '0.3',
    changefreq: 'yearly',
  })),
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
