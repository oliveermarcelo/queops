/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Conteúdo editorial da loja (institucional, diferenciais).
 *
 * Separado de `data.ts` de propósito: aquele arquivo é a semente do catálogo,
 * com 72 produtos, e importá-lo só para ler a história da empresa arrastava
 * todo o catálogo para dentro do bundle.
 */

import type { ValueProp } from './types';

export const VALUE_PROPS: ValueProp[] = [
  {
    id: 'artesanal',
    title: 'Feito à Mão desde 1990',
    description: 'Pirâmides lapidadas artesanalmente, proporcionais à Grande Pirâmide de Quéops.',
    icon: 'Hammer',
  },
  {
    id: 'entrega',
    title: 'Envio para Todo o Brasil',
    description: 'Embalagem cuidadosa e logística que protege cada peça até a sua casa.',
    icon: 'Truck',
  },
  {
    id: 'energia',
    title: 'Harmonia e Equilíbrio',
    description: 'Cristais, incensos e pirâmides selecionados para o seu bem-estar espiritual.',
    icon: 'Sparkles',
  },
];

export const COMPANY_HISTORY = {
  title: 'Harmonia, Felicidade e Paz',
  paragraphs: [
    'A Quéops Pirâmides fabrica pirâmides artesanais desde 1990, todas proporcionais à Grande Pirâmide de Quéops. Desde 1996 trabalhamos o cobre e, a partir de 2019, passamos a lapidar pirâmides de cristal com técnica própria.',
    'Muito além das pirâmides, reunimos um universo de artigos para o corpo e o espírito: cristais, incensos, imagens sacras, pêndulos de radiestesia e peças de decoração escolhidas com cuidado.',
    'Nossa missão é criar possibilidades para que as pessoas alcancem a Harmonia, a Felicidade e a Paz — levando energia, beleza e significado para cada ambiente.',
  ],
  stats: [
    { label: 'Anos de Tradição', value: '35+' },
    { label: 'Peças no Catálogo', value: '1.400+' },
    { label: 'Feito à Mão', value: '100%' },
    { label: 'Avaliação Média', value: '4.9★' },
  ],
};
