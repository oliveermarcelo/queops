/**
 * Excluir produto pelo painel — os dois caminhos.
 *
 * O relato que motivou este arquivo foi "clico para deletar e não deleta". O
 * botão funcionava: fazia exclusão suave, e a lista do painel — que mostra
 * também os inativos — continuava exibindo o produto igual aos outros. Nada na
 * tela dizia que algo tinha mudado.
 *
 * Então o que precisa ficar verdadeiro é isto: a exclusão suave TIRA da
 * vitrine e MANTÉM no painel, marcada; e existe um caminho que apaga de
 * verdade, disponível só para quem nunca foi vendido.
 *
 *   npm run teste:excluir
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
      method: metodo,
      headers: h,
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

const estado = async () => (await painel.chamar('GET', '/api/admin/state')).json;
const noPainel = (s, id) => (s.products ?? []).find((p) => p.id === id);

const marca = Date.now();
const novo = `excluir-${marca}`;

// --------------------------------------------- produto nunca vendido ----

await painel.chamar('POST', '/api/admin/products', {
  id: novo, name: 'Produto para excluir', price: 30, stock: 5, category: 'piramides',
});
ok(noPainel(await estado(), novo) !== undefined, 'produto criado aparece no painel');

const suave = await painel.chamar('DELETE', `/api/admin/products/${novo}`);
ok(suave.status === 200, 'a exclusão padrão responde 200', String(suave.status));
ok(suave.json?.apagado === false, 'e informa que NÃO apagou a linha', String(suave.json?.apagado));

const depoisSuave = await estado();
const linha = noPainel(depoisSuave, novo);
ok(linha !== undefined, 'o produto CONTINUA no painel — é exclusão suave');
ok(linha?.active === false,
  'mas marcado como inativo, que é o que a tela precisa mostrar',
  String(linha?.active));

const vitrine = await cliente().chamar('GET', '/api/catalog');
ok(!(vitrine.json?.products ?? []).some((p) => p.id === novo),
  'e sumiu da vitrine, que é o efeito real do botão');

// Voltar atrás.
await painel.chamar('POST', '/api/admin/products', { id: novo, name: 'Produto para excluir', price: 30, active: true });
ok(noPainel(await estado(), novo)?.active === true, 'dá para colocar de volta na vitrine');

// ------------------------------------------------ apagar em definitivo ----

await painel.chamar('DELETE', `/api/admin/products/${novo}`);
const definitivo = await painel.chamar('DELETE', `/api/admin/products/${novo}?definitivo=1`);
ok(definitivo.status === 200, 'apagar em definitivo responde 200', String(definitivo.status));
ok(definitivo.json?.apagado === true, 'e diz que apagou de verdade', String(definitivo.json?.apagado));
ok(noPainel(await estado(), novo) === undefined,
  'agora o produto sai do painel também');

// -------------------------------------- produto que já foi vendido ----

/*
 * A trava vale enquanto o pedido vale.
 *
 * Ela existe para não tirar um produto dos relatórios no meio de uma venda em
 * andamento — e NÃO, como a mensagem antiga afirmava, para impedir que o
 * pedido fique sem o item: `order_items` guarda cópia própria do nome, da
 * quantidade e do preço, e não referencia `products`. Isso é verificado
 * explicitamente mais abaixo, porque foi a crença errada que tornou a trava
 * intransponível: contando qualquer pedido, cancelar não liberava nada e um
 * produto de teste vendido uma vez ficava na lista para sempre.
 */
/*
 * A venda é criada aqui, direto no banco, em vez de depender de a base ter um
 * pedido antigo. Um teste que só verifica a trava "se houver dado" é um teste
 * que não roda justamente na base limpa onde o erro seria introduzido.
 */
const vendido = `vendido-${marca}`;
// orders.id é VARCHAR(24) — o carimbo inteiro não cabe.
const pedido = `TST-${String(marca).slice(-9)}`;

await painel.chamar('POST', '/api/admin/products', {
  id: vendido, name: 'Produto já vendido', price: 40, stock: 2, category: 'piramides',
});
await q.run(
  `INSERT INTO orders (id, customer_name, customer_email, subtotal, total, status, payment)
   VALUES (?, 'Teste', 'teste@exemplo.com', 40, 40, 'paid', 'pix')`,
  [pedido],
);
await q.run(
  `INSERT INTO order_items (order_id, product_id, name, quantity, unit_price)
   VALUES (?, ?, 'Produto já vendido', 1, 40)`,
  [pedido, vendido],
);

const comVenda = (await estado()).productsWithActiveOrders ?? [];
ok(comVenda.includes(vendido),
  'o painel enxerga que este produto está preso a um pedido que vale');

const bloqueado = await painel.chamar('DELETE', `/api/admin/products/${vendido}?definitivo=1`);
ok(bloqueado.status === 409, 'produto em pedido que vale NÃO é apagado', String(bloqueado.status));
ok(/cancele/i.test(String(bloqueado.json?.error?.message)),
  'e a recusa diz COMO sair dela, em vez de ser um beco sem saída',
  JSON.stringify(bloqueado.json?.error?.message));

ok(noPainel(await estado(), vendido) !== undefined,
  'ele continua existindo, com o histórico do pedido intacto');

// ------------------------------- cancelar o pedido libera o produto ----

/*
 * O relato que motivou esta parte: "mesmo colocando todos os pedidos para
 * cancelado, não consegui deletar o produto". A trava contava qualquer pedido,
 * então não havia nada que a pessoa pudesse fazer para sair dela.
 */
await painel.chamar('PATCH', `/api/admin/orders/${pedido}`, { status: 'canceled' });

const depoisDeCancelar = (await estado()).productsWithActiveOrders ?? [];
ok(!depoisDeCancelar.includes(vendido),
  'cancelado o pedido, o painel deixa de mostrar o produto como preso');

const liberado = await painel.chamar('DELETE', `/api/admin/products/${vendido}?definitivo=1`);
ok(liberado.status === 200, 'e agora o produto é apagado de verdade', String(liberado.status));
ok(noPainel(await estado(), vendido) === undefined, 'ele some da lista do painel');

/*
 * A verificação que derruba a justificativa antiga: com o produto apagado, o
 * pedido continua mostrando o item, o nome e o preço do dia da compra.
 */
const itensDoPedido = await q.all(
  'SELECT name, quantity, unit_price FROM order_items WHERE order_id = ?',
  [pedido],
);
ok(itensDoPedido.length === 1, 'o pedido continua com o item', String(itensDoPedido.length));
ok(String(itensDoPedido[0]?.name) === 'Produto já vendido',
  'e o item ainda tem nome — apagar o produto não deixou o pedido ilegível',
  String(itensDoPedido[0]?.name));
ok(Number(itensDoPedido[0]?.unit_price) === 40,
  'e o preço do dia da compra, que é o que importa no histórico',
  String(itensDoPedido[0]?.unit_price));

// ------------------------------------------------- apagar o pedido ----

const apagaCancelado = await painel.chamar('DELETE', `/api/admin/orders/${pedido}`);
ok(apagaCancelado.status === 200, 'pedido cancelado e não pago é apagado',
  String(apagaCancelado.status));
const sobrou = await q.all('SELECT id FROM orders WHERE id = ?', [pedido]);
ok(sobrou.length === 0, 'a linha some do banco');
const itensOrfaos = await q.all('SELECT id FROM order_items WHERE order_id = ?', [pedido]);
ok(itensOrfaos.length === 0, 'e os itens caem junto, sem deixar órfão', String(itensOrfaos.length));

/*
 * Pedido PAGO nunca some — é o registro de dinheiro que entrou, e não existe
 * como reconstruí-lo depois.
 */
const pago = `TSP-${String(marca).slice(-9)}`;
await q.run(
  `INSERT INTO orders (id, customer_name, customer_email, subtotal, total, status, payment, paid_at)
   VALUES (?, 'Teste', 'teste@exemplo.com', 40, 40, 'paid', 'pix', NOW())`,
  [pago],
);
const recusaPago = await painel.chamar('DELETE', `/api/admin/orders/${pago}`);
ok(recusaPago.status === 409, 'pedido pago NÃO é apagado', String(recusaPago.status));

/*
 * E marcar o pago como "cancelado" na tela não abre a porta.
 *
 * `status` é editável no painel; `paid_at` é o fato. Se a regra olhasse só o
 * status, dois cliques apagariam justamente o que ela existe para proteger.
 */
await painel.chamar('PATCH', `/api/admin/orders/${pago}`, { status: 'canceled' });
const aindaRecusa = await painel.chamar('DELETE', `/api/admin/orders/${pago}`);
ok(aindaRecusa.status === 409,
  'e marcá-lo como cancelado na tela não libera — o que vale é o pagamento',
  String(aindaRecusa.status));
await q.run('DELETE FROM orders WHERE id = ?', [pago]);

/*
 * Cobrança em aberto segura o pedido. Sem isso, o Pix pago depois chegaria por
 * webhook sem pedido a que se referir: dinheiro dentro, pedido nenhum.
 */
const comPix = `TSX-${String(marca).slice(-9)}`;
await q.run(
  `INSERT INTO orders (id, customer_name, customer_email, subtotal, total, status, payment,
                       payment_ref)
   VALUES (?, 'Teste', 'teste@exemplo.com', 40, 40, 'pending', 'pix', ?)`,
  [comPix, `ref-${marca}`],
);
const recusaAberta = await painel.chamar('DELETE', `/api/admin/orders/${comPix}`);
ok(recusaAberta.status === 409, 'pedido com cobrança em aberto NÃO é apagado',
  String(recusaAberta.status));
ok(/cancelado/i.test(String(recusaAberta.json?.error?.message)),
  'e a recusa aponta o caminho: cancelar primeiro',
  JSON.stringify(recusaAberta.json?.error?.message));

await painel.chamar('PATCH', `/api/admin/orders/${comPix}`, { status: 'canceled' });
const agoraVai = await painel.chamar('DELETE', `/api/admin/orders/${comPix}`);
ok(agoraVai.status === 200, 'cancelado, ele pode ser apagado', String(agoraVai.status));

// O painel sabe quem está preso, para não oferecer um botão que a rota nega.
const s = await estado();
ok(Array.isArray(s.productsWithActiveOrders),
  'o painel recebe a lista de produtos presos a pedido que vale',
  typeof s.productsWithActiveOrders);

// Limpeza do que este teste criou no banco.
await q.run('DELETE FROM orders WHERE id IN (?, ?, ?)', [pedido, pago, comPix]);
await q.run('DELETE FROM products WHERE id = ?', [vendido]);

await closePool();
console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
