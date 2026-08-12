/**
 * Gera `api/seed/catalog.json` a partir de `src/data.ts`.
 *
 * O catálogo nasceu como um array TypeScript; o banco passa a ser a fonte da
 * verdade. Este script existe para a carga inicial (e para recarregar o
 * catálogo se um dia o arquivo voltar a ser editado à mão).
 *
 *   node --experimental-strip-types scripts/export-catalog.mjs
 *   # ou:  npx tsx scripts/export-catalog.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// Compila data.ts para um módulo ESM temporário e importa o resultado.
const bundled = await build({
  entryPoints: [resolve(root, 'src/data.ts')],
  bundle: true,
  format: 'esm',
  platform: 'neutral',
  write: false,
  loader: { '.ts': 'ts' },
});

const code = bundled.outputFiles[0].text;
const dataUrl = 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const mod = await import(dataUrl);

const { PRODUCTS, CATEGORIES, MENU_CATEGORIES } = mod;

const out = {
  products: PRODUCTS,
  categories: CATEGORIES.filter((c) => c.id !== 'all'),
  menu: MENU_CATEGORIES,
};

const target = resolve(root, 'api/seed/catalog.json');
mkdirSync(dirname(target), { recursive: true });
writeFileSync(target, JSON.stringify(out, null, 2), 'utf8');

console.log(
  `catalog.json gerado: ${out.products.length} produtos, ` +
    `${out.categories.length} categorias, ${out.menu.length} entradas de menu`,
);
