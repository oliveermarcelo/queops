/**
 * O produto do ERP chega COM a foto?
 *
 * O ERP tem as fotos; a loja não. Antes, mandar `image` com um endereço só
 * gravava o ENDEREÇO — e isso tem três problemas, todos reais: a vitrine fica
 * refém do servidor do ERP (se ele cair, a loja fica sem foto), endereço de
 * rede interna não funciona de fora, e nada garante que aquilo é imagem.
 *
 * Agora a loja BAIXA e guarda como arquivo próprio, no mesmo instante em que o
 * produto chega. É o que faz "o produto já vem com imagem" ser verdade.
 *
 * O arquivo tem duas partes. A primeira chama `baixarImagem` direto, com o
 * `fetch` trocado por um de mentira: é a única forma de cobrir resposta que não
 * é imagem, redirecionamento e tamanho sem depender de um servidor remoto se
 * comportar mal sob encomenda. A segunda passa pela API de verdade.
 *
 *   npm run teste:imagem-erp
 */

import { baixarImagem } from '../server/src/midia.ts';
import { closePool } from '../server/src/db.ts';

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

// ========================================================= parte 1 ====
// As travas, com o fetch trocado. Host público de mentira para passar da
// checagem de endereço interno e chegar nas outras verificações.
const original = globalThis.fetch;
const responder = (status, headers, corpo = new Uint8Array(0)) => {
  globalThis.fetch = async () => new Response(status === 204 ? null : corpo, { status, headers });
};
/*
 * Host real, resposta de mentira.
 *
 * A trava de SSRF resolve o nome de verdade antes de pedir qualquer coisa —
 * um domínio inventado não resolve e é recusado ali, antes de chegar nas
 * verificações que este trecho quer testar. Com o `fetch` trocado, nenhuma
 * requisição sai daqui.
 */
const URL_FALSA = 'https://raw.githubusercontent.com/fake/foto.png';

responder(200, { 'Content-Type': 'text/html' });
let r = await baixarImagem(URL_FALSA);
ok(
  /Content-Type/i.test(r.erro),
  '1 · resposta que não é imagem é recusada — HTML no domínio da loja é XSS',
  r.erro,
);

responder(302, { Location: 'http://169.254.169.254/latest/meta-data/' });
r = await baixarImagem(URL_FALSA);
ok(
  /redireciona/i.test(r.erro),
  '1 · redirecionamento NÃO é seguido — é por onde se chega nos metadados da nuvem',
  r.erro,
);

responder(404, { 'Content-Type': 'text/plain' });
r = await baixarImagem(URL_FALSA);
ok(/HTTP 404/.test(r.erro), '1 · endereço que não existe vira erro legível', r.erro);

responder(200, { 'Content-Type': 'image/png', 'Content-Length': String(50 * 1024 * 1024) });
r = await baixarImagem(URL_FALSA);
ok(/muito grande/i.test(r.erro), '1 · arquivo gigante é recusado ANTES de ser lido', r.erro);

responder(200, { 'Content-Type': 'image/png' });
r = await baixarImagem(URL_FALSA);
ok(/vazia/i.test(r.erro), '1 · corpo vazio é recusado', r.erro);

globalThis.fetch = original;

// SSRF: estes nem chegam a pedir nada — a trava é antes do fetch.
for (const interno of [
  'http://127.0.0.1:9200/x.png',
  'http://169.254.169.254/x.png',
  'http://10.0.0.5/x.png',
  'http://localhost/x.png',
]) {
  const res = await baixarImagem(interno);
  ok(
    /interno ou reservado/i.test(res.erro),
    `2 · recusa endereço interno (${interno.split('/')[2]})`,
    res.erro,
  );
}
for (const esquema of ['file:///etc/passwd', 'ftp://exemplo.com/x.png']) {
  const res = await baixarImagem(esquema);
  ok(/http/i.test(res.erro), `2 · recusa esquema ${esquema.split(':')[0]}`, res.erro);
}

// ========================================================= parte 2 ====
// Pela API de verdade, com um endereço público de verdade.
const FOTO_A = 'https://raw.githubusercontent.com/github/explore/main/topics/git/git.png';
const FOTO_B = 'https://raw.githubusercontent.com/github/explore/main/topics/javascript/javascript.png';
const FOTO_404 = 'https://raw.githubusercontent.com/github/explore/main/topics/zz-nao-existe/zz.png';

const alcancavel = await fetch(FOTO_A, { method: 'HEAD' }).then((x) => x.ok).catch(() => false);
if (!alcancavel) {
  console.log('\nAVISO sem acesso à internet neste ambiente — a parte 2 não rodou.');
  await closePool().catch(() => {});
  console.log(falhas === 0 ? '\nparte 1 passou' : `\n${falhas} falha(s)`);
  process.exit(falhas === 0 ? 0 : 1);
}

let cookie = '', csrf = '';
const painel = async (metodo, caminho, corpo) => {
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
const sessao = async () => { csrf = (await painel('GET', '/api/session')).json?.csrfToken ?? ''; };

await sessao();
await painel('POST', '/api/admin/login', ADMIN);
await sessao();
await painel('PUT', '/api/admin/settings', { holdNewProducts: false });
const chave = await painel('POST', '/api/admin/api-keys', { name: 'Teste imagem do ERP' });
const TOKEN = chave.json?.token ?? '';

const erp = async (metodo, caminho, corpo) => {
  const h = { Accept: 'application/json', Authorization: `Bearer ${TOKEN}` };
  if (corpo !== undefined) h['Content-Type'] = 'application/json';
  const res = await fetch(BASE + caminho, {
    method: metodo, headers: h,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

const ID = 'ZZ-IMG-' + Date.now();

const criado = await erp('PUT', `/api/v1/products/${ID}`, {
  name: 'ZZ produto com foto do ERP', price: 10, stock: 1, image: FOTO_A,
});
ok(criado.status === 201, '3 · o ERP cria o produto mandando só o endereço da foto');
ok(
  (criado.json?.applied ?? []).includes('image'),
  '3 · e a foto entra no MESMO envio — o produto já chega com imagem',
  JSON.stringify({ applied: criado.json?.applied, warnings: criado.json?.warnings }),
);

const lido = await erp('GET', `/api/v1/products/${ID}`);
const guardado = String(lido.json?.product?.image ?? '');
ok(
  /^\/midia\/[0-9a-f]{24}\.png$/.test(guardado),
  '3 · o que fica gravado é arquivo DA LOJA, não o endereço do ERP',
  guardado,
);

const servida = await fetch(BASE + guardado);
ok(
  servida.status === 200 && (servida.headers.get('content-type') ?? '').startsWith('image/'),
  '3 · e a loja serve esse arquivo sozinha — se o ERP sair do ar, a vitrine continua com foto',
);

// ---- não rebaixa o que já baixou ----
const denovo = await erp('PUT', `/api/v1/products/${ID}`, { image: FOTO_A, stock: 2 });
ok(
  (denovo.json?.ignored ?? []).some((i) => i.field === 'image' && i.reason === 'unchanged'),
  '4 · o mesmo endereço no ciclo seguinte não baixa de novo',
  JSON.stringify(denovo.json?.ignored),
);
ok(
  (denovo.json?.applied ?? []).includes('stock'),
  '4 · e o resto do ciclo segue normal',
);

const trocada = await erp('PUT', `/api/v1/products/${ID}`, { image: FOTO_B });
ok((trocada.json?.applied ?? []).includes('image'), '4 · endereço diferente baixa');
const lido2 = await erp('GET', `/api/v1/products/${ID}`);
ok(
  String(lido2.json?.product?.image ?? '') !== guardado,
  '4 · e a foto do produto muda',
  String(lido2.json?.product?.image),
);

// ---- falhar na foto não derruba o produto ----
const comErro = await erp('PUT', `/api/v1/products/${ID}`, { image: FOTO_404, price: 99 });
ok(comErro.status === 200, '5 · endereço que responde 404 não derruba a gravação');
ok(
  (comErro.json?.warnings ?? []).some((w) => /image não foi gravada/i.test(w)),
  '5 · mas o ERP é avisado, em vez de achar que gravou',
  JSON.stringify(comErro.json?.warnings),
);
const lido3 = await erp('GET', `/api/v1/products/${ID}`);
ok(Number(lido3.json?.product?.price) === 99, '5 · e o resto do produto foi gravado');
ok(
  String(lido3.json?.product?.image ?? '') === String(lido2.json?.product?.image ?? ''),
  '5 · a foto anterior continua lá — falhar não apaga o que já existia',
);

// ---- a escolha do painel vence ----
await painel('POST', '/api/admin/products', {
  id: ID, name: 'ZZ produto com foto do ERP', price: 99, stock: 2,
  image: '/midia/aaaaaaaaaaaaaaaaaaaaaaaa.png', category: '',
});
const sobrescrever = await erp('PUT', `/api/v1/products/${ID}`, { image: FOTO_A });
ok(
  (sobrescrever.json?.ignored ?? []).some((i) => i.field === 'image' && i.reason === 'locked_in_panel'),
  '6 · foto trocada no painel fica travada: o ERP não sobrescreve',
  JSON.stringify(sobrescrever.json?.ignored),
);

await painel('DELETE', `/api/admin/products/${ID}?definitivo=1`);
await painel('PATCH', `/api/admin/api-keys/${chave.json?.id}`, { revoked: true });
await closePool().catch(() => {});

console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
