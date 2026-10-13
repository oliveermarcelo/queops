/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Catálogo da vitrine, servido pelo banco.
 *
 * Antes cada tela importava o array `PRODUCTS` de `src/data.ts`, o que fazia o
 * painel administrativo e a loja viverem em mundos separados: editar um preço
 * no admin não mudava nada aqui. Agora existe uma fonte só — `GET /api/catalog`.
 */

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import type { MenuCategory, Product, Category, ProductGroup } from '../types';

export interface StorePublicSettings {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  pixDiscountPct: number;
  /**
   * Mínimo em PRODUTOS para o desconto do Pix valer; 0 quando vale sempre.
   *
   * Produtos, sem frete e sem cupom — a mesma base do frete grátis. A tela
   * precisa dizer isso, senão o cliente soma o frete e acha que já chegou lá.
   */
  pixMinOrder: number;
  payments: { card: boolean; pix: boolean; boleto: boolean };
  /** Valor mínimo para frete grátis; 0 quando a regra está desligada. */
  freeShippingFrom: number;
  /** Frete padrão, usado como estimativa antes de o cliente informar o CEP. */
  shippingFrom: number;
}

interface CatalogValue {
  /**
   * O que a vitrine mostra: produtos soltos mais UM card por grupo.
   *
   * As variações agrupadas não estão aqui. Elas continuam existindo em
   * `allProducts` e em `productById` — a página do grupo precisa do preço e do
   * estoque de cada uma —, mas na listagem o grupo aparece uma vez só. Era
   * esse o problema: três tamanhos da mesma peça viravam três cards, e quem
   * visitava lia como três produtos diferentes.
   */
  products: Product[];
  /** Todos os produtos, inclusive os que pertencem a um grupo. */
  allProducts: Product[];
  categories: Category[];
  menu: MenuCategory[];
  settings: StorePublicSettings | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  /** Busca um produto pelo id na lista já carregada. */
  productById: (id: string) => Product | undefined;
}

const Ctx = createContext<CatalogValue | null>(null);

interface CatalogResponse {
  products: Product[];
  groups?: ProductGroup[] & { [k: number]: GrupoDoServidor };
  categories: Category[];
  menu: MenuCategory[];
  settings: StorePublicSettings;
}

/** O grupo como o servidor manda: conteúdo de vitrine mais eixos e variações. */
interface GrupoDoServidor extends ProductGroup {
  name: string;
  description: string;
  longDescription: string;
  image: string;
  category: string;
  subcategory: string | null;
  categoryLabel: string;
  tag: string | null;
  highlight: boolean;
}

/**
 * Transforma um grupo num Product, para a vitrine inteira continuar igual.
 *
 * A alternativa seria ensinar card, listagem, filtro, busca, trilho e menu a
 * lidar com dois tipos de item. Seria a mesma lógica repetida em seis lugares,
 * e bastaria um deles ficar para trás para uma variação reaparecer sozinha na
 * vitrine ao lado do grupo — exatamente o card duplicado que todo este
 * trabalho existe para evitar.
 *
 * O preço é o MENOR entre as variações que dá para comprar agora, porque é
 * isso que o card promete ("a partir de"). Quando nenhuma tem estoque, cai
 * para o menor entre as ativas: o card continua mostrando um preço de verdade
 * e a página explica que está esgotado — melhor do que um card com R$ 0,00.
 */
function grupoComoProduto(g: GrupoDoServidor, porId: Map<string, Product>): Product | null {
  const variacoes = g.variants
    .map((v) => porId.get(v.productId))
    .filter((p): p is Product => p !== undefined && p.active !== false);

  // Grupo sem nenhuma variação viva não vira card: não há o que vender nele.
  if (variacoes.length === 0) return null;

  const comEstoque = variacoes.filter((p) => (p.stock ?? 0) > 0);
  const base = comEstoque.length > 0 ? comEstoque : variacoes;
  const menor = base.reduce((a, b) => (b.price < a.price ? b : a));

  return {
    id: g.id,
    name: g.name,
    category: g.category,
    subcategory: g.subcategory ?? undefined,
    categoryLabel: g.categoryLabel,
    description: g.description,
    longDescription: g.longDescription,
    price: menor.price,
    oldPrice: menor.oldPrice,
    // Soma só para o card saber se há o que vender. Quem decide se UMA
    // variação vende é o estoque dela — somar nunca libera a venda de um
    // tamanho esgotado por causa do saldo de outro.
    stock: variacoes.reduce((n, p) => n + (p.stock ?? 0), 0),
    image: g.image !== '' ? g.image : menor.image,
    highlight: g.highlight,
    tag: g.tag ?? undefined,
    weight: menor.weight,
    weightLabel: menor.weightLabel,
    sku: '',
    searchTerms: variacoes.map((p) => `${p.sku} ${p.id}`).join(' '),
    group: { id: g.id, code: g.code, axes: g.axes, variants: g.variants },
  };
}

export function CatalogProvider({ children }: { children: React.ReactNode }) {
  const [data, setData] = useState<CatalogResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    api
      .get<CatalogResponse>('/catalog')
      .then(setData)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const value = useMemo<CatalogValue>(() => {
    const allProducts = data?.products ?? [];
    const index = new Map<string, Product>(allProducts.map((p) => [p.id, p] as [string, Product]));

    const grupos = (data?.groups ?? []) as unknown as GrupoDoServidor[];
    const agrupados = new Set<string>();
    const cards: Product[] = [];
    for (const g of grupos) {
      const card = grupoComoProduto(g, index);
      if (card === null) continue;
      cards.push(card);
      for (const v of g.variants) agrupados.add(v.productId);
    }

    /*
     * O card do grupo entra no lugar da PRIMEIRA variação dele, e não no fim
     * da lista. A ordem da vitrine é a ordem de `position` definida no painel;
     * jogar os grupos para o fim mudaria a posição de peças que ninguém pediu
     * para mover.
     */
    const products: Product[] = [];
    const jaInserido = new Set<string>();
    for (const p of allProducts) {
      if (!agrupados.has(p.id)) {
        products.push(p);
        continue;
      }
      const card = cards.find((c) => c.group?.variants.some((v) => v.productId === p.id));
      if (card !== undefined && !jaInserido.has(card.id)) {
        products.push(card);
        jaInserido.add(card.id);
      }
    }

    // Produto agrupado continua acessível por id: a página do grupo lê preço e
    // estoque de cada variação a partir daqui.
    for (const c of cards) index.set(c.id, c);

    return {
      products,
      allProducts,
      categories: data?.categories ?? [],
      menu: data?.menu ?? [],
      settings: data?.settings ?? null,
      loading,
      error,
      reload: load,
      productById: (id) => index.get(id),
    };
  }, [data, loading, error, load]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCatalog(): CatalogValue {
  const v = useContext(Ctx);
  if (!v) {
    throw new Error('useCatalog precisa estar dentro de <CatalogProvider>');
  }
  return v;
}
