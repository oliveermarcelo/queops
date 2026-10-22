/**
 * Envia (envia.com): cotação, etiqueta e rastreio.
 *
 * A Envia é a terceira fonte de frete da loja e a primeira que vai além de
 * cotar — ela emite a etiqueta e isso GASTA DINHEIRO. O teste existe para
 * cobrar as duas coisas que, se falharem, falham caro e em silêncio:
 *
 *   1. que o agrupamento de provedor não vaze para o ERP (o `shippingServiceCode`
 *      precisa sair limpo, sem o nome da transportadora colado);
 *   2. que a etiqueta NÃO possa ser emitida duas vezes, nem antes do pagamento.
 *
 * A rede não é tocada: a cotação de verdade depende de um token que a loja
 * ainda não tem, e teste que depende de internet não roda. O que é testado
 * aqui é a tradução da resposta e as travas — que é onde um campo renomeado
 * pela API vira frete R$ 0,00 em produção.
 *
 *   npm run teste:envia
 */

import { closePool, q } from '../server/src/db.ts';
import { mapearOpcoes, credsFrom, problemaNasCredenciais, ehSandbox, detalheDoErro } from '../server/src/envia.ts';
import { dadosDaTransportadora } from '../server/src/pricing.ts';

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

function navegador() {
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

// ------------------------------------------- 1. tradução da cotação ----

/*
 * A resposta da Envia, como a documentação dela descreve. Se algum destes
 * nomes mudar do lado deles, é aqui que o teste quebra — e não em produção,
 * com o frete saindo zero.
 */
const RESPOSTA = [
  {
    carrier: 'correios',
    carrierDescription: 'Correios',
    service: 'pac',
    serviceDescription: 'PAC',
    basePrice: 20.0,
    totalPrice: 24.9,
    currency: 'BRL',
    deliveryEstimate: '5-8 días',
    deliveryDate: { dateDifference: 8 },
  },
  {
    carrier: 'jadlog',
    carrierDescription: 'Jadlog',
    service: 'package',
    serviceDescription: '.Package',
    totalPrice: 31.5,
    deliveryEstimate: '3-4 días',
  },
  {
    carrier: 'loggi',
    carrierDescription: 'Loggi',
    service: 'express',
    serviceDescription: 'Express',
    totalPrice: 0,
  },
];

const opcoes = mapearOpcoes(RESPOSTA);

ok(opcoes[0].preco === 24.9,
  '1 · o preço vem de totalPrice, não de basePrice — o base sai sem as taxas',
  String(opcoes[0].preco));
ok(opcoes[0].servico === 'correios|pac',
  '1 · o id do serviço carrega a transportadora junto: é o par que a Envia usa',
  opcoes[0].servico);
ok(opcoes[0].nome === 'Correios · PAC', '1 · com o nome montado para o cliente ler', opcoes[0].nome);
ok(opcoes[0].prazoDias === 8, '1 · o prazo sai de deliveryDate.dateDifference', String(opcoes[0].prazoDias));

ok(opcoes[1].prazoDias === 4,
  '1 · sem dateDifference, o prazo sai do texto — e pega o MAIOR número de "3-4 días"',
  String(opcoes[1].prazoDias));
ok(opcoes[1].servico === 'jadlog|package', '1 · o par da segunda transportadora');

ok(opcoes[2].erro !== '' && opcoes[2].preco === 0,
  '1 · serviço sem preço vira erro, e não uma opção de R$ 0,00',
  JSON.stringify(opcoes[2]));

// -------------------------- 2. o par não vaza para o ERP ----

const escolha = dadosDaTransportadora(
  {
    shippingOptions: [
      { id: 'envia:correios|pac', label: 'Correios · PAC', carrier: 'Correios', price: 24.9, days: 8, source: 'envia' },
    ],
    shippingChoice: 'envia:correios|pac',
    shipping: 24.9,
    shippingLabel: 'Correios · PAC',
  },
  '',
);
ok(escolha.serviceCode === 'pac',
  '2 · o ERP recebe o código do serviço LIMPO, sem a transportadora colada',
  escolha.serviceCode);
ok(escolha.carrier === 'Correios', '2 · e a transportadora no campo dela', escolha.carrier);

const escolhaCorreios = dadosDaTransportadora(
  {
    shippingOptions: [
      { id: 'correios:03220', label: 'SEDEX', carrier: 'Correios', price: 30, days: 3, source: 'correios' },
    ],
    shippingChoice: 'correios:03220',
    shipping: 30,
    shippingLabel: 'SEDEX',
  },
  '',
);
ok(escolhaCorreios.serviceCode === '03220',
  '2 · e os provedores antigos continuam saindo como sempre',
  escolhaCorreios.serviceCode);

// --------------------------------- 3. credenciais e ambiente ----

ok(problemaNasCredenciais(credsFrom({})) !== '',
  '3 · sem token, a integração diz o que falta em vez de tentar');

const quaseLa = credsFrom({
  token: 'x', originName: 'Quéops', originPhone: '11998670049',
  originStreet: 'Rua A', originCity: 'São Paulo', originState: 'SP', originCep: '',
});
const recado = problemaNasCredenciais(quaseLa);
ok(recado.includes('CEP de origem'),
  '3 · e nomeia o campo que falta, em vez de "credenciais inválidas"', recado);
ok(problemaNasCredenciais(credsFrom({
  token: 'x', originName: 'Quéops', originPhone: '11998670049', originStreet: 'Rua A',
  originCity: 'São Paulo', originState: 'SP', originCep: '01310-100',
})) === '', '3 · com tudo preenchido, está pronta');

ok(ehSandbox(credsFrom({ sandbox: 'sandbox' })) === true, '3 · reconhece o ambiente de teste');
ok(ehSandbox(credsFrom({ sandbox: 'production' })) === false, '3 · e o de produção');

ok(detalheDoErro('Authentication error.') === 'Authentication error.',
  '3 · erro em texto cru (401 da Shipping API) é lido como mensagem');
ok(detalheDoErro('{"message":"postalCode is required"}') === 'postalCode is required',
  '3 · e o erro em JSON também — é ele que diz qual campo corrigir');

// ------------------------------ 4. as travas da etiqueta ----

const painel = navegador();
await painel.sessao();
await painel.chamar('POST', '/api/admin/login', ADMIN);
await painel.sessao();

const marca = Date.now();
const PEDIDO_PAGO = `ENV-P-${String(marca).slice(-8)}`;
const PEDIDO_ABERTO = `ENV-A-${String(marca).slice(-8)}`;

await q.run(
  `INSERT INTO orders (id, customer_name, customer_email, subtotal, total, status, payment,
                       ship_cep, ship_street, ship_number, ship_city, ship_state,
                       shipping_carrier, shipping_service_code, paid_at)
   VALUES (?, 'Cliente da Envia', 'envia@exemplo.com', 200, 224.90, 'paid', 'pix',
           '01310-100', 'Av. Paulista', '1000', 'São Paulo', 'SP',
           'Correios', 'pac', NOW())`,
  [PEDIDO_PAGO],
);
await q.run(
  `INSERT INTO orders (id, customer_name, customer_email, subtotal, total, status, payment,
                       ship_cep, ship_city, ship_state, shipping_carrier, shipping_service_code)
   VALUES (?, 'Cliente sem pagar', 'aberto@exemplo.com', 200, 224.90, 'pending', 'pix',
           '01310-100', 'São Paulo', 'SP', 'Correios', 'pac')`,
  [PEDIDO_ABERTO],
);

const semPagar = await painel.chamar('POST', `/api/admin/orders/${PEDIDO_ABERTO}/etiqueta`);
ok(semPagar.status === 409 && semPagar.json?.error?.code === 'order_not_paid',
  '4 · pedido NÃO PAGO não emite etiqueta — seria pagar frete de venda que pode não vir',
  `${semPagar.status} ${semPagar.json?.error?.code}`);

/*
 * O caminho feliz não dá para exercitar sem token da Envia. O que dá, e é o
 * que importa, é provar que a SEGUNDA emissão é recusada — a trava que separa
 * "frete pago uma vez" de "frete pago duas vezes".
 */
await q.run(
  "UPDATE orders SET shipment_ref = 'ENVIO-123', label_provider = 'envia', label_url = 'https://exemplo/e.pdf' WHERE id = ?",
  [PEDIDO_PAGO],
);
const segundaVez = await painel.chamar('POST', `/api/admin/orders/${PEDIDO_PAGO}/etiqueta`);
ok(segundaVez.status === 409 && segundaVez.json?.error?.code === 'label_exists',
  '4 · pedido que JÁ tem etiqueta recusa a segunda emissão',
  `${segundaVez.status} ${segundaVez.json?.error?.code}`);

const semSessao = await fetch(`${BASE}/api/admin/orders/${PEDIDO_PAGO}/etiqueta`, { method: 'POST' });
ok(semSessao.status === 401 || semSessao.status === 419,
  '4 · e sem sessão de painel ninguém gasta o saldo da conta', String(semSessao.status));

// ---------------------------- 5. o pedido conta o que tem ----

const chave = await painel.chamar('POST', '/api/admin/api-keys', { name: `teste-envia-${marca}` });
const TOKEN = chave.json?.token ?? '';
const erp = async (caminho) => {
  const res = await fetch(BASE + caminho, { headers: { Authorization: `Bearer ${TOKEN}` } });
  return await res.json().catch(() => null);
};

const pedido = (await erp(`/api/v1/orders/${PEDIDO_PAGO}`))?.order ?? {};
ok(pedido.labelUrl === 'https://exemplo/e.pdf',
  '5 · a etiqueta aparece na API do ERP — antes só dava para saber abrindo o painel',
  String(pedido.labelUrl));
ok(pedido.shipmentRef === 'ENVIO-123', '5 · com o id do envio', String(pedido.shipmentRef));

const pedidoSemEtiqueta = (await erp(`/api/v1/orders/${PEDIDO_ABERTO}`))?.order ?? {};
ok(pedidoSemEtiqueta.labelUrl === null,
  '5 · e vem null quando não há etiqueta, não string vazia',
  JSON.stringify(pedidoSemEtiqueta.labelUrl));

// --------------------------- 6. a tela de serviços responde ----

const servicos = await painel.chamar('GET', '/api/admin/envia/servicos');
ok(servicos.status === 200,
  '6 · a lista de transportadoras responde mesmo sem credencial', String(servicos.status));
ok(String(servicos.json?.erro ?? '').includes('Token'),
  '6 · e diz o que falta, em vez de uma lista vazia sem explicação',
  String(servicos.json?.erro));

// ------------------------------------------------------------ limpeza ----

await q.run('DELETE FROM orders WHERE id IN (?, ?)', [PEDIDO_PAGO, PEDIDO_ABERTO]);
if (chave.json?.id) await painel.chamar('DELETE', `/api/admin/api-keys/${chave.json.id}`);

await closePool();
console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
