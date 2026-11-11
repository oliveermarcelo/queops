/**
 * A pasta de conteúdo sobrevive a uma publicação?
 *
 * Esta é a regra que custou 1.398 fotos. A hospedagem publica criando um
 * diretório NOVO a cada versão (`.../hbuilds/versions/<id>/nodejs/`) e
 * descartando o anterior inteiro. Com a pasta de mídia relativa à aplicação,
 * toda publicação começava com a pasta vazia — o banco continuava apontando
 * para os arquivos, e eles não existiam mais.
 *
 * Confiar em alguém lembrar de definir MIDIA_DIR não é correção. O padrão
 * precisa nascer fora do diretório de versão sozinho, e é isso que este
 * arquivo cobra.
 *
 *   npm run teste:pasta
 */

import { pastaDuravel } from '../server/src/config.ts';

let falhas = 0;
const ok = (cond, nome, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}${cond || extra === '' ? '' : ' → ' + extra}`);
  if (!cond) falhas++;
};

// ---------------------------------------------------- hospedagem real ----
const VERSAO = '/home/u983491248/domains/queopspiramides.com.br'
  + '/hbuilds/versions/01a1c821-6b04-71ff-9294-d2387b3884bc/nodejs';

const destino = pastaDuravel('midia', 'queops_midia', VERSAO);
ok(
  destino === '/home/u983491248/domains/queopspiramides.com.br/queops_midia',
  '1 · sai de dentro da versão e vai para a raiz da publicação',
  destino,
);
ok(
  !destino.includes('/hbuilds/'),
  '1 · e não sobra nada de hbuilds no caminho — é isso que o deploy apaga',
  destino,
);

// Uma versão nova não pode mudar o destino: é o que fazia as fotos sumirem.
const OUTRA = VERSAO.replace('01a1c821-6b04-71ff-9294-d2387b3884bc', 'ffffffff-0000-0000-0000-000000000000');
ok(
  pastaDuravel('midia', 'queops_midia', OUTRA) === destino,
  '2 · publicar de novo aponta para a MESMA pasta — a foto de ontem continua lá',
);

// ------------------------------------------------------ fora do padrão ----
ok(
  pastaDuravel('midia', 'queops_midia', '/home/alguem/queops') === 'midia',
  '3 · fora desse formato nada muda: segue `midia/` relativo à aplicação',
  pastaDuravel('midia', 'queops_midia', '/home/alguem/queops'),
);
ok(
  pastaDuravel('notas', 'queops_notas', '/var/www/loja') === 'notas',
  '3 · vale para as notas fiscais do mesmo jeito — instalação que está bem não muda',
);

// Windows, onde o caminho vem com barra invertida.
const win = pastaDuravel('midia', 'queops_midia', 'C:\\sites\\loja\\hbuilds\\versions\\abc\\nodejs');
ok(
  !win.includes('hbuilds'),
  '4 · reconhece o caminho com barra invertida também',
  win,
);

console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
