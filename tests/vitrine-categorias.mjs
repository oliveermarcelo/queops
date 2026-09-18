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

// ------------------------------------------------------------ limpeza ----

await q.run('DELETE FROM erp_categories WHERE code = ?', [codigo]);
await q.run('DELETE FROM categories WHERE id IN (?, ?)', [slug, slugEsperado]);
await painel.chamar('DELETE', `/api/admin/api-keys/${chave.json.id}`);

await closePool();
console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
