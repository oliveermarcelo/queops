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
  /** Saldo em estoque. Pode ter fração: o ERP trabalha o saldo assim. */
  stock?: number;
  image: string;
  highlight?: boolean;
  tag?: string; // ex.: 'DESTAQUE', 'NOVIDADE'
  /**
   * Peso da peça em QUILOS — é o que a cotação de frete usa.
   *
   * Era texto livre fazendo dois papéis ao mesmo tempo: rótulo na vitrine e
   * peso para o frete. Como texto, ninguém lia "0,2kg" como número — nem o
   * ERP, nem o próprio cálculo de frete, que garimpava o valor no meio da
   * frase. O rótulo passou a ser `weightLabel`.
   */
  weight: number;
  /** Medida/formato exibido na vitrine, ex.: 'Base 15cm · cobre'. Só texto. */
  weightLabel?: string;
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
