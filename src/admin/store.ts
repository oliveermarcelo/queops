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
  IntegrationId, AbandonedStatus, RecoveryConfig, ShippingConfig, TrackingEvent, Webhook,
  PanelUser, ErpCategory,
} from './types';

/** Estado completo do painel numa requisição só. */
export function loadState(): Promise<AdminState> {
  return api.get<AdminState>('/admin/state');
}

// ------------------------------------------------------------- produtos ----

export function upsertProduct(product: Product): Promise<{ product: Product }> {
  return api.post<{ product: Product }>('/admin/products', product);
}

/**
 * Sem `definitivo`, tira o produto da vitrine (exclusão suave) e o mantém no
 * painel. Com `definitivo`, apaga a linha — o servidor recusa com 409 se o
 * produto já foi vendido, porque o pedido de quem comprou ficaria sem o item.
 */
export function deleteProduct(id: string, definitivo = false): Promise<void> {
  const rota = `/admin/products/${encodeURIComponent(id)}`;
  return api.del(definitivo ? `${rota}?definitivo=1` : rota);
}

/**
 * Envia uma imagem e recebe a URL dela.
 *
 * A foto sobe uma vez, aqui, e o produto guarda só a URL. Antes ela viajava
 * embutida no corpo do produto como data URL e era cortada pelo tamanho da
 * coluna — salvava com 200 e não aparecia.
 */
export function uploadImagem(dataUrl: string): Promise<{ url: string; bytes: number }> {
  return api.post<{ url: string; bytes: number }>('/admin/midia', { dataUrl });
}

// -------------------------------------------------------------- pedidos ----

export function setOrderStatus(id: string, status: OrderStatus): Promise<void> {
  return api.patch(`/admin/orders/${encodeURIComponent(id)}`, { status });
}

/**
 * Apaga o pedido e os itens dele, de vez.
 *
 * O servidor recusa com 409 se o pedido foi pago ou se tem cobrança em aberto:
 * a linha de um pedido pago é o único registro de dinheiro que entrou, e um Pix
 * ainda pagável cairia depois sem pedido a que se referir.
 */
export function deleteOrder(id: string): Promise<void> {
  return api.del(`/admin/orders/${encodeURIComponent(id)}`);
}

/** Grava o código de rastreio. String vazia limpa o que estava lá. */
export function setOrderTracking(id: string, trackingCode: string): Promise<void> {
  return api.put(`/admin/orders/${encodeURIComponent(id)}/tracking`, { trackingCode });
}

/** Consulta os Correios. `erro` vem preenchido quando não deu para rastrear. */
export function fetchOrderTracking(
  id: string,
): Promise<{ trackingCode: string; eventos: TrackingEvent[]; erro: string }> {
  return api.get(`/admin/orders/${encodeURIComponent(id)}/tracking`);
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

// ------------------------------------------------ usuários do painel -----

/**
 * As rotas de usuário devolvem a lista inteira já atualizada.
 *
 * É de propósito: nesta tela um clique muda o que os outros cliques podem
 * fazer (desativar o penúltimo usuário faz o último deixar de ser desativável).
 * Devolver a lista de volta mantém a tela e o servidor com a mesma verdade,
 * sem uma segunda ida ao servidor entre um clique e o próximo.
 */
export function createPanelUser(input: {
  name: string; email: string; password: string;
}): Promise<{ id: string; users: PanelUser[] }> {
  return api.post<{ id: string; users: PanelUser[] }>('/admin/users', input);
}

export function updatePanelUser(
  id: string,
  patch: { name?: string; email?: string; active?: boolean; password?: string },
): Promise<{ users: PanelUser[] }> {
  return api.patch<{ users: PanelUser[] }>(`/admin/users/${encodeURIComponent(id)}`, patch);
}

// ---------------------------------------------- categorias do ERP -----

/**
 * Amarra um código do ERP a uma categoria da loja. `category: null` desamarra.
 *
 * Devolve a lista inteira já atualizada, pelo mesmo motivo das rotas de
 * usuário: nesta tela uma amarração muda a contagem de pendentes e pode tirar
 * produtos do limbo, e o número na tela precisa acompanhar sem uma segunda
 * viagem ao servidor.
 */
export function linkErpCategory(
  code: string,
  category: string | null,
  subcategory: string | null,
): Promise<{ erpCategories: ErpCategory[]; productsWithoutCategory: number; released: number }> {
  return api.put(`/admin/erp-categories/${encodeURIComponent(code)}`, { category, subcategory });
}

/**
 * Refaz a árvore de categorias da loja como cópia da do ERP.
 *
 * Destrutivo: apaga as categorias atuais. Pede `confirmar` explícito porque um
 * clique a mais não pode ser o que esvazia a vitrine.
 */
export function espelharCategoriasDoErp(): Promise<{
  categorias: number; subcategorias: number; amarrados: number;
  orfaos: number; apagadas: number; warnings: string[];
}> {
  return api.post('/admin/erp-categories/espelhar', { confirmar: true });
}

/** Trocar a própria senha exige a atual — a sessão aberta não basta. */
export function changeOwnPassword(currentPassword: string, newPassword: string): Promise<void> {
  return api.put('/admin/me/password', { currentPassword, newPassword });
}
