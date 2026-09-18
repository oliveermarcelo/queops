/**
 * A vitrine das categorias: foto, frase e quem aparece na home.
 *
 * Três coisas precisam ficar verdadeiras, e as três falhavam em silêncio:
 *
 *   1. a home mostra as categorias DE VERDADE. Antes eram seis cartões
 *      cravados no código; depois que a loja passou a espelhar a árvore do
 *      ERP, os ids deixaram de existir e os cartões levavam a uma lista vazia
 *      — bonitos e quebrados ao mesmo tempo;
 *
 *   2. só aparece quem foi marcado. O ERP manda dezenas de categorias, e
 *      mostrar todas viraria uma parede de cartões;
 *
 *   3. ESPELHAR AS CATEGORIAS DO ERP NÃO PODE APAGAR AS FOTOS. O espelhamento
 *      apaga e recria as categorias, e o ERP não conhece foto nenhuma. Sem
 *      cuidado, cada sincronização apagaria o trabalho de quem subiu as
 *      imagens à mão — e só se descobriria olhando a home depois.
 *
 *   npm run teste:vitrine
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

const painel = cliente();
await painel.sessao();
await painel.chamar('POST', '/api/admin/login', ADMIN);
await painel.sessao();

const marca = Date.now();
const slug = `vitrine-teste-${marca}`;

await q.run(
  'INSERT INTO categories (id, name, description, icon, featured, position) VALUES (?,?,?,?,0,?)',
  [slug, `Vitrine Teste ${marca}`, '', '', 900],
);

const menuPublico = async () => (await (await fetch(BASE + '/api/catalog')).json()).menu ?? [];
const doMenu = (menu) => menu.find((c) => c.id === slug);

// ------------------------------------------------ o padrão é não aparecer ----

const inicial = doMenu(await menuPublico());
ok(inicial !== undefined, 'a categoria nova chega à vitrine pela API');
ok(inicial?.home === false, 'e nasce FORA da home — aparecer é decisão de quem administra',
  String(inicial?.home));
ok(inicial?.image === '', 'sem foto', JSON.stringify(inicial?.image));

// ------------------------------------------------------ editar no painel ----

const semNada = await painel.chamar('PATCH', `/api/admin/categories/${slug}`, {});
ok(semNada.status === 422, 'salvar sem nenhum campo é recusado', String(semNada.status));

const salvo = await painel.chamar('PATCH', `/api/admin/categories/${slug}`, {
  image: '/midia/abc123def456abc123def456.png',
  blurb: 'Uma frase de teste',
  home: true,
});
ok(salvo.status === 200, 'foto, frase e destaque são salvos', String(salvo.status));

const depois = doMenu(await menuPublico());
ok(depois?.image === '/midia/abc123def456abc123def456.png', 'a foto chega à vitrine',
  String(depois?.image));
ok(depois?.blurb === 'Uma frase de teste', 'a frase também', String(depois?.blurb));
ok(depois?.home === true, 'e a categoria passa a aparecer na home');

/*
 * Campo ausente não é mexido. É o que permite à tela salvar só o que mudou —
 * e impede que uma tela antiga, sem conhecer um campo novo, o apague ao gravar.
 */
await painel.chamar('PATCH', `/api/admin/categories/${slug}`, { blurb: 'Outra frase' });
const parcial = doMenu(await menuPublico());
ok(parcial?.image === '/midia/abc123def456abc123def456.png',
  'salvar só a frase não apaga a foto', String(parcial?.image));
ok(parcial?.home === true, 'nem desmarca a home');

const inexistente = await painel.chamar('PATCH', '/api/admin/categories/nao-existe-mesmo', {
  home: true,
});
ok(inexistente.status === 404, 'categoria inexistente responde 404', String(inexistente.status));

// -------------------------------- espelhar o ERP NÃO pode apagar as fotos ----

/*
 * O cenário que custa caro: alguém sobe as fotos, o ERP sincroniza, e as fotos
 * somem. O espelhamento apaga e recria as categorias — a vitrine é preservada
 * por SLUG, que é derivado do nome.
 */
const codigo = `VIT${String(marca).slice(-6)}`;
const nomeNoErp = `Categoria Espelhada ${marca}`;
const slugEsperado = nomeNoErp.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

const chave = await painel.chamar('POST', '/api/admin/api-keys', { name: `vitrine-${marca}` });
const TOKEN = chave.json?.token ?? '';
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

// O ERP conhece a categoria, e a loja espelha uma primeira vez.
await erp('PUT', '/api/v1/categories', {
  categories: [{ code: codigo, name: nomeNoErp, active: true }],
});
await painel.chamar('POST', '/api/admin/erp-categories/espelhar', { confirmar: true });

// Alguém sobe a foto pela tela.
const gravou = await painel.chamar('PATCH', `/api/admin/categories/${slugEsperado}`, {
  image: '/midia/aaaabbbbccccddddeeeeffff.png',
  blurb: 'Foto subida à mão',
  home: true,
});
ok(gravou.status === 200, 'a foto é gravada na categoria espelhada', String(gravou.status));

// E o ERP sincroniza de novo.
await painel.chamar('POST', '/api/admin/erp-categories/espelhar', { confirmar: true });

const sobreviveu = doMenu.call(null, await menuPublico())
  ?? (await menuPublico()).find((c) => c.id === slugEsperado);
ok(sobreviveu?.image === '/midia/aaaabbbbccccddddeeeeffff.png',
  'espelhar o ERP de novo NÃO apaga a foto — é o que custaria o trabalho de quem cadastrou',
  String(sobreviveu?.image));
ok(sobreviveu?.blurb === 'Foto subida à mão', 'nem a frase', String(sobreviveu?.blurb));
ok(sobreviveu?.home === true, 'nem a marcação da home');

// ------------------------------------------------- agrupar categorias ----

/*
 * O problema real: o ERP manda "Pirâmides de Cristal", "de Madeira" e "de
 * Impressão 3D" como categorias SOLTAS, no mesmo nível. Não existe uma
 * "Pirâmides" para o cliente clicar, e não vai existir enquanto o ERP não
 * mandar a hierarquia. A loja cria a sua e pendura as do ERP dentro.
 */
const filhas = [`grp-a-${marca}`, `grp-b-${marca}`];
for (const [i, id] of filhas.entries()) {
  await q.run(
    'INSERT INTO categories (id, name, description, icon, featured, position) VALUES (?,?,?,?,0,?)',
    [id, `Filha ${i + 1} ${marca}`, '', '', 910 + i],
  );
}
// Um produto em cada filha: é o que prova que navegar no grupo acha os dois.
for (const [i, id] of filhas.entries()) {
  await painel.chamar('POST', '/api/admin/products', {
    id: `prod-grp-${i}-${marca}`, name: `Produto do grupo ${i}`, price: 10 + i,
    stock: 5, category: id,
  });
}

const grupo = await painel.chamar('POST', '/api/admin/categories', {
  name: `Categoria Geral ${marca}`,
});
ok(grupo.status === 201, 'a categoria geral é criada pelo painel', String(grupo.status));
const idGrupo = grupo.json?.id ?? '';

for (const id of filhas) {
  await painel.chamar('PATCH', `/api/admin/categories/${id}`, { groupId: idGrupo });
}

const menuAgrupado = await menuPublico();
ok(menuAgrupado.some((c) => c.id === idGrupo), 'a categoria geral aparece no topo do menu');
ok(!menuAgrupado.some((c) => c.id === filhas[0]),
  'e as agrupadas somem do topo — era esse o menu cheio de irmãs');

const dentro = menuAgrupado.find((c) => c.id === idGrupo)?.subcategories ?? [];
ok(dentro.length === 2, 'as duas aparecem DENTRO da categoria geral', String(dentro.length));
ok(dentro.every((s) => s.isCategory === true),
  'marcadas como categoria, e não como subcategoria — a vitrine filtra diferente');

/*
 * A verificação que importa para o cliente: o produto continua onde estava, e
 * mesmo assim é encontrado pela categoria geral. Agrupar não move produto.
 */
const catalogo = await (await fetch(BASE + '/api/catalog')).json();
const doGrupo = (catalogo.products ?? []).filter((p) => filhas.includes(p.category));
ok(doGrupo.length === 2,
  'os produtos continuam apontando para a categoria do ERP, não para o grupo',
  String(doGrupo.length));

// ------------------------------------------------ o que o servidor recusa ----

const emSiMesma = await painel.chamar('PATCH', `/api/admin/categories/${idGrupo}`, {
  groupId: idGrupo,
});
ok(emSiMesma.status === 422, 'uma categoria não entra dentro dela mesma', String(emSiMesma.status));

const doisNiveis = await painel.chamar('PATCH', `/api/admin/categories/${slug}`, {
  groupId: filhas[0],
});
ok(doisNiveis.status === 422,
  'nem dentro de uma que já está dentro de outra — só um nível',
  String(doisNiveis.status));

const grupoComMembros = await painel.chamar('PATCH', `/api/admin/categories/${idGrupo}`, {
  groupId: slug,
});
ok(grupoComMembros.status === 422,
  'e quem já agrupa outras não vira membro, senão os filhos sumiriam',
  String(grupoComMembros.status));

const apagarDoErp = await painel.chamar('DELETE', `/api/admin/categories/${filhas[0]}`);
ok(apagarDoErp.status === 409,
  'categoria do ERP não é apagada aqui — voltaria na próxima sincronização',
  String(apagarDoErp.status));

// ------------------------- espelhar não pode desmontar o que foi agrupado ----

await painel.chamar('POST', '/api/admin/erp-categories/espelhar', { confirmar: true });
const depoisDeEspelhar = await menuPublico();
ok(depoisDeEspelhar.some((c) => c.id === idGrupo),
  'a categoria geral SOBREVIVE ao espelhamento — o ERP não a conhece e a apagaria',
  JSON.stringify(depoisDeEspelhar.map((c) => c.id).slice(0, 5)));

// --------------------------------------------- apagar a categoria geral ----

const apagou = await painel.chamar('DELETE', `/api/admin/categories/${idGrupo}`);
ok(apagou.status === 200, 'a categoria geral criada aqui pode ser apagada', String(apagou.status));

const semGrupo = await menuPublico();
ok(!semGrupo.some((c) => c.id === idGrupo), 'ela some do menu');

// ------------------------------------------------------------ limpeza ----

for (let i = 0; i < 2; i++) {
  await painel.chamar('DELETE', `/api/admin/products/${`prod-grp-${i}-${marca}`}?definitivo=1`);
}
await q.run('DELETE FROM categories WHERE id LIKE ?', [`grp-%-${marca}`]);
await q.run('DELETE FROM erp_categories WHERE code = ?', [codigo]);
await q.run('DELETE FROM categories WHERE id IN (?, ?)', [slug, slugEsperado]);
await painel.chamar('DELETE', `/api/admin/api-keys/${chave.json.id}`);

await closePool();
console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
