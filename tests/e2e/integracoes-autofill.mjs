/**
 * Credencial preenchida pelo NAVEGADOR chega ao servidor?
 *
 * O preenchimento automático escreve no input sem disparar o onChange do
 * React — e telefone, rua, cidade, UF e CEP são justamente os campos que o
 * Chrome preenche sozinho. O painel mostrava o endereço completo, o rascunho
 * do React continuava vazio, e salvar mandava um endereço sem eles: a Envia
 * respondia "falta preencher" com a tela visivelmente preenchida, e não havia
 * como a lojista descobrir o porquê.
 *
 * Este teste escreve nos campos do mesmo jeito que o navegador escreve, e
 * falha se o servidor não receber o que está na tela.
 *
 *   node tests/e2e/integracoes-autofill.mjs
 */
import { chromium } from 'playwright';
const BASE = 'http://127.0.0.1:8080';
const nav = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium', args: ['--disable-background-networking','--no-sandbox'] });
const p = await nav.newPage({ viewport: { width: 1500, height: 1100 } });
p.setDefaultTimeout(8000);
p.on('response', (r) => { const u = r.url(); if (u.includes('integrations/envia')) console.log('   HTTP', r.request().method(), r.status(), u.split('/api')[1]); });

await p.goto(`${BASE}/admin`, { waitUntil: 'domcontentloaded' });
await p.fill('#admin-email', 'admin@queopspiramides.com.br');
await p.fill('#admin-pass', 'DemoQueops2026!');
await p.click('button[type=submit]');
await p.waitForTimeout(2500);
await p.getByRole('button', { name: /integra/i }).first().click();
await p.waitForTimeout(1000);
await p.getByRole('button', { name: /log[ií]stica/i }).first().click();
await p.waitForTimeout(1000);
const n = await p.getByRole('button', { name: /configurar/i }).count();
for (let i = 0; i < n; i++) {
  await p.getByRole('button', { name: /configurar/i }).nth(i).click().catch(() => {});
  await p.waitForTimeout(400);
  if (await p.locator('#envia-token').count()) break;
}

// a pessoa DIGITA token e nome (o React vê)
await p.fill('#envia-token', 'tok-teste');
await p.fill('#envia-originName', 'Queops');

// o NAVEGADOR preenche o endereço sozinho (o React não vê)
await p.evaluate(() => {
  const autofill = { originPhone: '11998670049', originStreet: 'Rua das Piramides',
    originNumber: '100', originDistrict: 'Centro', originCity: 'Sao Paulo',
    originState: 'SP', originCep: '01310100' };
  for (const [k, v] of Object.entries(autofill)) {
    const el = document.querySelector(`#envia-${k}`);
    if (el) el.value = v; // sem disparar evento nenhum: é o que o autofill faz
  }
});
console.log('>> endereço preenchido pelo "navegador", sem onChange');

const salvarHabilitado = await p.evaluate(() => {
  const campo = document.querySelector('#envia-token');
  let no = campo;
  while (no) {
    const b = [...no.querySelectorAll('button')].find((x) => /^salvar$/i.test((x.textContent || '').trim()));
    if (b) return !b.disabled;
    no = no.parentElement;
  }
  return null;
});
console.log('>> botão SALVAR habilitado?', salvarHabilitado);

await p.evaluate(() => {
  const campo = document.querySelector('#envia-token');
  let no = campo;
  while (no) {
    const b = [...no.querySelectorAll('button')].find((x) => /testar conex/i.test(x.textContent || ''));
    if (b) { b.click(); return; }
    no = no.parentElement;
  }
});
await p.waitForTimeout(9000);
const texto = await p.locator('body').innerText();
const linhas = texto.split('\n').filter((l) => /falta|salve|respondeu|salvas/i.test(l));
console.log('mensagem no cartão:', JSON.stringify(linhas));

/*
 * O teste não exige que a Envia responda — o sandbox não alcança a API dela.
 * Exige que o painel PARE de dizer que falta o que está na tela: qualquer
 * "falta preencher" aqui significa que o endereço não chegou ao servidor.
 */
const reclamou = /falta preencher/i.test(texto);
await nav.close();
if (reclamou) {
  console.log('FALHA  o painel pediu campos que estavam preenchidos na tela');
  process.exit(1);
}
console.log('  OK   o que o navegador preencheu chegou ao servidor');
