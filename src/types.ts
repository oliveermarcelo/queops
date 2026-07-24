/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  id: string;
  name: string;
  category: string; // parent category slug, e.g. 'palmitos', 'azeitonas', 'derivados-do-mar'
  subcategory?: string; // subcategory slug, e.g. 'palmito-pupunha', 'azeitona-verde'
  categoryLabel: string; // e.g., 'Palmitos', 'Conservas', 'Cogumelos', 'Pescados'
  description: string;
  longDescription?: string;
  price: number;
  oldPrice?: number; // original price when on sale (renders strikethrough + % off)
  stock?: number; // units in stock
  image: string;
  highlight?: boolean;
  tag?: string; // e.g., 'DESTAQUE', 'NOVO', 'SUPREMO'
  weight: string; // e.g., 'Frasco 300g líquido', 'Drenado 250g'
  sku: string;
  ingredients?: string;
  nutritionalFacts?: {
    calorias: string;
    sodio: string;
    carboidratos: string;
    proteinas: string;
    gorduras: string;
    fibra: string;
  };
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
