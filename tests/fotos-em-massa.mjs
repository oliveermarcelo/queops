/**
 * Subir mil fotos sem abrir produto por produto.
 *
 * 1.264 produtos ficaram sem foto quando a pasta de mídia foi descartada numa
 * publicação. Refazer pelo painel é abrir um por um, mil duzentas e sessenta e
 * quatro vezes — ninguém termina.
 *
 * A rota que faltava: `PUT /products/:id` aceita `image`, mas só como URL, e
 * quem tem as fotos num diretório não tem onde publicá-las. Aqui vão os BYTES,
 * autenticados por chave de API — carga em massa não é lugar para a senha de
 * ninguém.
 *
 *   npm run teste:fotos-massa
 */

import zlib from 'node:zlib';

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

function png(semente) {
  const crc = (b) => {
    let c = ~0;
    for (const x of b) { c ^= x; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  const ch = (t, d) => {
    const tt = Buffer.from(t, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc(Buffer.concat([tt, d])));
    return Buffer.concat([len, tt, d, cb]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const bruto = Buffer.from([0, semente & 0xff, (semente >> 8) & 0xff, (semente >> 16) & 0xff]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    ch('IHDR', ihdr), ch('IDAT', zlib.deflateSync(bruto)), ch('IEND', Buffer.alloc(0)),
  ]);
}
const dataUrl = (n) => 'data:image/png;base64,' + png(n).toString('base64');

let cookie = '', csrf = '';
const painel = async (metodo, caminho, corpo) => {
  const h = { Accept: 'application/json' };
  if (cookie) h.Cookie = cookie;
  if (corpo !== undefined) h['Content-Type'] = 'application/json';
  if (metodo !== 'GET' && csrf) h['X-CSRF-Token'] = csrf;
  const r = await fetch(BASE + caminho, {
    method: metodo, headers: h,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  for (const c of (r.headers.getSetCookie?.() ?? [])) cookie = c.split(';')[0];
  return { status: r.status, json: await r.json().catch(() => null) };
};
const sessao = async () => { csrf = (await painel('GET', '/api/session')).json?.csrfToken ?? ''; };

await sessao();
await painel('POST', '/api/admin/login', ADMIN);
await sessao();
const chave = await painel('POST', '/api/admin/api-keys', { name: 'Teste fotos em massa' });
const TOKEN = chave.json?.token ?? '';

const erp = async (metodo, caminho, corpo, token = TOKEN) => {
  const h = { Accept: 'application/json', Authorization: `Bearer ${token}` };
  if (corpo !== undefined) h['Content-Type'] = 'application/json';
  const r = await fetch(BASE + caminho, {
    method: metodo, headers: h,
    body: corpo === undefined ? undefined : JSON.stringify(corpo),
  });
  return { status: r.status, json: await r.json().catch(() => null) };
};

const ID = 'ZZ-FOTO-' + Date.now();
await erp('PUT', `/api/v1/products/${ID}`, { name: 'ZZ produto de foto', price: 10, stock: 1 });

// -------------------------------------------------------------- 1 ----
const capa = await erp('POST', `/api/v1/products/${ID}/imagem`, { dataUrl: dataUrl(11) });
ok(capa.status === 201, '1 · a foto sobe pela chave de API, sem senha de ninguém', String(capa.status));
ok(/^\/midia\/[0-9a-f]{24}\.png$/.test(capa.json?.url ?? ''), '1 · e vira URL curta', capa.json?.url);
ok(capa.json?.destino === 'capa', '1 · indo para a capa por padrão');

const lido = await erp('GET', `/api/v1/products/${ID}`);
ok(
  lido.json?.product?.image === capa.json?.url,
  '1 · e o produto passa a apontar para ela — sem segundo passo',
  String(lido.json?.product?.image),
);

const servida = await fetch(BASE + capa.json.url);
ok(
  servida.status === 200 && (servida.headers.get('content-type') ?? '').startsWith('image/'),
  '1 · o arquivo é servido como imagem de verdade',
);

// -------------------------------------------------------------- 2 ----
const gal = await erp('POST', `/api/v1/products/${ID}/imagem?galeria=1`, { dataUrl: dataUrl(22) });
ok(gal.status === 201 && gal.json?.destino === 'galeria', '2 · e dá para acrescentar à galeria');
const lido2 = await erp('GET', `/api/v1/products/${ID}`);
ok(
  lido2.json?.product?.image === capa.json?.url,
  '2 · sem trocar a capa — produto com cinco fotos tem UMA capa',
);

// -------------------------------------------------------------- 3 ----
// A mesma foto duas vezes não ocupa disco duas vezes: o nome é o hash.
const repetida = await erp('POST', `/api/v1/products/${ID}/imagem`, { dataUrl: dataUrl(11) });
ok(
  repetida.json?.url === capa.json?.url && repetida.json?.reaproveitada === true,
  '3 · a mesma foto reenviada reaproveita o arquivo',
  JSON.stringify({ url: repetida.json?.url, reaproveitada: repetida.json?.reaproveitada }),
);

// -------------------------------------------------------------- 4 ----
const semChave = await erp('POST', `/api/v1/products/${ID}/imagem`, { dataUrl: dataUrl(33) }, 'qp_live_invalida');
ok(semChave.status === 401, '4 · chave inválida não grava foto em produto nenhum', String(semChave.status));

const inexistente = await erp('POST', '/api/v1/products/zz-nao-existe/imagem', { dataUrl: dataUrl(44) });
ok(inexistente.status === 404, '4 · produto inexistente é recusado', String(inexistente.status));

const lixo = await erp('POST', `/api/v1/products/${ID}/imagem`, { dataUrl: 'data:text/html;base64,PGh0bWw+' });
ok(lixo.status === 422, '4 · e o que não é imagem também — HTML servido do domínio da loja é XSS');

const vazio = await erp('POST', `/api/v1/products/${ID}/imagem`, {});
ok(vazio.status === 422, '4 · corpo sem imagem responde 422, e não 500');

// ------------------------------------------------------------ limpeza ----
await painel('DELETE', `/api/admin/products/${ID}?definitivo=1`);
await painel('PATCH', `/api/admin/api-keys/${chave.json?.id}`, { revoked: true });

console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
