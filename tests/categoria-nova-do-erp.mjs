/**
 * Categoria NOVA no ERP: dá para colocá-la na loja sem destruir a árvore?
 *
 * É o caso real: a lojista cadastra "Incensos" no ERP, a categoria chega na
 * lista do painel, e o seletor de amarração não oferece nada — porque ele só
 * lista o que a LOJA já tem. Antes restavam duas saídas, as duas ruins:
 * jogar os produtos numa categoria existente, misturando prateleira, ou rodar
 * o espelhamento, que apaga a árvore inteira por causa de um item.
 *
 * Este teste prova a terceira: criar a categoria a partir do nome que veio do
 * ERP, no lugar que a hierarquia do ERP indica, amarrando o código e soltando
 * na vitrine os produtos que estavam esperando.
 *
 *   npm run teste:categoria-nova
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
      csrf = (await chamar('GET', '/api/session')).json?.csrfToken ?? '';
    },
  };
}

const painel = cliente();
await painel.sessao();
await painel.chamar('POST', '/api/admin/login', ADMIN);
await painel.sessao();
// Mesma razão do teste de categorias: o assunto aqui é a árvore, não a
// retenção de produto novo, que tem teste próprio.
await painel.chamar('PUT', '/api/admin/settings', { holdNewProducts: false });

const chave = await painel.chamar('POST', '/api/admin/api-keys', { name: 'Teste categoria nova' });
const TOKEN = chave.json?.token ?? '';
const erp = (metodo, caminho, corpo) =>
  cliente().chamar(metodo, caminho, corpo, { Authorization: `Bearer ${TOKEN}` });

const PAI = 'zz-pai-' + Date.now();
const FILHA = 'zz-filha-' + Date.now();
// O PUT /api/v1/products/:id usa o caminho como ID do produto, não como SKU.
const ID = 'ZZ-INC-' + Date.now();

// ---------------------------------------------------------------- 1 ----
// O ERP manda PAI (com filha). O pai é amarrado à mão, como hoje se faz.
const carga = await erp('PUT', '/api/v1/categories', {
  categories: [
    { code: PAI, name: 'ZZ Incensos e Incensarios' },
    { code: FILHA, name: 'ZZ Incensos', parentCode: PAI },
  ],
});
ok(carga.status === 200, '1 · o ERP consegue mandar categoria nova');

const lista = (await painel.chamar('GET', '/api/admin/state')).json ?? {};
const chegou = (lista.erpCategories ?? []).filter((c) => c.code === PAI || c.code === FILHA);
ok(chegou.length === 2, '1 · as duas chegaram na lista do painel');
ok(
  chegou.every((c) => c.linked === false),
  '1 · e chegam SEM amarração — a loja não adivinha onde elas vão',
);

// ---------------------------------------------------------------- 2 ----
// O pai ganha destino no primeiro nível.
const criouPai = await painel.chamar('POST', `/api/admin/erp-categories/${PAI}/criar-destino`);
ok(criouPai.status === 200, '2 · o código sem destino cria a própria categoria');
const slugPai = criouPai.json?.category ?? '';
// startsWith e não igualdade: rodar o teste duas vezes deixa o slug ocupado,
// e o sufixo é o comportamento certo — não um defeito.
ok(slugPai.startsWith('zz-incensos-e-incensarios'), '2 · com slug tirado do nome do ERP', slugPai);
ok(criouPai.json?.subcategory === null, '2 · no primeiro nível, por não ter pai no ERP');

// ---------------------------------------------------------------- 3 ----
// A filha nasce DENTRO do pai, que é o ponto todo.
const criouFilha = await painel.chamar('POST', `/api/admin/erp-categories/${FILHA}/criar-destino`);
ok(criouFilha.status === 200, '3 · a filha também');
ok(
  criouFilha.json?.category === slugPai
    && String(criouFilha.json?.subcategory ?? '').startsWith('zz-incensos'),
  '3 · e nasce DENTRO do pai, seguindo a hierarquia do ERP',
  JSON.stringify({ cat: criouFilha.json?.category, sub: criouFilha.json?.subcategory }),
);
ok(
  criouFilha.json?.dentroDe === 'ZZ Incensos e Incensarios',
  '3 · a tela recebe o nome da mãe, para dizer onde a coisa foi parar',
);

const menu = criouFilha.json?.menu ?? [];
const naArvore = menu.find((c) => c.id === slugPai);
ok(
  (naArvore?.subcategories ?? []).some((s) => s.id === criouFilha.json?.subcategory),
  '3 · e o menu já volta com ela — o seletor repinta sem recarregar a tela',
);

// ---------------------------------------------------------------- 4 ----
// Produto que chegou ANTES da amarração entra na vitrine sozinho.
const PAR = 'zz-par-' + Date.now();
await erp('PUT', '/api/v1/categories', {
  categories: [
    { code: PAI, name: 'ZZ Incensos e Incensarios' },
    { code: FILHA, name: 'ZZ Incensos', parentCode: PAI },
    { code: PAR, name: 'ZZ Incensos Indianos', parentCode: PAI },
  ],
});
const prod = await erp('PUT', `/api/v1/products/${ID}`, {
  name: 'ZZ Incenso de teste',
  price: 19.9,
  stock: 5,
  categoryCode: PAR,
});
ok(prod.status === 200 || prod.status === 201, '4 · o ERP envia produto com o código novo');

const antes = (await painel.chamar('GET', '/api/admin/state')).json ?? {};
const oProduto = (antes.products ?? []).find((p) => p.id === ID);
ok(
  oProduto !== undefined && (oProduto.category ?? '') === '',
  '4 · e ele fica FORA da vitrine enquanto o código não tem destino',
);

const criouPar = await painel.chamar('POST', `/api/admin/erp-categories/${PAR}/criar-destino`);
ok(criouPar.status === 200, '5 · criar o destino amarra o código');
ok(
  criouPar.json?.released >= 1,
  '5 · e solta na vitrine quem estava esperando, sem o ERP reenviar nada',
  `released=${criouPar.json?.released}`,
);

const depois = (await painel.chamar('GET', '/api/admin/state')).json ?? {};
const agora = (depois.products ?? []).find((p) => p.id === ID);
ok(
  agora !== undefined && agora.category === slugPai
    && String(agora.subcategory ?? '').startsWith('zz-incensos-indianos'),
  '5 · o produto está na prateleira certa',
  JSON.stringify({ cat: agora?.category, sub: agora?.subcategory }),
);

// ---------------------------------------------------------------- 6 ----
// Não cria duas vezes.
const denovo = await painel.chamar('POST', `/api/admin/erp-categories/${FILHA}/criar-destino`);
ok(denovo.status === 422, '6 · código já amarrado não cria categoria duplicada');

const inexistente = await painel.chamar('POST', '/api/admin/erp-categories/zz-nao-existe/criar-destino');
ok(inexistente.status === 422, '6 · e código que o ERP nunca mandou é recusado');

// ---------------------------------------------------------------- 7 ----
// Desfazer: é o que impede o botão de criar de ser uma porta de mão única.
const comProduto = await painel.chamar('POST', `/api/admin/erp-categories/${PAR}/desfazer-destino`);
ok(
  comProduto.status === 422,
  '7 · não desfaz prateleira com produto dentro — tiraria os produtos da vitrine',
);

await painel.chamar('DELETE', `/api/admin/products/${ID}`).catch(() => {});

const desfez = await painel.chamar('POST', `/api/admin/erp-categories/${FILHA}/desfazer-destino`);
ok(desfez.status === 200, '7 · desfaz a prateleira vazia');
ok(
  (desfez.json?.apagou ?? '') === 'ZZ Incensos',
  '7 · e diz o que apagou',
  String(desfez.json?.apagou),
);
const menuDepois = desfez.json?.menu ?? [];
const paiDepois = menuDepois.find((c) => c.id === slugPai);
ok(
  !(paiDepois?.subcategories ?? []).some((s) => s.id === criouFilha.json?.subcategory),
  '7 · ela sai do menu na mesma resposta',
);
const codigoDepois = (desfez.json?.erpCategories ?? []).find((c) => c.code === FILHA);
ok(codigoDepois?.linked === false, '7 · e o código volta a ficar sem destino');

// ------------------------------------------------------------ limpeza ----
await painel.chamar('POST', `/api/admin/erp-categories/${PAR}/desfazer-destino`).catch(() => {});
await painel.chamar('POST', `/api/admin/erp-categories/${PAI}/desfazer-destino`).catch(() => {});
await painel.chamar('PATCH', `/api/admin/api-keys/${chave.json?.id}`, { revoked: true });

console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
