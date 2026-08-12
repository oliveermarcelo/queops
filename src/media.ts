/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Imagens editoriais (banners da home e capas de categoria).
 *
 * Todas apontam para arquivos servidos pelo próprio domínio, em
 * `public/banners/`. Antes vinham do WordPress do cliente e de duas fotos do
 * Unsplash — se aquele site saísse do ar, a home ficava sem imagem, e cada
 * visita gerava requisições para domínios de terceiros.
 *
 * Para (re)baixar os arquivos originais:  `npm run sync:midia`
 */

export const BANNERS = {
  heroPiramides: '/banners/hero-piramides.jpg',
  heroCristais: '/banners/hero-cristais.jpg',
  heroIncensos: '/banners/hero-incensos.jpg',
  promo: '/banners/promo.jpg',
} as const;

export const CATEGORY_COVERS = {
  piramides: '/banners/categoria-piramides.jpg',
  cristais: '/banners/categoria-cristais.jpg',
  incensos: '/banners/categoria-incensos.jpg',
  acessorios: '/banners/categoria-acessorios.jpg',
  religiosos: '/banners/categoria-religiosos.jpg',
  decoracao: '/banners/categoria-decoracao.jpg',
} as const;
