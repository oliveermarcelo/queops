/**
 * Foto que sumiu do disco: a loja avisa, ou mostra um quadrado cinza?
 *
 * O banco guarda `/midia/abc.png`. Se o arquivo sai da pasta — e sai, quando a
 * publicação substitui a pasta da aplicação inteira —, o pedido daquela URL
 * caía no fallback da SPA e voltava HTTP 200 com o index.html. O navegador
 * recebia uma página onde esperava um PNG: nada desenhado, nenhum erro no
 * console, nada na aba de rede. Quem cadastrou conclui que o upload não
 * funciona e sobe tudo outra vez.
 *
 *   npm run teste:midia
 */

import { existsSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
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
  const crc = (buf) => {
    let c = ~0;
    for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1)); }
    return ~c >>> 0;
  };
  const chunk = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii');
    const len = Buffer.alloc(4); len.writeUInt32BE(dados.length);
    const cb = Buffer.alloc(4); cb.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, cb]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4); ihdr[8] = 8; ihdr[9] = 2;
  const bruto = Buffer.from([0, semente & 0xff, (semente >> 8) & 0xff, (semente >> 16) & 0xff]);
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(bruto)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

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
  const tipo = r.headers.get('content-type') ?? '';
  return { status: r.status, tipo, json: await r.json().catch(() => null) };
};
const sessao = async () => { csrf = (await chamar('GET', '/api/session')).json?.csrfToken ?? ''; };

await sessao();
await chamar('POST', '/api/admin/login', ADMIN);
await sessao();

// -------------------------------------------------------------- 1 ----
const semente = Date.now() & 0xffffff;
const dataUrl = 'data:image/png;base64,' + png(semente).toString('base64');
const subida = await chamar('POST', '/api/admin/midia', { dataUrl });
ok(subida.status === 201, '1 · a foto sobe');
const url = subida.json?.url ?? '';
ok(/^\/midia\/[0-9a-f]{24}\.png$/.test(url), '1 · e devolve uma URL curta', url);

const servida = await fetch(BASE + url);
ok(
  servida.status === 200 && (servida.headers.get('content-type') ?? '').startsWith('image/'),
  '1 · o arquivo é servido como IMAGEM',
  `${servida.status} ${servida.headers.get('content-type')}`,
);

// -------------------------------------------------------------- 2 ----
// Some com o arquivo, que é o que a publicação faz com a pasta inteira.
const pasta = path.resolve(process.cwd(), process.env.MIDIA_DIR ?? 'midia');
const arquivo = path.join(pasta, path.basename(url));
ok(existsSync(arquivo), '2 · o arquivo está na pasta de mídia', arquivo);
unlinkSync(arquivo);

const sumiu = await fetch(BASE + url);
const tipo = sumiu.headers.get('content-type') ?? '';
ok(
  sumiu.status === 404,
  '2 · foto que não está no disco responde 404',
  `veio ${sumiu.status} ${tipo}`,
);
ok(
  !tipo.includes('text/html'),
  '2 · e NÃO a página da loja — era isso que deixava a falha invisível',
  tipo,
);

// -------------------------------------------------------------- 3 ----
// O painel precisa saber contar, senão ninguém descobre sem abrir o SSH.
const produto = await chamar('POST', '/api/admin/products', {
  name: 'ZZ foto sumida ' + semente, price: 10, stock: 1, image: url, category: '',
});
ok(produto.status === 200 || produto.status === 201, '3 · produto gravado com a foto que sumiu');

const conta = await chamar('GET', '/api/admin/midia/ausentes');
ok(conta.status === 200, '3 · o painel consegue contar as fotos ausentes');
ok(
  (conta.json?.ausentes ?? 0) >= 1,
  '3 · e conta a que acabou de sumir',
  JSON.stringify({ ausentes: conta.json?.ausentes, referenciadas: conta.json?.referenciadas }),
);
ok(
  (conta.json?.exemplos ?? []).includes(url),
  '3 · dizendo QUAL arquivo falta, para dar para conferir à mão',
);
ok(
  String(conta.json?.pasta ?? '') !== '',
  '3 · e em que pasta ele era procurado — é o que se muda no MIDIA_DIR',
  String(conta.json?.pasta),
);

// ------------------------------------------------------------ limpeza ----
const id = produto.json?.product?.id ?? produto.json?.id ?? '';
if (id !== '') await chamar('DELETE', `/api/admin/products/${id}?definitivo=1`);
writeFileSync(arquivo, png(semente));
unlinkSync(arquivo);

console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
