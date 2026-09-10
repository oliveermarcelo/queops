/**
 * O que a vitrine ANUNCIA e o que o servidor ACEITA precisam bater.
 *
 * O parcelamento vive em dois arquivos: `INSTALLMENTS` em `src/config.ts`, que
 * a tela usa, e `INSTALLMENTS_MAX` em `server/src/routes/public.ts`, que decide
 * o que o pagamento aceita. Quem só levantasse um dos dois produziria a pior
 * combinação possível: a página oferece 10x, o cliente escolhe 10x e o cartão
 * recusa no fim do checkout, sem explicação que faça sentido para ele.
 *
 * Já aconteceu uma versão disso — a página do produto dizia "3x" e o checkout,
 * "em até 6x". A correção de então criou `src/config.ts` para ser o lugar
 * único; o servidor, que veio depois, ficou de fora e refez o problema.
 *
 * Comparar por leitura de arquivo, e não por import, é de propósito: o código
 * do servidor não importa o do front (bundles separados), então é este teste
 * que os mantém amarrados.
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '../..');

/** Lê `const NOME = <número>` de um arquivo, com o caminho no erro. */
function constanteNumerica(arquivo: string, nome: string): number {
  const caminho = path.join(raiz, arquivo);
  const fonte = readFileSync(caminho, 'utf8');
  const achado = new RegExp(`\\b${nome}\\s*=\\s*(\\d+)`).exec(fonte);
  assert.ok(
    achado !== null,
    `não achei "${nome}" em ${arquivo} — se a constante foi renomeada, este teste `
    + 'precisa acompanhar, senão ele passa a não verificar nada',
  );
  return Number(achado![1]);
}

test('o parcelamento anunciado na vitrine é o mesmo que o servidor aceita', () => {
  const vitrine = constanteNumerica('src/config.ts', 'INSTALLMENTS');
  const servidor = constanteNumerica('server/src/routes/public.ts', 'INSTALLMENTS_MAX');

  assert.equal(
    vitrine,
    servidor,
    `a vitrine anuncia ${vitrine}x e o servidor aceita ${servidor}x. `
    + 'O cliente escolheria uma parcela que o pagamento recusa.',
  );
});

test('o parcelamento é um número que faz sentido oferecer', () => {
  const vitrine = constanteNumerica('src/config.ts', 'INSTALLMENTS');
  assert.ok(vitrine >= 1, 'parcelamento precisa ser pelo menos 1x (à vista)');
  assert.ok(vitrine <= 12, 'acima de 12x o Mercado Pago não parcela sem juros');
});
