/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  id: string;
  name: string;
  category: string; // slug da categoria-mãe, ex.: 'piramides', 'cristais'
  subcategory?: string; // slug da subcategoria, ex.: 'piramides-de-cobre'
  categoryLabel: string; // rótulo exibido, ex.: 'Pirâmides de Cobre'
  description: string;
  longDescription?: string;
  price: number;
  oldPrice?: number; // original price when on sale (renders strikethrough + % off)
  stock?: number; // units in stock
  image: string;
  highlight?: boolean;
  tag?: string; // ex.: 'DESTAQUE', 'NOVIDADE'
  weight: string; // medida/formato da peça, ex.: 'Base 15cm · cobre'
  sku: string;
  /** Materiais e composição da peça. */
  ingredients?: string;
  /** false = fora da vitrine (exclusão suave). Só o painel recebe este campo. */
  active?: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface Category {
  id: string;
  name: string;
  description: string;
}

// Mega-menu taxonomy
export interface SubCategory {
  id: string;
  name: string;
}

export interface MenuCategory {
  id: string;
  name: string;
  icon: string; // lucide icon name
  featured?: boolean; // highlighted entry (e.g. Promoções, Novidades)
  subcategories: SubCategory[];
}

export interface ValueProp {
  id: string;
  title: string;
  description: string;
  icon: string;
}
