import { chromium } from 'playwright';
const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
// Credenciais do administrador de teste. Sobrescreva com variáveis de ambiente
// para não depender de uma senha fixa no repositório.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@queopspiramides.com.br';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'DemoQueops2026!';
const log = []; const ok = m => log.push('  OK  ' + m); const fail = m => log.push('FALHA ' + m);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext()).newPage();

await page.goto(BASE, { waitUntil: 'networkidle' });
// escolhe um produto caro para passar do mínimo de frete grátis / cupom
await page.evaluate(() => localStorage.setItem('queops_cart_v1', JSON.stringify([{ id: 'cruz-de-cristal-fume-20cm-1011', qty: 1 }])));
await page.reload({ waitUntil: 'networkidle' });

await page.locator('header button').filter({ hasText: /R\$/ }).first().click().catch(async () => {
  await page.locator('header button').last().click();
});
await page.waitForTimeout(800);
const drawer = await page.locator('[role=dialog]').count();
drawer ? ok('gaveta do carrinho abre com role=dialog') : fail('gaveta sem role=dialog');

/*
 * Esc fecha (acessibilidade).
 *
 * Espera o diálogo DESAPARECER em vez de dormir um tempo fixo: a gaveta tem
 * animação de saída de ~600ms, e o timeout de 500ms acusava falha num
 * comportamento que estava correto — teste instável ensina a ignorar teste.
 */
await page.keyboard.press('Escape');
await page.locator('[role=dialog]').waitFor({ state: 'detached', timeout: 5000 })
  .then(() => ok('Esc fecha a gaveta'))
  .catch(() => fail('Esc não fechou'));

// vai ao checkout pela gaveta
await page.locator('header button').filter({ hasText: /R\$/ }).first().click();
await page.waitForTimeout(600);
await page.locator('button:has-text("Finalizar")').first().click();
await page.waitForSelector('text=Finalizar compra', { timeout: 10000 });
ok('checkout abriu');

await page.fill('#ck-name', 'Marcelo Oliveira');
await page.fill('#ck-cpf', '52998224725');
await page.fill('#ck-phone', '11988887777');
await page.fill('#ck-email', 'marcelo.teste@example.com');
await page.getByRole('button', { name: 'Continuar', exact: true }).click();
await page.waitForTimeout(600);

await page.fill('#ck-cep', '01310100');
await page.fill('#ck-street', 'Av. Paulista');
await page.fill('#ck-number', '1000');
await page.fill('#ck-hood', 'Bela Vista');
await page.fill('#ck-city', 'São Paulo');
await page.selectOption('#ck-uf', 'SP');
await page.waitForTimeout(900);

// aplica cupom
await page.fill('#ck-coupon', 'BEMVINDO10');
await page.click('button:has-text("Aplicar")');
await page.waitForTimeout(1200);
const resumo = await page.locator('text=Resumo do pedido').locator('..').locator('..').innerText();
/Cupom BEMVINDO10 aplicado/.test(resumo) ? ok('cupom validado pelo servidor') : fail('cupom não aplicou: ' + resumo.slice(0, 200));
/Frete/.test(resumo) ? ok('linha de frete presente') : fail('sem linha de frete');

await page.getByRole('button', { name: 'Continuar', exact: true }).click();
await page.waitForTimeout(600);
await page.click('button:has-text("Pix")').catch(() => {});
await page.waitForTimeout(1200);
const resumo2 = await page.locator('text=Resumo do pedido').locator('..').locator('..').innerText();
/Desconto Pix/.test(resumo2) ? ok('desconto Pix vindo das configurações') : fail('sem desconto Pix');

/*
 * Daqui para frente o teste depende de haver meio de pagamento configurado,
 * porque SEM COBRANÇA NÃO EXISTE PEDIDO — foi o defeito mais grave que esta
 * loja teve: a tela afirmava "Pedido confirmado · Total pago" sem ninguém ter
 * sido cobrado. Então verificamos o que for verdade no ambiente atual:
 *
 *   - sem credencial do Mercado Pago → a loja RECUSA e avisa, e nada é gravado;
 *   - com credencial de teste (TEST-…) → o Pix gera o QR e a tela diz
 *     "Aguardando o pagamento", nunca "Total pago".
 */
const cfg = await page.evaluate(() => fetch('/api/payments/config').then(r => r.json()));
let num = '';

if (!cfg.enabled) {
  const corpo = await page.locator('body').innerText();
  /não está aceitando pagamento online/i.test(corpo)
    ? ok('sem gateway configurado, o checkout avisa em vez de fingir')
    : fail('sem gateway e sem aviso na tela de pagamento');

  const botao = page.locator('button:has-text("Gerar código Pix")');
  (await botao.count()) === 1 ? ok('botão do Pix presente') : fail('botão do Pix ausente');
  (await botao.first().isDisabled())
    ? ok('e desabilitado, porque não há como cobrar')
    : fail('botão do Pix habilitado sem meio de pagamento');

  (await page.locator('text=Finalizar compra').count())
    ? ok('nenhum pedido é confirmado sem cobrança')
    : fail('a tela avançou sem cobrança');
  /Total pago/i.test(corpo)
    ? fail('a tela afirma "Total pago" sem cobrança')
    : ok('a tela não afirma "Total pago"');

  await page.screenshot({ path: 'tests/e2e/.saida/checkout.png' });
  await browser.close();
  console.log(log.join('\n'));
  console.log(
    '\nNOTA: o resto do fluxo (QR do Pix, pedido no painel) exige credencial do'
    + '\nMercado Pago. Cadastre as chaves TEST- em Painel → Integrações e rode de novo.',
  );
  const parcial = log.filter(l => l.startsWith('FALHA')).length;
  process.exit(parcial ? 1 : 0);
}

await page.click('button:has-text("Gerar código Pix")');
await page.waitForSelector('text=Aguardando o pagamento', { timeout: 30000 });
const conf = await page.locator('body').innerText();
num = (conf.match(/QP-\d{6}/) ?? [])[0] ?? '';
num ? ok('pedido reservado com Pix: ' + num) : fail('sem número de pedido');
/Total pago/i.test(conf)
  ? fail('a tela do Pix afirma "Total pago" antes de o dinheiro entrar')
  : ok('a tela do Pix não afirma pagamento');
(await page.locator('img[alt*="QR code"]').count())
  ? ok('QR code do Pix desenhado na página')
  : fail('sem QR code na tela do Pix');
await page.screenshot({ path: 'tests/e2e/.saida/checkout.png' });

// o pedido aparece no painel?
await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
await page.fill('#admin-email', ADMIN_EMAIL);
await page.fill('#admin-pass', ADMIN_PASS);
await page.click('button[type=submit]');
await page.waitForTimeout(2500);
await page.click('button:has-text("Pedidos")');
await page.waitForTimeout(1500);
const painel = await page.locator('body').innerText();
painel.includes(num) ? ok(`pedido ${num} visível no painel`) : fail('pedido não apareceu no painel');
painel.includes('marcelo.teste@example.com') || painel.includes('Marcelo Oliveira') ? ok('cliente registrado') : fail('cliente ausente');
await page.screenshot({ path: 'tests/e2e/.saida/pedidos.png' });

await browser.close();
console.log(log.join('\n'));
const f = log.filter(l => l.startsWith('FALHA')).length;
console.log(f ? `\n${f} falha(s)` : '\nFluxo de compra completo funcionando');
process.exit(f ? 1 : 0);
