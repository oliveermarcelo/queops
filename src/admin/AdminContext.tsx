/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Estado do painel administrativo.
 *
 * As telas continuam chamando `upsertProduct(...)`, `setOrderStatus(...)` e
 * companhia como antes. O que mudou por baixo: cada ação agora fala com a API,
 * atualiza a tela na hora (resposta otimista) e, se o servidor recusar,
 * recarrega o estado e mostra o erro — em vez de gravar no localStorage e
 * fingir que deu certo.
 */

import React, {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
} from 'react';
import { Product } from '../types';
import {
  AdminState, Order, OrderStatus, Coupon, StoreSettings, IntegrationConfig,
  IntegrationId, AbandonedStatus, RecoveryConfig, Webhook, ShippingConfig, PanelUser,
} from './types';
import * as store from './store';

interface AdminContextValue {
  state: AdminState;
  loading: boolean;
  /** Última falha de gravação, para a tela avisar o operador. */
  error: string | null;
  clearError: () => void;
  refresh: () => Promise<void>;

  upsertProduct: (p: Product) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  setOrderStatus: (id: string, status: OrderStatus) => Promise<void>;
  upsertCoupon: (c: Coupon) => Promise<void>;
  deleteCoupon: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<StoreSettings>) => Promise<void>;
  updateIntegration: (id: IntegrationId, patch: Partial<IntegrationConfig>) => Promise<void>;
  testIntegration: (id: IntegrationId) => Promise<{ ok: boolean; message: string }>;
  setCartStatus: (id: string, status: AbandonedStatus) => Promise<void>;
  sendCartReminder: (id: string) => Promise<{ ok: boolean; message: string }>;
  updateRecovery: (patch: Partial<RecoveryConfig>) => Promise<void>;
  createApiKey: (name: string) => Promise<string>;
  revokeApiKey: (id: string) => Promise<void>;
  deleteApiKey: (id: string) => Promise<void>;
  addWebhook: (w: Omit<Webhook, 'id'>) => Promise<void>;
  removeWebhook: (id: string) => Promise<void>;
  updateShipping: (patch: Partial<ShippingConfig>) => Promise<void>;

  /**
   * As ações de usuário NÃO usam resposta otimista, e isso é deliberado.
   *
   * No resto do painel, mostrar a mudança antes da confirmação custa pouco: se
   * o servidor recusar, o estado recarrega e o operador tenta de novo. Aqui a
   * mudança é sobre quem consegue entrar. Uma tela que mostra "usuário criado"
   * antes da confirmação convida o dono a fechar o navegador e passar uma senha
   * que não existe — e a descobrir isso pela pessoa que não conseguiu entrar.
   * Então estas quatro esperam o servidor e propagam o erro para quem chamou.
   */
  createPanelUser: (input: { name: string; email: string; password: string }) => Promise<void>;
  renamePanelUser: (id: string, patch: { name?: string; email?: string }) => Promise<void>;
  setPanelUserActive: (id: string, active: boolean) => Promise<void>;
  resetPanelUserPassword: (id: string, password: string) => Promise<void>;
  changeOwnPassword: (currentPassword: string, newPassword: string) => Promise<void>;

  /** Amarra um código de categoria do ERP à árvore da loja. `null` desamarra. */
  linkErpCategory: (
    code: string, category: string | null, subcategory: string | null,
  ) => Promise<void>;
}

const Ctx = createContext<AdminContextValue | null>(null);

/** Estado vazio, exibido enquanto a primeira carga não chega. */
const EMPTY: AdminState = {
  menu: [],
  products: [], orders: [], customers: [], coupons: [],
  settings: {
    name: '', email: '', phone: '', whatsapp: '',
    pixDiscountPct: 0,
    payments: { card: true, pix: true, boleto: true },
  },
  integrations: {} as AdminState['integrations'],
  abandonedCarts: [], recovery: { enabled: false, delayMinutes: 60, message: '', couponCode: '' },
  apiKeys: [], webhooks: [], users: [],
  erpCategories: [], productsWithoutCategory: 0,
  shipping: {
    defaultPrice: 0, perState: {}, cepRanges: [],
    freeShipping: { enabled: false, minOrder: 0, states: [] },
  },
};

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AdminState>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = await store.loadState();
      if (alive.current) setState(fresh);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Falha ao carregar os dados.');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  /**
   * Aplica a mudança na tela imediatamente e envia ao servidor. Se o servidor
   * recusar, desfaz recarregando o estado real — nunca deixa a tela mostrar
   * algo que não foi gravado.
   */
  const mutate = useCallback(
    async (optimistic: (s: AdminState) => AdminState, call: () => Promise<unknown>) => {
      setError(null);
      setState(optimistic);
      try {
        await call();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Não foi possível salvar.');
      } finally {
        await refresh();
      }
    },
    [refresh],
  );

  /** Grava a lista de usuários que a rota devolveu, sem tocar no resto. */
  const aplicarUsuarios = useCallback((users: PanelUser[]) => {
    if (alive.current) setState((s) => ({ ...s, users }));
  }, []);

  const value = useMemo<AdminContextValue>(
    () => ({
      state,
      loading,
      error,
      clearError: () => setError(null),
      refresh,

      upsertProduct: (p) =>
        mutate(
          (s) => ({
            ...s,
            products: s.products.some((x) => x.id === p.id)
              ? s.products.map((x) => (x.id === p.id ? p : x))
              : [p, ...s.products],
          }),
          () => store.upsertProduct(p),
        ),

      deleteProduct: (id) =>
        mutate(
          (s) => ({ ...s, products: s.products.filter((x) => x.id !== id) }),
          () => store.deleteProduct(id),
        ),

      setOrderStatus: (id, status) =>
        mutate(
          (s) => ({
            ...s,
            orders: s.orders.map((o: Order) => (o.id === id ? { ...o, status } : o)),
          }),
          () => store.setOrderStatus(id, status),
        ),

      upsertCoupon: (c) =>
        mutate(
          (s) => ({
            ...s,
            coupons: s.coupons.some((x) => x.id === c.id)
              ? s.coupons.map((x) => (x.id === c.id ? c : x))
              : [c, ...s.coupons],
          }),
          () => store.upsertCoupon(c),
        ),

      deleteCoupon: (id) =>
        mutate(
          (s) => ({ ...s, coupons: s.coupons.filter((x) => x.id !== id) }),
          () => store.deleteCoupon(id),
        ),

      updateSettings: (patch) =>
        mutate(
          (s) => ({ ...s, settings: { ...s.settings, ...patch } }),
          () => store.updateSettings(patch),
        ),

      updateShipping: (patch) =>
        mutate(
          (s) => ({ ...s, shipping: { ...s.shipping, ...patch } }),
          () => store.updateShipping(patch),
        ),

      updateRecovery: (patch) =>
        mutate(
          (s) => ({ ...s, recovery: { ...s.recovery, ...patch } }),
          () => store.updateRecovery(patch),
        ),

      updateIntegration: (id, patch) =>
        mutate(
          (s) => ({
            ...s,
            integrations: { ...s.integrations, [id]: { ...s.integrations[id], ...patch } },
          }),
          () => store.updateIntegration(id, patch),
        ),

      testIntegration: async (id) => {
        const result = await store.testIntegration(id);
        await refresh();
        return result;
      },

      setCartStatus: (id, status) =>
        mutate(
          (s) => ({
            ...s,
            abandonedCarts: s.abandonedCarts.map((c) => (c.id === id ? { ...c, status } : c)),
          }),
          () => store.setCartStatus(id, status),
        ),

      sendCartReminder: async (id) => {
        const result = await store.sendCartReminder(id);
        await refresh();
        return result;
      },

      createApiKey: async (name) => {
        const created = await store.createApiKey(name);
        await refresh();
        return created.token;
      },

      revokeApiKey: (id) =>
        mutate(
          (s) => ({
            ...s,
            apiKeys: s.apiKeys.map((k) => (k.id === id ? { ...k, revoked: true } : k)),
          }),
          () => store.revokeApiKey(id),
        ),

      deleteApiKey: (id) =>
        mutate(
          (s) => ({ ...s, apiKeys: s.apiKeys.filter((k) => k.id !== id) }),
          () => store.deleteApiKey(id),
        ),

      addWebhook: (w) => mutate((s) => s, () => store.addWebhook(w)),

      removeWebhook: (id) =>
        mutate(
          (s) => ({ ...s, webhooks: s.webhooks.filter((w) => w.id !== id) }),
          () => store.removeWebhook(id),
        ),

      // As rotas devolvem a lista já atualizada, então a tela não precisa
      // adivinhar o resultado nem esperar um /state inteiro para acertar.
      createPanelUser: async (input) => {
        const { users } = await store.createPanelUser(input);
        aplicarUsuarios(users);
      },

      renamePanelUser: async (id, patch) => {
        const { users } = await store.updatePanelUser(id, patch);
        aplicarUsuarios(users);
      },

      setPanelUserActive: async (id, active) => {
        const { users } = await store.updatePanelUser(id, { active });
        aplicarUsuarios(users);
      },

      resetPanelUserPassword: async (id, password) => {
        const { users } = await store.updatePanelUser(id, { password });
        aplicarUsuarios(users);
      },

      changeOwnPassword: (atual, nova) => store.changeOwnPassword(atual, nova),

      linkErpCategory: async (code, category, subcategory) => {
        const r = await store.linkErpCategory(code, category, subcategory);
        if (alive.current) {
          setState((s) => ({
            ...s,
            erpCategories: r.erpCategories,
            productsWithoutCategory: r.productsWithoutCategory,
          }));
        }
      },
    }),
    [state, loading, error, mutate, refresh, aplicarUsuarios],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin(): AdminContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdmin precisa estar dentro de <AdminProvider>');
  return v;
}
