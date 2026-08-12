/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Camada de dados do painel.
 *
 * Este arquivo já era o "ponto de encaixe" previsto para um backend: antes ele
 * lia e gravava tudo no localStorage do navegador — cada visitante via a sua
 * própria loja. Agora cada função é uma chamada à API, e as telas continuam
 * exatamente iguais.
 */

import { api } from '../api/client';
import { Product } from '../types';
import {
  AdminState, OrderStatus, Coupon, StoreSettings, IntegrationConfig,
  IntegrationId, AbandonedStatus, RecoveryConfig, ShippingConfig, Webhook,
} from './types';

/** Estado completo do painel numa requisição só. */
export function loadState(): Promise<AdminState> {
  return api.get<AdminState>('/admin/state');
}

// ------------------------------------------------------------- produtos ----

export function upsertProduct(product: Product): Promise<{ product: Product }> {
  return api.post<{ product: Product }>('/admin/products', product);
}

export function deleteProduct(id: string): Promise<void> {
  return api.del(`/admin/products/${encodeURIComponent(id)}`);
}

// -------------------------------------------------------------- pedidos ----

export function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  return api.patch(`/admin/orders/${encodeURIComponent(id)}`, { status });
}

// --------------------------------------------------------------- cupons ----

export function upsertCoupon(coupon: Coupon): Promise<void> {
  return api.post('/admin/coupons', coupon);
}

export function deleteCoupon(id: string): Promise<void> {
  return api.del(`/admin/coupons/${encodeURIComponent(id)}`);
}

// -------------------------------------------------------- configurações ----

export function updateSettings(patch: Partial<StoreSettings>): Promise<void> {
  return api.put('/admin/settings', patch);
}

export function updateShipping(patch: Partial<ShippingConfig>): Promise<void> {
  return api.put('/admin/shipping', patch);
}

export function updateRecovery(patch: Partial<RecoveryConfig>): Promise<void> {
  return api.put('/admin/recovery', patch);
}

// ---------------------------------------------------------- integrações ----

export function updateIntegration(
  id: IntegrationId,
  patch: Partial<IntegrationConfig>,
): Promise<{ integration: IntegrationConfig }> {
  return api.put<{ integration: IntegrationConfig }>(`/admin/integrations/${id}`, patch);
}

/**
 * Testa a conexão do provedor. O handshake roda no servidor, com a credencial
 * cifrada — o navegador nunca vê o token e não esbarra em CORS.
 */
export function testIntegration(id: IntegrationId): Promise<{ ok: boolean; message: string }> {
  return api.post<{ ok: boolean; message: string }>(`/admin/integrations/${id}/test`);
}

/** Envia uma mensagem de teste pelo provedor de WhatsApp ativo. */
export function sendWhatsAppTest(phone: string): Promise<{ ok: boolean; message: string }> {
  return api.post<{ ok: boolean; message: string }>('/admin/whatsapp/test', { phone });
}

// ------------------------------------------------ carrinhos abandonados ----

export function setCartStatus(id: string, status: AbandonedStatus): Promise<void> {
  return api.patch(`/admin/carts/${encodeURIComponent(id)}`, { status });
}

/** Dispara a mensagem de recuperação pelo WhatsApp configurado. */
export function sendCartReminder(id: string): Promise<{ ok: boolean; message: string }> {
  return api.post<{ ok: boolean; message: string }>(`/admin/carts/${encodeURIComponent(id)}/remind`);
}

// ----------------------------------------------------- API e webhooks -----

export function createApiKey(name: string): Promise<{ id: string; name: string; token: string }> {
  return api.post<{ id: string; name: string; token: string }>('/admin/api-keys', { name });
}

export function revokeApiKey(id: string): Promise<void> {
  return api.patch(`/admin/api-keys/${encodeURIComponent(id)}`, { revoked: true });
}

export function deleteApiKey(id: string): Promise<void> {
  return api.del(`/admin/api-keys/${encodeURIComponent(id)}`);
}

export function addWebhook(webhook: Omit<Webhook, 'id'>): Promise<void> {
  return api.post('/admin/webhooks', webhook);
}

export function removeWebhook(id: string): Promise<void> {
  return api.del(`/admin/webhooks/${encodeURIComponent(id)}`);
}
