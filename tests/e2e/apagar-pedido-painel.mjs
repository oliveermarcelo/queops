/**
 * Apagar pedido, e o produto que ele segurava — no navegador de verdade.
 *
 * O relato foi: "mesmo colocando todos os pedidos para cancelado, não consegui
 * deletar o produto" — e o diálogo dizia que o produto "só pode ficar fora da
 * vitrine", sem saída nenhuma.
 *
 * O teste HTTP prova que as rotas obedecem à regra nova. Só o navegador prova
 * o que a pessoa vive: que o botão da tela LIBERA depois de cancelar, sem
 * recarregar a página. Foi exatamente aí que a versão anterior falhou — a
 * rota estava certa e a tela contava outra história.
 *
 *   node tests/e2e/apagar-pedido-painel.mjs
 */

import { chromium } from 'playwright';

import { closePool, q } from '../../server/src/db.ts';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@queopspiramides.com.br';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'DemoQueops2026!';

const log = [];
const ok = (m) => log.push('  OK  ' + m);
const fail = (m) => log.push('FALHA ' + m);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext().then((c) => c.newPage());
const erros = [];
page.on('pageerror', (e) => erros.push(String(e)));

await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
await page.fill('#admin-email', ADMIN_EMAIL);
await page.fill('#admin-pass', ADMIN_PASS);
await page.click('button[type=submit]');
await page.waitForTimeout(2500);

/*
 * O cenário é montado direto no banco: um produto novo e um pedido pendente,
 * com cobrança em aberto, que o contém.
 *
 * Vai pelo banco, e não por uma rota, de propósito: criar pedido é coisa do
 * checkout, e abrir um atalho no painel só para o teste seria código de
 * produção existindo por causa do teste. Também não depende de o ambiente ter
 * dado antigo — um teste que só roda "se houver pedido" não roda na base
 * limpa, que é justamente onde o erro entraria sem ninguém ver.
 */
const marca = Date.now();
const idProduto = `e2e-apagar-${marca}`;
const idPedido = `E2E-${String(marca).slice(-9)}`;
const nomeProduto = `Produto preso ${idPedido}`;

await page.evaluate(async ({ id, nome }) => {
  const s = await (await fetch('/api/session')).json();
  await fetch('/api/admin/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrfToken },
    body: JSON.stringify({ id, name: nome, price: 55, stock: 3, category: 'piramides' }),
  });
}, { id: idProduto, nome: nomeProduto });

await q.run(
  `INSERT INTO orders (id, customer_name, customer_email, subtotal, total, status, payment,
                       payment_ref)
   VALUES (?, 'Cliente de teste', 'e2e@exemplo.com', 55, 55, 'pending', 'pix', ?)`,
  [idPedido, `ref-e2e-${marca}`],
);
await q.run(
  `INSERT INTO order_items (order_id, product_id, name, quantity, unit_price)
   VALUES (?, ?, ?, 1, 55)`,
  [idPedido, idProduto, nomeProduto],
);
/*
 * Recarrega depois de montar o cenário.
 *
 * O painel carrega o estado inteiro uma vez, no login. O pedido entrou no
 * banco depois disso, então sem este recarregamento a tela mostraria a lista
 * de antes e o teste falharia procurando uma linha que o servidor já tem.
 */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2000);
ok('cenário montado: produto novo preso a um pedido pendente');

// ------------------------------------------- o produto está travado ----

await page.click('button:has-text("Produtos")');
await page.waitForTimeout(1500);
await page.fill('input[placeholder*="Buscar"]', idPedido);
await page.waitForTimeout(800);

// Para chegar ao "apagar em definitivo" o produto precisa estar fora da vitrine.
await page.evaluate(async (id) => {
  const s = await (await fetch('/api/session')).json();
  await fetch(`/api/admin/products/${id}`, {
    method: 'DELETE', headers: { 'X-CSRF-Token': s.csrfToken },
  });
}, idProduto);

const travado = await page.evaluate(async (id) => {
  const s = await (await fetch('/api/admin/state')).json();
  return (s.productsWithActiveOrders ?? []).includes(id);
}, idProduto);
travado
  ? ok('o painel marca o produto como preso a pedido que vale')
  : fail('o painel não viu o pedido que segura o produto');

const recusa = await page.evaluate(async (id) => {
  const s = await (await fetch('/api/session')).json();
  const r = await fetch(`/api/admin/products/${id}?definitivo=1`, {
    method: 'DELETE', headers: { 'X-CSRF-Token': s.csrfToken },
  });
  return { status: r.status, corpo: await r.json().catch(() => null) };
}, idProduto);
recusa.status === 409 ? ok('e apagar é recusado, como deve ser') : fail(`status ${recusa.status}`);
/cancele/i.test(String(recusa.corpo?.error?.message))
  ? ok('a recusa diz o que fazer para sair dela')
  : fail(`recusa sem saída: ${String(recusa.corpo?.error?.message).slice(0, 90)}`);

// -------------------------------- apagar o pedido pela tela Pedidos ----

await page.click('button:has-text("Pedidos")');
await page.waitForTimeout(1500);
await page.fill('input[placeholder*="Buscar"]', idPedido);
await page.waitForTimeout(800);

const linha = page.locator('tr', { hasText: idPedido }).first();
(await linha.count()) ? ok('o pedido aparece na lista') : fail('pedido não encontrado na tela');

/*
 * Pendente com cobrança em aberto: o botão existe e está DESABILITADO, com o
 * motivo no título. Sumir com ele só faria procurar um botão que não existe.
 */
const lixeira = linha.locator('button').last();
(await lixeira.isDisabled())
  ? ok('com cobrança em aberto, a lixeira fica desabilitada')
  : fail('a lixeira está habilitada com cobrança em aberto');
/cancelado/i.test(String(await lixeira.getAttribute('title')))
  ? ok('e o título explica que é preciso cancelar antes')
  : fail(`título sem explicação: ${await lixeira.getAttribute('title')}`);

/*
 * Cancelar passa pelo diálogo do motivo.
 *
 * Escolher "cancelado" na lista não aplica mais direto: abre a caixa que
 * pergunta POR QUÊ, porque o ERP precisa distinguir "cliente desistiu" de
 * "pagamento recusado" — a partir de `status = "canceled"` sozinho não há como
 * saber qual dos dois foi.
 */
await linha.locator('select').selectOption('canceled');
await page.waitForTimeout(800);

const dialogoMotivo = page.locator('[role=alertdialog]');
(await dialogoMotivo.count()) === 1
  ? ok('cancelar pergunta o motivo antes de aplicar')
  : fail('o cancelamento foi aplicado sem perguntar o motivo');

await dialogoMotivo.locator('label:has-text("Produto sem estoque") input').check();
await dialogoMotivo.locator('button:has-text("Cancelar pedido")').click();
await page.waitForTimeout(1800);

const motivoGravado = await page.evaluate(async (id) => {
  const s = await (await fetch('/api/admin/state')).json();
  const o = (s.orders ?? []).find((x) => x.id === id);
  return { motivo: o?.cancelReason ?? null, por: o?.canceledBy ?? null, status: o?.status ?? '' };
}, idPedido);
motivoGravado.motivo === 'Produto sem estoque' && motivoGravado.por === 'store'
  ? ok('o motivo e quem cancelou ficam gravados no pedido')
  : fail(`gravado: ${JSON.stringify(motivoGravado)}`);

const depoisDeCancelar = page.locator('tr', { hasText: idPedido }).first().locator('button').last();
(await depoisDeCancelar.isEnabled())
  ? ok('cancelado o pedido, a lixeira libera na hora — sem recarregar')
  : fail('a lixeira continua travada depois de cancelar');

await depoisDeCancelar.click();
await page.waitForTimeout(600);
await page.locator('button:has-text("Apagar pedido")').last().click();
await page.waitForTimeout(2000);

(await page.locator('tr', { hasText: idPedido }).count()) === 0
  ? ok('o pedido sai da lista')
  : fail('o pedido continua na tela depois de apagado');

// ------------------- e agora o produto pode ser apagado, pela tela ----

await page.click('button:has-text("Produtos")');
await page.waitForTimeout(1500);

const liberou = await page.evaluate(async (id) => {
  const s = await (await fetch('/api/admin/state')).json();
  return !(s.productsWithActiveOrders ?? []).includes(id);
}, idProduto);
liberou
  ? ok('o produto deixou de estar preso')
  : fail('o produto continua marcado como preso depois de o pedido sumir');

await page.fill('input[placeholder*="Buscar"]', idPedido);
await page.waitForTimeout(800);
const linhaProduto = page.locator('tr', { hasText: nomeProduto }).first();
await linhaProduto.locator('button').last().click();
await page.waitForTimeout(600);

const dialogo = await page.locator('[role=dialog], .fixed').last().innerText().catch(() => '');
/não dá para apagar/i.test(dialogo)
  ? fail('a tela ainda diz que não dá para apagar')
  : ok('o diálogo não repete a recusa antiga');

await page.locator('button:has-text("Apagar")').last().click();
await page.waitForTimeout(2000);

const sumiu = await page.evaluate(async (id) => {
  const s = await (await fetch('/api/admin/state')).json();
  return !(s.products ?? []).some((p) => p.id === id);
}, idProduto);
sumiu
  ? ok('e o produto é apagado de verdade, pela tela')
  : fail('o produto continua no banco depois de apagar pela tela');

// Limpeza: o que este teste criou não fica para trás nem que uma checagem falhe.
await q.run('DELETE FROM orders WHERE id = ?', [idPedido]);
await q.run('DELETE FROM products WHERE id = ?', [idProduto]);
await closePool();

await browser.close();
console.log(log.join('\n'));
console.log('\nErros de página:', erros.length ? erros.slice(0, 3).join(' | ') : 'nenhum');
const falhas = log.filter((l) => l.startsWith('FALHA')).length;
console.log(falhas ? `\n${falhas} verificação(ões) falharam` : '\nTodas as verificações passaram');
process.exit(falhas ? 1 : 0);
