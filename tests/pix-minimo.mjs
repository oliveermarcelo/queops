/**
 * Desconto do Pix condicionado a um valor mínimo.
 *
 * Regra de dinheiro, então o que precisa ficar verdadeiro é preciso:
 *
 *   - o mínimo é conferido contra o SUBTOTAL DOS PRODUTOS. Sem frete: senão o
 *     mesmo carrinho ganharia ou perderia o desconto conforme o CEP. E sem o
 *     cupom já abatido: senão aplicar um cupom poderia apagar o desconto do
 *     Pix e fazer o total SUBIR ao usar um desconto — ninguém liga uma coisa à
 *     outra, e a tela não teria como explicar;
 *
 *   - abaixo do mínimo, o servidor devolve QUANTO FALTA, para a loja convidar
 *     em vez de simplesmente não descontar. Vem de cá, do mesmo cálculo que
 *     define o total: a tela calculando por conta própria foi como o carrinho
 *     e o checkout passaram a anunciar fretes diferentes.
 *
 * O teste devolve a configuração ao estado anterior no fim, inclusive se
 * falhar no meio — mexer em desconto e deixar a loja assim é caro.
 *
 *   npm run teste:pix
 */

import { closePool } from '../server/src/db.ts';
import { configGet, configSet } from '../server/src/store.ts';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';

let falhas = 0;
const ok = (cond, nome, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}${cond || extra === '' ? '' : ' → ' + extra}`);
  if (!cond) falhas++;
};

/*
 * Cliente que acompanha o cookie, como o navegador faz.
 *
 * Entrar no painel TROCA o cookie de sessão, e com ele o token CSRF. Um
 * cliente que guardasse o cookie de antes receberia 419 em tudo depois do
 * login — e o teste passaria a verificar respostas de erro achando que
 * verificava regras de desconto.
 */
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

const loja = cliente();
await loja.sessao();

/** Cota uma sacola como o checkout faz. */
async function cotar(itens, extra = {}) {
  const r = await loja.chamar('POST', '/api/checkout/quote', {
    items: itens, cep: '01310-100', payment: 'pix', ...extra,
  });
  return r.json ?? {};
}

// Um produto ativo qualquer, descoberto em tempo de execução: id escrito à mão
// quebra o teste sempre que o catálogo do ambiente muda.
const catalogo = await (await fetch(`${BASE}/api/products`)).json();
const produto = (catalogo.products ?? []).find((p) => p.active !== false && Number(p.price) > 0);
if (produto === undefined) {
  console.log('FALHA não há produto ativo para cotar');
  process.exit(1);
}

const preco = Number(produto.price);
const originais = await configGet('settings', {});

try {
  // ------------------------------------------------ sem mínimo (0) ----

  await configSet('settings', { ...originais, pixDiscountPct: 10, pixMinOrder: 0 });

  const semMinimo = await cotar([{ productId: produto.id, quantity: 1 }]);
  ok(Math.abs(semMinimo.pixDiscount - preco * 0.1) < 0.02,
    'com mínimo 0, o desconto vale em qualquer valor',
    `${semMinimo.pixDiscount} de ${preco}`);
  ok((semMinimo.pixFaltam ?? 0) === 0, 'e não falta nada');

  // ------------------------------------------------ abaixo do mínimo ----

  /*
   * Mínimo logo acima do preço de UMA peça, e abaixo do de duas: assim o
   * mesmo produto exercita os dois lados da regra, sem depender de quanto
   * custam os produtos deste ambiente.
   */
  const minimo = Math.round((preco * 1.5 + Number.EPSILON) * 100) / 100;
  await configSet('settings', { ...originais, pixDiscountPct: 10, pixMinOrder: minimo });

  const abaixo = await cotar([{ productId: produto.id, quantity: 1 }]);
  ok(abaixo.pixDiscount === 0, 'abaixo do mínimo não há desconto', String(abaixo.pixDiscount));
  ok(Math.abs(abaixo.pixFaltam - (minimo - preco)) < 0.02,
    'e o servidor diz exatamente quanto falta',
    `${abaixo.pixFaltam}, esperado ${(minimo - preco).toFixed(2)}`);
  ok(Math.abs(abaixo.total - (preco + abaixo.shipping)) < 0.02,
    'o total cobrado não leva desconto nenhum',
    `${abaixo.total}`);

  // ------------------------------------------------ acima do mínimo ----

  const acima = await cotar([{ productId: produto.id, quantity: 2 }]);
  ok(Math.abs(acima.pixDiscount - preco * 2 * 0.1) < 0.02,
    'atingido o mínimo, o desconto entra',
    `${acima.pixDiscount}`);
  ok((acima.pixFaltam ?? 0) === 0, 'e não falta mais nada');

  // ------------------------------------- o frete NÃO conta para o mínimo ----

  /*
   * A peça sozinha não atinge o mínimo. Se o frete entrasse na conta, um CEP
   * distante (frete caro) poderia empurrar o pedido por cima da linha — e o
   * mesmo carrinho teria desconto em Manaus e não teria em São Paulo.
   */
  const longe = await cotar([{ productId: produto.id, quantity: 1 }], { cep: '69050-000' });
  ok(longe.pixDiscount === 0,
    'o frete não conta para atingir o mínimo, nem num CEP caro',
    `frete ${longe.shipping}, desconto ${longe.pixDiscount}`);

  // ------------------------------- o cupom NÃO derruba o pedido do mínimo ----

  /*
   * Duas peças passam do mínimo. Com um cupom que abate abaixo dele, o
   * desconto do Pix TEM de continuar valendo: caso contrário o cliente
   * aplicaria um cupom e veria o total subir.
   */
  const codigo = `PIXTST${String(Date.now()).slice(-6)}`;
  const painel = cliente();
  await painel.sessao();
  await painel.chamar('POST', '/api/admin/login', {
    email: process.env.ADMIN_EMAIL ?? 'admin@queopspiramides.com.br',
    password: process.env.ADMIN_PASS ?? 'DemoQueops2026!',
  });
  // O login troca a sessão: pega o token CSRF novo antes de gravar.
  await painel.sessao();

  const criado = await painel.chamar('POST', '/api/admin/coupons', {
    code: codigo, type: 'percent', value: 50, active: true,
  });
  ok(criado.status === 200, 'o cupom de teste foi criado no painel', String(criado.status));

  // A rota recebe o cupom em `coupon` — `couponCode` é como ele VOLTA.
  const comCupom = await cotar([{ productId: produto.id, quantity: 2 }], { coupon: codigo });
  ok(comCupom.couponDiscount > 0, 'o cupom de teste foi aceito', String(comCupom.couponDiscount));
  ok(comCupom.pixDiscount > 0,
    'o cupom não derruba o pedido abaixo do mínimo do Pix — os dois se somam',
    `pix ${comCupom.pixDiscount}, cupom ${comCupom.couponDiscount}`);

  /*
   * E o percentual do Pix incide sobre o valor JÁ descontado do cupom: dois
   * descontos sobre o valor cheio dariam mais desconto do que a loja quis.
   */
  const baseEsperada = preco * 2 - comCupom.couponDiscount;
  ok(Math.abs(comCupom.pixDiscount - baseEsperada * 0.1) < 0.02,
    'e o Pix incide sobre o subtotal já com o cupom, não sobre o cheio',
    `${comCupom.pixDiscount}, esperado ${(baseEsperada * 0.1).toFixed(2)}`);

  const cupomId = criado.json?.id ?? codigo;
  await painel.chamar('DELETE', `/api/admin/coupons/${encodeURIComponent(cupomId)}`);

  // ------------------------------- cartão não ganha desconto de Pix ----

  const cartao = await cotar([{ productId: produto.id, quantity: 2 }], { payment: 'card' });
  ok(cartao.pixDiscount === 0, 'pagando no cartão não há desconto de Pix', String(cartao.pixDiscount));

  // ------------------------------------- a loja publica a regra ----

  const publico = await (await fetch(`${BASE}/api/catalog`)).json();
  ok(Number(publico.settings?.pixMinOrder) === minimo,
    'a vitrine recebe o mínimo, para poder avisar quanto falta',
    String(publico.settings?.pixMinOrder));
} finally {
  // Devolve a configuração ao que era, aconteça o que acontecer.
  await configSet('settings', originais);
}

await closePool();
console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
