/**
 * Ciclo completo das categorias por código — contra o servidor rodando.
 *
 * A pergunta que só este teste responde: um produto enviado com um código
 * ainda não amarrado some sem avisar? A resposta certa é não — ele é aceito,
 * fica fora da vitrine, é contado no painel, e entra na loja no instante em que
 * alguém amarra, sem o ERP reenviar nada.
 *
 *   npm run teste:categorias
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

const chave = await painel.chamar('POST', '/api/admin/api-keys', { name: 'Teste categorias' });
const TOKEN = chave.json?.token ?? '';
const erp = (metodo, caminho, corpo) =>
  cliente().chamar(metodo, caminho, corpo, { Authorization: `Bearer ${TOKEN}` });

const marca = Date.now();
const COD_PIR = `T-PIR-${marca}`;
const COD_PUL = `T-PUL-${marca}`;
const COD_INTERNO = `T-INT-${marca}`;
const produtoId = `teste-cat-${marca}`;

// --------------------------------------------------------- a carga ----

const carga = await erp('PUT', '/api/v1/categories', {
  categories: [
    { code: COD_PIR, name: 'Pirâmides do ERP' },
    { code: COD_PUL, name: 'Pulseiras do ERP', parentCode: COD_PIR },
    { code: COD_INTERNO, name: 'Uso Interno', active: false },
    { name: 'Sem código nenhum' },
  ],
});
ok(carga.status === 200, 'a carga de categorias é aceita', JSON.stringify(carga.json).slice(0, 160));
ok(carga.json?.criadas === 3, 'as 3 válidas foram gravadas', String(carga.json?.criadas));
ok(
  (carga.json?.warnings ?? []).some((w) => /code/.test(w)),
  'a que veio sem código é avisada, e não derruba o lote',
  JSON.stringify(carga.json?.warnings),
);
ok(carga.json?.pendentes >= 2, 'a resposta diz quantas estão sem destino', String(carga.json?.pendentes));
ok(
  /fica fora da vitrine/.test(String(carga.json?.message)),
  'e explica a consequência de deixar pendente',
  String(carga.json?.message),
);

// Reenvio: idempotente, e não duplica.
const recarga = await erp('PUT', '/api/v1/categories', {
  categories: [{ code: COD_PIR, name: 'Pirâmides do ERP (renomeada)' }],
});
ok(recarga.json?.criadas === 0 && recarga.json?.atualizadas === 1,
  'reenviar o mesmo código atualiza, não duplica',
  JSON.stringify({ c: recarga.json?.criadas, a: recarga.json?.atualizadas }));

// ------------------------------- produto com código ainda não amarrado ----

const semAmarra = await erp('PUT', `/api/v1/products/${produtoId}`, {
  name: 'Produto de teste por código',
  price: 99,
  stock: 3,
  categoryCode: COD_PUL,
});
ok(semAmarra.status === 201, 'produto com código pendente é ACEITO, não recusado',
  JSON.stringify(semAmarra.json).slice(0, 160));
ok(
  (semAmarra.json?.warnings ?? []).some((w) => /não está amarrado/.test(w)),
  'e o aviso diz exatamente o que falta',
  JSON.stringify(semAmarra.json?.warnings),
);

const antes = await erp('GET', `/api/v1/products/${produtoId}`);
ok(antes.json?.product?.category === '', 'ele fica sem categoria', String(antes.json?.product?.category));
ok(antes.json?.product?.categoryCode === null,
  'e o código volta como null, não como campo ausente',
  JSON.stringify(antes.json?.product?.categoryCode));

const vitrine = await cliente().chamar('GET', '/api/catalog');
ok(
  !(vitrine.json?.products ?? []).some((p) => p.id === produtoId),
  'e não aparece na vitrine',
);

const estado = await erp('GET', '/api/v1/categories');
ok(estado.json?.productsWithoutCategory >= 1,
  'a loja conta quantos produtos estão parados por isso',
  String(estado.json?.productsWithoutCategory));

// ------------------------------------------------------- a amarração ----

const codigoInvalido = await erp('PUT', `/api/v1/categories/${COD_PUL}/link`, {
  category: 'categoria-que-nao-existe',
});
ok(codigoInvalido.status === 422, 'amarrar a um slug inexistente é recusado', String(codigoInvalido.status));

const subInvalida = await erp('PUT', `/api/v1/categories/${COD_PUL}/link`, {
  category: 'acessorios', subcategory: 'nao-existe',
});
ok(subInvalida.status === 422, 'subcategoria que não é daquela categoria é recusada',
  String(subInvalida.status));

const amarrou = await erp('PUT', `/api/v1/categories/${COD_PUL}/link`, {
  category: 'acessorios', subcategory: 'pulseiras',
});
ok(amarrou.status === 200, 'amarração válida é aceita', JSON.stringify(amarrou.json));

/*
 * O produto já gravado entra na vitrine sozinho? NÃO — e isso é intencional.
 *
 * A amarração diz para onde vão os PRÓXIMOS produtos daquele código; ela não
 * sabe quais produtos antigos chegaram com ele, porque o produto sem categoria
 * não guarda o código que tentou usar. O ERP reenvia e o produto entra. O
 * teste existe para que isso seja uma decisão registrada, e não uma surpresa.
 */
const reenvio = await erp('PUT', `/api/v1/products/${produtoId}`, { categoryCode: COD_PUL });
ok(reenvio.status === 200, 'o reenvio do produto é aceito', String(reenvio.status));
ok((reenvio.json?.applied ?? []).includes('categoryCode'),
  'e agora a categoria é aplicada de verdade',
  JSON.stringify(reenvio.json?.applied));

const depois = await erp('GET', `/api/v1/products/${produtoId}`);
ok(depois.json?.product?.category === 'acessorios', 'o produto foi para a categoria certa',
  String(depois.json?.product?.category));
ok(depois.json?.product?.subcategory === 'pulseiras', 'e para a subcategoria certa',
  String(depois.json?.product?.subcategory));
ok(depois.json?.product?.categoryCode === COD_PUL,
  'e o GET devolve o mesmo código que o ERP enviou',
  String(depois.json?.product?.categoryCode));

const vitrineDepois = await cliente().chamar('GET', '/api/catalog');
ok(
  (vitrineDepois.json?.products ?? []).some((p) => p.id === produtoId),
  'agora ele aparece na vitrine',
);

// -------------------------------------- código que nunca foi enviado ----

const desconhecido = await erp('PUT', `/api/v1/products/${produtoId}`, {
  categoryCode: 'CODIGO-QUE-NUNCA-VEIO',
});
ok(
  (desconhecido.json?.warnings ?? []).some((w) => /não veio em nenhuma carga/.test(w)),
  'código nunca enviado dá aviso diferente do pendente',
  JSON.stringify(desconhecido.json?.warnings),
);

/*
 * E, principalmente: NÃO tira o produto da vitrine.
 *
 * Um produto que já está vendendo não pode sair do ar porque o ERP mandou um
 * código que a loja não conhece. Esta é a verificação que mais importa aqui.
 */
const aindaLa = await erp('GET', `/api/v1/products/${produtoId}`);
ok(aindaLa.json?.product?.category === 'acessorios',
  'e não tira da vitrine o produto que já estava categorizado',
  String(aindaLa.json?.product?.category));

// ------------------------------------------------------ desamarrar ----

const desamarrou = await erp('PUT', `/api/v1/categories/${COD_PUL}/link`, { category: null });
ok(desamarrou.status === 200, 'desamarrar é possível', String(desamarrou.status));
const semCodigo = await erp('GET', `/api/v1/products/${produtoId}`);
ok(semCodigo.json?.product?.category === 'acessorios',
  'e o produto continua na categoria onde já estava',
  String(semCodigo.json?.product?.category));
ok(semCodigo.json?.product?.categoryCode === null,
  'mas o código deixa de ser devolvido, porque a tradução não existe mais',
  JSON.stringify(semCodigo.json?.product?.categoryCode));

// Limpeza.
await erp('PUT', `/api/v1/products/${produtoId}`, { active: false });
await painel.chamar('PATCH', `/api/admin/api-keys/${chave.json?.id}`, { revoked: true });

console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
