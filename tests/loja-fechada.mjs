/**
 * Loja fechada recusa pedido, ou só esconde a vitrine?
 *
 * A diferença é tudo. Esconder a loja no navegador não fecha loja nenhuma: o
 * endereço do checkout continua respondendo, e basta um link antigo, um robô
 * ou uma aba aberta de ontem para um pedido entrar no meio da montagem — com
 * preço provisório, estoque errado e frete não configurado.
 *
 * E tem a outra metade: fechar NÃO pode apagar nada. Produtos, pedidos e
 * cadastros ficam onde estão, e tudo volta como estava ao reabrir.
 *
 *   npm run teste:loja-fechada
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
  let cookie = '', csrf = '';
  const chamar = async (metodo, caminho, corpo) => {
    const h = { Accept: 'application/json' };
    if (cookie) h.Cookie = cookie;
    if (corpo !== undefined) h['Content-Type'] = 'application/json';
    if (metodo !== 'GET' && csrf) h['X-CSRF-Token'] = csrf;
    const r = await fetch(BASE + caminho, {
      method: metodo, headers: h,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    for (const c of (r.headers.getSetCookie?.() ?? [])) cookie = c.split(';')[0];
    const j = await r.json().catch(() => null);
    if (caminho === '/api/session') csrf = j?.csrfToken ?? '';
    return { status: r.status, json: j };
  };
  return { chamar, sessao: () => chamar('GET', '/api/session') };
}

const painel = cliente();
await painel.sessao();
await painel.chamar('POST', '/api/admin/login', ADMIN);
await painel.sessao();

const original = (await painel.chamar('GET', '/api/admin/state')).json?.settings ?? {};
const restaurar = async () => {
  await painel.chamar('PUT', '/api/admin/settings', {
    ...original, storeClosed: original.storeClosed === true, closedMessage: original.closedMessage ?? '',
  });
};

/** Um pedido que seria aceito numa loja aberta. */
const PEDIDO = {
  name: 'Comprador de Teste', email: 'comprador@exemplo.com.br', phone: '11988887777',
  cpf: '390.533.447-05', payment: 'pix',
  address: {
    cep: '01310-100', street: 'Avenida Paulista', number: '1578',
    neighborhood: 'Bela Vista', city: 'São Paulo', state: 'SP',
  },
  items: [{ productId: 'ZZ-DET-1', quantity: 1 }],
};

// --------------------------------------------------------------- 1 ----
await painel.chamar('PUT', '/api/admin/settings', {
  ...original, storeClosed: true, closedMessage: 'Voltamos dia 20.',
});

const visitante = cliente();
await visitante.sessao();

const catalogo = await visitante.chamar('GET', '/api/catalog');
ok(catalogo.status === 200, '1 · o catálogo continua respondendo');
ok(
  catalogo.json?.settings?.storeClosed === true,
  '1 · e avisa que a loja está fechada — é o que a vitrine lê para mostrar o aviso',
);
ok(
  catalogo.json?.settings?.closedMessage === 'Voltamos dia 20.',
  '1 · com o texto que a lojista escreveu',
);
ok(catalogo.json?.admin === false, '1 · e diz que quem está vendo NÃO é do painel');

// --------------------------------------------------------------- 2 ----
// A trava de verdade: o pedido é recusado no servidor.
const tentativa = await visitante.chamar('POST', '/api/orders', PEDIDO);
ok(
  tentativa.status === 503,
  '2 · pedido por link direto é RECUSADO — esconder a vitrine não fecha a loja',
  `veio ${tentativa.status}`,
);
ok(
  tentativa.json?.error?.code === 'store_closed',
  '2 · com um código que o front sabe tratar',
  JSON.stringify(tentativa.json?.error),
);
ok(
  tentativa.json?.error?.message === 'Voltamos dia 20.',
  '2 · e a mensagem da lojista, não um erro genérico',
  String(tentativa.json?.error?.message),
);

const cotacao = await visitante.chamar('POST', '/api/checkout/quote', {
  cep: '01310-100', items: PEDIDO.items,
});
ok(cotacao.status === 503, '2 · cotar frete também é recusado — é o primeiro passo da compra');

// --------------------------------------------------------------- 3 ----
// Quem é do painel passa: é como a lojista confere a própria loja.
const vistoPeloPainel = await painel.chamar('GET', '/api/catalog');
ok(
  vistoPeloPainel.json?.admin === true,
  '3 · quem está logado no painel é reconhecido',
);
const cotacaoAdmin = await painel.chamar('POST', '/api/checkout/quote', {
  cep: '01310-100', items: PEDIDO.items,
});
ok(
  cotacaoAdmin.status === 200,
  '3 · e consegue percorrer a loja fechada, inclusive cotando frete',
  `veio ${cotacaoAdmin.status}`,
);

// --------------------------------------------------------------- 4 ----
// FECHAR NÃO APAGA NADA. É a metade que mais importa.
const estadoFechado = (await painel.chamar('GET', '/api/admin/state')).json ?? {};
ok(
  (estadoFechado.products ?? []).length > 0,
  '4 · com a loja fechada, os produtos continuam no painel',
  `${(estadoFechado.products ?? []).length} produto(s)`,
);
ok(
  Array.isArray(estadoFechado.orders),
  '4 · e os pedidos também — fechar é uma cortina, não uma desmontagem',
  `${(estadoFechado.orders ?? []).length} pedido(s)`,
);
const produtosFechada = (catalogo.json?.products ?? []).length;

// --------------------------------------------------------------- 5 ----
// Reabrir devolve tudo.
await painel.chamar('PUT', '/api/admin/settings', { ...original, storeClosed: false });

const depois = cliente();
await depois.sessao();
const catalogoAberto = await depois.chamar('GET', '/api/catalog');
ok(
  catalogoAberto.json?.settings?.storeClosed === false,
  '5 · reabrir volta a loja para o público',
);
ok(
  (catalogoAberto.json?.products ?? []).length === produtosFechada,
  '5 · com os mesmos produtos de antes — nada se perdeu no caminho',
  `${produtosFechada} → ${(catalogoAberto.json?.products ?? []).length}`,
);

const aceito = await depois.chamar('POST', '/api/checkout/quote', {
  cep: '01310-100', items: PEDIDO.items,
});
ok(aceito.status === 200, '5 · e o checkout volta a funcionar', `veio ${aceito.status}`);

await restaurar();
console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
