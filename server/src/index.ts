/**
 * Ponto de entrada da aplicação Node.
 *
 * Na Hostinger, é o arquivo que o gerenciador de Node.js aponta como
 * "Application startup file". Ele não escolhe a porta: quem escolhe é o
 * Passenger, pela variável PORT.
 */

import { createApp } from './app.ts';
import { config, configProblems } from './config.ts';
import { closePool, q } from './db.ts';

async function main(): Promise<void> {
  const problemas = configProblems();
  if (problemas.length) {
    console.error('Configuração incompleta — a loja não vai subir:');
    for (const p of problemas) console.error('  · ' + p);
    console.error('\nDefina as variáveis em hPanel → Avançado → Node.js → Environment variables');
    console.error('(ou num arquivo .env, em desenvolvimento). Veja o .env.example.');
    process.exit(1);
  }

  // Falha cedo e com mensagem clara se o banco não responder, em vez de deixar
  // a loja no ar devolvendo 503 em toda requisição.
  try {
    await q.one('SELECT 1 AS ok');
  } catch (e) {
    const err = e as { code?: string; message?: string; status?: number };
    console.error('Não foi possível conectar ao MySQL:', err.code ?? '', err.message ?? err);
    console.error('Confira DB_HOST, DB_NAME, DB_USER e DB_PASS. Na Hostinger, o host é localhost');
    console.error('e o nome do banco/usuário leva o prefixo da conta (ex.: u123456789_queops).');
    process.exit(1);
  }

  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`[queops] no ar em http://${config.host}:${config.port} (${config.env})`);

    /*
     * Plataformas com proxy na frente (a hospedagem nova da Hostinger, entre
     * outras) injetam PORT no ambiente e encaminham só para ela. Sem PORT,
     * caímos na 3000 e o proxy bate numa porta onde não há ninguém: a
     * aplicação aparece "Em execução" no painel e o site devolve 503, sem
     * nada no log explicando.
     *
     * Este aviso existe para esse caso não passar despercebido de novo.
     */
    if (!process.env.PORT) {
      console.warn(
        `[queops] PORT não veio do ambiente; escutando na ${config.port} por padrão. ` +
          'Se o site responder 503 com a aplicação "em execução", é quase certo que ' +
          'o proxy espera outra porta — defina PORT nas variáveis de ambiente.',
      );
    }
  });

  // Encerramento limpo: o Passenger manda SIGTERM a cada deploy, e sem isto as
  // conexões do MySQL ficariam penduradas até o timeout do servidor.
  const shutdown = (sinal: string) => {
    console.log(`[queops] recebi ${sinal}, encerrando…`);
    server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 8_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((e) => {
  console.error('[queops] falha ao iniciar:', e);
  process.exit(1);
});
