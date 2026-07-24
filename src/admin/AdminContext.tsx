/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Product } from '../types';
import { AdminState, Order, OrderStatus, Coupon, StoreSettings, IntegrationConfig, IntegrationId, AbandonedStatus, RecoveryConfig, Webhook, ShippingConfig } from './types';
import { loadState, saveState, resetState, generateToken } from './store';

interface AdminContextValue {
  state: AdminState;
  // products
  upsertProduct: (p: Product) => void;
  deleteProduct: (id: string) => void;
  // orders
  setOrderStatus: (id: string, status: OrderStatus) => void;
  // coupons
  upsertCoupon: (c: Coupon) => void;
  deleteCoupon: (id: string) => void;
  // settings
  updateSettings: (patch: Partial<StoreSettings>) => void;
  // integrations
  updateIntegration: (id: IntegrationId, patch: Partial<IntegrationConfig>) => void;
  // abandoned carts
  setCartStatus: (id: string, status: AbandonedStatus) => void;
  markReminderSent: (id: string) => void;
  updateRecovery: (patch: Partial<RecoveryConfig>) => void;
  // public API
  createApiKey: (name: string) => string;
  revokeApiKey: (id: string) => void;
  deleteApiKey: (id: string) => void;
  addWebhook: (w: Omit<Webhook, 'id'>) => void;
  removeWebhook: (id: string) => void;
  // shipping
  updateShipping: (patch: Partial<ShippingConfig>) => void;
  reset: () => void;
}

const Ctx = createContext<AdminContextValue | null>(null);

export function AdminProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AdminState>(() => loadState());

  useEffect(() => {
    saveState(state);
  }, [state]);

  const value = useMemo<AdminContextValue>(() => ({
    state,
    upsertProduct: (p) =>
      setState((s) => {
        const exists = s.products.some((x) => x.id === p.id);
        return {
          ...s,
          products: exists
            ? s.products.map((x) => (x.id === p.id ? p : x))
            : [p, ...s.products],
        };
      }),
    deleteProduct: (id) =>
      setState((s) => ({ ...s, products: s.products.filter((x) => x.id !== id) })),
    setOrderStatus: (id, status) =>
      setState((s) => ({
        ...s,
        orders: s.orders.map((o) => (o.id === id ? { ...o, status } : o)),
      })),
    upsertCoupon: (c) =>
      setState((s) => {
        const exists = s.coupons.some((x) => x.id === c.id);
        return {
          ...s,
          coupons: exists ? s.coupons.map((x) => (x.id === c.id ? c : x)) : [c, ...s.coupons],
        };
      }),
    deleteCoupon: (id) =>
      setState((s) => ({ ...s, coupons: s.coupons.filter((x) => x.id !== id) })),
    updateSettings: (patch) =>
      setState((s) => ({ ...s, settings: { ...s.settings, ...patch } })),
    updateIntegration: (id, patch) =>
      setState((s) => ({
        ...s,
        integrations: { ...s.integrations, [id]: { ...s.integrations[id], ...patch } },
      })),
    setCartStatus: (id, status) =>
      setState((s) => ({
        ...s,
        abandonedCarts: s.abandonedCarts.map((c) => (c.id === id ? { ...c, status } : c)),
      })),
    markReminderSent: (id) =>
      setState((s) => ({
        ...s,
        abandonedCarts: s.abandonedCarts.map((c) =>
          c.id === id ? { ...c, remindersSent: c.remindersSent + 1 } : c
        ),
      })),
    updateRecovery: (patch) =>
      setState((s) => ({ ...s, recovery: { ...s.recovery, ...patch } })),
    createApiKey: (name) => {
      const token = generateToken();
      setState((s) => ({
        ...s,
        apiKeys: [
          { id: `key-${Date.now()}`, name: name || 'Nova chave', token, createdAt: new Date().toISOString() },
          ...s.apiKeys,
        ],
      }));
      return token;
    },
    revokeApiKey: (id) =>
      setState((s) => ({
        ...s,
        apiKeys: s.apiKeys.map((k) => (k.id === id ? { ...k, revoked: true } : k)),
      })),
    deleteApiKey: (id) =>
      setState((s) => ({ ...s, apiKeys: s.apiKeys.filter((k) => k.id !== id) })),
    addWebhook: (w) =>
      setState((s) => ({
        ...s,
        webhooks: [{ id: `wh-${Date.now()}`, ...w }, ...s.webhooks],
      })),
    removeWebhook: (id) =>
      setState((s) => ({ ...s, webhooks: s.webhooks.filter((w) => w.id !== id) })),
    updateShipping: (patch) =>
      setState((s) => ({ ...s, shipping: { ...s.shipping, ...patch } })),
    reset: () => setState(resetState()),
  }), [state]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin(): AdminContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAdmin must be used within AdminProvider');
  return v;
}
