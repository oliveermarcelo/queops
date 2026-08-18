/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * SEMENTE do catálogo — não é mais lida pela loja em tempo de execução.
 *
 * A vitrine e o painel consomem o banco (`GET /api/catalog`). Este arquivo
 * alimenta a carga inicial: `node scripts/export-catalog.mjs` transforma estes
 * arrays em `server/db/catalog.json`, que o `npm run migrar` importa.
 *
 * Dados coletados do site oficial (queopspiramides.com.br) via API pública do
 * WooCommerce. Depois da carga, edite os produtos pelo painel, não aqui.
 */

import { Product, Category, ValueProp, MenuCategory } from './types';

export const CATEGORIES: Category[] = [
  { id: 'all', name: 'Início', description: 'Catálogo completo' },
  { id: 'piramides', name: 'Pirâmides', description: 'Pirâmides de Cobre, Pirâmides de Cristal, Pirâmides de Veludo Azul, Pirâmides de' },
  { id: 'cristais', name: 'Cristais', description: 'Cristais, Materia Prima' },
  { id: 'incensos', name: 'Incensos', description: 'Incensos, Incensários, Essências, Difusores' },
  { id: 'acessorios', name: 'Acessórios', description: 'Pingentes e Brincos, Pulseiras, Peças em Prata, Chaveiros, Porta Crachás' },
  { id: 'radiestesia', name: 'Radiestesia', description: 'Pêndulos, Radiestesia, Bússolas' },
  { id: 'religiosos', name: 'Religiosos', description: 'São Francisco, Joana d\'Arc, Cristo, Cruzes, Egípcios, Indianos' },
  { id: 'decoracao', name: 'Decoração', description: 'Estátuas e Enfeites, Quadros, Fotos e Porta Retratos, Velas e Porta Velas, Papir' },
  { id: 'livros-e-midia', name: 'Livros e Mídia', description: 'Livros, Infantil, Filmes DvD\'s' },
];

// Mega-menu — categorias-mãe com subcategorias reais do catálogo Quéops
export const MENU_CATEGORIES: MenuCategory[] = [
  { id: 'destaques', name: 'Destaques', icon: 'Star', featured: true, subcategories: [] },
  {
    id: 'piramides',
    name: 'Pirâmides',
    icon: 'Triangle',
    subcategories: [
      { id: 'piramides-de-cobre', name: 'Pirâmides de Cobre' },
      { id: 'piramides-de-cristal', name: 'Pirâmides de Cristal' },
      { id: 'piramides-de-veludo-azul', name: 'Pirâmides de Veludo Azul' },
      { id: 'piramides-de-ametista-e-outros', name: 'Pirâmides de Ametista e Outros' },
      { id: 'piramides-de-impressao-3d', name: 'Pirâmides de Impressão 3D' },
      { id: 'piramides-de-madeira', name: 'Pirâmides de Madeira' },
      { id: 'suportes-de-madeira', name: 'Suportes de Madeira' },
      { id: 'baterias-de-piramides', name: 'Baterias de Pirâmides' },
    ],
  },
  {
    id: 'cristais',
    name: 'Cristais',
    icon: 'Gem',
    subcategories: [
      { id: 'cristais', name: 'Cristais' },
      { id: 'materia-prima', name: 'Materia Prima' },
    ],
  },
  {
    id: 'incensos',
    name: 'Incensos',
    icon: 'Flame',
    subcategories: [
      { id: 'incensos', name: 'Incensos' },
      { id: 'incensarios', name: 'Incensários' },
      { id: 'essencias', name: 'Essências' },
      { id: 'difusores', name: 'Difusores' },
    ],
  },
  {
    id: 'acessorios',
    name: 'Acessórios',
    icon: 'Sparkles',
    subcategories: [
      { id: 'pingentes-e-brincos', name: 'Pingentes e Brincos' },
      { id: 'pulseiras', name: 'Pulseiras' },
      { id: 'pecas-em-prata', name: 'Peças em Prata' },
      { id: 'chaveiros', name: 'Chaveiros' },
      { id: 'porta-crachas', name: 'Porta Crachás' },
    ],
  },
  {
    id: 'radiestesia',
    name: 'Radiestesia',
    icon: 'Compass',
    subcategories: [
      { id: 'pendulos', name: 'Pêndulos' },
      { id: 'radiestesia', name: 'Radiestesia' },
      { id: 'bussolas', name: 'Bússolas' },
    ],
  },
  {
    id: 'religiosos',
    name: 'Religiosos',
    icon: 'Cross',
    subcategories: [
      { id: 'sao-francisco', name: 'São Francisco' },
      { id: 'joana-d-arc', name: 'Joana d\'Arc' },
      { id: 'cristo', name: 'Cristo' },
      { id: 'cruzes', name: 'Cruzes' },
      { id: 'egipcios', name: 'Egípcios' },
      { id: 'indianos', name: 'Indianos' },
    ],
  },
  {
    id: 'decoracao',
    name: 'Decoração',
    icon: 'Frame',
    subcategories: [
      { id: 'estatuas-e-enfeites', name: 'Estátuas e Enfeites' },
      { id: 'quadros', name: 'Quadros' },
      { id: 'fotos-e-porta-retratos', name: 'Fotos e Porta Retratos' },
      { id: 'velas-e-porta-velas', name: 'Velas e Porta Velas' },
      { id: 'papiros', name: 'Papiros' },
      { id: 'lampadas', name: 'Lâmpadas' },
      { id: 'pecas-em-aco-inox', name: 'Peças em Aço Inox' },
      { id: 'cadeiras', name: 'Cadeiras' },
    ],
  },
  {
    id: 'livros-e-midia',
    name: 'Livros e Mídia',
    icon: 'BookOpen',
    subcategories: [
      { id: 'livros', name: 'Livros' },
      { id: 'infantil', name: 'Infantil' },
      { id: 'filmes-dvd-s', name: 'Filmes DvD\'s' },
    ],
  },
  { id: 'novidades', name: 'Novidades', icon: 'Sparkles', featured: true, subcategories: [] },
];

/*
 * Vazio de propósito: o catálogo de demonstração foi removido.
 *
 * O banco é a fonte da verdade — os produtos reais entram pelo painel, em
 * Produtos → Novo. Esta lista só alimenta a carga inicial via
 * `npm run seed:catalogo`, e uma lista vazia não apaga o que já está no banco.
 *
 * O catálogo anterior (72 produtos) está no histórico do git, no commit
 * b398c7d, caso precise ser recuperado.
 */
export const PRODUCTS: Product[] = [];
