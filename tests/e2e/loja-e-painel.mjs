import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
// Credenciais do administrador de teste. Sobrescreva com variáveis de ambiente
// para não depender de uma senha fixa no repositório.
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@queopspiramides.com.br';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'DemoQueops2026!';
const log = [];
const ok = (m) => log.push('  OK  ' + m);
const fail = (m) => log.push('FALHA ' + m);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const ctx = await browser.newContext();
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));

// ---------- vitrine ----------
await page.goto(BASE, { waitUntil: 'networkidle' });
const title = await page.title();
title.includes('Quéops') ? ok('título da página') : fail('título: ' + title);

await page.waitForSelector('text=Mais vendidos', { timeout: 15000 });
ok('home renderizou os trilhos de produtos');

const cards = await page.locator('h3').count();
cards > 5 ? ok(`produtos na home: ${cards} títulos`) : fail('poucos produtos: ' + cards);

// carrinho vazio de início
await page.click('button[aria-label*="acola" i], button:has-text("Sacola")').catch(() => {});
const badge = await page.locator('header').innerText();
!/\b[1-9]\d* ite/.test(badge) ? ok('carrinho começa vazio') : fail('carrinho veio preenchido');

// ---------- adicionar ao carrinho + persistência ----------
await page.goto(BASE, { waitUntil: 'networkidle' });
const addBtn = page.locator('button:has-text("Comprar")').first();
if (await addBtn.count()) {
  await addBtn.click();
  await page.waitForTimeout(400);
  const stored = await page.evaluate(() => localStorage.getItem('queops_cart_v1'));
  stored && JSON.parse(stored).length === 1 ? ok('item salvo no localStorage') : fail('carrinho não persistiu: ' + stored);
  await page.reload({ waitUntil: 'networkidle' });
  const after = await page.evaluate(() => localStorage.getItem('queops_cart_v1'));
  JSON.parse(after ?? '[]').length === 1 ? ok('carrinho sobrevive ao reload') : fail('carrinho perdido no reload');
} else {
  fail('botão "Comprar" não encontrado');
}

// ---------- API: cotação reflete as regras ----------
const quote = await page.evaluate(async () => {
  const s = await (await fetch('/api/session')).json();
  const r = await fetch('/api/checkout/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': s.csrfToken },
    body: JSON.stringify({ items: [{ productId: 'placa-de-cobre-m-1001', quantity: 1 }], cep: '01310100', payment: 'pix' }),
  });
  return r.json();
});
quote.uf === 'SP' ? ok('UF deduzida do CEP: ' + quote.uf) : fail('UF: ' + quote.uf);
quote.shipping === 9.9 ? ok('faixa de CEP aplicada (R$ 9,90)') : fail('frete: ' + quote.shipping);

// ---------- admin ----------
await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
await page.waitForSelector('text=Painel Administrativo', { timeout: 15000 });
ok('/admin abre a tela de login');
const body = await page.locator('body').innerText();
/admin123|Acesso de demonstra/i.test(body) ? fail('credenciais de demo ainda visíveis') : ok('sem credenciais expostas no login');

await page.fill('#admin-email', ADMIN_EMAIL);
await page.fill('#admin-pass', 'senha-errada');
await page.click('button[type=submit]');
await page.waitForSelector('text=inválidos', { timeout: 10000 });
ok('senha errada é rejeitada pelo servidor');

await page.fill('#admin-pass', ADMIN_PASS);
await page.click('button[type=submit]');
await page.waitForSelector('text=Faturamento, text=Dashboard', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
const adminBody = await page.locator('body').innerText();
/Pedidos|Dashboard/.test(adminBody) ? ok('login válido entra no painel') : fail('painel não carregou');
/admin@queopspiramides/.test(adminBody) ? ok('usuário exibido no topo') : fail('usuário não exibido');

await page.screenshot({ path: 'tests/e2e/.saida/admin.png', fullPage: false });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.screenshot({ path: 'tests/e2e/.saida/loja.png', fullPage: false });

await browser.close();

console.log(log.join('\n'));
console.log('\nErros de console:', errors.length ? errors.slice(0, 5).join(' | ') : 'nenhum');
const failures = log.filter((l) => l.startsWith('FALHA')).length;
console.log(failures ? `\n${failures} verificação(ões) falharam` : '\nTodas as verificações passaram');
process.exit(failures ? 1 : 0);
