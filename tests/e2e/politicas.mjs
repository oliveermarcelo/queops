/**
 * As páginas de política, no navegador de verdade.
 *
 * Documento legal tem duas exigências que o resto da loja não tem, e as duas
 * quebram de um jeito que ninguém nota olhando a tela:
 *
 *   1. abrir por ENDEREÇO DIRETO. É assim que a pessoa chega — pelo link que
 *      alguém mandou, pelo buscador, pelo cadastro no meio de pagamento. A
 *      loja é uma página só, então digitar /trocas-e-devolucoes depende do
 *      servidor devolver o index.html E de o app ler o caminho ao carregar.
 *      Se qualquer um dos dois falhar, o link que a loja divulgou abre a home;
 *
 *   2. estar INTEIRO. Prazo, quem paga o frete e o que a loja se obriga a
 *      fazer estão em frases específicas. Este teste procura essas frases —
 *      um texto cortado pela metade continua parecendo uma página normal.
 *
 *   node tests/e2e/politicas.mjs
 */

import { chromium } from 'playwright';

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';

const log = [];
const ok = (m) => log.push('  OK  ' + m);
const fail = (m) => log.push('FALHA ' + m);

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newContext().then((c) => c.newPage());
const erros = [];
page.on('pageerror', (e) => erros.push(String(e)));

// ------------------------------------------------- endereço direto ----

const resposta = await page.goto(BASE + '/trocas-e-devolucoes', { waitUntil: 'networkidle' });
resposta?.status() === 200
  ? ok('o endereço /trocas-e-devolucoes responde 200')
  : fail(`status ${resposta?.status()}`);

await page.waitForTimeout(1500);
const corpo = await page.locator('body').innerText();

/Política de Troca/i.test(corpo)
  ? ok('e abre a política, não a home')
  : fail('o endereço direto não abriu a política');

/20\.403\.704 ANTONELA BORDON/.test(corpo)
  ? ok('com a razão social a que o documento se refere')
  : fail('faltou a razão social do documento');

/*
 * O título tem de estar VISÍVEL ao abrir.
 *
 * O cabeçalho da loja é `fixed`: não ocupa espaço no fluxo, então uma página
 * sem espaçamento no topo nasce com as primeiras linhas escondidas atrás dele.
 * Foi o que aconteceu aqui — a pessoa que abrisse o link cairia direto no meio
 * do documento, sem ver o nome dele nem o botão de voltar. É invisível para
 * qualquer verificação de texto, porque o conteúdo ESTÁ na página.
 */
const posicao = await page.evaluate(() => {
  const h1 = document.querySelector('h1');
  const cabecalho = document.querySelector('header');
  if (h1 === null || cabecalho === null) return null;
  return { tituloTopo: h1.getBoundingClientRect().top, cabecalhoFim: cabecalho.getBoundingClientRect().bottom };
});
posicao !== null && posicao.tituloTopo >= posicao.cabecalhoFim
  ? ok('o título aparece abaixo do cabeçalho, e não escondido atrás dele')
  : fail(`título em ${posicao?.tituloTopo}px, cabeçalho termina em ${posicao?.cabecalhoFim}px`);

// ------------------------------------------ o texto está completo ----

/*
 * As frases que definem obrigação. Se alguma sumir, o documento publicado
 * promete menos (ou mais) do que a loja combinou.
 */
const exigidas = [
  ['prazo de troca', 'em até 7 dias contados da data do recebimento'],
  ['embalagem original', 'é indispensável que o item esteja em sua embalagem original'],
  ['prazo do reembolso', 'em até 30 dias contados da data em que recebermos'],
  ['defeito de fabricação', 'você tem o direito de solicitar a devolução em até 30 dias'],
  ['quem paga a devolução', 'serão cobertos pela nossa loja através do processo de logística reversa'],
  ['código de postagem', 'código de autorização de postagem'],
  ['embalagem não coberta', 'Não cobrimos os custos de embalagem'],
];
for (const [nome, trecho] of exigidas) {
  corpo.includes(trecho)
    ? ok(`o texto mantém: ${nome}`)
    : fail(`sumiu do texto: ${nome} → "${trecho.slice(0, 40)}…"`);
}

const emails = await page.locator('a[href^="mailto:contato@queopspiramides.com.br"]').count();
emails >= 4
  ? ok(`os e-mails de contato são clicáveis (${emails})`)
  : fail(`e-mails clicáveis: ${emails}`);

// --------------------------------------------- navegação e voltar ----

await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(800);

const link = page.locator('a[href="/trocas-e-devolucoes"]').first();
(await link.count()) === 1
  ? ok('o rodapé tem o link, com endereço de verdade')
  : fail('o rodapé não expõe o endereço da política');

await link.click();
await page.waitForTimeout(1500);
page.url().endsWith('/trocas-e-devolucoes')
  ? ok('clicar leva à política e a barra de endereço acompanha')
  : fail(`a URL ficou em ${page.url()}`);

/*
 * O "voltar" do navegador é como se sai de uma página dessas. Sem tratar
 * `popstate`, a URL voltaria para "/" e a política continuaria na tela.
 */
await page.goBack();
await page.waitForTimeout(1500);
const depois = await page.locator('body').innerText();
!/Condições para efetuar uma troca/.test(depois) && new URL(page.url()).pathname === '/'
  ? ok('e o botão "voltar" do navegador devolve à loja')
  : fail(`voltar não saiu da política (url ${page.url()})`);

// Os documentos que ainda não existem não podem estar linkados.
const mortos = await page.locator('a[href="#privacidade"], a[href="#termos"], a[href="#trocas"]').count();
mortos === 0
  ? ok('não sobrou link apontando para lugar nenhum')
  : fail(`${mortos} link(s) ainda apontam para âncoras vazias`);

await browser.close();
console.log(log.join('\n'));
console.log('\nErros de página:', erros.length ? erros.slice(0, 3).join(' | ') : 'nenhum');
const falhas = log.filter((l) => l.startsWith('FALHA')).length;
console.log(falhas ? `\n${falhas} verificação(ões) falharam` : '\nTodas as verificações passaram');
process.exit(falhas ? 1 : 0);
