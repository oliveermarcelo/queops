/**
 * O contrato do pedido para o ERP, item a item do que o integrador apontou.
 *
 * Cada verificação aqui corresponde a um problema real relatado por quem
 * consome esta API do outro lado, e a maioria falhava de um jeito silencioso:
 * o pedido chegava, o ERP aceitava, e o erro aparecia dias depois numa nota
 * fiscal com destino errado ou num pedido pago que ninguém faturou.
 *
 * O teste monta pedidos direto no banco em vez de passar pelo checkout porque
 * precisa de estados que o checkout leva dias para produzir — pago ontem,
 * enviado hoje, cancelado pelo gateway.
 *
 *   npm run teste:pedido-erp
 */

import { closePool, q } from '../server/src/db.ts';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? 'admin@queopspiramides.com.br',
  password: process.env.ADMIN_PASS ?? 'DemoQueops2026!',
};

let falhas = 0;
const ok = (cond, nome, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}${cond || extra === '' ? '' : ' → ' + extra}`);
  if (!cond) falhas++;
};

function cliente() {
  let cookie = '';
  let csrf = '';
  const chamar = async (metodo, caminho, corpo, headers = {}) => {
    const h = { Accept: 'application/json', ...headers };
    if (cookie) h.Cookie = cookie;
    if (corpo !== undefined) h['Content-Type'] = 'application/json';
    if (metodo !== 'GET' && csrf) h['X-CSRF-Token'] = csrf;
    const res = await fetch(BASE + caminho, {
      method: metodo, headers: h,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    for (const c of (res.headers.getSetCookie?.() ?? [])) cookie = c.split(';')[0];
    return { status: res.status, json: await res.json().catch(() => null) };
  };
  return {
    chamar,
    async sessao() {
      const r = await chamar('GET', '/api/session');
      csrf = r.json?.csrfToken ?? '';
      return r;
    },
  };
}

const painel = cliente();
await painel.sessao();
await painel.chamar('POST', '/api/admin/login', ADMIN);
await painel.sessao();

// Chave de API, como o ERP usa.
const chave = await painel.chamar('POST', '/api/admin/api-keys', { name: `teste-erp-${Date.now()}` });
const TOKEN = chave.json?.token ?? '';
if (TOKEN === '') {
  console.log('FALHA não consegui criar a chave de API');
  process.exit(1);
}
const erp = async (metodo, caminho, corpo) => {
  const res = await fetch(BASE + caminho, {
    method: metodo,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${TOKEN}`,
      ...(corpo === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const marca = Date.now();
const curto = String(marca).slice(-9);
const pedidoPago = `EP1-${curto}`;
const pedidoLimpo = `EP2-${curto}`;
const produto = `prod-erp-${marca}`;

// ------------------------------------------------------------ cenário ----

await painel.chamar('POST', '/api/admin/products', {
  id: produto, name: 'Produto do teste de ERP', price: 130, stock: 10,
  category: 'piramides', sku: 'SKU-ERP-1',
});

/*
 * Um pedido PAGO, com CPF mascarado como o checkout grava e com dados de
 * cartão. É o caso que o integrador descreveu.
 */
await q.run(
  `INSERT INTO orders (id, customer_id, customer_name, customer_email, customer_phone,
                       customer_cpf, subtotal, shipping_cost, discount, total, status, payment,
                       ship_cep, ship_street, ship_number, ship_city, ship_state,
                       shipping_service, paid_at, payment_provider, payment_ref,
                       payment_brand, payment_installments, paid_amount,
                       discount_coupon, discount_payment, customer_note,
                       tracking_code, shipping_carrier, shipping_service_code,
                       shipping_min_days, shipping_max_days, shipping_cost_owner)
   VALUES (?, NULL, 'Marcelo Teste', 'erp@exemplo.com', '(74) 99194-9707',
           '071.662.725-62', 130, 20.13, 0, 150.13, 'paid', 'card',
           '44823-478', 'Rua A', '10', 'Capim Grosso', 'BA',
           'PAC — até 7 dias úteis', NOW(), 'mercadopago', ?,
           'visa', 3, 150.13, 6.50, 0.00, 'Entregar após as 18h',
           'AA123456789BR', 'Correios', 'PAC', 5, 7, 0.00)`,
  [pedidoPago, `ref-${marca}`],
);
await q.run(
  `INSERT INTO order_items (order_id, product_id, sku, name, quantity, unit_price,
                            discount, total_price)
   VALUES (?, ?, 'SKU-ERP-1', 'Produto do teste de ERP', 1.5, 130, 0, 195)`,
  [pedidoPago, produto],
);

// Um pedido SEM CPF, sem rastreio: é onde a string vazia aparecia.
await q.run(
  `INSERT INTO orders (id, customer_name, customer_email, subtotal, total, status, payment,
                       ship_cep, ship_city, ship_state)
   VALUES (?, 'Sem Documento', 'sem@exemplo.com', 50, 50, 'pending', 'pix',
           '01310-100', 'São Paulo', 'SP')`,
  [pedidoLimpo],
);

const lido = (await erp('GET', `/api/v1/orders/${pedidoPago}`)).json?.order ?? {};
const limpo = (await erp('GET', `/api/v1/orders/${pedidoLimpo}`)).json?.order ?? {};

// ------------------------------------------------ 1. documento do cliente ----

ok(lido.customerDocument === '07166272562',
  '1 · o documento sai só com dígitos, sem máscara',
  String(lido.customerDocument));
ok(lido.customerDocumentType === 'cpf', '1 · com o tipo do documento', String(lido.customerDocumentType));
ok(limpo.customerDocument === null,
  '1 · sem documento informado, vem null e não string vazia',
  JSON.stringify(limpo.customerDocument));

// -------------------------------------------------- 2. detalhe do pagamento ----

const pg = lido.paymentDetails ?? {};
ok(pg.method === 'card', '2 · paymentDetails traz o meio', String(pg.method));
ok(pg.brand === 'visa', '2 · a bandeira do cartão', String(pg.brand));
ok(pg.installments === 3, '2 · o número de parcelas', String(pg.installments));
ok(Number(pg.paidAmount) === 150.13, '2 · quanto foi pago de fato', String(pg.paidAmount));
ok(pg.gateway === 'mercadopago', '2 · o adquirente', String(pg.gateway));
ok(String(pg.transactionId).startsWith('ref-'), '2 · e o id da transação', String(pg.transactionId));
ok(typeof pg.paidAt === 'string' && pg.paidAt.includes('T'), '2 · com a data do pagamento em ISO');

// ---------------------------------------------------- 3. datas de transição ----

ok(typeof lido.updatedAt === 'string' && lido.updatedAt.includes('T'),
  '3 · o pedido traz updatedAt', String(lido.updatedAt));
ok('shippedAt' in lido && 'deliveredAt' in lido && 'canceledAt' in lido,
  '3 · e as demais datas de transição existem no contrato');

/*
 * A verificação que fecha o defeito mais caro: um pedido criado ANTES do
 * corte, mas atualizado depois, tem de aparecer na varredura. Com o filtro
 * antigo (por data de criação) ele ficava invisível para sempre.
 */
await q.run(
  "UPDATE orders SET created_at = DATE_SUB(NOW(), INTERVAL 3 DAY), updated_at = NOW() WHERE id = ?",
  [pedidoPago],
);
const ontem = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const porCriacao = (await erp('GET', `/api/v1/orders?since=${encodeURIComponent(ontem)}`)).json?.orders ?? [];
const porAtualizacao = (await erp('GET', `/api/v1/orders?updatedSince=${encodeURIComponent(ontem)}`)).json?.orders ?? [];

ok(!porCriacao.some((o) => o.id === pedidoPago),
  '3 · ?since continua filtrando pela CRIAÇÃO (pedido antigo não aparece)');
ok(porAtualizacao.some((o) => o.id === pedidoPago),
  '3 · ?updatedSince encontra o pedido antigo que MUDOU — era o que se perdia');

// ------------------------------------------------------------- 4. eixos ----

ok(lido.paymentStatus === 'paid', '4 · paymentStatus separado do status', String(lido.paymentStatus));
ok(lido.fulfillmentStatus === 'unpacked',
  '4 · fulfillmentStatus separado', String(lido.fulfillmentStatus));

/*
 * O ponto do relato: ao avançar para "enviado", a informação "foi pago" NÃO
 * pode desaparecer. No campo único ela desaparecia.
 */
await erp('PATCH', `/api/v1/orders/${pedidoPago}`, { status: 'shipped' });
const enviado = (await erp('GET', `/api/v1/orders/${pedidoPago}`)).json?.order ?? {};
ok(enviado.status === 'shipped', '4 · o status avança para enviado');
ok(enviado.paymentStatus === 'paid',
  '4 · e o pedido CONTINUA dizendo que foi pago', String(enviado.paymentStatus));
ok(enviado.fulfillmentStatus === 'shipped', '4 · com a logística no eixo dela');
ok(typeof enviado.shippedAt === 'string',
  '4 · a data do envio foi gravada na transição', String(enviado.shippedAt));

// Cancelamento com causa, pelo painel.
await painel.chamar('PATCH', `/api/admin/orders/${pedidoLimpo}`, {
  status: 'canceled', cancelReason: 'Cliente desistiu da compra',
});
const cancelado = (await erp('GET', `/api/v1/orders/${pedidoLimpo}`)).json?.order ?? {};
ok(cancelado.cancelReason === 'Cliente desistiu da compra',
  '4 · o motivo do cancelamento chega ao ERP', String(cancelado.cancelReason));
ok(cancelado.canceledBy === 'store', '4 · e quem cancelou', String(cancelado.canceledBy));
ok(typeof cancelado.canceledAt === 'string', '4 · com a data do cancelamento');

// ------------------------------------------------------------- 5. frete ----

ok(lido.shippingCarrier === 'Correios',
  '5 · a transportadora sai limpa, sem prazo junto', String(lido.shippingCarrier));
ok(lido.shippingServiceCode === 'PAC', '5 · com o código do serviço', String(lido.shippingServiceCode));
ok(lido.shippingMinDays === 5 && lido.shippingMaxDays === 7,
  '5 · e o prazo em números', `${lido.shippingMinDays}-${lido.shippingMaxDays}`);
ok(lido.shippingService === 'PAC — até 7 dias úteis',
  '5 · o texto antigo continua existindo, para não quebrar quem já lê');
ok(String(lido.trackingUrl ?? '').includes('AA123456789BR'),
  '5 · e agora existe a URL de rastreio', String(lido.trackingUrl));
ok(lido.shippingCostOwner === 0, '5 · custo do frete para a loja, separado do cobrado',
  String(lido.shippingCostOwner));

// ---------------------------------------------------------- 6. endereço ----

const end = lido.shippingAddress ?? {};
ok(end.country === 'BR', '6 · o endereço traz o país', String(end.country));
ok(end.recipientName === 'Marcelo Teste', '6 · e quem recebe', String(end.recipientName));
ok(end.phone === '(74) 99194-9707', '6 · com telefone de contato', String(end.phone));
ok('cityIbgeCode' in end, '6 · o campo do código IBGE existe no contrato');
ok(lido.billingAddress === null,
  '6 · cobrança vem null quando é o mesmo da entrega, e não repetido',
  JSON.stringify(lido.billingAddress));

// --------------------------------------------------------- 7. UF x CEP ----

/*
 * O checkout gravava a UF que o comprador escolheu numa lista com "SP" já
 * marcado. CEP 44823-478 é Bahia; o pedido saía como SP e a NF-e ia com
 * destino e ICMS errados. Agora a UF é DERIVADA do CEP no servidor.
 */
const loja = cliente();
await loja.sessao();
const cotacao = await loja.chamar('POST', '/api/checkout/quote', {
  items: [{ productId: produto, quantity: 1 }],
  cep: '44823-478', state: 'SP', payment: 'pix',
});
ok(cotacao.json?.uf === 'BA',
  '7 · a loja resolve a UF pelo CEP, ignorando o "SP" que veio da tela',
  String(cotacao.json?.uf));

// ------------------------------------------------------ 8. customerId ----

ok('customerId' in lido, '8 · o pedido referencia o cliente da loja');
ok(limpo.customerId === null, '8 · e vem null no pedido de visitante', JSON.stringify(limpo.customerId));

// ----------------------------------------------------------- 9. itens ----

const item = (lido.items ?? [])[0] ?? {};
ok(item.sku === 'SKU-ERP-1', '9a · o item traz o SKU explícito', String(item.sku));
ok(item.totalPrice === 195, '9b · e o total da linha', String(item.totalPrice));
ok(item.discount === 0, '9c · com o desconto do item, mesmo que zero', String(item.discount));
ok(item.quantity === 1.5,
  '9d · a quantidade aceita fração — venda por peso não é mais truncada',
  String(item.quantity));

// -------------------------------------------------------- 10. desconto ----

ok(lido.discountCoupon === 6.5, '10 · desconto de cupom, separado', String(lido.discountCoupon));
ok(lido.discountPayment === 0, '10 · desconto do meio de pagamento, separado', String(lido.discountPayment));
ok('discount' in lido, '10 · e o total continua existindo');

// ----------------------------------------------------- 11. observação ----

ok(lido.customerNote === 'Entregar após as 18h',
  '11 · a observação do comprador chega ao ERP', String(lido.customerNote));

// ------------------------------------------------------- 12. null vs "" ----

ok(limpo.trackingCode === null, '12 · rastreio ausente é null', JSON.stringify(limpo.trackingCode));
ok(limpo.trackingStatus === null, '12 · status de rastreio ausente é null');
ok(limpo.customerNote === null, '12 · observação ausente é null');

// ------------------------------------------------------- 13. moeda ----

ok(lido.currency === 'BRL', '13 · a moeda do pedido é explícita', String(lido.currency));

// ------------------------------------------------------------ limpeza ----

await q.run('DELETE FROM orders WHERE id IN (?, ?)', [pedidoPago, pedidoLimpo]);
await q.run('DELETE FROM products WHERE id = ?', [produto]);
await painel.chamar('DELETE', `/api/admin/api-keys/${chave.json.id}`);

await closePool();
console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
