/**
 * Espelhar a árvore do ERP — contra o servidor e o banco de verdade.
 *
 * Esta é a operação mais destrutiva do painel: apaga a taxonomia da loja e a
 * refaz a partir do ERP. O que este teste protege não é o caminho feliz, é o
 * conjunto de coisas que precisam continuar verdadeiras depois dela:
 *
 *   - a hierarquia do ERP virou categoria/subcategoria de verdade;
 *   - todo código ficou amarrado, sem sobrar pendência;
 *   - o produto que estava esperando entrou;
 *   - o produto da categoria antiga saiu da vitrine em vez de ficar num limbo
 *     visível na home e inacessível pelo menu;
 *   - e rodar de novo não duplica nada.
 *
 *   npm run teste:espelhar
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

const chave = await painel.chamar('POST', '/api/admin/api-keys', { name: 'Teste espelho' });
const TOKEN = chave.json?.token ?? '';
const erp = (m, p, b) => cliente().chamar(m, p, b, { Authorization: `Bearer ${TOKEN}` });

const marca = Date.now();
const antigo = `produto-antigo-${marca}`;
const esperando = `produto-esperando-${marca}`;

// Um produto numa categoria da loja que NÃO vem do ERP: ele é o que deve sair
// da vitrine quando a árvore for trocada.
await erp('PUT', `/api/v1/products/${antigo}`, {
  name: 'Produto da categoria antiga', price: 50, category: 'piramides', active: true,
});

// -------------------------------------------------------- a carga ----

const COD_PAI = `E-PAI-${marca}`;
const COD_FILHA = `E-FILHA-${marca}`;
const COD_NETA = `E-NETA-${marca}`;
const COD_OFF = `E-OFF-${marca}`;

await erp('PUT', '/api/v1/categories', {
  categories: [
    { code: COD_PAI, name: `Estátuas Espelho ${marca}` },
    { code: COD_FILHA, name: `São Francisco ${marca}`, parentCode: COD_PAI },
    { code: COD_NETA, name: `Neta Profunda ${marca}`, parentCode: COD_FILHA },
    { code: COD_OFF, name: `Uso Interno ${marca}`, active: false },
  ],
});

// Produto que chega ANTES do espelhamento, com um código ainda sem destino.
await erp('PUT', `/api/v1/products/${esperando}`, {
  name: 'Produto esperando a categoria', price: 80, categoryCode: COD_FILHA, active: true,
});
const antesDoEspelho = await erp('GET', `/api/v1/products/${esperando}`);
ok(antesDoEspelho.json?.product?.category === '',
  'antes do espelho, o produto novo está sem categoria',
  String(antesDoEspelho.json?.product?.category));

// ------------------------------------------------------ confirmação ----

const semConfirmar = await painel.chamar('POST', '/api/admin/erp-categories/espelhar', {});
ok(semConfirmar.status === 422,
  'espelhar sem confirmar é recusado — não é um clique só que esvazia a vitrine',
  String(semConfirmar.status));

// -------------------------------------------------------- o espelho ----

const r = await painel.chamar('POST', '/api/admin/erp-categories/espelhar', { confirmar: true });
ok(r.status === 200, 'o espelhamento roda', JSON.stringify(r.json).slice(0, 200));
ok(r.json?.apagadas > 0, 'e informa quantas categorias antigas apagou', String(r.json?.apagadas));

const cats = await erp('GET', '/api/v1/categories');
const arvore = cats.json?.categories ?? [];

const pai = arvore.find((c) => c.name === `Estátuas Espelho ${marca}`);
ok(pai !== undefined, 'a categoria-mãe do ERP virou categoria da loja');
ok(pai?.id === `estatuas-espelho-${marca}`,
  'com slug legível, sem acento — é o que vai para a URL pública',
  String(pai?.id));
ok(pai?.erpCode === COD_PAI, 'e já amarrada ao código do ERP', String(pai?.erpCode));

const filha = (pai?.subcategories ?? []).find((s) => s.name === `São Francisco ${marca}`);
ok(filha !== undefined, 'a filha do ERP virou subcategoria');
ok(filha?.id === `sao-francisco-${marca}`, 'com slug sem acento nem cedilha', String(filha?.id));
ok(filha?.erpCode === COD_FILHA, 'e amarrada ao código dela', String(filha?.erpCode));

/*
 * A loja tem dois níveis; o ERP pode ter três. Achatar é melhor que descartar:
 * a categoria continua existindo e o produto dela tem para onde ir.
 */
const neta = (pai?.subcategories ?? []).find((s) => s.name === `Neta Profunda ${marca}`);
ok(neta !== undefined, 'o terceiro nível do ERP foi achatado para subcategoria da raiz');
ok((r.json?.warnings ?? []).some((w) => /terceiro n[ií]vel/i.test(w)),
  'e o achatamento é avisado, não silencioso',
  JSON.stringify(r.json?.warnings));

const inativaVirou = arvore.some((c) => c.name === `Uso Interno ${marca}`);
ok(!inativaVirou, 'categoria inativa no ERP não entra na loja');
ok((r.json?.warnings ?? []).some((w) => /inativa/i.test(w)),
  'e isso também é dito',
  JSON.stringify(r.json?.warnings));

ok(cats.json?.pending === 0, 'nenhum código fica pendente depois do espelho',
  String(cats.json?.pending));

// -------------------------------- produtos: o que entra e o que sai ----

const liberado = await erp('GET', `/api/v1/products/${esperando}`);
ok(liberado.json?.product?.category === `estatuas-espelho-${marca}`,
  'o produto que esperava entrou na categoria certa',
  String(liberado.json?.product?.category));
ok(liberado.json?.product?.subcategory === `sao-francisco-${marca}`,
  'e na subcategoria certa',
  String(liberado.json?.product?.subcategory));

const saiu = await erp('GET', `/api/v1/products/${antigo}`);
ok(saiu.json?.product?.category === '',
  'o produto da categoria antiga ficou SEM categoria',
  String(saiu.json?.product?.category));

/*
 * A verificação que mais importa das duas: sem zerar a coluna, o produto
 * continuaria passando pelo filtro da vitrine (categoria não vazia) e
 * apareceria na home sem pertencer a seção nenhuma.
 */
const vitrine = await cliente().chamar('GET', '/api/catalog');
const ids = (vitrine.json?.products ?? []).map((p) => p.id);
ok(!ids.includes(antigo), 'e sumiu da vitrine de verdade, não só do menu');
ok(ids.includes(esperando), 'enquanto o que estava esperando aparece nela');

const menu = vitrine.json?.menu ?? [];
ok(menu.some((c) => c.id === `estatuas-espelho-${marca}`),
  'a vitrine passa a mostrar a árvore do ERP no menu');
ok(!menu.some((c) => c.id === 'piramides' && c.name === 'Pirâmides'),
  'e as categorias antigas sumiram do menu');

// ------------------------------------------------ rodar de novo é seguro ----

const denovo = await painel.chamar('POST', '/api/admin/erp-categories/espelhar', { confirmar: true });
ok(denovo.status === 200, 'espelhar de novo funciona', String(denovo.status));

const cats2 = await erp('GET', '/api/v1/categories');
ok(cats2.json?.categories.length === cats.json?.categories.length,
  'e não duplica nada',
  `${cats.json?.categories.length} → ${cats2.json?.categories.length}`);

const aindaLa = await erp('GET', `/api/v1/products/${esperando}`);
ok(aindaLa.json?.product?.category === `estatuas-espelho-${marca}`,
  'o produto já categorizado continua onde estava depois do segundo espelho',
  String(aindaLa.json?.product?.category));

// Limpeza.
await erp('PUT', `/api/v1/products/${antigo}`, { active: false });
await erp('PUT', `/api/v1/products/${esperando}`, { active: false });
await painel.chamar('PATCH', `/api/admin/api-keys/${chave.json?.id}`, { revoked: true });

console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
