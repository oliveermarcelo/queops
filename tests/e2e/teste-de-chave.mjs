/**
 * O botão "Testar" das chaves de API, no navegador.
 *
 * O teste que mais importa aqui é o do caso ERRADO: colar outra chave válida.
 * Sem a checagem de prefixo o teste passaria — resposta certa para a pergunta
 * errada — e a pessoa concluiria que a chave daquela linha funciona. Um teste
 * de conexão que engana é pior que nenhum, porque produz confiança falsa.
 *
 *   node tests/e2e/teste-de-chave.mjs
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@queopspiramides.com.br';
const ADMIN_PASS = process.env.ADMIN_PASS ?? 'DemoQueops2026!';

const log = [];
const ok = (m) => log.push('  OK  ' + m);
const fail = (m) => log.push('FALHA ' + m);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext().then((c) => c.newPage());
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));

await page.goto(BASE + '/admin', { waitUntil: 'networkidle' });
await page.fill('#admin-email', ADMIN_EMAIL);
await page.fill('#admin-pass', ADMIN_PASS);
await page.click('button[type=submit]');
await page.waitForTimeout(2000);

await page.click('button:has-text("Integrações")');
await page.waitForTimeout(1500);

// A seção de API fica dentro de Integrações, numa aba própria.
const abaApi = page.locator('button:has-text("API"), button:has-text("Desenvolvedores")').first();
if (await abaApi.count()) {
  await abaApi.click();
  await page.waitForTimeout(1000);
}
await page.waitForSelector('text=Chaves de API', { timeout: 10000 });
ok('a seção de Chaves de API abre');

// ---------- cria duas chaves: a certa e a "outra" ----------
const criar = async (nome) => {
  await page.click('button:has-text("Gerar nova chave")');
  await page.fill('input[placeholder*="Nome da chave"]', nome);
  await page.click('button:has-text("Criar")');
  await page.waitForSelector('code:has-text("qp_live_")', { timeout: 10000 });
  await page.waitForTimeout(800);
  // O token completo aparece uma única vez, no alerta verde.
  const alerta = page.locator('div.bg-emerald-50 code').first();
  return (await alerta.innerText()).trim();
};

const tokenA = await criar('Teste E2E — chave A');
const tokenB = await criar('Teste E2E — chave B');
/^qp_live_[0-9a-f]{40}$/.test(tokenA) && tokenA !== tokenB
  ? ok('duas chaves distintas criadas')
  : fail('chaves inesperadas: ' + tokenA + ' / ' + tokenB);

const linhaA = page.locator('div.rounded-lg.border').filter({ hasText: 'Teste E2E — chave A' }).first();

// ---------- "nunca usada" antes de qualquer chamada ----------
const antes = await linhaA.innerText();
/nunca usada/i.test(antes)
  ? ok('chave recém-criada aparece como "nunca usada"')
  : fail('faltou a marca "nunca usada": ' + antes.replace(/\n/g, ' | '));

// ---------- colar a chave ERRADA ----------
await linhaA.locator('button:has-text("Testar")').click();
await page.waitForTimeout(500);
await linhaA.locator('input[placeholder*="Cole aqui"]').fill(tokenB);
await linhaA.locator('button:has-text("Testar agora")').click();
await page.waitForTimeout(1200);
const comErrada = await linhaA.innerText();
/não é a "Teste E2E — chave A"/.test(comErrada)
  ? ok('colar outra chave válida é recusado, com o motivo explícito')
  : fail('a chave errada não foi barrada: ' + comErrada.replace(/\n/g, ' | '));
/200/.test(comErrada)
  ? fail('a chave errada chegou a ser testada — o prefixo não barrou a chamada')
  : ok('e nenhuma chamada chegou a ser feita com ela');

// ---------- colar a chave CERTA ----------
await linhaA.locator('input[placeholder*="Cole aqui"]').fill(tokenA);
await linhaA.locator('button:has-text("Testar agora")').click();
await page.waitForTimeout(3000);
const comCerta = await linhaA.innerText();
/A chave funciona nos três endpoints/.test(comCerta)
  ? ok('a chave certa passa nos três endpoints')
  : fail('a chave certa não passou: ' + comCerta.replace(/\n/g, ' | '));
/\/products/.test(comCerta) && /\/orders/.test(comCerta) && /\/customers/.test(comCerta)
  ? ok('o resultado mostra endpoint por endpoint')
  : fail('faltou o detalhe por endpoint');
/\d+ produtos/.test(comCerta)
  ? ok('e diz quantos registros vieram em cada um')
  : fail('não mostrou a contagem');

// Recorte só da linha testada: o resultado fica abaixo da dobra e uma captura
// da viewport inteira não mostraria justamente o que o teste verificou.
await linhaA.scrollIntoViewIfNeeded();
await linhaA.screenshot({ path: 'tests/e2e/.saida/teste-de-chave.png' });

/*
 * O teste do painel NÃO pode contar como uso.
 *
 * `last_used_at` existe para responder "o ERP já chamou a loja?". Se o próprio
 * botão de testar gravasse uso, a resposta viraria "sim" logo depois do
 * primeiro clique, e o dono leria a chamada dele mesmo como confirmação do
 * ERP. Por isso a chamada com sessão de admin é ignorada no registro.
 */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('button:has-text("Integrações")');
await page.waitForTimeout(1200);
const abaApi1 = page.locator('button:has-text("API"), button:has-text("Desenvolvedores")').first();
if (await abaApi1.count()) {
  await abaApi1.click();
  await page.waitForTimeout(1200);
}
const aposTeste = await page.locator('div.rounded-lg.border')
  .filter({ hasText: 'Teste E2E — chave A' }).first().innerText();
/nunca usada/i.test(aposTeste)
  ? ok('testar pelo painel não conta como uso — o selo continua "nunca usada"')
  : fail('o teste do painel contaminou o último uso: ' + aposTeste.replace(/\n/g, ' | '));

// ---------- uma chamada externa (sem sessão de painel) conta ----------
const externa = await fetch(`${BASE}/api/v1/products`, {
  headers: { Authorization: `Bearer ${tokenA}` },
});
externa.status === 200
  ? ok('uma chamada externa com a chave responde 200')
  : fail('a chamada externa respondeu ' + externa.status);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(2500);
await page.click('button:has-text("Integrações")');
await page.waitForTimeout(1200);
const abaApi2 = page.locator('button:has-text("API"), button:has-text("Desenvolvedores")').first();
if (await abaApi2.count()) {
  await abaApi2.click();
  await page.waitForTimeout(1200);
}
const linhaDepois = page.locator('div.rounded-lg.border').filter({ hasText: 'Teste E2E — chave A' }).first();
const depois = await linhaDepois.innerText();
/em uso/.test(depois) && /último uso em/.test(depois)
  ? ok('a chamada externa aparece como "em uso", com data e hora')
  : fail('o último uso não apareceu: ' + depois.replace(/\n/g, ' | '));

// ---------- chave revogada: 401 ----------
await linhaDepois.locator('button[title=Revogar]').click();
await page.waitForSelector('div[role=alertdialog]', { timeout: 5000 });
await page.locator('div[role=alertdialog] button:has-text("Revogar")').click();
await page.waitForTimeout(2500);
const revogada = page.locator('div.rounded-lg.border').filter({ hasText: 'Teste E2E — chave A' }).first();
(await revogada.locator('button:has-text("Testar")').count()) === 0
  ? ok('chave revogada não oferece mais o botão de testar')
  : fail('o botão de testar continuou numa chave revogada');

// A chave B ainda serve para provar que o 401 aparece de verdade quando a
// credencial não vale: aqui usamos a chave A, já revogada.
const via401 = await page.evaluate(async (t) => {
  const r = await fetch('/api/v1/products', { headers: { Authorization: 'Bearer ' + t } });
  return r.status;
}, tokenA);
via401 === 401
  ? ok('a chave revogada passa a receber 401 na API')
  : fail('chave revogada respondeu ' + via401);

await browser.close();
console.log(log.join('\n'));
console.log('\nErros de página:', errors.length ? errors.slice(0, 3).join(' | ') : 'nenhum');
const falhas = log.filter((l) => l.startsWith('FALHA')).length;
console.log(falhas ? `\n${falhas} verificação(ões) falharam` : '\nTodas as verificações passaram');
process.exit(falhas ? 1 : 0);
