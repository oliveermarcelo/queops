/**
 * Fotos do produto: upload de verdade e galeria.
 *
 * O que este teste existe para impedir é uma regressão específica e cara: a
 * imagem enviada pelo painel virava data URL, era CORTADA em 500 caracteres
 * pela coluna e salvava quebrada — com 200 na resposta, sem erro em lugar
 * nenhum. Quem cadastrou só descobria olhando a loja.
 *
 * Por isso a verificação central não é "o upload respondeu ok", é: o que
 * ficou gravado no produto é curto, é uma URL, e o arquivo existe e é
 * servido com os mesmos bytes que subiram.
 *
 *   npm run teste:fotos
 */

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

function cliente() {
  let cookie = '';
  let csrf = '';
  const chamar = async (metodo, caminho, corpo) => {
    const h = { Accept: 'application/json' };
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

/** PNG 1x1 válido, com uma cor que muda por chamada (arquivos distintos). */
function pngDeTeste(semente) {
  const zlib = require('node:zlib');
  const crc = (buf) => {
    let c = ~0;
    for (const b of buf) {
      c ^= b;
      for (let i = 0; i < 8; i++) c = (c >>> 1) ^ (0xEDB88320 & -(c & 1));
    }
    return ~c >>> 0;
  };
  const chunk = (tipo, dados) => {
    const t = Buffer.from(tipo, 'ascii');
    const len = Buffer.alloc(4);
    len.writeUInt32BE(dados.length);
    const soma = Buffer.alloc(4);
    soma.writeUInt32BE(crc(Buffer.concat([t, dados])));
    return Buffer.concat([len, t, dados, soma]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(1, 0); ihdr.writeUInt32BE(1, 4);
  ihdr[8] = 8; ihdr[9] = 2; // 8 bits, RGB
  const pixel = Buffer.from([0, semente & 0xff, (semente >> 8) & 0xff, (semente >> 16) & 0xff]);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(pixel)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);

const painel = cliente();
await painel.sessao();
await painel.chamar('POST', '/api/admin/login', ADMIN);
await painel.sessao();

const marca = Date.now();
const id = `fotos-${marca}`;

// ------------------------------------------------------------ upload ----

const capa = pngDeTeste(marca);
const enviada = await painel.chamar('POST', '/api/admin/midia', {
  dataUrl: `data:image/png;base64,${capa.toString('base64')}`,
});
ok(enviada.status === 201, 'a imagem é aceita', JSON.stringify(enviada.json).slice(0, 140));
ok(/^\/midia\/[0-9a-f]{24}\.png$/.test(String(enviada.json?.url)),
  'e volta como URL curta, não como data URL',
  String(enviada.json?.url));

/*
 * A verificação que fecha o buraco antigo: a URL cabe na coluna. A data URL
 * desta mesma imagem já teria mais que os 500 caracteres do campo.
 */
ok(String(enviada.json?.url).length < 60,
  'a URL cabe folgada na coluna de 500 caracteres',
  `${String(enviada.json?.url).length} caracteres`);

const servida = await fetch(BASE + enviada.json.url);
ok(servida.status === 200, 'o arquivo é servido em /midia', String(servida.status));
const bytesServidos = Buffer.from(await servida.arrayBuffer());
ok(bytesServidos.equals(capa),
  'e os bytes servidos são idênticos aos enviados — nada foi truncado',
  `${bytesServidos.length} vs ${capa.length}`);

// Mesma imagem duas vezes: o nome é o hash do conteúdo, então reaproveita.
const denovo = await painel.chamar('POST', '/api/admin/midia', {
  dataUrl: `data:image/png;base64,${capa.toString('base64')}`,
});
ok(denovo.json?.url === enviada.json?.url, 'enviar a mesma foto não duplica o arquivo');
ok(denovo.json?.reaproveitada === true, 'e a resposta diz que reaproveitou');

// ------------------------------------------------------- o que é recusado ----

const naoImagem = await painel.chamar('POST', '/api/admin/midia', {
  dataUrl: 'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
});
ok(naoImagem.status === 422, 'arquivo que não é imagem é recusado', String(naoImagem.status));

/*
 * SVG fica de fora de propósito: é XML, pode conter script, e seria servido do
 * mesmo domínio da loja — com acesso à sessão de quem abrisse.
 */
const svg = await painel.chamar('POST', '/api/admin/midia', {
  dataUrl: `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>').toString('base64')}`,
});
ok(svg.status === 422, 'SVG é recusado, mesmo sendo imagem', String(svg.status));

/*
 * Com sessão válida mas SEM login: precisa parar na autenticação, não no CSRF.
 *
 * Sem o `sessao()` antes, a requisição morreria no token CSRF (419) e o teste
 * passaria sem nunca ter exercitado a checagem de login — verde por um motivo
 * diferente do que ele afirma verificar.
 */
const anonimo = cliente();
await anonimo.sessao();
const semSessao = await anonimo.chamar('POST', '/api/admin/midia', {
  dataUrl: 'data:image/png;base64,AA==',
});
ok(semSessao.status === 401, 'sem login ninguém envia imagem', String(semSessao.status));

// ------------------------------------------------------------ galeria ----

const extra1 = pngDeTeste(marca + 1);
const extra2 = pngDeTeste(marca + 2);
const u1 = (await painel.chamar('POST', '/api/admin/midia', {
  dataUrl: `data:image/png;base64,${extra1.toString('base64')}`,
})).json.url;
const u2 = (await painel.chamar('POST', '/api/admin/midia', {
  dataUrl: `data:image/png;base64,${extra2.toString('base64')}`,
})).json.url;

const salvo = await painel.chamar('POST', '/api/admin/products', {
  id,
  name: 'Produto com galeria',
  price: 100,
  category: 'piramides',
  image: enviada.json.url,
  images: [u1, u2],
});
ok(salvo.status === 200, 'produto salva com galeria', String(salvo.status));
ok(salvo.json?.product?.image === enviada.json.url, 'a capa fica em image');
ok(JSON.stringify(salvo.json?.product?.images) === JSON.stringify([u1, u2]),
  'e as extras saem em images, na ordem enviada',
  JSON.stringify(salvo.json?.product?.images));

/*
 * A capa NÃO se repete na galeria. Se repetisse, a página do produto mostraria
 * a mesma foto duas vezes nas miniaturas.
 */
ok(!(salvo.json?.product?.images ?? []).includes(enviada.json.url),
  'a capa não aparece duplicada dentro de images');

// Reordenar é reenviar a lista na ordem nova.
const reordenado = await painel.chamar('POST', '/api/admin/products', {
  id, name: 'Produto com galeria', price: 100, category: 'piramides',
  image: enviada.json.url, images: [u2, u1],
});
ok(JSON.stringify(reordenado.json?.product?.images) === JSON.stringify([u2, u1]),
  'reenviar a lista muda a ordem',
  JSON.stringify(reordenado.json?.product?.images));

/*
 * Salvar SEM o campo `images` não apaga a galeria.
 *
 * É o caso do ERP: ele grava produto pela API v1 e não conhece galeria. Se a
 * ausência do campo fosse lida como lista vazia, o primeiro ciclo de
 * sincronização apagaria as fotos que alguém subiu à mão.
 */
await painel.chamar('POST', '/api/admin/products', {
  id, name: 'Produto com galeria', price: 111, category: 'piramides', image: enviada.json.url,
});
const depois = await painel.chamar('GET', '/api/admin/state');
const naLista = (depois.json?.products ?? []).find((x) => x.id === id);
ok(JSON.stringify(naLista?.images) === JSON.stringify([u2, u1]),
  'salvar sem o campo images preserva a galeria',
  JSON.stringify(naLista?.images));

// Lista vazia explícita limpa.
await painel.chamar('POST', '/api/admin/products', {
  id, name: 'Produto com galeria', price: 111, category: 'piramides',
  image: enviada.json.url, images: [],
});
const limpo = await painel.chamar('GET', '/api/admin/state');
const semFotos = (limpo.json?.products ?? []).find((x) => x.id === id);
ok(semFotos?.images === undefined, 'mandar lista vazia limpa a galeria',
  JSON.stringify(semFotos?.images));

// Limpeza.
await painel.chamar('DELETE', `/api/admin/products/${id}`);
await painel.chamar('DELETE', `/api/admin/products/${id}?definitivo=1`);

await closePool();
console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
