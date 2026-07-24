/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Lightweight client-side store backed by localStorage.
 * This is the single seam where a real backend/ERP would later plug in:
 * swap these functions for API calls and the UI stays unchanged.
 */

import { PRODUCTS } from '../data';
import {
  AdminState, Order, Customer, Coupon, StoreSettings,
  IntegrationConfig, IntegrationId, AbandonedCart, RecoveryConfig,
  ApiKey, Webhook, ShippingConfig,
} from './types';

const KEY = 'km_admin_state_v8';

const DEFAULT_SHIPPING: ShippingConfig = {
  defaultPrice: 24.9,
  perState: {
    SP: 14.9, RJ: 19.9, MG: 19.9, ES: 22.9,
    PR: 24.9, SC: 24.9, RS: 27.9, DF: 22.9,
  },
  cepRanges: [
    { id: 'cr1', from: '01000000', to: '05999999', price: 9.9, label: 'Capital SP' },
  ],
  freeShipping: {
    enabled: true,
    minOrder: 199,
    states: ['SP'],
  },
};

// Gives each catalog product a deterministic default stock for the demo.
function withDefaultStock(): typeof PRODUCTS {
  return PRODUCTS.map((p, i) => ({
    ...p,
    stock: p.stock ?? [12, 8, 25, 4, 0, 18, 33, 6, 15, 9][i % 10],
  }));
}

// Generates a demo API token (km_live_...). In production this comes from the backend.
export function generateToken(): string {
  const rand = () => Math.random().toString(36).slice(2);
  return `km_live_${rand()}${rand()}`.slice(0, 40);
}

const DEFAULT_API_KEYS: ApiKey[] = [
  { id: 'k1', name: 'Chave de Produção', token: 'km_live_demo3f9a2c7b51e84d6a0b9c', createdAt: new Date(2024, 4, 1).toISOString() },
];

const DEFAULT_WEBHOOKS: Webhook[] = [];

const DEFAULT_RECOVERY: RecoveryConfig = {
  enabled: true,
  delayMinutes: 60,
  message:
    'Olá {nome}! 👋 Você esqueceu alguns itens na sua sacola da Quéops Pirâmides (total {valor}). '
    + 'Use o cupom {cupom} e finalize com desconto: ',
  couponCode: 'VOLTA10',
};

const DEFAULT_SETTINGS: StoreSettings = {
  name: 'Quéops Pirâmides',
  email: 'contato@queopspiramides.com.br',
  phone: '(11) 0000-0000',
  whatsapp: '5511000000000',
  freeShippingThreshold: 199,
  flatShipping: 19.9,
  pixDiscountPct: 5,
  payments: { card: true, pix: true, boleto: true },
};

function emptyIntegration(id: IntegrationId): IntegrationConfig {
  return { id, enabled: false, fields: {}, lastStatus: 'unknown' };
}

const DEFAULT_INTEGRATIONS: Record<IntegrationId, IntegrationConfig> = {
  uno: emptyIntegration('uno'),
  erp: emptyIntegration('erp'),
  zapi: emptyIntegration('zapi'),
  evolution: emptyIntegration('evolution'),
  chatwoot: emptyIntegration('chatwoot'),
  chatvolt: emptyIntegration('chatvolt'),
  mercadopago: emptyIntegration('mercadopago'),
  pagseguro: emptyIntegration('pagseguro'),
  stripe: emptyIntegration('stripe'),
  pagarme: emptyIntegration('pagarme'),
  correios: emptyIntegration('correios'),
  melhorenvio: emptyIntegration('melhorenvio'),
  frenet: emptyIntegration('frenet'),
};

// Deterministic PRNG (mulberry32) so the demo numbers stay stable across reloads.
function makeRng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CUSTOMERS_POOL = [
  { name: 'Maria Oliveira', email: 'maria.oliveira@email.com' },
  { name: 'João Santos', email: 'joao.santos@email.com' },
  { name: 'Ana Costa', email: 'ana.costa@email.com' },
  { name: 'Pedro Lima', email: 'pedro.lima@email.com' },
  { name: 'Restaurante Sabor & Arte', email: 'compras@saborarte.com' },
  { name: 'Carla Mendes', email: 'carla.mendes@email.com' },
  { name: 'Bistrô da Praça', email: 'contato@bistrodapraca.com' },
  { name: 'Lucas Ferreira', email: 'lucas.ferreira@email.com' },
  { name: 'Juliana Prado', email: 'juliana.prado@email.com' },
  { name: 'Mercado Bom Preço', email: 'pedidos@bompreco.com' },
  { name: 'Rafael Almeida', email: 'rafael.almeida@email.com' },
  { name: 'Beatriz Souza', email: 'beatriz.souza@email.com' },
];

// ---- Seed orders spread across ~6 months so the dashboard has real history ----
function seedOrders(): Order[] {
  const rng = makeRng(20240601);
  const statuses: Order['status'][] = ['paid', 'shipped', 'delivered', 'delivered', 'delivered', 'pending', 'canceled'];
  const orders: Order[] = [];
  const DAYS = 180;
  const COUNT = 140;

  for (let i = 0; i < COUNT; i++) {
    // Recent days get more orders (growth trend): bias the day distribution.
    const daysAgo = Math.floor(Math.pow(rng(), 1.6) * DAYS);
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    d.setHours(Math.floor(rng() * 24), Math.floor(rng() * 60), 0, 0);

    const cust = CUSTOMERS_POOL[Math.floor(rng() * CUSTOMERS_POOL.length)];
    const itemCount = 1 + Math.floor(rng() * 3);
    const items = Array.from({ length: itemCount }, () => {
      const prod = PRODUCTS[Math.floor(rng() * Math.min(PRODUCTS.length, 20))];
      const quantity = 1 + Math.floor(rng() * 3);
      return { productId: prod.id, name: prod.name, quantity, unitPrice: prod.price };
    });
    const total = items.reduce((s, it) => s + it.unitPrice * it.quantity, 0);

    orders.push({
      id: `KM-${1000 + i}`,
      createdAt: d.toISOString(),
      customerName: cust.name,
      customerEmail: cust.email,
      customerPhone: `1199999${String(1000 + i).slice(-4)}`,
      items,
      total,
      status: statuses[Math.floor(rng() * statuses.length)],
      payment: (['card', 'pix', 'boleto'] as const)[Math.floor(rng() * 3)],
      channel: (['site', 'whatsapp', 'erp'] as const)[Math.floor(rng() * 3)],
    });
  }
  return orders.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

function seedCustomers(orders: Order[]): Customer[] {
  const map = new Map<string, Customer>();
  orders.forEach((o) => {
    const existing = map.get(o.customerEmail);
    if (existing) {
      existing.ordersCount += 1;
      existing.totalSpent += o.total;
      // keep the earliest order date as the customer's "since" date
      if (+new Date(o.createdAt) < +new Date(existing.createdAt)) {
        existing.createdAt = o.createdAt;
      }
    } else {
      map.set(o.customerEmail, {
        id: o.customerEmail,
        name: o.customerName,
        email: o.customerEmail,
        phone: o.customerPhone,
        ordersCount: 1,
        totalSpent: o.total,
        createdAt: o.createdAt,
      });
    }
  });
  return [...map.values()];
}

function seedCoupons(): Coupon[] {
  return [
    { id: 'c1', code: 'BEMVINDO10', type: 'percent', value: 10, active: true, minOrder: 100 },
    { id: 'c2', code: 'FRETEGRATIS', type: 'fixed', value: 19.9, active: true },
  ];
}

function seedAbandoned(): AbandonedCart[] {
  const samples = [
    { name: 'Fernanda Alves', phone: '5511988887777', email: 'fernanda@email.com', idxs: [0, 4], hoursAgo: 2 },
    { name: 'Ricardo Souza', phone: '5511977776666', email: 'ricardo@email.com', idxs: [1], hoursAgo: 8 },
    { name: 'Bistrô da Praça', phone: '5511966665555', email: 'compras@bistro.com', idxs: [2, 3, 5], hoursAgo: 26 },
    { name: 'Juliana Prado', phone: '5511955554444', email: 'juliana@email.com', idxs: [6], hoursAgo: 50 },
  ];
  return samples.map((s, i) => {
    const items = s.idxs
      .map((idx) => PRODUCTS[idx])
      .filter(Boolean)
      .map((prod, j) => ({
        productId: prod.id,
        name: prod.name,
        quantity: (j % 2) + 1,
        unitPrice: prod.price,
      }));
    const total = items.reduce((sum, it) => sum + it.unitPrice * it.quantity, 0);
    const d = new Date();
    d.setHours(d.getHours() - s.hoursAgo);
    return {
      id: `AC-${2000 + i}`,
      customerName: s.name,
      customerPhone: s.phone,
      customerEmail: s.email,
      items,
      total,
      abandonedAt: d.toISOString(),
      status: 'open' as const,
      remindersSent: 0,
    };
  });
}

function freshState(): AdminState {
  const orders = seedOrders();
  return {
    products: withDefaultStock(),
    orders,
    customers: seedCustomers(orders),
    coupons: seedCoupons(),
    settings: DEFAULT_SETTINGS,
    integrations: DEFAULT_INTEGRATIONS,
    abandonedCarts: seedAbandoned(),
    recovery: DEFAULT_RECOVERY,
    apiKeys: DEFAULT_API_KEYS,
    webhooks: DEFAULT_WEBHOOKS,
    shipping: DEFAULT_SHIPPING,
  };
}

export function loadState(): AdminState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      const s = freshState();
      saveState(s);
      return s;
    }
    const parsed = JSON.parse(raw) as AdminState;
    // Keep admin-managed products (created/edited, with stock). Seed defaults
    // only if the saved state somehow has none.
    if (!parsed.products || parsed.products.length === 0) {
      parsed.products = withDefaultStock();
    }
    // Backfill any new integration keys
    parsed.integrations = { ...DEFAULT_INTEGRATIONS, ...parsed.integrations };
    parsed.settings = { ...DEFAULT_SETTINGS, ...parsed.settings };
    if (!parsed.abandonedCarts) parsed.abandonedCarts = seedAbandoned();
    parsed.recovery = { ...DEFAULT_RECOVERY, ...parsed.recovery };
    if (!parsed.apiKeys) parsed.apiKeys = DEFAULT_API_KEYS;
    if (!parsed.webhooks) parsed.webhooks = DEFAULT_WEBHOOKS;
    parsed.shipping = parsed.shipping
      ? {
          ...DEFAULT_SHIPPING,
          ...parsed.shipping,
          freeShipping: { ...DEFAULT_SHIPPING.freeShipping, ...parsed.shipping.freeShipping },
        }
      : DEFAULT_SHIPPING;
    return parsed;
  } catch {
    return freshState();
  }
}

export function saveState(state: AdminState): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* ignore quota errors */
  }
}

export function resetState(): AdminState {
  const s = freshState();
  saveState(s);
  return s;
}
