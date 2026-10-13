/**
 * Variações: o "produto pai" montado no painel.
 *
 * Este teste existe para provar a promessa central feita ao time do ERP: o
 * agrupamento MORRE NA VITRINE. Nada do que acontece aqui pode vazar para o
 * contrato de integração — nem no `GET /products`, que continua plano, nem no
 * pedido, que continua carregando o código da variação.
 *
 * O modo de falha que isso evita é o pior possível e é silencioso: se um item
 * de pedido apontasse para o grupo e o código do grupo por acaso existisse
 * como produto no ERP, o pedido importaria o produto ERRADO, baixaria o
 * estoque errado e emitiria nota fiscal errada, sem alerta nenhum.
 *
 *   npm run teste:variacoes
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

function navegador() {
  let cookie = '';
  let csrf = '';
  const chamar = async (metodo, caminho, corpo) => {
    const h = { Accept: 'application/json' };
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

const painel = navegador();
await painel.sessao();
await painel.chamar('POST', '/api/admin/login', ADMIN);
await painel.sessao();

const chaveApi = await painel.chamar('POST', '/api/admin/api-keys', { name: `teste-var-${Date.now()}` });
const TOKEN = chaveApi.json?.token ?? '';
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
const catalogo = async () => (await fetch(`${BASE}/api/catalog`).then((r) => r.json()));

// ------------------------------------------------------------ cenário ----

const marca = Date.now();
const CATEGORIA = String((await q.one('SELECT id FROM categories ORDER BY position ASC LIMIT 1'))?.id ?? '');
const P15 = `VAR-15-${marca}`;
const P20 = `VAR-20-${marca}`;
const P25 = `VAR-25-${marca}`;
const SOLTO = `VAR-SO-${marca}`;

const criarPeloErp = (id, nome, preco, estoque) => erp('PUT', `/api/v1/products/${id}`, {
  name: nome, price: preco, stock: estoque, sku: id, category: CATEGORIA, weight: 0.8,
});

const r15 = await criarPeloErp(P15, 'Pirâmide de cobre 15cm', 180, 5);
await criarPeloErp(P20, 'Pirâmide de cobre 20cm', 240, 3);
await criarPeloErp(P25, 'Pirâmide de cobre 25cm', 320, 0);
await criarPeloErp(SOLTO, 'Difusor de cerâmica', 90, 7);

// ---------------------------------- 1. produto novo nasce retido ----

ok(r15.status === 201, '1 · o ERP cria o produto normalmente', String(r15.status));
const retido = await q.one('SELECT pending_group FROM products WHERE id = ?', [P15]);
ok(Number(retido?.pending_group) === 1,
  '1 · e ele nasce RETIDO para conferência de agrupamento',
  String(retido?.pending_group));
ok((r15.json?.warnings ?? []).some((w) => String(w).includes('RETIDO')),
  '1 · a resposta ao ERP diz isso com todas as letras',
  JSON.stringify(r15.json?.warnings));

const antesDePublicar = await catalogo();
ok(!(antesDePublicar.products ?? []).some((p) => p.id === P15),
  '1 · produto retido NÃO aparece na vitrine');

const naApiDoErp = (await erp('GET', '/api/v1/products')).json?.products ?? [];
ok(naApiDoErp.some((p) => p.id === P15),
  '1 · mas CONTINUA na API do ERP — a reconciliação de vínculo dele lê essa lista');

/*
 * A retenção vale só para quem é criado. Atualizar um produto que já estava
 * vendendo não pode tirá-lo da vitrine.
 */
await painel.chamar('POST', '/api/admin/products/publicar', { ids: [SOLTO] });
await criarPeloErp(SOLTO, 'Difusor de cerâmica', 95, 7);
const soltoDepois = await q.one('SELECT pending_group FROM products WHERE id = ?', [SOLTO]);
ok(Number(soltoDepois?.pending_group) === 0,
  '1 · atualização do ERP não volta a reter quem já estava publicado',
  String(soltoDepois?.pending_group));

const publicados = await painel.chamar('POST', '/api/admin/products/publicar', {
  ids: [P15, P20, P25],
});
ok(publicados.status === 200 && Number(publicados.json?.released) === 3,
  '1 · "publicar solto" libera a fila', JSON.stringify(publicados.json?.released));

// ------------------------------------------------ 2. criar o grupo ----

const corpoDoGrupo = (extra = {}) => ({
  name: `Pirâmide de cobre ${marca}`,
  description: 'Uma peça, três tamanhos.',
  category: CATEGORIA,
  axes: [{ name: 'Tamanho', options: ['15cm', '20cm', '25cm'] }],
  variants: [
    { productId: P15, values: { Tamanho: '15cm' } },
    { productId: P20, values: { Tamanho: '20cm' } },
    { productId: P25, values: { Tamanho: '25cm' } },
  ],
  ...extra,
});

const criado = await painel.chamar('POST', '/api/admin/product-groups', corpoDoGrupo());
ok(criado.status === 201, '2 · o grupo é criado pelo painel', String(criado.status));
const GRUPO = criado.json?.id ?? '';
ok(GRUPO !== '' && !GRUPO.includes(' '), '2 · com um slug, que é o endereço público', GRUPO);

const noEstado = (criado.json?.productGroups ?? []).find((g) => g.id === GRUPO) ?? {};
ok((noEstado.axes ?? []).length === 1 && noEstado.axes[0].name === 'Tamanho',
  '2 · com o eixo gravado');
ok((noEstado.axes?.[0]?.options ?? []).map((o) => o.value).join(',') === '15cm,20cm,25cm',
  '2 · e as opções NA ORDEM em que foram definidas — é a ordem do seletor',
  JSON.stringify(noEstado.axes?.[0]?.options));
ok((noEstado.variants ?? []).length === 3, '2 · com as três variações');

ok(noEstado.code !== undefined && String(noEstado.code).startsWith('GRP-'),
  '2 · o grupo tem um código próprio, para diagnóstico', String(noEstado.code));
ok(noEstado.price === undefined && noEstado.stock === undefined && noEstado.sku === undefined,
  '2 · e NÃO tem preço, estoque nem SKU: o grupo não é comprável',
  JSON.stringify(Object.keys(noEstado)));

// ------------------------------------------- 3. a vitrine agrupa ----

const comGrupo = await catalogo();
const grupoNaVitrine = (comGrupo.groups ?? []).find((g) => g.id === GRUPO) ?? null;
ok(grupoNaVitrine !== null, '3 · o grupo chega no catálogo da vitrine');
ok((comGrupo.products ?? []).some((p) => p.id === P15),
  '3 · e as variações CONTINUAM no catálogo — a página do grupo lê o preço e o estoque delas');
ok((grupoNaVitrine?.variants ?? []).every((v) => v.price === undefined),
  '3 · a variação do grupo não repete preço: uma fonte só para cada número');

// ------------------------------- 4. o contrato do ERP não muda ----

const listaDoErp = (await erp('GET', '/api/v1/products')).json?.products ?? [];
const p15NoErp = listaDoErp.find((p) => p.id === P15) ?? {};
ok(listaDoErp.filter((p) => [P15, P20, P25].includes(p.id)).length === 3,
  '4 · GET /products continua plano: uma entrada por variação, todas visíveis');
ok(!listaDoErp.some((p) => p.id === GRUPO),
  '4 · e o GRUPO não aparece nessa lista — ele não é produto');
ok(p15NoErp.groupCode === String(noEstado.code),
  '4 · cada variação traz groupCode, só para diagnóstico', String(p15NoErp.groupCode));
ok(p15NoErp.groupName !== null && p15NoErp.groupName !== undefined,
  '4 · com o nome do grupo', String(p15NoErp.groupName));
ok((p15NoErp.options ?? [])[0]?.name === 'Tamanho'
  && (p15NoErp.options ?? [])[0]?.value === '15cm',
  '4 · e as opções dela', JSON.stringify(p15NoErp.options));

const soltoNoErp = listaDoErp.find((p) => p.id === SOLTO) ?? {};
ok(soltoNoErp.groupCode === null,
  '4 · produto sem grupo traz groupCode null, e não campo ausente',
  JSON.stringify(soltoNoErp.groupCode));
ok(Array.isArray(soltoNoErp.options) && soltoNoErp.options.length === 0,
  '4 · com options vazio');

const umSo = (await erp('GET', `/api/v1/products/${P20}`)).json?.product ?? {};
ok(umSo.groupCode === String(noEstado.code), '4 · o GET de um produto só também traz');

/*
 * A escrita continua sendo só do painel: se o ERP mandar groupCode, a loja
 * ignora. Sem isso, o agrupamento teria duas fontes sem precedência definida.
 */
const tentativa = await erp('PUT', `/api/v1/products/${SOLTO}`, {
  groupCode: 'GRP-INVENTADO', price: 95,
});
const soltoDepoisDaTentativa = await q.one('SELECT group_id FROM products WHERE id = ?', [SOLTO]);
ok(soltoDepoisDaTentativa?.group_id === null,
  '4 · groupCode enviado pelo ERP é IGNORADO — agrupar é decisão do painel',
  String(soltoDepoisDaTentativa?.group_id));
ok((tentativa.json?.warnings ?? []).some((w) => String(w).includes('groupCode')),
  '4 · e a resposta avisa que o campo foi ignorado, em vez de aceitar calado',
  JSON.stringify(tentativa.json?.warnings));

// -------------------------------------------- 5. as validações duras ----

const outro = await painel.chamar('POST', '/api/admin/product-groups', {
  name: `Outro grupo ${marca}`,
  category: CATEGORIA,
  axes: [{ name: 'Tamanho', options: ['15cm'] }],
  variants: [{ productId: P15, values: { Tamanho: '15cm' } }],
});
ok(outro.status === 422,
  '5 · o mesmo produto em dois grupos é recusado', String(outro.status));

const repetida = await painel.chamar('PUT', `/api/admin/product-groups/${GRUPO}`, corpoDoGrupo({
  variants: [
    { productId: P15, values: { Tamanho: '15cm' } },
    { productId: P20, values: { Tamanho: '15cm' } },
  ],
}));
ok(repetida.status === 422,
  '5 · duas variações com a mesma combinação são recusadas', String(repetida.status));

const semValor = await painel.chamar('PUT', `/api/admin/product-groups/${GRUPO}`, corpoDoGrupo({
  axes: [
    { name: 'Tamanho', options: ['15cm', '20cm', '25cm'] },
    { name: 'Acabamento', options: ['Polido'] },
  ],
}));
ok(semValor.status === 422,
  '5 · variação sem valor em algum eixo é recusada', String(semValor.status));

const inexistente = await painel.chamar('PUT', `/api/admin/product-groups/${GRUPO}`, corpoDoGrupo({
  variants: [{ productId: `NAO-EXISTE-${marca}`, values: { Tamanho: '15cm' } }],
}));
ok(inexistente.status === 422,
  '5 · SKU que a loja não tem não entra no grupo — é a resposta para "e se o ERP nunca enviou"',
  String(inexistente.status));

const semEixo = await painel.chamar('PUT', `/api/admin/product-groups/${GRUPO}`, corpoDoGrupo({
  axes: [], variants: [],
}));
ok(semEixo.status === 422, '5 · grupo sem nenhum eixo é recusado', String(semEixo.status));

const semCategoria = await painel.chamar('POST', '/api/admin/product-groups', corpoDoGrupo({
  category: `nao-existe-${marca}`, variants: [],
}));
ok(semCategoria.status === 422, '5 · categoria que a loja não tem é recusada');

/* Nenhuma recusa pode ter deixado o grupo pela metade. */
const inteiro = ((await painel.chamar('GET', '/api/admin/state')).json?.productGroups ?? [])
  .find((g) => g.id === GRUPO) ?? {};
ok((inteiro.variants ?? []).length === 3 && (inteiro.axes ?? []).length === 1,
  '5 · depois de seis recusas, o grupo continua inteiro e válido',
  `${(inteiro.axes ?? []).length} eixo(s), ${(inteiro.variants ?? []).length} variação(ões)`);

// ------------------------------------ 6. o pedido não vê o grupo ----

const loja = navegador();
await loja.sessao();
const pedido = await loja.chamar('POST', '/api/checkout/quote', {
  items: [{ productId: P15, quantity: 1 }, { productId: P20, quantity: 2 }],
  cep: '01310-100', payment: 'pix',
});
ok(pedido.status === 200,
  '6 · duas variações do mesmo grupo cotam como dois itens', String(pedido.status));

await q.run(
  `INSERT INTO orders (id, customer_name, customer_email, subtotal, total, status, payment,
                       ship_cep, ship_city, ship_state)
   VALUES (?, 'Teste de variação', 'var@exemplo.com', 660, 660, 'pending', 'pix',
           '01310-100', 'São Paulo', 'SP')`,
  [`VAR-${String(marca).slice(-9)}`],
);
await q.run(
  `INSERT INTO order_items (order_id, product_id, sku, name, quantity, unit_price, total_price)
   VALUES (?,?,?,?,1,180,180), (?,?,?,?,2,240,480)`,
  [
    `VAR-${String(marca).slice(-9)}`, P15, P15, 'Pirâmide de cobre 15cm',
    `VAR-${String(marca).slice(-9)}`, P20, P20, 'Pirâmide de cobre 20cm',
  ],
);
const pedidoNoErp = (await erp('GET', `/api/v1/orders/VAR-${String(marca).slice(-9)}`)).json?.order ?? {};
const itens = pedidoNoErp.items ?? [];
ok(itens.length === 2, '6 · o pedido tem duas linhas independentes', String(itens.length));
ok(itens.every((i) => i.sku !== GRUPO && i.productId !== GRUPO),
  '6 · e NENHUMA delas carrega o código do grupo — era o modo de falha silencioso');
ok(JSON.stringify(pedidoNoErp).includes(P15) && !JSON.stringify(pedidoNoErp).includes(GRUPO),
  '6 · o grupo não aparece em campo nenhum do pedido');

// ----------------------------------------- 7. desfazer o agrupamento ----

const apagado = await painel.chamar('DELETE', `/api/admin/product-groups/${GRUPO}`);
ok(apagado.status === 200 && Number(apagado.json?.released) === 3,
  '7 · apagar o grupo devolve os produtos', JSON.stringify(apagado.json?.released));

const aindaVivos = await q.one(
  'SELECT COUNT(*) AS n FROM products WHERE id IN (?, ?, ?)', [P15, P20, P25],
);
ok(Number(aindaVivos?.n) === 3,
  '7 · e NÃO apaga os produtos: eles são do ERP, têm estoque e podem estar em pedidos');

const depoisDeApagar = await catalogo();
ok((depoisDeApagar.groups ?? []).every((g) => g.id !== GRUPO), '7 · o grupo some da vitrine');
ok((depoisDeApagar.products ?? []).some((p) => p.id === P15),
  '7 · e a variação volta a ser card solto, como era antes de ser agrupada');

const pedidoDepois = (await erp('GET', `/api/v1/orders/VAR-${String(marca).slice(-9)}`)).json?.order ?? {};
ok((pedidoDepois.items ?? []).length === 2,
  '7 · o pedido feito antes continua inteiro — desagrupar é apresentação, não catálogo');

// ------------------------------------------------------------ limpeza ----

await q.run('DELETE FROM orders WHERE id = ?', [`VAR-${String(marca).slice(-9)}`]);
await q.run('DELETE FROM products WHERE id IN (?, ?, ?, ?)', [P15, P20, P25, SOLTO]);
await q.run('DELETE FROM product_groups WHERE id = ?', [GRUPO]);
await painel.chamar('DELETE', `/api/admin/api-keys/${chaveApi.json.id}`);

await closePool();
console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
