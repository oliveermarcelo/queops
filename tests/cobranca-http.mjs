/**
 * Teste do checkout pela HTTP, com a loja no ar.
 *
 *   npm start &                      # http://127.0.0.1:8080
 *   node --env-file-if-exists=.env tests/cobranca-http.mjs
 *
 * Prova, na porta de entrada real, as duas situações em que uma loja mal feita
 * confirma pedido sem dinheiro:
 *
 *   1. SEM MEIO DE PAGAMENTO CONFIGURADO — tem de recusar antes de gravar
 *      qualquer coisa. Era exatamente o que acontecia antes: o pedido era
 *      gravado, o estoque baixava e a tela dizia "PEDIDO CONFIRMADO · Total
 *      pago" sem ninguém ter sido cobrado.
 *
 *   2. COM CREDENCIAL QUE O PROVEDOR RECUSA — o pedido é gravado (o estoque
 *      baixa dentro da transação), a cobrança falha, e então o pedido precisa
 *      ficar `canceled` com o ESTOQUE DEVOLVIDO. Mercadoria presa por uma
 *      cobrança que não aconteceu é venda perdida silenciosa.
 *
 * O teste cadastra uma credencial falsa, roda, e devolve a integração ao estado
 * anterior no fim — inclusive se falhar no meio.
 */

import { encryptPayload } from '../server/src/crypto.ts';
import { closePool, q } from '../server/src/db.ts';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';

let ok = 0;
const falhas = [];

function checar(nome, esperado, obtido) {
  if (JSON.stringify(esperado) === JSON.stringify(obtido)) {
    ok++;
    console.log(`  ok   ${nome}`);
    return;
  }
  falhas.push(`${nome}\n       esperado: ${JSON.stringify(esperado)}\n       obtido:   ${JSON.stringify(obtido)}`);
  console.log(`  FALHA ${nome}`);
}

// ---------------------------------------------------------- sessão HTTP ----

/** Guarda o cookie de sessão e o token CSRF, como o navegador faria. */
async function novaSessao() {
  const r = await fetch(`${BASE}/api/session`);
  const cookie = (r.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
  const corpo = await r.json();
  return { cookie, csrf: corpo.csrfToken ?? '' };
}

async function criarPedido(sessao, produtoId) {
  const r = await fetch(`${BASE}/api/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': sessao.csrf,
      Cookie: sessao.cookie,
    },
    body: JSON.stringify({
      items: [{ productId: produtoId, quantity: 1 }],
      name: 'Teste Cobranca',
      email: 'teste-cobranca@example.com',
      phone: '11988887777',
      cpf: '52998224725',
      payment: 'pix',
      address: {
        cep: '01310-100', street: 'Av. Paulista', number: '1000',
        neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP',
      },
    }),
  });
  return { status: r.status, corpo: await r.json().catch(() => ({})) };
}

// ------------------------------------------------------------- cenário ----

const PRODUTO = 'teste-cobranca-http';
const ESTOQUE = 5;

const integracaoAntes = await q.one('SELECT * FROM integrations WHERE id = ?', ['mercadopago']);

async function restaurarIntegracao() {
  if (integracaoAntes === null) {
    await q.run('DELETE FROM integrations WHERE id = ?', ['mercadopago']);
    return;
  }
  await q.run(
    'UPDATE integrations SET enabled = ?, fields_enc = ? WHERE id = ?',
    [integracaoAntes.enabled, integracaoAntes.fields_enc, 'mercadopago'],
  );
}

const estoque = async () =>
  Number((await q.one('SELECT stock FROM products WHERE id = ?', [PRODUTO]))?.stock ?? -1);

async function limpar() {
  const pedidos = await q.all(
    "SELECT id FROM orders WHERE customer_email = 'teste-cobranca@example.com'",
  );
  for (const p of pedidos) {
    await q.run('DELETE FROM order_items WHERE order_id = ?', [p.id]);
    await q.run('DELETE FROM orders WHERE id = ?', [p.id]);
  }
  await q.run("DELETE FROM customers WHERE email = 'teste-cobranca@example.com'");
  await q.run('DELETE FROM products WHERE id = ?', [PRODUTO]);
}

console.log('Checkout pela HTTP: nenhum pedido sem cobrança\n');

try {
  await limpar();
  await q.run(
    `INSERT INTO products (id, name, price, stock, active) VALUES (?, 'Produto de teste', 100, ?, 1)`,
    [PRODUTO, ESTOQUE],
  );

  // ---- 1. Integração desligada: recusa antes de gravar ----
  await q.run('DELETE FROM integrations WHERE id = ?', ['mercadopago']);

  let sessao = await novaSessao();
  let r = await criarPedido(sessao, PRODUTO);
  checar('sem meio de pagamento, o pedido é recusado com 503', 503, r.status);
  checar('e com o código que a tela entende', 'payments_disabled', r.corpo?.error?.code);
  checar('nenhum pedido foi gravado', 0, (await q.all(
    "SELECT id FROM orders WHERE customer_email = 'teste-cobranca@example.com'",
  )).length);
  checar('e o estoque não foi tocado', ESTOQUE, await estoque());

  // ---- 2. Credencial que o Mercado Pago recusa ----
  await q.run(
    `INSERT INTO integrations (id, enabled, fields_enc) VALUES (?, 1, ?)
     ON DUPLICATE KEY UPDATE enabled = 1, fields_enc = VALUES(fields_enc)`,
    ['mercadopago', encryptPayload({
      publicKey: 'TEST-chave-publica-invalida',
      accessToken: 'TEST-token-invalido-de-proposito',
      webhookSecret: 'segredo-de-teste',
    })],
  );

  sessao = await novaSessao();
  r = await criarPedido(sessao, PRODUTO);
  checar('cobrança rejeitada pelo provedor não confirma pedido', 502, r.status);
  checar('e informa que nada foi cobrado', 'gateway_unavailable', r.corpo?.error?.code);

  const pedido = (await q.all(
    "SELECT * FROM orders WHERE customer_email = 'teste-cobranca@example.com' ORDER BY created_at DESC",
  ))[0];
  checar('o pedido gravado ficou cancelado', 'canceled', pedido ? String(pedido.status) : '(nenhum)');
  checar('nunca marcado como pago', null, pedido ? pedido.paid_at : 'sem pedido');
  checar('e o estoque voltou para a prateleira', ESTOQUE, await estoque());
} finally {
  await limpar();
  await restaurarIntegracao();
  await closePool();
}

console.log('');
if (falhas.length === 0) {
  console.log(`Todas as ${ok} verificações passaram.`);
  process.exit(0);
}
console.log(`${ok} passaram, ${falhas.length} falharam:`);
for (const f of falhas) console.log('  FALHA ' + f);
process.exit(1);
