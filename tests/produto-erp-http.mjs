/**
 * Estoque fracionado e peso numérico — contra o servidor rodando.
 *
 * O teste unitário cobre as conversões. Este cobre o que só o banco revela: se
 * a coluna guarda a fração ou trunca, e se o valor que volta na resposta é o
 * que ficou gravado. Um `DECIMAL` mal declarado passa em todo teste de função
 * e perde a fração exatamente aqui.
 *
 *   npm run teste:produto-erp
 */

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

// Chave de API nova, para falar como o ERP fala.
const chave = await painel.chamar('POST', '/api/admin/api-keys', { name: 'Teste produto ERP' });
const TOKEN = chave.json?.token ?? '';
ok(TOKEN.startsWith('qp_live_'), 'chave de API criada para o teste');
const comoErp = (metodo, caminho, corpo) =>
  cliente().chamar(metodo, caminho, corpo, { Authorization: `Bearer ${TOKEN}` });

const id = `teste-erp-${Date.now()}`;

// ------------------------------------------------- criar com fração ----

const criado = await comoErp('PUT', `/api/v1/products/${id}`, {
  name: 'Peça de teste do ERP',
  sku: 'T-0001',
  category: 'piramides',
  price: 50,
  stock: 7.5,
  weight: 0.2,
  weightLabel: 'Base 15cm · cobre',
});
ok(criado.status === 201, 'produto criado pelo ERP', JSON.stringify(criado.json));

const lido = await comoErp('GET', `/api/v1/products/${id}`);
const p = lido.json?.product ?? {};

ok(p.stock === 7.5, 'estoque fracionado sobrevive ao banco', JSON.stringify(p.stock));
ok(typeof p.stock === 'number', 'e volta como número, não texto', typeof p.stock);
ok(p.weight === 0.2, 'peso volta como número em quilos', JSON.stringify(p.weight));
ok(typeof p.weight === 'number', 'e não como texto formatado', typeof p.weight);
ok(p.weightLabel === 'Base 15cm · cobre', 'o rótulo de medida tem campo próprio', String(p.weightLabel));

// ------------------------------------------ PATCH do saldo com fração ----

const patch = await comoErp('PATCH', `/api/v1/products/${id}/stock`, { stock: 3.25 });
ok(patch.status === 200, 'PATCH de estoque aceita fração', JSON.stringify(patch.json));
ok(patch.json?.stock === 3.25, 'e a resposta traz o saldo gravado', JSON.stringify(patch.json?.stock));

const negativo = await comoErp('PATCH', `/api/v1/products/${id}/stock`, { stock: -1 });
ok(negativo.status === 422, 'saldo negativo continua recusado', String(negativo.status));

// ------------------------------------------------- avisos que importam ----

const semPeso = await comoErp('PUT', `/api/v1/products/${id}`, { weight: 0 });
ok(
  (semPeso.json?.warnings ?? []).some((w) => /500 g/.test(w)),
  'peso zero avisa que o frete vai usar o padrão',
  JSON.stringify(semPeso.json?.warnings),
);

const unidadeErrada = await comoErp('PUT', `/api/v1/products/${id}`, { weight: 200 });
ok(
  (unidadeErrada.json?.warnings ?? []).some((w) => /QUILO/.test(w)),
  'peso de 200 avisa sobre a unidade, e não recusa',
  JSON.stringify(unidadeErrada.json?.warnings),
);

const textoNoPeso = await comoErp('PUT', `/api/v1/products/${id}`, { weight: '0,2kg' });
ok(
  (textoNoPeso.json?.warnings ?? []).some((w) => /numérico, em quilos/.test(w)),
  'texto com unidade é aceito, convertido e avisado',
  JSON.stringify(textoNoPeso.json?.warnings),
);
const depoisDoTexto = await comoErp('GET', `/api/v1/products/${id}`);
ok(depoisDoTexto.json?.product?.weight === 0.2, '"0,2kg" virou 0.2 no banco',
  JSON.stringify(depoisDoTexto.json?.product?.weight));

// ------------------------------------------ o pedido baixa saldo fracionado ----

/*
 * O caminho do pedido é o mais delicado da loja: a baixa de estoque é
 * `stock = stock - ? WHERE stock >= ?`. Com DECIMAL isso continua valendo, mas
 * é aqui que um erro apareceria — e apareceria como venda perdida.
 */
await comoErp('PUT', `/api/v1/products/${id}`, { stock: 2.5, active: true, price: 50 });
const antes = (await comoErp('GET', `/api/v1/products/${id}`)).json?.product?.stock;

const loja = cliente();
await loja.sessao();
const cotacao = await loja.chamar('POST', '/api/checkout/quote', {
  items: [{ productId: id, quantity: 2 }],
  cep: '01310100',
  payment: 'pix',
});
ok(cotacao.status === 200, 'a loja cota um produto de saldo fracionado', JSON.stringify(cotacao.json));

// O corpo do pedido é plano (name/email/phone/cpf) com `address` aninhado, e
// o CPF é validado de verdade — 529.982.247-25 é um CPF de teste válido.
const pedido = await loja.chamar('POST', '/api/orders', {
  items: [{ productId: id, quantity: 2 }],
  payment: 'pix',
  name: 'Teste Fração',
  email: 'fracao@exemplo.com',
  phone: '(11) 90000-0000',
  cpf: '529.982.247-25',
  address: {
    cep: '01310100', street: 'Av. Paulista', number: '1000',
    neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP',
  },
});
const criouPedido = pedido.status === 200 || pedido.status === 201;
const semPagamento = pedido.json?.error?.code === 'payments_disabled';

if (semPagamento) {
  /*
   * Base sem provedor de pagamento cadastrado: o pedido para antes da baixa,
   * de propósito (a loja não grava pedido que ninguém vai cobrar).
   *
   * Não conto como falha — não é a mudança que está sendo testada —, mas
   * também não passo por cima: a baixa de saldo fracionado é verificada no
   * banco por tests/pagamento-banco.mjs, que não depende de provedor.
   */
  console.log('     (pedido não testado aqui: nenhum meio de pagamento cadastrado nesta base;');
  console.log('      a baixa de saldo fracionado é coberta por tests/pagamento-banco.mjs)');
} else {
  ok(criouPedido, 'e cria o pedido', JSON.stringify(pedido.json).slice(0, 200));
  if (criouPedido) {
    const depois = (await comoErp('GET', `/api/v1/products/${id}`)).json?.product?.stock;
    ok(
      Math.abs(Number(antes) - Number(depois) - 2) < 0.0001,
      `a baixa tirou exatamente 2 do saldo fracionado (${antes} → ${depois})`,
      `${antes} → ${depois}`,
    );
  }
}

// Limpeza: some da vitrine e a chave é revogada.
await comoErp('PUT', `/api/v1/products/${id}`, { active: false });
await painel.chamar('PATCH', `/api/admin/api-keys/${chave.json?.id}`, { revoked: true });

console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
