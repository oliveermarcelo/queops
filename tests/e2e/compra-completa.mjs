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

// Esc fecha (acessibilidade)
await page.keyboard.press('Escape');
await page.waitForTimeout(500);
(await page.locator('[role=dialog]').count()) === 0 ? ok('Esc fecha a gaveta') : fail('Esc não fechou');

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

await page.click('button:has-text("Concluir pedido")');
await page.waitForSelector('text=Pedido confirmado', { timeout: 20000 });
const conf = await page.locator('body').innerText();
const num = (conf.match(/QP-\d{6}/) ?? [])[0];
num ? ok('pedido gravado: ' + num) : fail('sem número de pedido');
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
