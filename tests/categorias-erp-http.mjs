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

/*
 * As categorias de destino saem da própria loja, em vez de estarem cravadas
 * aqui.
 *
 * Antes o teste assumia que "acessorios/pulseiras" existiria sempre, o que era
 * verdade só enquanto ninguém mexesse na árvore. Bastou existir a função de
 * espelhar o ERP — que apaga e refaz as categorias — para este arquivo começar
 * a falhar por um motivo que não tinha nada a ver com o que ele testa.
 */
const arvore = (await erp('GET', '/api/v1/categories')).json?.categories ?? [];
const comSub = arvore.find((c) => (c.subcategories ?? []).length > 0);
if (comSub === undefined) {
  console.log('FALHA a loja não tem nenhuma categoria com subcategoria — rode `npm run migrar`');
  process.exit(1);
}
const DESTINO = { categoria: comSub.id, sub: comSub.subcategories[0].id };
const OUTRO = arvore.find((c) => c.id !== DESTINO.categoria) ?? comSub;
console.log(`     (usando ${DESTINO.categoria}/${DESTINO.sub} como destino)`);

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
  category: DESTINO.categoria, subcategory: 'nao-existe-mesmo',
});
ok(subInvalida.status === 422, 'subcategoria que não é daquela categoria é recusada',
  String(subInvalida.status));

const amarrou = await erp('PUT', `/api/v1/categories/${COD_PUL}/link`, {
  category: DESTINO.categoria, subcategory: DESTINO.sub,
});
ok(amarrou.status === 200, 'amarração válida é aceita', JSON.stringify(amarrou.json));

/*
 * O produto represado entra na vitrine SOZINHO, sem o ERP reenviar.
 *
 * Esta é a verificação mais importante do arquivo. O ERP do cliente guarda no
 * banco dele "essa categoria eu já integrei" para não repetir trabalho — o que
 * é correto. Mas significa que, se a entrada do produto na loja dependesse de
 * um reenvio, esse reenvio nunca aconteceria: o ERP não tem motivo para tocar
 * de novo num produto que não mudou. Os produtos ficariam invisíveis
 * indefinidamente, sem erro em lugar nenhum.
 */
ok(amarrou.json?.released === 1,
  'a amarração informa quantos produtos represados foram liberados',
  JSON.stringify(amarrou.json?.released));

const depois = await erp('GET', `/api/v1/products/${produtoId}`);
ok(depois.json?.product?.category === DESTINO.categoria,
  'o produto foi para a categoria certa SEM reenvio',
  String(depois.json?.product?.category));
ok(depois.json?.product?.subcategory === DESTINO.sub, 'e para a subcategoria certa',
  String(depois.json?.product?.subcategory));
ok(depois.json?.product?.categoryCode === COD_PUL,
  'e o GET devolve o mesmo código que o ERP enviou',
  String(depois.json?.product?.categoryCode));

const vitrineDepois = await cliente().chamar('GET', '/api/catalog');
ok(
  (vitrineDepois.json?.products ?? []).some((p) => p.id === produtoId),
  'e ele aparece na vitrine, sem o ERP fazer mais nada',
);

// ------------------------------------- fluxo síncrono, uma por vez ----

/*
 * O jeito que o integrador do UNO vai usar: antes de cada produto, manda a
 * categoria dele; guarda no banco do ERP que já mandou; nas próximas vezes,
 * pula.
 *
 * O risco desse desenho é o cache guardar a coisa errada. Um 200 aqui diz
 * "categoria registrada", não "produto vai aparecer na loja" — por isso a
 * resposta traz `linked`, que é o que o cache dele precisa guardar.
 */
const COD_SINC = `T-SINC-${marca}`;
const produtoSinc = `teste-sinc-${marca}`;

const uma = await erp('PUT', `/api/v1/categories/${COD_SINC}`, { name: 'Difusores' });
ok(uma.status === 200, 'PUT de categoria única funciona', JSON.stringify(uma.json).slice(0, 140));
ok(uma.json?.created === true, 'e informa que criou', String(uma.json?.created));
ok(uma.json?.linked === false,
  'e diz que ela ainda NÃO está amarrada — é isso que o ERP deve guardar, não o 200',
  String(uma.json?.linked));
ok(/fora da vitrine/.test(String(uma.json?.message)),
  'a mensagem explica a consequência',
  String(uma.json?.message));

const dedeNovo = await erp('PUT', `/api/v1/categories/${COD_SINC}`, { name: 'Difusores' });
ok(dedeNovo.json?.created === false, 'reenviar a mesma categoria não duplica',
  String(dedeNovo.json?.created));

const semNome = await erp('PUT', `/api/v1/categories/${COD_SINC}-x`, {});
ok(semNome.status === 422, 'categoria única sem name é 422, não 200 mudo', String(semNome.status));

await erp('PUT', `/api/v1/products/${produtoSinc}`, {
  name: 'Produto do fluxo síncrono', price: 10, categoryCode: COD_SINC,
});

const consulta = await erp('GET', `/api/v1/categories/${COD_SINC}`);
ok(consulta.status === 200, 'dá para consultar o estado de um código só', String(consulta.status));
ok(consulta.json?.productsWaiting === 1,
  'e a consulta diz quantos produtos estão esperando a amarração',
  String(consulta.json?.productsWaiting));

const amarrouSinc = await erp('PUT', `/api/v1/categories/${COD_SINC}/link`, {
  category: OUTRO.id, subcategory: null,
});
ok(amarrouSinc.json?.released === 1,
  'ao amarrar, o produto do fluxo síncrono é liberado sem reenvio',
  JSON.stringify(amarrouSinc.json));

const sincNaLoja = await erp('GET', `/api/v1/products/${produtoSinc}`);
ok(sincNaLoja.json?.product?.categoryCode === COD_SINC,
  'e passa a devolver o código que o ERP mandou',
  String(sincNaLoja.json?.product?.categoryCode));

const depoisDeAmarrar = await erp('GET', `/api/v1/categories/${COD_SINC}`);
ok(depoisDeAmarrar.json?.linked === true, 'a consulta passa a dizer linked: true',
  String(depoisDeAmarrar.json?.linked));
ok(depoisDeAmarrar.json?.productsWaiting === 0, 'e ninguém mais esperando',
  String(depoisDeAmarrar.json?.productsWaiting));

await erp('PUT', `/api/v1/products/${produtoSinc}`, { active: false });

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
ok(aindaLa.json?.product?.category === DESTINO.categoria,
  'e não tira da vitrine o produto que já estava categorizado',
  String(aindaLa.json?.product?.category));

// ------------------------------------------------------ desamarrar ----

const desamarrou = await erp('PUT', `/api/v1/categories/${COD_PUL}/link`, { category: null });
ok(desamarrou.status === 200, 'desamarrar é possível', String(desamarrou.status));
const semCodigo = await erp('GET', `/api/v1/products/${produtoId}`);
ok(semCodigo.json?.product?.category === DESTINO.categoria,
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
