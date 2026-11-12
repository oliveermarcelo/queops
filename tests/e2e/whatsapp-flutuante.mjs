/**
 * O WhatsApp acompanha o cliente pela loja inteira?
 *
 * O contato existia só no rodapé — ou seja, só para quem rolasse até o fim.
 * Quem está em dúvida no meio de uma página de produto é exatamente quem mais
 * precisa perguntar, e era de quem o caminho estava mais longe.
 *
 * O teste cobra as três coisas que separam um botão flutuante útil de um
 * estorvo: ele aparece em TODAS as telas da loja, NÃO aparece no painel, e
 * fica ABAIXO dos modais — um botão que cobre o formulário aberto esconde
 * justamente o campo que a pessoa ia preencher.
 *
 *   node tests/e2e/whatsapp-flutuante.mjs
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const SELETOR = 'a[aria-label="Falar com a loja no WhatsApp"]';

const log = [];
const ok = (m) => log.push('  OK  ' + m);
const fail = (m) => log.push('FALHA ' + m);

const nav = await chromium.launch({
  executablePath: '/opt/pw-browsers/chromium',
  args: ['--disable-background-networking', '--no-sandbox'],
});
const p = await nav.newPage({ viewport: { width: 1280, height: 820 } });
p.setDefaultTimeout(12000);
const zap = () => p.locator(SELETOR);

// ---------------------------------------------------------------- 1 ----
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);

(await zap().isVisible())
  ? ok('aparece na home')
  : fail('não aparece na home');

const href = (await zap().getAttribute('href')) ?? '';
/^https:\/\/wa\.me\/\d{10,}/.test(href)
  ? ok('com um link de WhatsApp válido')
  : fail(`link estranho: ${href}`);
href.includes('text=')
  ? ok('e a conversa já começa com uma mensagem pronta')
  : fail('abre a conversa em branco');

// ---------------------------------------------------------------- 2 ----
// Página com URL própria: é outra montagem da árvore, e é onde um botão
// colocado dentro do App sumiria.
await p.goto(`${BASE}/trocas-e-devolucoes`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1000);
(await zap().isVisible())
  ? ok('continua nas páginas de política, que têm endereço próprio')
  : fail('some nas páginas de política');

// ---------------------------------------------------------------- 3 ----
// O painel não é a loja.
await p.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
await p.waitForTimeout(1500);
(await zap().count()) === 0
  ? ok('não aparece no painel')
  : fail('vazou para o painel');

// ---------------------------------------------------------------- 4 ----
// Com um modal aberto, quem está no canto inferior direito não pode ser ele.
await p.goto(BASE, { waitUntil: 'networkidle' });
await p.waitForTimeout(1200);
const sacola = p.locator('button').filter({ hasText: /Sacola/ }).first();
if (await sacola.count()) {
  await sacola.click();
  await p.waitForTimeout(1200);
  const porCima = await p.evaluate((sel) => {
    const el = document.elementFromPoint(window.innerWidth - 45, window.innerHeight - 45);
    return el?.closest(sel) !== null && el?.closest(sel) !== undefined;
  }, SELETOR);
  porCima
    ? fail('fica por cima da sacola aberta — cobriria os botões dela')
    : ok('fica ABAIXO da sacola aberta, como deve');
} else {
  ok('(sacola não encontrada nesta vitrine — verificação pulada)');
}

// ---------------------------------------------------------------- 5 ----
const celular = await nav.newPage({ viewport: { width: 390, height: 780 } });
await celular.goto(BASE, { waitUntil: 'networkidle' });
await celular.waitForTimeout(1200);
(await celular.locator(SELETOR).isVisible())
  ? ok('aparece no celular, onde o WhatsApp é o canal natural')
  : fail('some no celular');

await nav.close();
console.log(log.join('\n'));
const falhou = log.some((l) => l.startsWith('FALHA'));
console.log(falhou ? '\nhouve falha' : '\nTodas as verificações passaram');
process.exit(falhou ? 1 : 0);
