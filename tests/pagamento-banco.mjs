/**
 * Teste de integração das travas de pagamento — contra um MySQL de verdade.
 *
 *   node --env-file-if-exists=.env tests/pagamento-banco.mjs
 *
 * Os testes em server/tests/ são puros: não tocam o banco. Mas as três garantias
 * que realmente protegem dinheiro dependem de transação, de `FOR UPDATE` e de
 * UPDATE condicional — e essas só se provam com um banco no meio. É a diferença
 * entre "a lógica parece certa" e "o estoque não infla".
 *
 * O teste cria os próprios dados, num pedido com prefixo TESTE-, e apaga tudo no
 * fim. Não usa o Mercado Pago: chama `aplicarPagamento` diretamente com o
 * resultado que o provedor teria devolvido.
 */

import { aplicarPagamento, cancelarSemCobranca } from '../server/src/payments/pedidos.ts';
import { closePool, q } from '../server/src/db.ts';

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

const PRODUTO = 'teste-pagamento-produto';
const ESTOQUE_INICIAL = 10;

async function limpar() {
  await q.run("DELETE FROM order_items WHERE order_id LIKE 'TESTE-%'");
  await q.run("DELETE FROM orders WHERE id LIKE 'TESTE-%'");
  await q.run('DELETE FROM products WHERE id = ?', [PRODUTO]);
}

/** Cria um pedido pendente com 3 unidades já baixadas do estoque. */
async function novoPedido(id) {
  await q.run(
    `INSERT INTO orders (id, customer_name, customer_email, subtotal, total, status, payment)
     VALUES (?, 'Teste', 'teste@exemplo.com', 100, 100, 'pending', 'pix')`,
    [id],
  );
  await q.run(
    `INSERT INTO order_items (order_id, product_id, name, quantity, unit_price)
     VALUES (?, ?, 'Produto de teste', 3, 100)`,
    [id, PRODUTO],
  );
  // O pedido baixou 3 do estoque na criação, como o checkout faz.
  await q.run('UPDATE products SET stock = ? WHERE id = ?', [ESTOQUE_INICIAL - 3, PRODUTO]);
}

const estoque = async () =>
  Number((await q.one('SELECT stock FROM products WHERE id = ?', [PRODUTO]))?.stock ?? -1);

const pedido = async (id) => q.one('SELECT * FROM orders WHERE id = ?', [id]);

console.log('Travas de pagamento (contra o banco)\n');

await limpar();
await q.run(
  `INSERT INTO products (id, name, price, stock, active) VALUES (?, 'Produto de teste', 100, ?, 1)`,
  [PRODUTO, ESTOQUE_INICIAL],
);

// ---------------------------------------------------------- aprovação ----
await novoPedido('TESTE-001');
let r = await aplicarPagamento({
  orderId: 'TESTE-001', status: 'aprovado', detalhe: 'accredited',
  provedor: 'mercadopago', ref: 'MP-001',
});
let p = await pedido('TESTE-001');
checar('pagamento aprovado marca o pedido como pago', 'paid', String(p.status));
checar('grava a referência da cobrança', 'MP-001', String(p.payment_ref));
checar('carimba a data do pagamento', true, p.paid_at !== null);
checar('estoque não é devolvido numa venda aprovada', ESTOQUE_INICIAL - 3, await estoque());

const pagoEm = String(p.paid_at);
r = await aplicarPagamento({
  orderId: 'TESTE-001', status: 'aprovado', detalhe: 'accredited', provedor: 'mercadopago', ref: 'MP-001',
});
p = await pedido('TESTE-001');
checar('aviso repetido de aprovação não muda a data do pagamento', pagoEm, String(p.paid_at));
checar('e não é reportado como mudança', false, r.mudou);

/*
 * O caso que mais dói: o webhook de recusa chega DEPOIS da aprovação (fora de
 * ordem, coisa que acontece de verdade). Cancelar aqui devolveria mercadoria
 * que já foi paga.
 */
r = await aplicarPagamento({
  orderId: 'TESTE-001', status: 'recusado', detalhe: 'cc_rejected_high_risk',
  provedor: 'mercadopago', ref: 'MP-001',
});
p = await pedido('TESTE-001');
checar('recusa atrasada NÃO cancela um pedido já pago', 'paid', String(p.status));
checar('e não devolve o estoque de uma venda paga', ESTOQUE_INICIAL - 3, await estoque());

// ------------------------------------------------------------ recusa ----
await q.run('UPDATE products SET stock = ? WHERE id = ?', [ESTOQUE_INICIAL, PRODUTO]);
await novoPedido('TESTE-002');
checar('estoque baixou na criação do pedido', ESTOQUE_INICIAL - 3, await estoque());

r = await aplicarPagamento({
  orderId: 'TESTE-002', status: 'recusado', detalhe: 'cc_rejected_insufficient_amount',
  provedor: 'mercadopago', ref: 'MP-002',
});
p = await pedido('TESTE-002');
checar('pagamento recusado cancela o pedido', 'canceled', String(p.status));
checar('e devolve o estoque', ESTOQUE_INICIAL, await estoque());
checar('reportando que devolveu', true, r.estoqueDevolvido);
checar('guarda o motivo da recusa', 'cc_rejected_insufficient_amount', String(p.payment_detail));

/*
 * A trava do estoque: o Mercado Pago reenvia avisos. Sem `stock_restored`, cada
 * reenvio devolveria as 3 peças outra vez e o estoque cresceria sozinho.
 */
r = await aplicarPagamento({
  orderId: 'TESTE-002', status: 'recusado', detalhe: 'cc_rejected_insufficient_amount',
  provedor: 'mercadopago', ref: 'MP-002',
});
checar('segundo aviso de recusa NÃO devolve o estoque de novo', ESTOQUE_INICIAL, await estoque());
checar('e não é reportado como devolução', false, r.estoqueDevolvido);

r = await aplicarPagamento({
  orderId: 'TESTE-002', status: 'recusado', detalhe: 'outro_motivo',
  provedor: 'mercadopago', ref: 'MP-002',
});
checar('terceiro aviso também não mexe no estoque', ESTOQUE_INICIAL, await estoque());

// --------------------------------------------------------- aguardando ----
await q.run('UPDATE products SET stock = ? WHERE id = ?', [ESTOQUE_INICIAL, PRODUTO]);
await novoPedido('TESTE-003');
await aplicarPagamento({
  orderId: 'TESTE-003', status: 'aguardando', detalhe: 'waiting_transfer',
  provedor: 'mercadopago', ref: 'MP-003',
});
p = await pedido('TESTE-003');
checar('Pix emitido mantém o pedido pendente', 'pending', String(p.status));
checar('e segura o estoque enquanto espera', ESTOQUE_INICIAL - 3, await estoque());

// Pix que expirou sem pagamento.
await aplicarPagamento({
  orderId: 'TESTE-003', status: 'recusado', detalhe: 'expired', provedor: 'mercadopago', ref: 'MP-003',
});
checar('Pix expirado devolve o estoque', ESTOQUE_INICIAL, await estoque());

// --------------------------------------------- falha antes de cobrar ----
await q.run('UPDATE products SET stock = ? WHERE id = ?', [ESTOQUE_INICIAL, PRODUTO]);
await novoPedido('TESTE-004');
await cancelarSemCobranca('TESTE-004', 'gateway_unavailable');
p = await pedido('TESTE-004');
checar('provedor fora do ar cancela o pedido', 'canceled', String(p.status));
checar('e devolve o estoque, porque ninguém foi cobrado', ESTOQUE_INICIAL, await estoque());

await cancelarSemCobranca('TESTE-004', 'gateway_unavailable');
checar('cancelar de novo não devolve o estoque duas vezes', ESTOQUE_INICIAL, await estoque());

// --------------------------------------------------- corrida real ----
/*
 * Dois avisos ao mesmo tempo para o mesmo pedido — o webhook do Mercado Pago e
 * a consulta que a página do cliente faz enquanto espera o Pix. É a corrida que
 * o `FOR UPDATE` existe para resolver.
 */
await q.run('UPDATE products SET stock = ? WHERE id = ?', [ESTOQUE_INICIAL, PRODUTO]);
await novoPedido('TESTE-005');
const simultaneos = await Promise.all([
  aplicarPagamento({ orderId: 'TESTE-005', status: 'recusado', detalhe: 'expired', provedor: 'mercadopago', ref: 'MP-005' }),
  aplicarPagamento({ orderId: 'TESTE-005', status: 'recusado', detalhe: 'expired', provedor: 'mercadopago', ref: 'MP-005' }),
  aplicarPagamento({ orderId: 'TESTE-005', status: 'recusado', detalhe: 'expired', provedor: 'mercadopago', ref: 'MP-005' }),
]);
checar('três avisos simultâneos devolvem o estoque UMA vez', ESTOQUE_INICIAL, await estoque());
checar('e só um deles reporta a devolução', 1, simultaneos.filter((x) => x.estoqueDevolvido).length);

// ------------------------------------------------- pedido inexistente ----
r = await aplicarPagamento({
  orderId: 'TESTE-NAO-EXISTE', status: 'aprovado', detalhe: 'accredited', provedor: 'mercadopago', ref: 'MP-X',
});
checar('aviso de pedido inexistente não quebra nada', false, r.mudou);

/*
 * ------------------------------------------------- saldo fracionado ----
 *
 * `stock` virou DECIMAL porque o ERP trabalha o saldo com fração. A baixa e a
 * devolução são UPDATEs aritméticos com trava no WHERE
 * (`stock = stock - ? WHERE stock >= ?`), e é aí que uma coluna inteira
 * estragaria a conta sem reclamar: 2,5 menos 1 daria 1 em vez de 1,5, e a
 * diferença só apareceria num inventário meses depois.
 *
 * Nenhum teste de função pega isso. Só o banco responde.
 */
await q.run('UPDATE products SET stock = ? WHERE id = ?', [2.5, PRODUTO]);
checar('a coluna guarda a fração como enviada', 2.5, await estoque());

// A mesma baixa que o checkout faz, com a mesma trava.
let baixou = await q.run(
  'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
  [1, PRODUTO, 1],
);
checar('a baixa de 1 sobre 2,5 acontece', 1, baixou);
checar('e sobra 1,5 — não 1', 1.5, await estoque());

// A trava continua valendo: não vende 2 quando só há 1,5.
baixou = await q.run(
  'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
  [2, PRODUTO, 2],
);
checar('não deixa vender 2 com saldo 1,5', 0, baixou);
checar('e o saldo fica intacto depois da recusa', 1.5, await estoque());

// Devolução, como no cancelamento.
await q.run('UPDATE products SET stock = stock + ? WHERE id = ?', [1, PRODUTO]);
checar('a devolução recompõe o saldo fracionado', 2.5, await estoque());

await limpar();
await closePool();

console.log('');
if (falhas.length === 0) {
  console.log(`Todas as ${ok} verificações passaram.`);
  process.exit(0);
}
console.log(`${ok} passaram, ${falhas.length} falharam:`);
for (const f of falhas) console.log('  FALHA ' + f);
process.exit(1);
