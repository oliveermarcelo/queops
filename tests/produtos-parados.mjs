/**
 * Produtos que não aparecem na vitrine: QUAIS são, e por quê.
 *
 * O painel sabia contar ("51 produtos estão sem categoria") e mandava amarrar
 * a categoria correspondente na lista abaixo. Isso só era verdade num dos
 * quatro casos possíveis. Numa loja com 41 categorias do ERP, todas amarradas,
 * e 51 produtos parados, o aviso mandava fazer algo que não existia para ser
 * feito — e não havia como descobrir nem quais produtos eram.
 *
 * Este teste monta os quatro casos lado a lado e cobra do servidor a
 * distinção, porque é ela que decide onde a pessoa resolve cada um.
 *
 *   npm run teste:parados
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

// ------------------------------------------------------------ cenário ----

const marca = Date.now();
const CODIGO_AMARRADO = `PA-AM-${marca}`;
const CODIGO_PENDENTE = `PA-PE-${marca}`;
const CODIGO_ORFAO = `PA-OR-${marca}`;

// Uma categoria de verdade da loja, para amarrar o primeiro código.
const categoria = await q.one('SELECT id FROM categories ORDER BY position ASC LIMIT 1');
const DESTINO = String(categoria?.id ?? '');
if (DESTINO === '') {
  console.log('FALHA a loja não tem nenhuma categoria para amarrar');
  process.exit(1);
}

await q.run(
  `INSERT INTO erp_categories (code, name, parent_code, active, category_id)
   VALUES (?, 'Amarrada do teste', NULL, 1, ?), (?, 'Pendente do teste', NULL, 1, NULL)`,
  [CODIGO_AMARRADO, DESTINO, CODIGO_PENDENTE],
);

const produtos = {
  amarrado: `pp-am-${marca}`,
  pendente: `pp-pe-${marca}`,
  orfao: `pp-or-${marca}`,
  semCodigo: `pp-sc-${marca}`,
};

const inserir = (id, nome, codigo) => q.run(
  `INSERT INTO products (id, sku, name, category, subcategory, price, stock,
                         pending_category_code, active)
   VALUES (?, ?, ?, '', NULL, 100, 5, ?, 1)`,
  [id, id.toUpperCase(), nome, codigo],
);

await inserir(produtos.amarrado, 'Parado · código já amarrado', CODIGO_AMARRADO);
await inserir(produtos.pendente, 'Parado · falta amarrar', CODIGO_PENDENTE);
await inserir(produtos.orfao, 'Parado · código órfão', CODIGO_ORFAO);
await inserir(produtos.semCodigo, 'Parado · sem código nenhum', '');

const parados = async () => (await painel.chamar('GET', '/api/admin/erp-categories/parados')).json;
const grupoDe = (dados, code) => (dados?.grupos ?? []).find((g) => g.code === code) ?? null;

// ------------------------------------------ 1. os quatro motivos ----

const antes = await parados();
ok(Number(antes?.total) >= 4, '1 · a rota devolve o total de produtos parados', String(antes?.total));

const gAmarrado = grupoDe(antes, CODIGO_AMARRADO);
ok(gAmarrado?.motivo === 'amarrado',
  '1 · código JÁ amarrado com produto fora da vitrine é um motivo próprio',
  String(gAmarrado?.motivo));

const gPendente = grupoDe(antes, CODIGO_PENDENTE);
ok(gPendente?.motivo === 'pendente',
  '1 · código que o ERP mandou e ninguém amarrou ainda', String(gPendente?.motivo));

const gOrfao = grupoDe(antes, CODIGO_ORFAO);
ok(gOrfao?.motivo === 'orfao',
  '1 · código que NUNCA veio como categoria — o aviso antigo mandava amarrar o que não existe',
  String(gOrfao?.motivo));

const gSemCodigo = grupoDe(antes, '');
ok(gSemCodigo?.motivo === 'sem_codigo',
  '1 · e produto que chegou sem código nenhum', String(gSemCodigo?.motivo));

// --------------------------------------------- 2. quais são, de fato ----

ok((gOrfao?.produtos ?? []).some((p) => p.id === produtos.orfao),
  '2 · cada grupo diz QUAIS produtos são — era o que faltava na tela');
ok((gOrfao?.produtos ?? [])[0]?.name !== undefined
  && (gOrfao?.produtos ?? [])[0]?.sku !== undefined,
  '2 · com nome e SKU, que é por onde a lojista reconhece');
ok(Number(gOrfao?.total) === 1, '2 · e a contagem do grupo', String(gOrfao?.total));

const ordem = (antes?.grupos ?? []).map((g) => g.motivo);
ok(ordem.indexOf('amarrado') < ordem.indexOf('sem_codigo'),
  '2 · a ordem é a do esforço: o que se resolve num clique vem primeiro',
  JSON.stringify(ordem));

// ------------------------------------- 3. reaplicar o que já está amarrado ----

const reaplicado = await painel.chamar('POST', `/api/admin/erp-categories/${CODIGO_AMARRADO}/reaplicar`);
ok(reaplicado.status === 200 && Number(reaplicado.json?.released) === 1,
  '3 · "colocar na vitrine agora" libera quem ficou para trás',
  `${reaplicado.status} ${JSON.stringify(reaplicado.json?.released)}`);

const depoisDoReaplicar = await q.one('SELECT category, pending_category_code FROM products WHERE id = ?', [produtos.amarrado]);
ok(String(depoisDoReaplicar?.category) === DESTINO,
  '3 · o produto ganhou a categoria do código', String(depoisDoReaplicar?.category));
ok(String(depoisDoReaplicar?.pending_category_code) === '',
  '3 · e deixou de estar esperando');

const semOAmarrado = await parados();
ok(grupoDe(semOAmarrado, CODIGO_AMARRADO) === null,
  '3 · o grupo some da lista depois de resolvido');

const denovo = await painel.chamar('POST', `/api/admin/erp-categories/${CODIGO_PENDENTE}/reaplicar`);
ok(denovo.status === 422,
  '3 · reaplicar um código NÃO amarrado é recusado, e não finge ter feito algo',
  String(denovo.status));

// ------------------------------------------- 4. registrar o código órfão ----

const registrado = await painel.chamar('POST', '/api/admin/erp-categories', { code: CODIGO_ORFAO });
ok(registrado.status === 200 && Number(registrado.json?.waiting) === 1,
  '4 · o código órfão pode ser registrado, com quantos produtos dependem dele',
  `${registrado.status} ${JSON.stringify(registrado.json?.waiting)}`);

const comOrfaoRegistrado = await parados();
ok(grupoDe(comOrfaoRegistrado, CODIGO_ORFAO)?.motivo === 'pendente',
  '4 · e ele deixa de ser um beco sem saída: vira pendente, amarrável na lista',
  String(grupoDe(comOrfaoRegistrado, CODIGO_ORFAO)?.motivo));

const repetido = await painel.chamar('POST', '/api/admin/erp-categories', { code: CODIGO_ORFAO });
ok(repetido.status === 422, '4 · registrar o mesmo código duas vezes é recusado', String(repetido.status));

const inventado = await painel.chamar('POST', '/api/admin/erp-categories', { code: `NAO-ESPERA-${marca}` });
ok(inventado.status === 422,
  '4 · código que NENHUM produto espera não entra — a tela não é cadastro livre de categoria',
  String(inventado.status));

// A amarração normal, agora possível, tira o produto do limbo.
const amarrado = await painel.chamar('PUT', `/api/admin/erp-categories/${CODIGO_ORFAO}`, {
  category: DESTINO, subcategory: null,
});
ok(amarrado.status === 200 && Number(amarrado.json?.released) === 1,
  '4 · amarrando o código registrado, o produto entra na vitrine',
  `${amarrado.status} ${JSON.stringify(amarrado.json?.released)}`);

// ------------------------------------------------- 5. sem login, nada ----

const semSessao = await fetch(`${BASE}/api/admin/erp-categories/parados`);
ok(semSessao.status === 401,
  '5 · a lista é do painel: sem sessão, não sai', String(semSessao.status));

// ------------------------------------------ 6. atribuição em massa ----

/*
 * O caso que nenhuma amarração resolve: produto que chegou sem código. Abrir
 * um por um, cinquenta e uma vezes, é trabalho que ninguém termina — e a loja
 * fica com produto invisível por semanas.
 */
const emLote = [produtos.semCodigo, produtos.pendente];
const movidos = await painel.chamar('POST', '/api/admin/products/categoria', {
  ids: emLote, category: DESTINO, subcategory: null,
});
ok(movidos.status === 200 && Number(movidos.json?.updated) === 2,
  '6 · dois produtos mudam de categoria numa chamada só',
  `${movidos.status} ${JSON.stringify(movidos.json?.updated)}`);

const depoisDoLote = await q.all(
  'SELECT id, category, category_label, pending_category_code, locked_fields FROM products WHERE id IN (?, ?)',
  emLote,
);
ok(depoisDoLote.every((p) => String(p.category) === DESTINO),
  '6 · os dois ficaram na categoria escolhida');
ok(depoisDoLote.every((p) => String(p.category_label ?? '') !== ''),
  '6 · com o rótulo da categoria preenchido pelo servidor',
  JSON.stringify(depoisDoLote.map((p) => p.category_label)));
ok(depoisDoLote.every((p) => String(p.pending_category_code) === ''),
  '6 · e deixaram de constar como "esperando um código"');

/*
 * A decisão explícita do dono da loja: a arrumação em massa NÃO trava o campo.
 * É um desempate provisório — no dia em que o ERP mandar o código certo, ele
 * deve valer. Travar faria essa correção nunca chegar, e ninguém lembraria por
 * quê meses depois.
 */
ok(depoisDoLote.every((p) => !String(p.locked_fields ?? '').includes('category')),
  '6 · e a categoria NÃO fica travada: o ERP ainda pode corrigir depois',
  JSON.stringify(depoisDoLote.map((p) => p.locked_fields)));

const comFantasma = await painel.chamar('POST', '/api/admin/products/categoria', {
  ids: [produtos.orfao, `nao-existe-${marca}`], category: DESTINO,
});
ok(comFantasma.status === 200
  && Number(comFantasma.json?.updated) === 1
  && Number(comFantasma.json?.ignored) === 1,
  '6 · id que não existe no meio do lote não derruba os outros, e é contado à parte',
  JSON.stringify(comFantasma.json));

const categoriaInventada = await painel.chamar('POST', '/api/admin/products/categoria', {
  ids: [produtos.orfao], category: `nao-existe-${marca}`,
});
ok(categoriaInventada.status === 422,
  '6 · categoria que a loja não tem é recusada — não grava produto apontando para o nada',
  String(categoriaInventada.status));

const subErrada = await painel.chamar('POST', '/api/admin/products/categoria', {
  ids: [produtos.orfao], category: DESTINO, subcategory: `sub-inventada-${marca}`,
});
ok(subErrada.status === 422,
  '6 · subcategoria de outra categoria é recusada, e não ignorada em silêncio',
  String(subErrada.status));

const semIds = await painel.chamar('POST', '/api/admin/products/categoria', {
  ids: [], category: DESTINO,
});
ok(semIds.status === 422, '6 · lista vazia é recusada', String(semIds.status));

const loteSemSessao = await fetch(`${BASE}/api/admin/products/categoria`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ ids: [produtos.orfao], category: DESTINO }),
});
ok(loteSemSessao.status === 401 || loteSemSessao.status === 419,
  '6 · e sem sessão de painel ninguém move catálogo', String(loteSemSessao.status));

// ------------------------------------------------------------ limpeza ----

await q.run('DELETE FROM products WHERE id IN (?, ?, ?, ?)', [
  produtos.amarrado, produtos.pendente, produtos.orfao, produtos.semCodigo,
]);
await q.run('DELETE FROM erp_categories WHERE code IN (?, ?, ?)', [
  CODIGO_AMARRADO, CODIGO_PENDENTE, CODIGO_ORFAO,
]);

await closePool();
console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
