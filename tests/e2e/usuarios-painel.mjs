/**
 * Tela "Usuários do Painel" no navegador de verdade.
 *
 * O teste HTTP já garante que as rotas funcionam. O que só aparece aqui é a
 * fiação da tela: o botão que não chama a rota, o erro do servidor que não
 * chega ao operador, a lista que não atualiza depois de criar. São falhas
 * silenciosas — a tela parece funcionar e o acesso não existe.
 *
 *   node tests/e2e/usuarios-painel.mjs
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
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

// ---------- entra no painel ----------
await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
await page.fill('#admin-email', ADMIN_EMAIL);
await page.fill('#admin-pass', ADMIN_PASS);
await page.click('button[type=submit]');
await page.waitForTimeout(2000);

// ---------- abre a tela ----------
await page.click('button:has-text("Usuários do Painel")');
await page.waitForSelector('text=Novo usuário', { timeout: 10000 });
ok('a tela Usuários do Painel abre pelo menu');

const corpo = await page.locator('main').innerText();
/acesso total ao painel/i.test(corpo)
  ? ok('o aviso de acesso total está visível antes de criar')
  : fail('o aviso de acesso total não apareceu');
/admin@queopspiramides/.test(corpo) ? ok('o dono aparece na lista') : fail('o dono não aparece na lista');
/você/.test(corpo) ? ok('a própria conta está marcada como "você"') : fail('falta a marca "você"');

// ---------- senha curta: o erro do servidor tem que chegar na tela ----------
const email = `e2e-${Date.now()}@exemplo.com`;
await page.click('button:has-text("Novo usuário")');
await page.waitForSelector('input[placeholder*="João"]', { timeout: 10000 });

await page.fill('input[placeholder*="João"]', 'Funcionária E2E');
await page.fill('input[type=email]', email);
await page.fill('input[placeholder*="frase"]', 'curta');
await page.click('button:has-text("Criar usuário")');
await page.waitForTimeout(1200);
const comErro = await page.locator('main').innerText();
/pelo menos 10 caracteres/i.test(comErro)
  ? ok('senha curta: a recusa do servidor aparece na tela')
  : fail('a recusa da senha curta não chegou à tela');

// ---------- sugerir senha ----------
await page.fill('input[placeholder*="frase"]', '');
await page.click('button:has-text("Sugerir")');
const sugerida = await page.inputValue('input[placeholder*="frase"]');
sugerida.length >= 10 && sugerida.includes('-')
  ? ok('o botão Sugerir preenche uma frase utilizável: ' + sugerida)
  : fail('Sugerir não preencheu: ' + sugerida);

// ---------- cria de verdade ----------
await page.click('button:has-text("Criar usuário")');
await page.waitForTimeout(2000);
const depois = await page.locator('main').innerText();
depois.includes(email)
  ? ok('o usuário criado aparece na lista sem recarregar a página')
  : fail('a lista não mostrou o usuário criado');
depois.includes('Nunca entrou')
  ? ok('a lista mostra que a pessoa ainda não entrou')
  : fail('faltou o "Nunca entrou"');

// ---------- o novo usuário consegue entrar ----------
const ctx2 = await browser.newContext();
const page2 = await ctx2.newPage();
await page2.goto(BASE + '/admin', { waitUntil: 'networkidle' });
await page2.fill('#admin-email', email);
await page2.fill('#admin-pass', sugerida);
await page2.click('button[type=submit]');
await page2.waitForTimeout(2500);
const painel2 = await page2.locator('body').innerText();
/Dashboard|Pedidos/.test(painel2)
  ? ok('quem foi criado na tela consegue entrar no painel')
  : fail('o usuário criado não entrou: ' + painel2.slice(0, 120));

// ---------- desativar a si mesmo não é oferecido ----------
const meuBotao = page.locator('div:has-text("você") button[title*="própria conta"]').first();
(await meuBotao.count()) > 0 && !(await meuBotao.isEnabled())
  ? ok('o botão de desativar a própria conta existe e está desabilitado, com o motivo no título')
  : fail('a própria conta não está protegida na tela');

await page.screenshot({ path: 'tests/e2e/.saida/usuarios.png', fullPage: false });

// ---------- desativa o criado, e ele perde o acesso ----------
// A linha do usuário é o cartão `p-4 rounded-lg` que contém o e-mail. Filtrar
// por `div:has-text(...)` pegaria também os divs internos, que não têm botão.
const linha = page.locator('div.p-4.rounded-lg').filter({ hasText: email }).first();
await linha.locator('button[title*="Desativar"]').click();
await page.waitForSelector('button:has-text("Desativar")', { timeout: 5000 });
await page.locator('div[role=alertdialog] button:has-text("Desativar")').click();
await page.waitForTimeout(2000);
const listaFinal = await page.locator('main').innerText();
/desativado/i.test(listaFinal)
  ? ok('a lista marca o usuário como desativado')
  : fail('a marca "desativado" não apareceu');

await page2.reload({ waitUntil: 'networkidle' });
await page2.waitForTimeout(2000);
const depoisDeDesativar = await page2.locator('body').innerText();
/Painel Administrativo|Entrar/i.test(depoisDeDesativar)
  ? ok('o desativado cai para a tela de login')
  : fail('o desativado continuou dentro do painel');

await browser.close();

console.log(log.join('\n'));
console.log('\nErros de console:', errors.length ? errors.slice(0, 5).join(' | ') : 'nenhum');
const falhas = log.filter((l) => l.startsWith('FALHA')).length;
console.log(falhas ? `\n${falhas} verificação(ões) falharam` : '\nTodas as verificações passaram');
process.exit(falhas ? 1 : 0);
