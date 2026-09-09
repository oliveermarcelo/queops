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
 * A trava que protege o histórico: apagar um produto vendido deixaria o pedido
 * de quem comprou sem o item. Vale mais um produto inativo pendurado na lista
 * do que um pedido antigo ilegível.
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

const comVenda = (await estado()).productsWithOrders ?? [];
ok(comVenda.includes(vendido),
  'o painel enxerga que este produto tem venda');

const bloqueado = await painel.chamar('DELETE', `/api/admin/products/${vendido}?definitivo=1`);
ok(bloqueado.status === 409, 'produto vendido NÃO é apagado', String(bloqueado.status));
ok(/pedido/i.test(String(bloqueado.json?.error?.message)),
  'e a recusa explica o motivo, em vez de um erro genérico',
  JSON.stringify(bloqueado.json?.error?.message));

ok(noPainel(await estado(), vendido) !== undefined,
  'ele continua existindo, com o histórico do pedido intacto');

// Limpeza do que este teste criou no banco.
await q.run('DELETE FROM order_items WHERE order_id = ?', [pedido]);
await q.run('DELETE FROM orders WHERE id = ?', [pedido]);
await q.run('DELETE FROM products WHERE id = ?', [vendido]);

// O painel sabe quem já foi vendido, para não oferecer um botão que a rota nega.
const s = await estado();
ok(Array.isArray(s.productsWithOrders),
  'o painel recebe a lista de produtos com venda',
  typeof s.productsWithOrders);

await closePool();
console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
