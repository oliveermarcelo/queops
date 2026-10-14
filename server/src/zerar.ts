/**
 * Zera a loja: apaga catálogo, pedidos e clientes, e preserva o que dá
 * trabalho recriar.
 *
 *   node zerar.js             → SIMULA: conta o que seria apagado e não toca em nada
 *   node zerar.js --confirmo  → apaga de verdade
 *
 * Existe para uma situação específica e legítima: a loja foi usada para testes
 * contra o ERP e precisa começar limpa antes da carga de verdade. É a operação
 * mais destrutiva do projeto — mais do que o "espelhar categorias", que ao
 * menos preserva os produtos — e por isso ela tem três proteções, nenhuma
 * decorativa:
 *
 *   1. O padrão é SIMULAR. Rodar sem o `--confirmo` lista as contagens e sai
 *      sem apagar. Um comando perigoso cujo comportamento padrão é destruir é
 *      um comando que um dia alguém roda por engano, no banco errado.
 *   2. Imprime o NOME DO BANCO e o ambiente antes de agir. "Apaguei no banco
 *      errado" é o erro que não tem desfazer, e o único jeito de evitá-lo é
 *      mostrar em qual banco se está.
 *   3. Diz, item por item, o que fica. O risco real aqui não é apagar demais:
 *      é apagar o login do painel, a credencial do Mercado Pago ou a chave que
 *      o ERP usa, e só descobrir quando a loja estiver fora do ar.
 *
 * O que é APAGADO:
 *   catálogo (produtos, fotos, categorias, subcategorias, códigos do ERP,
 *   grupos de variação), pedidos com itens e notas fiscais, clientes com
 *   endereços e favoritos, carrinhos abandonados, sessões e tentativas de
 *   login. O contador de pedidos volta a zero — o próximo pedido é QP-000001.
 *
 * O que FICA:
 *   usuários do painel, credenciais das integrações (cifradas), configurações
 *   da loja (frete, Pix, dados), chaves de API, webhooks e cupons.
 *
 * Os ARQUIVOS em disco não são apagados por aqui — ver o aviso impresso no
 * fim. Apagar foto é irreversível de um jeito diferente do banco: não há
 * backup do `midia/` junto com o dump, e um `rm -rf` por engano na pasta
 * errada leva junto o que ninguém pediu.
 */

import { config } from './config.ts';

/** Ordem de apagamento: filho antes de pai, para as chaves estrangeiras valerem. */
const ORDEM: { tabela: string; o_que: string }[] = [
  { tabela: 'order_invoices', o_que: 'notas fiscais dos pedidos' },
  { tabela: 'order_items', o_que: 'itens dos pedidos' },
  { tabela: 'orders', o_que: 'pedidos' },
  { tabela: 'abandoned_cart_items', o_que: 'itens de carrinho abandonado' },
  { tabela: 'abandoned_carts', o_que: 'carrinhos abandonados' },
  { tabela: 'customer_favorites', o_que: 'favoritos dos clientes' },
  { tabela: 'customer_addresses', o_que: 'endereços dos clientes' },
  { tabela: 'customers', o_que: 'clientes' },
  { tabela: 'product_group_values', o_que: 'valores das variações' },
  { tabela: 'product_group_options', o_que: 'opções dos eixos' },
  { tabela: 'product_group_axes', o_que: 'eixos de variação' },
  { tabela: 'product_groups', o_que: 'grupos de variação' },
  { tabela: 'product_images', o_que: 'fotos extras dos produtos' },
  { tabela: 'products', o_que: 'produtos' },
  { tabela: 'subcategories', o_que: 'subcategorias' },
  { tabela: 'categories', o_que: 'categorias da loja' },
  { tabela: 'erp_categories', o_que: 'categorias recebidas do ERP' },
  { tabela: 'sessions', o_que: 'sessões abertas (você vai precisar entrar de novo)' },
  { tabela: 'login_attempts', o_que: 'histórico de tentativas de login' },
];

/** O que NÃO é tocado — impresso na tela, para a decisão ser visível. */
const PRESERVADO = [
  ['admin_users', 'usuários do painel'],
  ['integrations', 'credenciais das integrações (Mercado Pago, Melhor Envio, Correios)'],
  ['store_config', 'configurações da loja: frete, Pix, dados, recuperação'],
  ['api_keys', 'chaves de API — a que o ERP usa continua valendo'],
  ['webhooks', 'URLs de webhook cadastradas'],
  ['coupons', 'cupons de desconto'],
];

async function principal(): Promise<void> {
  const confirmado = process.argv.includes('--confirmo');

  const { q, closePool } = await import('./db.ts');

  console.log('');
  console.log('  ZERAR A LOJA');
  console.log('  ------------');
  console.log(`  banco:    ${config.db.database}  (em ${config.db.host})`);
  console.log(`  ambiente: ${config.env}`);
  console.log('');

  /*
   * Tabela que não existe é PULADA, e não é erro.
   *
   * O banco pode estar numa versão anterior do schema — sem `order_invoices`,
   * sem os grupos de variação. Abortar no meio deixaria metade apagada, que é
   * o pior estado possível para uma operação que não tem desfazer.
   */
  const existentes = new Set(
    (await q.all(
      `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()`,
    )).map((r) => String(r.t ?? r.TABLE_NAME ?? '').toLowerCase()),
  );

  let total = 0;
  const plano: { tabela: string; o_que: string; linhas: number }[] = [];
  for (const item of ORDEM) {
    if (!existentes.has(item.tabela)) continue;
    const r = await q.one(`SELECT COUNT(*) AS n FROM \`${item.tabela}\``);
    const linhas = Number(r?.n ?? 0);
    plano.push({ ...item, linhas });
    total += linhas;
  }

  console.log('  SERÁ APAGADO:');
  for (const p of plano) {
    console.log(`    ${String(p.linhas).padStart(7)}  ${p.o_que}`);
  }
  console.log(`    ${String(total).padStart(7)}  linhas no total`);
  console.log('');
  console.log('  FICA COMO ESTÁ:');
  for (const [tabela, texto] of PRESERVADO) {
    if (existentes.has(tabela)) console.log(`             ${texto}`);
  }
  console.log('');

  if (!confirmado) {
    console.log('  Nada foi apagado — isto foi uma simulação.');
    console.log('');
    console.log('  Confira o nome do banco acima. Se for esse mesmo, FAÇA O BACKUP e rode:');
    console.log('');
    console.log('      node zerar.js --confirmo');
    console.log('');
    await closePool();
    return;
  }

  for (const p of plano) {
    await q.run(`DELETE FROM \`${p.tabela}\``);
    console.log(`  - ${p.o_que}: ${p.linhas} apagado(s)`);
  }

  /*
   * O contador de pedidos volta a zero: o próximo pedido é QP-000001.
   *
   * Faz sentido justamente porque os pedidos antigos foram apagados — manter o
   * contador em 42 faria a loja nascer com uma numeração que não corresponde a
   * venda nenhuma, e a primeira pergunta de quem olhasse seria "cadê os 41
   * primeiros?".
   */
  if (existentes.has('counters')) {
    await q.run("DELETE FROM counters WHERE name IN ('order', 'cart')");
    console.log('  - contador de pedidos: zerado (o próximo será QP-000001)');
  }

  console.log('');
  console.log('  Pronto. A loja está vazia e o painel continua acessível.');
  console.log('');
  console.log('  Próximos passos:');
  console.log('    1. entre no painel de novo (as sessões foram encerradas);');
  console.log('    2. peça ao ERP a carga de categorias e, depois, a de produtos;');
  console.log('    3. as fotos antigas continuam na pasta midia/ e as notas em notas/.');
  console.log('       Elas não são apagadas aqui de propósito: não há backup delas junto');
  console.log('       do dump do banco. Para limpar, confira a pasta e apague à mão.');
  console.log('');

  await closePool();
}

principal().catch((e) => {
  console.error('');
  console.error('  Falhou:', e instanceof Error ? e.message : String(e));
  console.error('  Nada além do que foi listado acima foi apagado.');
  console.error('');
  process.exit(1);
});
