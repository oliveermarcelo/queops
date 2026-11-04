/**
 * Salvar o produto COM A FOTO AINDA SUBINDO.
 *
 * A reclamação: "faz upload e a imagem não aparece no produto; se exclui e
 * sobe a mesma imagem de novo, aí aparece — em alguns casos".
 *
 * A causa é uma corrida. O envio da foto é assíncrono e o formulário não sabia
 * disso: dava para clicar em Salvar antes de a URL chegar, o produto gravava
 * sem a imagem, e a resposta do servidor chegava para um formulário já
 * fechado. Repetir funcionava porque o nome do arquivo é o hash do conteúdo —
 * na segunda vez o arquivo já está no disco, o servidor responde em
 * milissegundos e não dá tempo de perder a corrida. Daí o "em alguns casos":
 * depende do tamanho do arquivo e da conexão.
 *
 * Este teste atrasa a resposta do upload de propósito e tenta salvar no meio.
 *
 *   node tests/e2e/foto-salvar-cedo.mjs
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

/** PNG 1x1 de verdade — o servidor valida o formato. */
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
    const crcBuf = Buffer.alloc(4);
    crcBuf.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, crcBuf]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  const bruto = Buffer.from([0, semente & 0xff, (semente >> 8) & 0xff, (semente >> 16) & 0xff]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(bruto)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const pasta = mkdtempSync(path.join(tmpdir(), 'foto-corrida-'));
const arquivo = path.join(pasta, 'foto.png');
writeFileSync(arquivo, png(Date.now()));

const browser = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--disable-background-networking', '--no-sandbox'],
});
const page = await browser.newContext().then((c) => c.newPage());
page.setDefaultTimeout(15000);

/*
 * O upload passa a demorar 4 segundos.
 *
 * É o que acontece de verdade com uma foto de 2 MB numa conexão ruim — e é a
 * janela em que a pessoa clica em Salvar achando que já acabou.
 */
await page.route('**/api/admin/midia', async (rota) => {
  await new Promise((r) => setTimeout(r, 4000));
  await rota.continue();
});

await page.goto(BASE + '/admin', { waitUntil: 'domcontentloaded' });
await page.fill('#admin-email', ADMIN_EMAIL);
await page.fill('#admin-pass', ADMIN_PASS);
await page.click('button[type=submit]');
await page.waitForTimeout(2500);

await page.click('button:has-text("Produtos")');
await page.waitForTimeout(1200);
await page.click('button:has-text("Novo produto")');
await page.waitForSelector('form');

const nome = `Produto corrida ${Date.now()}`;
await page.locator('form input').first().fill(nome);
const seletor = page.locator('form select').first();
const valores = await seletor.locator('option').evaluateAll((os) => os.map((o) => o.value));
await seletor.selectOption(valores.find((v) => v !== ''));
await page.locator('form input[type=number]').first().fill('10');

await page.locator('form input[type=file]').setInputFiles([arquivo]);
await page.waitForTimeout(800); // o envio começou e NÃO terminou

const botao = page.locator('form button[type=submit]');
const travado = await botao.isDisabled();
travado
  ? ok('o Salvar fica travado enquanto a foto sobe')
  : fail('o Salvar continua clicável durante o envio — é aqui que a foto se perde');

// Tenta salvar assim mesmo: Enter num campo de texto também envia o formulário.
await page.locator('form input').first().press('Enter');
await page.waitForTimeout(500);
const aindaAberto = await page.locator('form').count() > 0;
aindaAberto
  ? ok('e o Enter num campo não escapa da trava')
  : fail('o Enter salvou o produto no meio do envio — a foto se perdeu');

if (!aindaAberto) {
  // O formulário fechou no meio do envio: é exatamente o defeito. Encerra
  // aqui, com a falha legível, em vez de estourar procurando um form que já
  // não existe.
  await browser.close();
  console.log(log.join('\n'));
  console.log('\nhouve falha');
  process.exit(1);
}

// Agora espera o envio terminar de verdade.
await page.waitForTimeout(5000);
const miniaturas = await page.locator('form img').count();
miniaturas >= 1
  ? ok('a foto aparece no formulário quando o envio termina')
  : fail('a foto não apareceu nem depois do envio');

const liberado = await botao.isEnabled();
liberado ? ok('e o Salvar é liberado') : fail('o Salvar ficou travado para sempre');

await botao.click();
await page.waitForTimeout(3000);

const gravado = await page.evaluate(async (n) => {
  const r = await fetch('/api/admin/state', { headers: { Accept: 'application/json' } });
  const j = await r.json();
  return (j.products ?? []).find((p) => p.name === n) ?? null;
}, nome);

if (gravado === null) {
  fail('o produto não foi gravado');
} else if (/^\/midia\/[0-9a-f]{24}\./.test(gravado.image ?? '')) {
  ok('o produto gravou com a foto: ' + gravado.image);
} else {
  fail(`o produto gravou SEM foto (image=${JSON.stringify(gravado.image)})`);
}

if (gravado !== null) {
  await page.evaluate(async (id) => {
    const s = await fetch('/api/session', { headers: { Accept: 'application/json' } }).then((r) => r.json());
    await fetch(`/api/admin/products/${id}`, {
      method: 'DELETE',
      headers: { 'X-CSRF-Token': s.csrfToken ?? '' },
    });
  }, gravado.id);
}

await browser.close();

console.log(log.join('\n'));
const falhou = log.some((l) => l.startsWith('FALHA'));
console.log(falhou ? '\nhouve falha' : '\nTodas as verificações passaram');
process.exit(falhou ? 1 : 0);
