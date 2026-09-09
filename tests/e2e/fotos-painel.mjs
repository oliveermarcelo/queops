/**
 * Enviar foto pelo painel, no navegador de verdade.
 *
 * O teste HTTP prova que a rota grava o arquivo. Só o navegador prova o
 * caminho inteiro que o defeito original percorria: escolher o arquivo, o
 * painel transformar em bytes, subir, receber a URL, e o produto salvar com
 * ELA — e não com a data URL de dezenas de milhares de caracteres que a coluna
 * cortava em silêncio.
 *
 *   node tests/e2e/fotos-painel.mjs
 */

import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@queopspiramides.com.br';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'DemoQueops2026!';

const log = [];
const ok = (m) => log.push('  OK  ' + m);
const fail = (m) => log.push('FALHA ' + m);

/** PNG 1x1 de verdade — o servidor valida o formato, não dá para inventar. */
function png(semente) {
  const crc = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const soma = Buffer.alloc(4);
    soma.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, soma]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0);
  ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(Buffer.from([0, semente & 0xff, 90, 40]))),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const pasta = mkdtempSync(path.join(tmpdir(), 'fotos-'));
const arquivos = [1, 2].map((n) => {
  const arquivo = path.join(pasta, `foto-${n}.png`);
  writeFileSync(arquivo, png(Date.now() + n));
  return arquivo;
});

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext().then((c) => c.newPage());
const erros = [];
page.on('pageerror', (e) => erros.push(String(e)));

await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
await page.fill('#admin-email', ADMIN_EMAIL);
await page.fill('#admin-pass', ADMIN_PASS);
await page.click('button[type=submit]');
await page.waitForTimeout(2500);

await page.click('button:has-text("Produtos")');
await page.waitForTimeout(1200);
await page.click('button:has-text("Novo produto")');
await page.waitForSelector('form', { timeout: 10000 });

const nome = `Produto com fotos ${Date.now()}`;
await page.locator('form input').first().fill(nome);

// Categoria: a primeira de verdade (a primeira opção é "sem categoria").
const seletor = page.locator('form select').first();
const valores = await seletor.locator('option').evaluateAll((os) => os.map((o) => o.value));
const categoria = valores.find((v) => v !== '');
await seletor.selectOption(categoria);
ok(`categoria escolhida: ${categoria}`);

await page.locator('form input[type=file]').setInputFiles(arquivos);
await page.waitForTimeout(3000);

const miniaturas = await page.locator('form img').count();
miniaturas === 2 ? ok('as duas fotos aparecem no formulário') : fail(`miniaturas: ${miniaturas}`);

const temCapa = await page.locator('form span:has-text("CAPA")').count();
temCapa === 1 ? ok('a primeira é marcada como CAPA') : fail('faltou a marca de capa');

await page.locator('form button[type=submit]').click();
await page.waitForTimeout(3000);

/*
 * A verificação que fecha o defeito: o que ficou gravado é URL curta.
 *
 * Antes, aqui estaria uma data URL truncada em 500 caracteres — salva com 200
 * e invisível na loja.
 */
const gravado = await page.evaluate(async (n) => {
  const r = await fetch('/api/admin/state', { headers: { Accept: 'application/json' } });
  const s = await r.json();
  return (s.products ?? []).find((p) => p.name === n) ?? null;
}, nome);

if (gravado === null) {
  fail('o produto não foi salvo');
} else {
  /^\/midia\/[0-9a-f]{24}\.png$/.test(String(gravado.image))
    ? ok(`a capa foi salva como URL curta: ${gravado.image}`)
    : fail(`capa gravada errada: ${String(gravado.image).slice(0, 80)}`);

  !String(gravado.image).startsWith('data:')
    ? ok('e não como data URL, que a coluna truncava')
    : fail('a capa voltou a ser data URL');

  (gravado.images ?? []).length === 1
    ? ok('a segunda foto ficou na galeria')
    : fail(`galeria: ${JSON.stringify(gravado.images)}`);

  const foto = await page.evaluate(async (u) => {
    const r = await fetch(u);
    return { status: r.status, bytes: (await r.arrayBuffer()).byteLength };
  }, gravado.image);
  foto.status === 200 && foto.bytes > 0
    ? ok(`o arquivo é servido pela loja (${foto.bytes} bytes)`)
    : fail(`a imagem não é servida: ${JSON.stringify(foto)}`);

  // Limpeza: sai da vitrine e some do banco (nunca foi vendido).
  await page.evaluate(async (id) => {
    const s = await (await fetch('/api/session')).json();
    const h = { 'X-CSRF-Token': s.csrfToken };
    await fetch(`/api/admin/products/${id}`, { method: 'DELETE', headers: h });
    await fetch(`/api/admin/products/${id}?definitivo=1`, { method: 'DELETE', headers: h });
  }, gravado.id);
}

await browser.close();
console.log(log.join('\n'));
console.log('\nErros de página:', erros.length ? erros.slice(0, 3).join(' | ') : 'nenhum');
const falhas = log.filter((l) => l.startsWith('FALHA')).length;
console.log(falhas ? `\n${falhas} verificação(ões) falharam` : '\nTodas as verificações passaram');
process.exit(falhas ? 1 : 0);
