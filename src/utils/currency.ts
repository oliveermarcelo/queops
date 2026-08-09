/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formatação de moeda no padrão brasileiro.
 *
 * Usar `toFixed(2)` gera separador decimal americano ("R$ 327.00"), que destoa
 * numa loja brasileira. Estes helpers centralizam o formato pt-BR para que
 * vitrine, carrinho e checkout mostrem sempre "R$ 327,00".
 */

/** Valor com símbolo: 327 → "R$ 327,00". */
export const brl = (n: number): string =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/**
 * Apenas o número, para quando o "R$" já aparece separado no layout
 * (preços em destaque que estilizam o símbolo à parte): 327 → "327,00".
 */
export const brlNumber = (n: number): string =>
  n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
