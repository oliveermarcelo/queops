/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { MenuCategory, Product } from '../types';

export type OrderStatus =
  | 'pending'
  | 'paid'
  | 'shipped'
  | 'delivered'
  | 'canceled';

export interface OrderItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface Order {
  id: string;
  createdAt: string; // ISO
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  discount: number;
  total: number;
  couponCode: string | null;
  status: OrderStatus;
  payment: 'card' | 'pix' | 'boleto';
  channel: 'site' | 'whatsapp' | 'erp';
  /** Código dos Correios (AA123456789BR). Vazio enquanto não despachado. */
  trackingCode?: string;
  /** Último status consultado, para não bater na API a cada abertura da tela. */
  trackingStatus?: string;
}

/** Um evento do rastreio dos Correios. */
export interface TrackingEvent {
  data: string;
  descricao: string;
  local: string;
}

export interface Customer {
  id: string;
  name: string;
  email: string;
  phone: string;
  ordersCount: number;
  totalSpent: number;
  createdAt: string;
}

export interface Coupon {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number; // % ou R$
  active: boolean;
  minOrder?: number | null;
  expiresAt?: string | null;
  /** Quantas vezes o cupom já foi usado (somente leitura). */
  uses?: number;
}

export interface StoreSettings {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  pixDiscountPct: number;
  payments: { card: boolean; pix: boolean; boleto: boolean };
}

// ---- Abandoned carts ----
export type AbandonedStatus = 'open' | 'recovered' | 'discarded';

export interface AbandonedCart {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  items: OrderItem[];
  total: number;
  abandonedAt: string; // ISO
  status: AbandonedStatus;
  remindersSent: number;
}

export interface RecoveryConfig {
  enabled: boolean;
  delayMinutes: number; // wait before sending the first reminder
  message: string; // template, supports {nome} {valor} {cupom}
  couponCode: string; // coupon offered to recover
}

// ---- Shipping / delivery ----
export interface CepRange {
  id: string;
  from: string; // 8-digit cep start
  to: string;   // 8-digit cep end
  price: number;
  free?: boolean; // free shipping for this range
  label?: string;
}

export interface ShippingConfig {
  defaultPrice: number;       // fallback flat rate
  perState: Record<string, number>; // UF -> price (overrides default)
  cepRanges: CepRange[];      // highest priority
  freeShipping: {
    enabled: boolean;
    minOrder: number;         // free above this cart value
    states: string[];         // UFs with always-free shipping
  };
}

// ---- Integrations ----
export type IntegrationId =
  | 'uno'
  | 'erp'
  | 'zapi'
  | 'evolution'
  | 'chatwoot'
  | 'chatvolt'
  // payment gateways
  | 'mercadopago'
  | 'pagseguro'
  | 'stripe'
  | 'pagarme'
  // logistics / shipping
  | 'correios'
  | 'melhorenvio'
  | 'frenet';

export interface IntegrationConfig {
  id: IntegrationId;
  enabled: boolean;
  /**
   * Campos de configuração. Os que são segredo (token, apiKey, secretKey…)
   * voltam SEMPRE vazios do servidor: a credencial fica cifrada no banco e
   * nunca trafega para o navegador. Enviar '' num campo secreto significa
   * "manter o valor atual".
   */
  fields: Record<string, string>;
  /** Nomes dos campos já preenchidos no servidor — inclusive os secretos. */
  configured?: string[];
  lastStatus?: 'unknown' | 'connected' | 'error';
  lastCheckedAt?: string | null;
}

// ---- Public API (for external tools to consume this store) ----
export interface ApiKey {
  id: string;
  name: string;
  /** Apenas o prefixo mascarado; o token completo só aparece na criação. */
  token: string;
  createdAt: string;
  lastUsedAt?: string | null;
  revoked?: boolean;
}

export interface Webhook {
  id: string;
  url: string;
  event: string; // e.g. 'order.created', 'order.status_changed'
  active: boolean;
}

export interface AdminState {
  /** Taxonomia de categorias, para os seletores do painel. */
  menu: MenuCategory[];
  products: Product[];
  orders: Order[];
  customers: Customer[];
  coupons: Coupon[];
  settings: StoreSettings;
  integrations: Record<IntegrationId, IntegrationConfig>;
  abandonedCarts: AbandonedCart[];
  recovery: RecoveryConfig;
  apiKeys: ApiKey[];
  webhooks: Webhook[];
  shipping: ShippingConfig;
}
