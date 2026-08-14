/*
 * Ponto de entrada na RAIZ do repositório.
 *
 * O gerenciador de Node do hPanel procura o arquivo de inicialização na raiz da
 * aplicação. Quando o deploy é por Git, a raiz é a do repositório clonado — e
 * aqui não existe servidor nenhum: o que roda em produção é `deploy/app.js`,
 * gerado por `npm run build:server && npm run empacotar`.
 *
 * Este arquivo existe só para fazer essa ponte. O ideal continua sendo apontar
 * "Application root" para a pasta `deploy/`, que já tem o package.json com as
 * quatro dependências de runtime; este atalho é para quando isso não é possível.
 *
 * Dois detalhes que quebram se forem mexidos sem cuidado:
 *
 *   - O caminho é `deploy/app.js`, não `.build/app.js`. O `.build/` é
 *     intermediário, está no .gitignore e nunca chega ao servidor.
 *
 *   - Este arquivo é ESM, e não CommonJS como o app.js que ele carrega. O
 *     package.json da raiz tem "type": "module", então um `require` aqui
 *     morreria com "require is not defined in ES module scope". Por isso o
 *     createRequire abaixo: ele abre uma porta CommonJS de dentro do ESM.
 */

import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const alvo = resolve(aqui, 'deploy', 'app.js');

if (!existsSync(alvo)) {
  console.error(
    [
      '',
      'deploy/app.js não encontrado.',
      '',
      'O pacote de produção é versionado, então ele deveria ter vindo no clone.',
      'Se está faltando, o build não rodou antes do último push. Na sua máquina:',
      '',
      '  npm run build && npm run build:server && npm run empacotar',
      '  git add deploy/ && git commit -m "release" && git push',
      '',
      'Depois, no hPanel: Deploy e Restart.',
      '',
    ].join('\n'),
  );
  process.exit(1);
}

/*
 * PUBLIC_DIR é resolvido a partir do diretório de trabalho, e o padrão é
 * "public". Iniciando daqui, isso apontaria para o public/ do projeto — que só
 * tem favicon e robots.txt — e a loja subiria em branco. A vitrine compilada
 * está em deploy/public.
 *
 * Só preenche se ninguém tiver definido: um valor vindo do painel do hPanel
 * continua mandando.
 */
if (!process.env.PUBLIC_DIR) {
  process.env.PUBLIC_DIR = resolve(aqui, 'deploy', 'public');
}

/*
 * As dependências (express, mysql2, bcryptjs, compression) são resolvidas a
 * partir de deploy/node_modules quando o `npm install` roda lá dentro, ou do
 * node_modules da raiz quando roda aqui. Os dois casos funcionam: o Node sobe
 * a árvore de diretórios procurando.
 */
const require = createRequire(import.meta.url);

export default require(alvo);
