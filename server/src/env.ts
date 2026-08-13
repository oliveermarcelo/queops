/**
 * Carrega o `.env` que estiver ao lado do processo, se existir.
 *
 * Por que isto existe: o gerenciador de Node do hPanel inicia a aplicação com
 * `node app.js`, sem a opção `--env-file`. Quem cadastrou as variáveis na
 * interface do painel não precisa disto — elas já chegam no ambiente. Mas quem
 * preferir subir um arquivo `.env` junto do app (mais fácil de revisar e de
 * versionar fora do Git) também funciona, e é isto que faz funcionar.
 *
 * As variáveis já definidas no ambiente têm precedência: `loadEnvFile` não
 * sobrescreve o que o painel configurou.
 *
 * Este módulo é importado como PRIMEIRA linha do config.ts de propósito: com o
 * bundle em um arquivo só, a ordem de inicialização segue a ordem dos imports, e
 * o `.env` precisa estar carregado antes de alguém ler `process.env`.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

const candidatos = [
  path.resolve(process.cwd(), '.env'),
  // Quando o app roda de uma subpasta (ex.: .build/app.js chamado da raiz).
  path.resolve(process.cwd(), '..', '.env'),
];

for (const arquivo of candidatos) {
  if (!existsSync(arquivo)) continue;
  try {
    process.loadEnvFile(arquivo);
    break;
  } catch (e) {
    console.error(`[queops] não consegui ler ${arquivo}:`, e instanceof Error ? e.message : e);
  }
}

export {};
