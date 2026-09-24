/**
 * Notas fiscais (NF-e) do pedido: o contrato inteiro que o ERP pediu.
 *
 * O que este teste persegue não é "a rota respondeu 200". É o conjunto de
 * coisas que, se der errado, dá errado em silêncio e caro:
 *
 *   - reenvio criando nota duplicada (o ERP reenvia por retry, sempre);
 *   - URL antiga continuando a funcionar depois da substituição — o arquivo
 *     velho já circulou por e-mail;
 *   - XML de um comprador baixável por outro, ou por qualquer um;
 *   - nota cancelada ainda sendo oferecida ao cliente como válida;
 *   - upload de nota mexendo no status do pedido.
 *
 *   npm run teste:notas
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

/** Cliente HTTP com cookie e CSRF, como o navegador faz. */
function navegador() {
  let cookie = '';
  let csrf = '';
  const chamar = async (metodo, caminho, corpo, headers = {}) => {
    const h = { Accept: 'application/json', ...headers };
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
    /** GET cru, para baixar arquivo com a sessão do navegador. */
    baixar: async (caminho) => {
      const res = await fetch(BASE + caminho, { headers: cookie ? { Cookie: cookie } : {} });
      return { status: res.status, headers: res.headers, corpo: await res.text() };
    },
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

const chaveApi = await painel.chamar('POST', '/api/admin/api-keys', { name: `teste-nf-${Date.now()}` });
const TOKEN = chaveApi.json?.token ?? '';
if (TOKEN === '') {
  console.log('FALHA não consegui criar a chave de API');
  process.exit(1);
}

/** Chamada do ERP com JSON. */
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

/** Chamada do ERP com multipart — o formato real do envio da nota. */
const enviarNota = async (pedido, dados, arquivos = {}) => {
  const form = new FormData();
  for (const [k, v] of Object.entries(dados)) {
    if (v !== undefined) form.append(k, String(v));
  }
  for (const [campo, arq] of Object.entries(arquivos)) {
    if (arq === undefined) continue;
    form.append(campo, new Blob([arq.bytes], { type: arq.tipo }), arq.nome);
  }
  const res = await fetch(`${BASE}/api/v1/orders/${pedido}/invoices`, {
    method: 'POST',
    headers: { Accept: 'application/json', Authorization: `Bearer ${TOKEN}` },
    body: form,
  });
  return { status: res.status, json: await res.json().catch(() => null) };
};

/** GET cru autenticado como ERP. */
const baixarComoErp = async (caminho) => {
  const res = await fetch(BASE + caminho, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return { status: res.status, headers: res.headers, corpo: await res.text() };
};

const caminhoDe = (url) => new URL(url).pathname;

// ----------------------------------------------------------- arquivos ----

const xmlDe = (chave) => Buffer.from(
  `<?xml version="1.0" encoding="UTF-8"?>\n`
  + `<nfeProc versao="4.00" xmlns="http://www.portalfiscal.inf.br/nfe">\n`
  + `  <NFe><infNFe Id="NFe${chave}" versao="4.00">\n`
  + `    <ide><cUF>35</cUF><natOp>Venda de mercadoria</natOp></ide>\n`
  + `    <dest><CPF>07166272562</CPF><xNome>Marcelo &amp; Cia</xNome></dest>\n`
  + `    <!-- comentario --><obs><![CDATA[qualquer <coisa> aqui]]></obs>\n`
  + `  </infNFe></NFe>\n</nfeProc>\n`,
  'utf8',
);
const pdfDe = (texto) => Buffer.from(`%PDF-1.4\n% DANFE ${texto}\n%%EOF\n`, 'latin1');

const arquivosDe = (chave, marca = 'a') => ({
  xml: { bytes: xmlDe(chave), tipo: 'application/xml', nome: 'nota.xml' },
  pdf: { bytes: pdfDe(marca), tipo: 'application/pdf', nome: 'danfe.pdf' },
});

// ------------------------------------------------------------ cenário ----

const marca = Date.now();
const curto = String(marca).slice(-9);
const pedido = `NF1-${curto}`;
const outroPedido = `NF2-${curto}`;
const CHAVE_A = '3526' + String(marca).padStart(40, '0');
const CHAVE_B = '3526' + String(marca + 1).padStart(40, '0');
const CHAVE_C = '3526' + String(marca + 2).padStart(40, '0');

const emailDono = `dono-nf-${marca}@exemplo.com`;
const emailOutro = `outro-nf-${marca}@exemplo.com`;
const SENHA = 'SenhaDeTeste2026!';

const dono = navegador();
await dono.sessao();
await dono.chamar('POST', '/api/account/register', { name: 'Dono do Pedido', email: emailDono, password: SENHA });
await dono.sessao();
const outro = navegador();
await outro.sessao();
await outro.chamar('POST', '/api/account/register', { name: 'Outro Cliente', email: emailOutro, password: SENHA });
await outro.sessao();

const idDono = Number((await q.one('SELECT id FROM customers WHERE email = ?', [emailDono]))?.id ?? 0);

// Um pedido PAGO do dono, e outro de visitante.
await q.run(
  `INSERT INTO orders (id, customer_id, customer_name, customer_email, subtotal, total,
                       status, payment, ship_cep, ship_city, ship_state, paid_at)
   VALUES (?, ?, 'Dono do Pedido', ?, 200, 200, 'paid', 'pix',
           '01310-100', 'São Paulo', 'SP', NOW())`,
  [pedido, idDono, emailDono],
);
await q.run(
  `INSERT INTO orders (id, customer_name, customer_email, subtotal, total,
                       status, payment, ship_cep, ship_city, ship_state)
   VALUES (?, 'Visitante', 'visita@exemplo.com', 90, 90, 'pending', 'pix',
           '01310-100', 'São Paulo', 'SP')`,
  [outroPedido],
);

const metadados = (chave, extras = {}) => ({
  key: chave,
  number: 12345,
  series: 1,
  issuedAt: '2026-09-22T14:32:10-03:00',
  totalAmount: '1234.56',
  ...extras,
});

// ------------------------------------------------------ 1. criação ----

const criada = await enviarNota(pedido, metadados(CHAVE_A), arquivosDe(CHAVE_A, 'v1'));
ok(criada.status === 201, '1 · a primeira nota do pedido responde 201', String(criada.status));
const nota1 = criada.json?.invoice ?? {};
ok(nota1.key === CHAVE_A, '1 · a resposta devolve a chave gravada', String(nota1.key));
ok(nota1.status === 'authorized', '1 · nasce autorizada', String(nota1.status));
ok(nota1.number === 12345 && nota1.series === 1, '1 · com número e série');
ok(nota1.totalAmount === '1234.56',
  '1 · o valor sai como TEXTO exato, sem passar por ponto flutuante',
  JSON.stringify(nota1.totalAmount));
ok(typeof nota1.issuedAt === 'string' && nota1.issuedAt.startsWith('2026-09-22T14:32:10'),
  '1 · a data de autorização volta no fuso de São Paulo', String(nota1.issuedAt));

const urlXml1 = nota1.xmlUrl ?? '';
const urlPdf1 = nota1.pdfUrl ?? '';
ok(urlXml1.endsWith('.xml') && urlPdf1.endsWith('.pdf'), '1 · com as duas URLs');

// ------------------------------------------ 2. as URLs não entregam pistas ----

ok(!urlXml1.includes(CHAVE_A) && !urlPdf1.includes(CHAVE_A),
  '2 · a chave da NF-e NÃO aparece no caminho da URL', urlXml1);
ok(!urlXml1.includes(pedido) && !urlPdf1.includes(pedido),
  '2 · nem o id do pedido', urlXml1);
ok(/\/([0-9a-f]{48})\.xml$/.test(urlXml1),
  '2 · o caminho é um token sorteado de 192 bits', urlXml1);
ok(caminhoDe(urlXml1) !== caminhoDe(urlPdf1),
  '2 · XML e PDF têm tokens diferentes — vazar um não entrega o outro');

// ---------------------------------------- 3. o status do pedido não muda ----

const depoisDoUpload = (await erp('GET', `/api/v1/orders/${pedido}`)).json?.order ?? {};
ok(depoisDoUpload.status === 'paid',
  '3 · subir nota NÃO mexe no status do pedido', String(depoisDoUpload.status));

// -------------------------------------------------- 4. GET traz a lista ----

ok(Array.isArray(depoisDoUpload.invoices) && depoisDoUpload.invoices.length === 1,
  '4 · o pedido passa a trazer "invoices"', JSON.stringify(depoisDoUpload.invoices?.length));
const doGet = (depoisDoUpload.invoices ?? [])[0] ?? {};
ok(doGet.xmlUrl === urlXml1 && doGet.pdfUrl === urlPdf1, '4 · com as mesmas URLs');
ok(!('xml' in doGet) && !('pdf' in doGet),
  '4 · e sem binário nenhum no JSON', JSON.stringify(Object.keys(doGet)));

const semNota = (await erp('GET', `/api/v1/orders/${outroPedido}`)).json?.order ?? {};
ok(Array.isArray(semNota.invoices) && semNota.invoices.length === 0,
  '4 · pedido sem nota devolve lista VAZIA, não campo ausente',
  JSON.stringify(semNota.invoices));

// ---------------------------------------------------- 5. download ----

const baixadoErp = await baixarComoErp(caminhoDe(urlXml1));
ok(baixadoErp.status === 200, '5 · o ERP baixa o XML pela chave de API', String(baixadoErp.status));
ok(baixadoErp.corpo.includes('nfeProc'), '5 · e recebe o arquivo que subiu');
ok((baixadoErp.headers.get('x-robots-tag') ?? '').includes('noindex'),
  '5 · com X-Robots-Tag noindex', String(baixadoErp.headers.get('x-robots-tag')));
ok((baixadoErp.headers.get('cache-control') ?? '').includes('no-store'),
  '5 · e sem cache — o XML tem CPF do comprador');
ok(!(baixadoErp.headers.get('content-disposition') ?? '').includes(CHAVE_A),
  '5 · o nome oferecido no download também não carrega a chave',
  String(baixadoErp.headers.get('content-disposition')));

const semLogin = await fetch(BASE + caminhoDe(urlXml1));
ok(semLogin.status === 401, '5 · sem identidade nenhuma, não baixa', String(semLogin.status));

const baixadoOutro = await outro.baixar(caminhoDe(urlXml1));
ok(baixadoOutro.status === 404,
  '5 · outro cliente logado NÃO baixa a nota alheia', String(baixadoOutro.status));

const baixadoDono = await dono.baixar(caminhoDe(urlPdf1));
ok(baixadoDono.status === 200, '5 · o dono do pedido baixa', String(baixadoDono.status));
ok(baixadoDono.corpo.startsWith('%PDF-'), '5 · e o que chega é o PDF');

const baixadoPainel = await painel.baixar(caminhoDe(urlXml1));
ok(baixadoPainel.status === 200, '5 · a lojista baixa pelo painel', String(baixadoPainel.status));

// ----------------------------------- 6. reenvio da mesma chave (200) ----

const reenviada = await enviarNota(pedido, metadados(CHAVE_A, { totalAmount: '1500.00' }), arquivosDe(CHAVE_A, 'v2'));
ok(reenviada.status === 200, '6 · reenviar a mesma chave responde 200, não 201', String(reenviada.status));
const nota2 = reenviada.json?.invoice ?? {};
ok(nota2.totalAmount === '1500.00', '6 · com os metadados atualizados', String(nota2.totalAmount));

const contagem = await q.one('SELECT COUNT(*) AS n FROM order_invoices WHERE nfe_key = ?', [CHAVE_A]);
ok(Number(contagem?.n) === 1, '6 · e SEM duplicata no banco', String(contagem?.n));

ok(nota2.xmlUrl !== urlXml1 && nota2.pdfUrl !== urlPdf1,
  '6 · os tokens são novos depois do reenvio');
const velha = await baixarComoErp(caminhoDe(urlXml1));
ok(velha.status === 404,
  '6 · e a URL ANTIGA deixa de funcionar — era o que já tinha circulado por e-mail',
  String(velha.status));
const nova = await baixarComoErp(caminhoDe(nota2.pdfUrl));
ok(nova.corpo.includes('v2'), '6 · a URL nova entrega o arquivo substituído');

// ------------------------------- 7. duas notas no mesmo pedido ----

const segunda = await enviarNota(pedido, metadados(CHAVE_B, { number: 12346 }), arquivosDe(CHAVE_B, 'b'));
ok(segunda.status === 201, '7 · uma segunda nota no mesmo pedido é aceita', String(segunda.status));
const comDuas = (await erp('GET', `/api/v1/orders/${pedido}`)).json?.order ?? {};
ok((comDuas.invoices ?? []).length === 2,
  '7 · faturamento parcial: o pedido mostra as duas', String((comDuas.invoices ?? []).length));

// ------------------------------------- 8. chave de outro pedido (409) ----

const invasora = await enviarNota(outroPedido, metadados(CHAVE_A), arquivosDe(CHAVE_A, 'x'));
ok(invasora.status === 409, '8 · a mesma chave em OUTRO pedido é recusada', String(invasora.status));
ok(invasora.json?.error?.code === 'invoice_key_conflict',
  '8 · com o código invoice_key_conflict', String(invasora.json?.error?.code));

// --------------------------------------------- 9. cada erro da tabela ----

const semPedido = await enviarNota(`NAO-EXISTE-${curto}`, metadados(CHAVE_C), arquivosDe(CHAVE_C));
ok(semPedido.status === 404 && semPedido.json?.error?.code === 'not_found',
  '9 · pedido inexistente → 404 not_found', String(semPedido.status));

const chaveCurta = await enviarNota(pedido, metadados('123'), arquivosDe(CHAVE_C));
ok(chaveCurta.status === 422 && chaveCurta.json?.error?.code === 'invalid_nfe_key',
  '9 · chave sem 44 dígitos → 422 invalid_nfe_key', String(chaveCurta.json?.error?.code));

const chaveComLetra = await enviarNota(pedido, metadados('A'.repeat(44)), arquivosDe(CHAVE_C));
ok(chaveComLetra.json?.error?.code === 'invalid_nfe_key',
  '9 · 44 caracteres que não são dígitos também não passam');

const semNumero = await enviarNota(pedido, metadados(CHAVE_C, { number: undefined }), arquivosDe(CHAVE_C));
ok(semNumero.status === 422 && semNumero.json?.error?.code === 'invalid_invoice',
  '9 · campo obrigatório ausente → 422', String(semNumero.json?.error?.code));

const semFuso = await enviarNota(
  pedido, metadados(CHAVE_C, { issuedAt: '2026-09-22T14:32:10' }), arquivosDe(CHAVE_C),
);
ok(semFuso.status === 422,
  '9 · data sem fuso é recusada — "às 23h30" mudaria de dia conforme o palpite',
  String(semFuso.status));

const semArquivo = await enviarNota(pedido, metadados(CHAVE_C), {
  xml: { bytes: xmlDe(CHAVE_C), tipo: 'application/xml', nome: 'nota.xml' },
});
ok(semArquivo.status === 422, '9 · sem o PDF, não grava', String(semArquivo.status));

const pdfGrande = await enviarNota(pedido, metadados(CHAVE_C), {
  xml: { bytes: xmlDe(CHAVE_C), tipo: 'application/xml', nome: 'nota.xml' },
  pdf: { bytes: Buffer.concat([pdfDe('g'), Buffer.alloc(2 * 1024 * 1024)]), tipo: 'application/pdf', nome: 'g.pdf' },
});
ok(pdfGrande.status === 413 && pdfGrande.json?.error?.code === 'file_too_large',
  '9 · PDF acima de 2 MB → 413 file_too_large', `${pdfGrande.status} ${pdfGrande.json?.error?.code}`);

const corpoEnorme = await enviarNota(pedido, metadados(CHAVE_C), {
  xml: { bytes: xmlDe(CHAVE_C), tipo: 'application/xml', nome: 'nota.xml' },
  pdf: { bytes: Buffer.concat([pdfDe('g'), Buffer.alloc(4 * 1024 * 1024)]), tipo: 'application/pdf', nome: 'g.pdf' },
});
ok(corpoEnorme.status === 413 && corpoEnorme.json?.error?.code === 'file_too_large',
  '9 · corpo acima do teto responde 413 NO NOSSO formato, e não erro genérico',
  `${corpoEnorme.status} ${JSON.stringify(corpoEnorme.json)}`);

const xmlGrande = await enviarNota(pedido, metadados(CHAVE_C), {
  xml: { bytes: Buffer.from('<a>' + 'x'.repeat(1024 * 1024) + '</a>'), tipo: 'application/xml', nome: 'g.xml' },
  pdf: { bytes: pdfDe('g'), tipo: 'application/pdf', nome: 'g.pdf' },
});
ok(xmlGrande.status === 413, '9 · XML acima de 1 MB → 413', String(xmlGrande.status));

const pdfFalso = await enviarNota(pedido, metadados(CHAVE_C), {
  xml: { bytes: xmlDe(CHAVE_C), tipo: 'application/xml', nome: 'nota.xml' },
  pdf: { bytes: Buffer.from('MZ isto e um executavel'), tipo: 'application/pdf', nome: 'falso.pdf' },
});
ok(pdfFalso.status === 415 && pdfFalso.json?.error?.code === 'unsupported_media_type',
  '9 · arquivo que se declara PDF mas não é → 415 (o conteúdo é que manda)',
  `${pdfFalso.status} ${pdfFalso.json?.error?.code}`);

const xmlQuebrado = await enviarNota(pedido, metadados(CHAVE_C), {
  xml: { bytes: Buffer.from('<nfeProc><NFe></nfeProc>'), tipo: 'application/xml', nome: 'ruim.xml' },
  pdf: { bytes: pdfDe('g'), tipo: 'application/pdf', nome: 'g.pdf' },
});
ok(xmlQuebrado.status === 415, '9 · XML mal formado → 415', String(xmlQuebrado.status));

const xxe = await enviarNota(pedido, metadados(CHAVE_C), {
  xml: {
    bytes: Buffer.from(
      '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>',
    ),
    tipo: 'application/xml',
    nome: 'xxe.xml',
  },
  pdf: { bytes: pdfDe('g'), tipo: 'application/pdf', nome: 'g.pdf' },
});
ok(xxe.status === 415,
  '9 · XML com DOCTYPE/ENTITY é recusado — é por aí que entra o XXE', String(xxe.status));

const semMultipart = await erp('POST', `/api/v1/orders/${pedido}/invoices`, { key: CHAVE_C });
ok(semMultipart.status === 415 && semMultipart.json?.error?.code === 'unsupported_media_type',
  '9 · JSON no lugar de multipart → 415', String(semMultipart.status));

const semChaveApi = await fetch(`${BASE}/api/v1/orders/${pedido}/invoices`, { method: 'POST' });
ok(semChaveApi.status === 401, '9 · e sem chave de API não passa nada', String(semChaveApi.status));

// Nenhum desses erros pode ter deixado lixo no banco.
const lixo = await q.one('SELECT COUNT(*) AS n FROM order_invoices WHERE nfe_key = ?', [CHAVE_C]);
ok(Number(lixo?.n) === 0, '9 · nenhuma recusa gravou nota pela metade', String(lixo?.n));

// ------------------------------------------ 10. cancelamento via PATCH ----

const statusErrado = await erp('PATCH', `/api/v1/orders/${pedido}/invoices/${CHAVE_B}`, { status: 'authorized' });
ok(statusErrado.status === 422 && statusErrado.json?.error?.code === 'invalid_status',
  '10 · PATCH só aceita "canceled"', String(statusErrado.json?.error?.code));

const notaDesconhecida = await erp('PATCH', `/api/v1/orders/${pedido}/invoices/${CHAVE_C}`, { status: 'canceled' });
ok(notaDesconhecida.status === 404, '10 · chave que não é deste pedido → 404', String(notaDesconhecida.status));

const cancelada = await erp('PATCH', `/api/v1/orders/${pedido}/invoices/${CHAVE_B}`, { status: 'canceled' });
ok(cancelada.status === 200 && cancelada.json?.invoice?.status === 'canceled',
  '10 · o cancelamento devolve a nota atualizada', JSON.stringify(cancelada.json?.invoice?.status));

const denovo = await erp('PATCH', `/api/v1/orders/${pedido}/invoices/${CHAVE_B}`, { status: 'canceled' });
ok(denovo.status === 200, '10 · cancelar de novo é retry, não erro', String(denovo.status));

const aindaLa = (await erp('GET', `/api/v1/orders/${pedido}`)).json?.order ?? {};
ok((aindaLa.invoices ?? []).length === 2,
  '10 · a nota cancelada CONTINUA no GET — o ERP precisa do histórico',
  String((aindaLa.invoices ?? []).length));

const reenvioDeCancelada = await enviarNota(pedido, metadados(CHAVE_B), arquivosDe(CHAVE_B, 'z'));
ok(reenvioDeCancelada.status === 409 && reenvioDeCancelada.json?.error?.code === 'invoice_canceled',
  '10 · reenviar nota cancelada → 409 invoice_canceled',
  String(reenvioDeCancelada.json?.error?.code));

// --------------------------- 11. o comprador não vê nota cancelada ----

const urlCancelada = (aindaLa.invoices ?? []).find((n) => n.key === CHAVE_B)?.pdfUrl ?? '';
const tentativaDoDono = await dono.baixar(caminhoDe(urlCancelada));
ok(tentativaDoDono.status === 404,
  '11 · o comprador NÃO baixa nota cancelada', String(tentativaDoDono.status));
const erpNaCancelada = await baixarComoErp(caminhoDe(urlCancelada));
ok(erpNaCancelada.status === 200,
  '11 · mas o ERP continua baixando — histórico contábil não se apaga',
  String(erpNaCancelada.status));

const conta = await dono.chamar('GET', '/api/account');
const pedidoNaConta = (conta.json?.account?.orders ?? []).find((o) => o.id === pedido) ?? {};
ok((pedidoNaConta.invoices ?? []).length === 1,
  '11 · na conta do cliente aparece só a autorizada',
  String((pedidoNaConta.invoices ?? []).length));
ok((pedidoNaConta.invoices ?? [])[0]?.key === CHAVE_A, '11 · e é a certa');

// ------------------------------------------------------------ limpeza ----

for (const chave of [CHAVE_A, CHAVE_B]) {
  const linha = await q.one('SELECT xml_token, pdf_token FROM order_invoices WHERE nfe_key = ?', [chave]);
  if (linha) {
    const { promises: fs } = await import('node:fs');
    const path = await import('node:path');
    for (const [t, ext] of [[linha.xml_token, 'xml'], [linha.pdf_token, 'pdf']]) {
      await fs.unlink(path.resolve(process.cwd(), 'notas', `${t}.${ext}`)).catch(() => {});
    }
  }
}
await q.run('DELETE FROM orders WHERE id IN (?, ?)', [pedido, outroPedido]);
await q.run('DELETE FROM customers WHERE email IN (?, ?)', [emailDono, emailOutro]);
await painel.chamar('DELETE', `/api/admin/api-keys/${chaveApi.json.id}`);

await closePool();
console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
