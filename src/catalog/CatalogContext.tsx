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
import type { MenuCategory, Product, Category } from '../types';

export interface StorePublicSettings {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  pixDiscountPct: number;
  payments: { card: boolean; pix: boolean; boleto: boolean };
  /** Valor mínimo para frete grátis; 0 quando a regra está desligada. */
  freeShippingFrom: number;
  /** Frete padrão, usado como estimativa antes de o cliente informar o CEP. */
  shippingFrom: number;
}

interface CatalogValue {
  products: Product[];
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
  categories: Category[];
  menu: MenuCategory[];
  settings: StorePublicSettings;
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
    const products = data?.products ?? [];
    const index = new Map(products.map((p) => [p.id, p]));
    return {
      products,
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
