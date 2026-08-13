/**
 * Diagnóstico da instalação.
 *
 *   node diagnostico.js
 *
 * Roda no servidor, pelo SSH, e diz em português o que está faltando. Existe
 * porque a primeira instalação travou justamente aqui: a loja respondia
 * "Não foi possível conectar ao banco de dados" e não havia como saber se o
 * problema era o nome do banco, o prefixo da conta, a senha ou a falta das
 * tabelas.
 *
 * Não expõe segredo nenhum: mostra tamanho de senha, nunca o valor.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { config, configProblems } from './config.ts';

/*
 * O módulo do banco é carregado por `import()` LÁ EMBAIXO, de propósito.
 *
 * Ele exige o pacote `mysql2`, e uma das falhas que este diagnóstico precisa
 * relatar é justamente "as dependências não foram instaladas". Importando no
 * topo, o próprio diagnóstico morria com um "Cannot find module 'mysql2'" —
 * inútil para quem está tentando descobrir o que fazer.
 */
type ModuloDb = typeof import('./db.ts');

type Estado = 'ok' | 'erro' | 'aviso';
const linhas: [Estado, string, string][] = [];
const ok = (rotulo: string, texto: string) => linhas.push(['ok', rotulo, texto]);
const erro = (rotulo: string, texto: string) => linhas.push(['erro', rotulo, texto]);
const aviso = (rotulo: string, texto: string) => linhas.push(['aviso', rotulo, texto]);

/** As tabelas que o migrate cria. Faltar alguma = migração não rodou. */
const TABELAS = [
  'admin_users', 'login_attempts', 'sessions', 'customers', 'customer_addresses',
  'customer_favorites', 'categories', 'subcategories', 'products', 'orders',
  'order_items', 'coupons', 'abandoned_carts', 'abandoned_cart_items',
  'integrations', 'api_keys', 'webhooks', 'store_config', 'counters',
];

async function main(): Promise<void> {
  // ------------------------------------------------------------ ambiente ----
  const [maior] = process.versions.node.split('.');
  if (Number(maior) >= 20) {
    ok('Versão do Node', process.versions.node);
  } else {
    erro('Versão do Node', `${process.versions.node} — precisa de 20 ou maior. `
      + 'hPanel → Avançado → Node.js → Node.js version');
  }

  ok('Pasta da aplicação', process.cwd());

  const problemas = configProblems();
  if (problemas.length === 0) {
    ok('Variáveis de ambiente', 'todas preenchidas');
  } else {
    for (const p of problemas) erro('Variável de ambiente', p);
  }

  // Mostrar "(vazio)" com marca de OK confunde: campo em branco é erro.
  const campo = (rotulo: string, valor: string) =>
    valor === '' ? erro(rotulo, 'vazio') : ok(rotulo, valor);
  campo('DB_HOST', config.db.host);
  campo('DB_NAME', config.db.database);
  campo('DB_USER', config.db.user);
  campo('DB_PASS', config.db.password === ''
    ? '' : `preenchida (${config.db.password.length} caracteres)`);

  // Erro clássico na Hostinger: esquecer o prefixo da conta.
  if (config.db.database && !/^u\d+_/.test(config.db.database)) {
    aviso('Prefixo do banco', `"${config.db.database}" não começa com o prefixo da conta `
      + '(tipo u123456789_). Confirme o nome exato em hPanel → Bancos de Dados.');
  }

  const chave = Buffer.from(config.appKey, 'base64');
  if (config.appKey && chave.length === 32) {
    ok('APP_KEY', 'válida (32 bytes)');
  } else {
    erro('APP_KEY', 'inválida — gere com: '
      + 'node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"');
  }

  ok('APP_ENV', config.env);
  ok('SECURE_COOKIES', String(config.secureCookies));

  // ------------------------------------------------------------ arquivos ----
  const publicDir = path.resolve(process.cwd(), config.publicDir);
  if (existsSync(path.join(publicDir, 'index.html'))) {
    ok(`Vitrine (${config.publicDir}/index.html)`, 'presente');
  } else {
    erro(`Vitrine (${config.publicDir}/index.html)`, 'AUSENTE — o conteúdo de deploy/ não subiu, '
      + 'ou PUBLIC_DIR aponta para outra pasta');
  }
  for (const arquivo of ['db/schema.sql', 'db/catalog.json']) {
    if (existsSync(path.resolve(process.cwd(), arquivo))) {
      ok(arquivo, 'presente');
    } else {
      aviso(arquivo, 'ausente — necessário para rodar o migrate.js');
    }
  }
  if (existsSync(path.resolve(process.cwd(), 'node_modules/express'))) {
    ok('Dependências instaladas', 'node_modules presente');
  } else {
    erro('Dependências instaladas', 'AUSENTES — clique em "Run NPM Install" no hPanel');
  }

  // --------------------------------------------------------------- MySQL ----
  let db: ModuloDb | null = null;
  try {
    db = await import('./db.ts');
  } catch (e) {
    erro('Driver do MySQL', 'não foi possível carregar o pacote mysql2 — '
      + 'clique em "Run NPM Install" no hPanel e rode este diagnóstico de novo.');
    if (config.env === 'development') console.error(e);
  }

  let conectou = false;
  const q = db?.q;
  if (q) try {
    const v = await q.one('SELECT VERSION() AS v');
    conectou = true;
    ok('Conexão com o MySQL', 'conectou');
    ok('Versão do MySQL', String(v?.v ?? '?'));
  } catch (e) {
    /*
     * O helper do banco embrulha a falha num ApiError com mensagem amigável —
     * certo para o navegador, inútil aqui. O erro do driver vem em `cause`, e é
     * o código dele (ER_ACCESS_DENIED_ERROR e companhia) que resolve o problema.
     */
    const bruto = (e as { cause?: unknown }).cause ?? e;
    const err = bruto as { code?: string; message?: string };
    erro('Conexão com o MySQL', `${err.code ?? ''} ${err.message ?? String(bruto)}`.trim());
    const dicas: Record<string, string> = {
      ER_ACCESS_DENIED_ERROR: 'Usuário ou senha errados — ou o usuário não está associado a este '
        + 'banco. Na Hostinger, nome e usuário levam o prefixo da conta (u123456789_queops).',
      ER_BAD_DB_ERROR: 'O banco com esse nome não existe. Crie em hPanel → Bancos de Dados → MySQL '
        + 'e copie o nome exatamente como aparece lá, com o prefixo.',
      ER_DBACCESS_DENIED_ERROR: 'O usuário existe, mas não tem permissão neste banco — ou o nome do '
        + 'banco está errado. Em hPanel → Bancos de Dados, confirme que este usuário aparece '
        + 'associado a este banco, e copie os dois nomes exatamente como estão lá.',
      ECONNREFUSED: 'Nada escutando nesse host/porta. Na Hostinger, DB_HOST é localhost.',
      ENOTFOUND: 'O host não existe. Na Hostinger, DB_HOST é localhost.',
      ETIMEDOUT: 'O host não respondeu. Se colocou um IP, troque por localhost.',
    };
    aviso('O que fazer', dicas[err.code ?? ''] ?? 'Confira DB_HOST, DB_NAME, DB_USER e DB_PASS.');
  }

  // -------------------------------------------------------------- tabelas ----
  if (conectou && q) {
    const existentes = new Set(
      (await q.all('SHOW TABLES')).map((r) => String(Object.values(r)[0])),
    );
    const faltando = TABELAS.filter((t) => !existentes.has(t));
    if (faltando.length === 0) {
      ok('Tabelas', `${existentes.size} presentes`);
    } else {
      erro('Tabelas', `faltam ${faltando.length} (${faltando.slice(0, 4).join(', ')}…) — `
        + 'rode: node migrate.js --admin-email=… --admin-pass=…');
    }

    if (existentes.has('products')) {
      const n = Number((await q.one('SELECT COUNT(*) AS n FROM products'))?.n ?? 0);
      const ativos = Number((await q.one('SELECT COUNT(*) AS n FROM products WHERE active = 1'))?.n ?? 0);
      if (n > 0) ok('Produtos', `${n} cadastrados (${ativos} ativos)`);
      else erro('Produtos', '0 — rode o migrate.js para importar o catálogo');
    }
    if (existentes.has('admin_users')) {
      const n = Number((await q.one('SELECT COUNT(*) AS n FROM admin_users WHERE active = 1'))?.n ?? 0);
      if (n > 0) ok('Administradores', String(n));
      else erro('Administradores', 'nenhum — rode o migrate.js com --admin-email e --admin-pass');
    }
    if (existentes.has('orders')) {
      const n = Number((await q.one('SELECT COUNT(*) AS n FROM orders'))?.n ?? 0);
      const demo = Number((await q.one("SELECT COUNT(*) AS n FROM orders WHERE id LIKE 'QPD-%'"))?.n ?? 0);
      ok('Pedidos', demo > 0 ? `${n} (dos quais ${demo} são de DEMONSTRAÇÃO)` : String(n));
      if (demo > 0 && config.isProd) {
        aviso('Pedidos de demonstração', `há ${demo} pedidos fictícios (QPD-…) num ambiente de `
          + 'produção. Apague-os antes de entregar o painel para a cliente: '
          + "DELETE FROM orders WHERE id LIKE 'QPD-%';");
      }
    }
    if (existentes.has('store_config')) {
      const chaves = (await q.all('SELECT config_key FROM store_config')).map((r) => String(r.config_key));
      const esperadas = ['settings', 'shipping', 'recovery'];
      const faltam = esperadas.filter((k) => !chaves.includes(k));
      if (faltam.length === 0) ok('Configurações da loja', 'settings, shipping e recovery gravadas');
      else aviso('Configurações da loja', 'faltam: ' + faltam.join(', '));
    }
  }

  // -------------------------------------------------------------- imagens ----
  try {
    const catalogo = JSON.parse(readFileSync(path.resolve(process.cwd(), 'db/catalog.json'), 'utf8'));
    const produtos: { image?: string }[] = catalogo.products ?? [];
    const remotas = produtos.filter((p) => /^https?:\/\//i.test(p.image ?? '')).length;
    if (remotas === 0) {
      ok('Imagens dos produtos', 'todas apontam para arquivos locais');
    } else {
      aviso('Imagens dos produtos', `${remotas} de ${produtos.length} ainda apontam para o site `
        + 'antigo. Rode `npm run sync:midia` na sua máquina ENQUANTO ele estiver no ar e suba de novo.');
    }
  } catch {
    /* sem catálogo: já avisado acima */
  }

  // -------------------------------------------------------------- relatório ----
  const largura = Math.max(...linhas.map(([, r]) => r.length));
  const falhas = linhas.filter(([e]) => e === 'erro').length;
  const avisos = linhas.filter(([e]) => e === 'aviso').length;

  console.log('\n  DIAGNÓSTICO — Quéops Pirâmides\n');
  for (const [estado, rotulo, texto] of linhas) {
    const tag = estado === 'ok' ? '  OK  ' : estado === 'erro' ? ' ERRO ' : 'AVISO ';
    console.log(`${tag} ${rotulo.padEnd(largura)}  ${texto}`);
  }
  console.log('');
  if (falhas === 0 && avisos === 0) {
    console.log('  Nada a corrigir: a loja está pronta.\n');
  } else {
    console.log(`  ${falhas} erro(s) e ${avisos} aviso(s). Os erros impedem a loja de funcionar.\n`);
  }
  process.exitCode = falhas === 0 ? 0 : 1;
}

main()
  .catch((e) => {
    console.error('[queops] o diagnóstico falhou:', e);
    process.exitCode = 1;
  })
  .finally(() => {
    // O pool só existe se o mysql2 pôde ser carregado.
    void import('./db.ts').then((m) => m.closePool()).catch(() => undefined);
  });
