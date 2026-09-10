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
    title: 'Feito à Mão desde 1996',
    description: 'Pirâmides lapidadas artesanalmente, proporcionais à Grande Pirâmide de Quéops.',
    icon: 'Hammer',
  },
  {
    id: 'entrega',
    title: 'Envio para o Mundo Todo',
    description: 'Embalagem própria de alta proteção, para envio nacional e internacional.',
    icon: 'Truck',
  },
  {
    id: 'energia',
    title: 'Harmonia e Equilíbrio',
    description: 'Cristais, incensos e pirâmides selecionados para o seu bem-estar espiritual.',
    icon: 'Sparkles',
  },
];

/*
 * Texto do "Sobre nós", escrito pela dona da loja.
 *
 * Está quebrado nos parágrafos que a leitura pede, mas as palavras são as
 * dela: é a voz da marca contando a própria história, e reescrever para soar
 * melhor tiraria justamente o que faz o texto ser dela.
 *
 * A data importa e estava errada: o site inteiro dizia "desde 1990". São 1996
 * para o cobre e 2019 para o cristal — e é por isso que "três décadas", e não
 * "35 anos", é o número honesto.
 */
export const COMPANY_HISTORY = {
  title: 'Harmonia, Felicidade e Paz',
  paragraphs: [
    'Bem-vindo à Quéops Pirâmides. A nossa jornada começou em 1996, movida pela paixão de fabricar pirâmides de cobre com máxima precisão e qualidade.',
    'Com o tempo, percebemos uma grande carência no mercado: não existiam pirâmides de cristal feitas com as medidas corretas. Foi essa necessidade que nos impulsionou a evoluir. Assim, desde 2019, incorporamos à nossa história a arte da lapidação artesanal de pirâmides de cristal.',
    'O nosso grande diferencial está no Respeito à proporção: todas as nossas pirâmides são fabricadas e lapidadas em medidas exatas à Grande Pirâmide de Quéops, garantindo a máxima energia em cada peça.',
    'Nosso objetivo é criar possibilidades para que as pessoas alcancem a Harmonia, a Felicidade e a Paz.',
  ],
  stats: [
    { label: 'Anos de Tradição', value: '30+' },
    { label: 'Peças no Catálogo', value: '1.400+' },
    { label: 'Feito à Mão', value: '100%' },
    { label: 'Avaliação Média', value: '4.9★' },
  ],
};
