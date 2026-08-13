/**
 * Painel administrativo. Exceto o login, toda rota daqui exige sessão de
 * administrador — `requireAdmin()` interrompe com 401 caso contrário.
 */

import { randomBytes } from 'node:crypto';

import { Router } from 'express';

import { adminLogin, adminLogout, currentAdmin, hashApiToken, requireAdmin } from '../auth.ts';
import { config } from '../config.ts';
import { encryptPayload } from '../crypto.ts';
import { placeholders, q } from '../db.ts';
import { fail } from '../errors.ts';
import { body, bodyBool, bodyFloat, bodyInt, bodyStr, brl, digits, iso, jsonOk } from '../http.ts';
import { fireWebhooks, isInternalHost, providerSendWhatsapp, providerTest } from '../providers.ts';
import {
  configGet, configMerge, configSet, DEFAULT_RECOVERY, DEFAULT_SETTINGS, DEFAULT_SHIPPING,
  fetchIntegrations, fetchOrders, fetchProducts, getRecovery, getSettings, getShipping,
  integrationSecrets, integrationToApi, INTEGRATION_IDS, INTEGRATION_SECRET_FIELDS,
  productRowToApi,
} from '../store.ts';
import { h } from './helpers.ts';

export const adminRoutes = Router();

const STATUS_PEDIDO = ['pending', 'paid', 'shipped', 'delivered', 'canceled'];

const rid = (prefix: string, bytes: number) => prefix + randomBytes(bytes).toString('hex');

// POST /api/admin/login
adminRoutes.post('/login', h(async (req, res) => {
  const b = body(req);
  const user = await adminLogin(req, bodyStr(b, 'email', '', 190), typeof b.password === 'string' ? b.password : '');
  if (user === null) fail('E-mail ou senha inválidos.', 401, 'invalid_credentials');
  jsonOk(res, { admin: { name: user.name, email: user.email } });
}));

// POST /api/admin/logout
adminRoutes.post('/logout', h(async (req, res) => {
  await adminLogout(req);
  jsonOk(res, { ok: true });
}));

// GET /api/admin/me
adminRoutes.get('/me', h(async (req, res) => {
  const a = await currentAdmin(req);
  jsonOk(res, { admin: a ? { name: a.name, email: a.email } : null });
}));

// GET /api/admin/state — estado completo do painel numa requisição
adminRoutes.get('/state', h(async (req, res) => {
  await requireAdmin(req);

  const customers = (
    await q.all(
      `SELECT c.id, c.name, c.email, c.phone, c.created_at,
              COUNT(o.id) AS orders_count,
              COALESCE(SUM(CASE WHEN o.status <> 'canceled' THEN o.total ELSE 0 END), 0) AS total_spent
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id
        GROUP BY c.id, c.name, c.email, c.phone, c.created_at
        ORDER BY total_spent DESC`,
    )
  ).map((c) => ({
    id: String(c.id),
    name: c.name,
    email: c.email,
    phone: c.phone,
    ordersCount: Number(c.orders_count) || 0,
    totalSpent: Number(c.total_spent) || 0,
    createdAt: iso(c.created_at),
  }));

  const carts = await q.all('SELECT * FROM abandoned_carts ORDER BY abandoned_at DESC LIMIT 200');
  const cartItems = new Map<string, unknown[]>();
  if (carts.length) {
    const ids = carts.map((c) => c.id);
    for (const i of await q.all(
      `SELECT * FROM abandoned_cart_items WHERE cart_id IN (${placeholders(ids.length)})`,
      ids,
    )) {
      const key = String(i.cart_id);
      const item = {
        productId: i.product_id,
        name: i.name,
        quantity: Number(i.quantity) || 0,
        unitPrice: Number(i.unit_price) || 0,
      };
      const list = cartItems.get(key);
      if (list) list.push(item);
      else cartItems.set(key, [item]);
    }
  }

  const subs = new Map<string, { id: string; name: string }[]>();
  for (const sub of await q.all('SELECT * FROM subcategories ORDER BY position ASC, name ASC')) {
    const key = String(sub.parent_id);
    const entry = { id: String(sub.id), name: String(sub.name) };
    const list = subs.get(key);
    if (list) list.push(entry);
    else subs.set(key, [entry]);
  }

  jsonOk(res, {
    menu: (await q.all('SELECT * FROM categories ORDER BY position ASC, name ASC')).map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      featured: Boolean(c.featured),
      subcategories: subs.get(String(c.id)) ?? [],
    })),
    products: await fetchProducts(false),
    orders: await fetchOrders(),
    customers,
    coupons: (await q.all('SELECT * FROM coupons ORDER BY created_at DESC')).map((c) => ({
      id: c.id,
      code: c.code,
      type: c.type,
      value: Number(c.value) || 0,
      active: Boolean(c.active),
      minOrder: c.min_order === null ? null : Number(c.min_order),
      expiresAt: c.expires_at === null ? null : String(c.expires_at).slice(0, 10),
      uses: Number(c.uses) || 0,
      maxUses: c.max_uses === null ? null : Number(c.max_uses),
    })),
    settings: await getSettings(),
    shipping: await getShipping(),
    recovery: await getRecovery(),
    integrations: await fetchIntegrations(),
    abandonedCarts: carts.map((c) => ({
      id: c.id,
      customerName: c.customer_name,
      customerEmail: c.customer_email,
      customerPhone: c.customer_phone,
      items: cartItems.get(String(c.id)) ?? [],
      total: Number(c.total) || 0,
      abandonedAt: iso(c.abandoned_at),
      status: c.status,
      remindersSent: Number(c.reminders_sent) || 0,
    })),
    apiKeys: (await q.all('SELECT * FROM api_keys ORDER BY created_at DESC')).map((k) => ({
      id: k.id,
      name: k.name,
      // Só o prefixo volta: o token completo aparece uma única vez, na criação.
      token: String(k.token_prefix) + '••••••••••••',
      createdAt: iso(k.created_at),
      lastUsedAt: iso(k.last_used_at),
      revoked: Boolean(k.revoked),
    })),
    webhooks: (await q.all('SELECT * FROM webhooks ORDER BY created_at DESC')).map((w) => ({
      id: w.id,
      url: w.url,
      event: w.event,
      active: Boolean(w.active),
    })),
  });
}));

// POST /api/admin/products — cria ou atualiza
adminRoutes.post('/products', h(async (req, res) => {
  await requireAdmin(req);
  const b = body(req);
  const id = bodyStr(b, 'id', '', 64) || rid('p-', 6);

  const name = bodyStr(b, 'name', '', 255);
  if (name === '') fail('O produto precisa de um nome.', 422, 'invalid_name');
  const price = bodyFloat(b, 'price');
  if (price < 0) fail('Preço não pode ser negativo.', 422, 'invalid_price');
  const image = bodyStr(b, 'image', '', 500);
  if (image !== '' && !safeImageUrl(image)) fail('Endereço de imagem inválido.', 422, 'invalid_image');

  const atual = await q.one('SELECT active FROM products WHERE id = ?', [id]);

  await q.run(
    `INSERT INTO products (
        id, sku, name, category, subcategory, category_label, description, long_description,
        price, old_price, stock, image, tag, weight, ingredients, highlight, active
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
        sku=VALUES(sku), name=VALUES(name), category=VALUES(category), subcategory=VALUES(subcategory),
        category_label=VALUES(category_label), description=VALUES(description),
        long_description=VALUES(long_description), price=VALUES(price), old_price=VALUES(old_price),
        stock=VALUES(stock), image=VALUES(image), tag=VALUES(tag), weight=VALUES(weight),
        ingredients=VALUES(ingredients), highlight=VALUES(highlight), active=VALUES(active)`,
    [
      id,
      bodyStr(b, 'sku', '', 64),
      name,
      bodyStr(b, 'category', '', 64),
      bodyStr(b, 'subcategory', '', 64) || null,
      bodyStr(b, 'categoryLabel', '', 120),
      bodyStr(b, 'description', '', 2000),
      bodyStr(b, 'longDescription', '', 20000),
      price,
      bodyFloat(b, 'oldPrice', 0) > 0 ? bodyFloat(b, 'oldPrice') : null,
      Math.max(0, bodyInt(b, 'stock')),
      image,
      bodyStr(b, 'tag', '', 40) || null,
      bodyStr(b, 'weight', '', 120),
      bodyStr(b, 'ingredients', '', 2000),
      bodyBool(b, 'highlight') ? 1 : 0,
      // Sem `active` no corpo, mantém o estado atual: salvar uma edição de
      // produto excluído não pode trazê-lo de volta à vitrine.
      bodyBool(b, 'active', atual === null || Boolean(atual.active)) ? 1 : 0,
    ],
  );

  const row = await q.one('SELECT * FROM products WHERE id = ?', [id]);
  jsonOk(res, { product: productRowToApi(row!) });
}));

// DELETE /api/admin/products/:id
adminRoutes.delete('/products/:id', h(async (req, res) => {
  await requireAdmin(req);
  // Soft delete: pedidos antigos continuam mostrando o item corretamente.
  await q.run('UPDATE products SET active = 0 WHERE id = ?', [req.params.id]);
  jsonOk(res, { ok: true });
}));

// PATCH /api/admin/orders/:id
adminRoutes.patch('/orders/:id', h(async (req, res) => {
  await requireAdmin(req);
  const status = bodyStr(body(req), 'status', '', 20);
  if (!STATUS_PEDIDO.includes(status)) fail('Status inválido.', 422, 'invalid_status');
  if ((await q.run('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id])) === 0) {
    fail('Pedido não encontrado.', 404, 'not_found');
  }
  fireWebhooks('order.status_changed', { orderId: req.params.id, status });
  jsonOk(res, { ok: true });
}));

// POST /api/admin/coupons
adminRoutes.post('/coupons', h(async (req, res) => {
  await requireAdmin(req);
  const b = body(req);
  const code = bodyStr(b, 'code', '', 40).toUpperCase();
  if (code === '') fail('Informe o código do cupom.', 422, 'invalid_code');
  const type = bodyStr(b, 'type', 'percent', 10);
  if (!['percent', 'fixed'].includes(type)) fail('Tipo de cupom inválido.', 422, 'invalid_type');
  const value = bodyFloat(b, 'value');
  if (value <= 0 || (type === 'percent' && value > 100)) {
    fail('Valor de desconto inválido.', 422, 'invalid_value');
  }
  const id = bodyStr(b, 'id', '', 40) || rid('c-', 5);

  await q.run(
    `INSERT INTO coupons (id, code, type, value, active, min_order, expires_at, max_uses)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE code=VALUES(code), type=VALUES(type), value=VALUES(value),
        active=VALUES(active), min_order=VALUES(min_order), expires_at=VALUES(expires_at),
        max_uses=VALUES(max_uses)`,
    [
      id, code, type, value, bodyBool(b, 'active', true) ? 1 : 0,
      b.minOrder !== undefined && b.minOrder !== null && Number.isFinite(Number(b.minOrder))
        ? Number(b.minOrder)
        : null,
      bodyStr(b, 'expiresAt', '', 10) || null,
      bodyInt(b, 'maxUses', 0) > 0 ? bodyInt(b, 'maxUses') : null,
    ],
  );
  jsonOk(res, { ok: true, id });
}));

// DELETE /api/admin/coupons/:id
adminRoutes.delete('/coupons/:id', h(async (req, res) => {
  await requireAdmin(req);
  await q.run('DELETE FROM coupons WHERE id = ?', [req.params.id]);
  jsonOk(res, { ok: true });
}));

// PUT /api/admin/settings | shipping | recovery
const CONFIGURAVEIS = {
  settings: DEFAULT_SETTINGS,
  shipping: DEFAULT_SHIPPING,
  recovery: DEFAULT_RECOVERY,
} as const;

for (const key of Object.keys(CONFIGURAVEIS) as (keyof typeof CONFIGURAVEIS)[]) {
  adminRoutes.put(`/${key}`, h(async (req, res) => {
    await requireAdmin(req);
    const def = CONFIGURAVEIS[key] as Record<string, unknown>;
    await configSet(key, configMerge(await configGet(key, def), body(req)));
    jsonOk(res, { [key]: await configGet(key, def) });
  }));
}

// PUT /api/admin/integrations/:id
adminRoutes.put('/integrations/:id', h(async (req, res) => {
  await requireAdmin(req);
  const id = req.params.id;
  if (!(INTEGRATION_IDS as readonly string[]).includes(id)) {
    fail('Integração desconhecida.', 404, 'not_found');
  }
  const b = body(req);

  // Campos em branco preservam o segredo já salvo — o painel nunca recebe o
  // valor de volta, então mandar '' significa "não mexi neste campo".
  const current = await integrationSecrets(id);
  const incoming = b.fields !== null && typeof b.fields === 'object' && !Array.isArray(b.fields)
    ? (b.fields as Record<string, unknown>)
    : {};
  for (const [k, raw] of Object.entries(incoming)) {
    if (raw === null || raw === undefined || typeof raw === 'object') continue;
    const v = String(raw).trim();
    if (v === '' && INTEGRATION_SECRET_FIELDS.includes(k)) continue;
    current[k] = v.slice(0, 2000);
  }

  await q.run(
    `INSERT INTO integrations (id, enabled, fields_enc) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), fields_enc = VALUES(fields_enc)`,
    [id, bodyBool(b, 'enabled') ? 1 : 0, encryptPayload(current)],
  );

  const row = await q.one('SELECT * FROM integrations WHERE id = ?', [id]);
  jsonOk(res, { integration: integrationToApi(row!) });
}));

// POST /api/admin/integrations/:id/test — o handshake acontece aqui, não no navegador
adminRoutes.post('/integrations/:id/test', h(async (req, res) => {
  await requireAdmin(req);
  const id = req.params.id;
  if (!(INTEGRATION_IDS as readonly string[]).includes(id)) {
    fail('Integração desconhecida.', 404, 'not_found');
  }
  const result = await providerTest(id, await integrationSecrets(id));
  await q.run(
    `INSERT INTO integrations (id, last_status, last_checked_at) VALUES (?,?,NOW())
     ON DUPLICATE KEY UPDATE last_status = VALUES(last_status), last_checked_at = NOW()`,
    [id, result.ok ? 'connected' : 'error'],
  );
  jsonOk(res, result);
}));

// POST /api/admin/whatsapp/test — envia uma mensagem de teste pelo provedor ativo
adminRoutes.post('/whatsapp/test', h(async (req, res) => {
  await requireAdmin(req);
  const phone = digits(bodyStr(body(req), 'phone', '', 20));
  if (phone.length < 10) fail('Informe o número com DDI e DDD.', 422, 'invalid_phone');
  jsonOk(res, await providerSendWhatsapp(phone, 'Mensagem de teste — Quéops Pirâmides ✅'));
}));

// PATCH /api/admin/carts/:id — muda o status do carrinho abandonado
adminRoutes.patch('/carts/:id', h(async (req, res) => {
  await requireAdmin(req);
  const status = bodyStr(body(req), 'status', '', 20);
  if (!['open', 'recovered', 'discarded'].includes(status)) fail('Status inválido.', 422, 'invalid_status');
  await q.run('UPDATE abandoned_carts SET status = ? WHERE id = ?', [status, req.params.id]);
  jsonOk(res, { ok: true });
}));

// POST /api/admin/carts/:id/remind — dispara o WhatsApp de recuperação
adminRoutes.post('/carts/:id/remind', h(async (req, res) => {
  await requireAdmin(req);
  const cart = await q.one('SELECT * FROM abandoned_carts WHERE id = ?', [req.params.id]);
  if (cart === null) fail('Carrinho não encontrado.', 404, 'not_found');

  const rec = await getRecovery();
  const msg = String(rec.message)
    .replaceAll('{nome}', String(cart.customer_name || 'tudo bem?'))
    .replaceAll('{valor}', 'R$ ' + brl(Number(cart.total) || 0))
    .replaceAll('{cupom}', String(rec.couponCode ?? ''))
    + config.appUrl;

  const result = await providerSendWhatsapp(String(cart.customer_phone ?? ''), msg);
  if (result.ok) {
    await q.run('UPDATE abandoned_carts SET reminders_sent = reminders_sent + 1 WHERE id = ?', [req.params.id]);
  }
  jsonOk(res, result);
}));

// POST /api/admin/api-keys — devolve o token completo UMA única vez
adminRoutes.post('/api-keys', h(async (req, res) => {
  await requireAdmin(req);
  const name = bodyStr(body(req), 'name', 'Nova chave', 120);
  const token = 'qp_live_' + randomBytes(20).toString('hex');
  const id = rid('k-', 6);

  await q.run('INSERT INTO api_keys (id, name, token_prefix, token_hash) VALUES (?,?,?,?)', [
    id, name, token.slice(0, 16), await hashApiToken(token),
  ]);
  jsonOk(res, { id, name, token }, 201);
}));

// PATCH /api/admin/api-keys/:id — revogar
adminRoutes.patch('/api-keys/:id', h(async (req, res) => {
  await requireAdmin(req);
  await q.run('UPDATE api_keys SET revoked = 1 WHERE id = ?', [req.params.id]);
  jsonOk(res, { ok: true });
}));

// DELETE /api/admin/api-keys/:id
adminRoutes.delete('/api-keys/:id', h(async (req, res) => {
  await requireAdmin(req);
  await q.run('DELETE FROM api_keys WHERE id = ?', [req.params.id]);
  jsonOk(res, { ok: true });
}));

// POST /api/admin/webhooks
adminRoutes.post('/webhooks', h(async (req, res) => {
  await requireAdmin(req);
  const b = body(req);
  const url = bodyStr(b, 'url', '', 500);
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    fail('Informe uma URL http(s) válida.', 422, 'invalid_url');
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    fail('Informe uma URL http(s) válida.', 422, 'invalid_url');
  }
  if (await isInternalHost(parsed.hostname)) {
    fail('Não é possível apontar um webhook para um endereço interno.', 422, 'internal_url');
  }
  const id = rid('wh-', 6);
  await q.run('INSERT INTO webhooks (id, url, event, active) VALUES (?,?,?,1)', [
    id, url, bodyStr(b, 'event', 'order.created', 60),
  ]);
  jsonOk(res, { ok: true, id }, 201);
}));

// DELETE /api/admin/webhooks/:id
adminRoutes.delete('/webhooks/:id', h(async (req, res) => {
  await requireAdmin(req);
  await q.run('DELETE FROM webhooks WHERE id = ?', [req.params.id]);
  jsonOk(res, { ok: true });
}));

/** Aceita apenas http(s), caminho local e data URLs de imagem raster — espelha o safeUrl.ts do front. */
export function safeImageUrl(url: string): boolean {
  if (/^data:image\/(png|jpe?g|gif|webp|avif|bmp|x-icon);base64,/i.test(url)) return true;
  if (/^\/[^/]/.test(url)) return true; // caminho local: /produtos/foo.jpg
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
