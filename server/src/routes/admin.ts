/**
 * Painel administrativo. Exceto o login, toda rota daqui exige sessão de
 * administrador — `requireAdmin()` interrompe com 401 caso contrário.
 */

import { randomBytes } from 'node:crypto';

import { Router } from 'express';

import {
  adminLogin, adminLogout, assertLoginAllowed, currentAdmin, hashApiToken, hashPassword,
  recordLoginAttempt, requireAdmin, verifyPassword,
} from '../auth.ts';
import { config } from '../config.ts';
import { encryptPayload } from '../crypto.ts';
import { placeholders, q, type Row } from '../db.ts';
import { fail } from '../errors.ts';
import {
  amarrarCategoria, erpCategoriaParaApi, produtosSemCategoria,
} from '../erp-categorias.ts';
import { destravarCampos, travarCamposEditados } from '../erp-produtos.ts';
import {
  body, bodyBool, bodyFloat, bodyInt, bodyStr, brl, digits, iso, jsonOk, queryStr,
} from '../http.ts';
import { fireWebhooks, isInternalHost, providerSendWhatsapp, providerTest } from '../providers.ts';
import {
  configGet, configMerge, configSet, DEFAULT_RECOVERY, DEFAULT_SETTINGS, DEFAULT_SHIPPING,
  fetchIntegrations, fetchOrders, fetchProducts, getRecovery, getSettings, getShipping,
  integrationSecrets, integrationToApi, INTEGRATION_IDS, INTEGRATION_SECRET_FIELDS,
  productRowToApi,
} from '../store.ts';
import {
  emailValido, motivoParaNaoDesativar, nomeValido, normalizarEmail, problemaNaSenha,
} from '../usuarios.ts';
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
  const eu = await requireAdmin(req);

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
    // O painel vê tudo: inativo e sem categoria também — é ele quem resolve.
    products: await fetchProducts({ onlyActive: false }),
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
    users: await listaDeUsuarios(eu.id),
    // Categorias que o ERP mandou, com o estado da amarração.
    erpCategories: (await q.all('SELECT * FROM erp_categories ORDER BY name ASC'))
      .map(erpCategoriaParaApi),
    productsWithoutCategory: await produtosSemCategoria(),
  });
}));

/**
 * PUT /api/admin/erp-categories/:code — amarra um código do ERP.
 *
 * É aqui que a decisão "amarração manual" acontece de verdade. `category:
 * null` desamarra: o código volta a ser pendente, e produto que chegar com ele
 * volta a ficar fora da vitrine.
 */
adminRoutes.put('/erp-categories/:code', h(async (req, res) => {
  await requireAdmin(req);
  const b = body(req);
  const categoria = b.category === null || b.category === undefined
    ? null
    : bodyStr(b, 'category', '', 100);
  const sub = b.subcategory === null || b.subcategory === undefined
    ? null
    : bodyStr(b, 'subcategory', '', 100);

  const erro = await amarrarCategoria(String(req.params.code ?? ''), categoria, sub);
  if (erro !== '') fail(erro, 422, 'invalid_link');

  jsonOk(res, {
    ok: true,
    erpCategories: (await q.all('SELECT * FROM erp_categories ORDER BY name ASC'))
      .map(erpCategoriaParaApi),
    productsWithoutCategory: await produtosSemCategoria(),
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

  const atual = await q.one('SELECT * FROM products WHERE id = ?', [id]);

  await q.run(
    `INSERT INTO products (
        id, sku, name, category, subcategory, category_label, description, long_description,
        price, old_price, stock, image, tag, weight_kg, weight, ingredients, highlight, active
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
        sku=VALUES(sku), name=VALUES(name), category=VALUES(category), subcategory=VALUES(subcategory),
        category_label=VALUES(category_label), description=VALUES(description),
        long_description=VALUES(long_description), price=VALUES(price), old_price=VALUES(old_price),
        stock=VALUES(stock), image=VALUES(image), tag=VALUES(tag), weight_kg=VALUES(weight_kg),
        weight=VALUES(weight),
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
      // Saldo pode ter fração (o ERP trabalha assim); 3 casas, como a coluna.
      Math.max(0, Math.round(bodyFloat(b, 'stock') * 1000) / 1000),
      image,
      bodyStr(b, 'tag', '', 40) || null,
      // Peso em quilos, numérico — o que o frete usa.
      Math.max(0, Math.round(bodyFloat(b, 'weight') * 1000) / 1000),
      // Rótulo de medida da vitrine, texto.
      bodyStr(b, 'weightLabel', '', 120),
      bodyStr(b, 'ingredients', '', 2000),
      bodyBool(b, 'highlight') ? 1 : 0,
      // Sem `active` no corpo, mantém o estado atual: salvar uma edição de
      // produto excluído não pode trazê-lo de volta à vitrine.
      bodyBool(b, 'active', atual === null || Boolean(atual.active)) ? 1 : 0,
    ],
  );

  /*
   * O QUE FOI EDITADO AQUI PASSA A RESISTIR AO ERP.
   *
   * O cliente pediu duas coisas que se contradizem sem um mecanismo: o ERP é a
   * fonte da verdade de preço e estoque, E o painel precisa poder alterar. A
   * saída é a trava por campo — o que a lojista muda aqui entra em
   * `locked_fields` e o próximo ciclo do ERP ignora aquele campo (ver
   * erp-produtos.ts). Sem isto, a correção feita à mão volta sozinha e a
   * conclusão de quem cuida da loja é "o site está com defeito".
   *
   * A comparação é por VALOR, não por presença: o painel envia o produto
   * inteiro a cada salvamento, então tratar tudo como edição travaria o
   * cadastro completo no primeiro clique — e o ERP nunca mais atualizaria nada.
   */
  const travados = await travarCamposEditados(id, b, atual);

  const row = await q.one('SELECT * FROM products WHERE id = ?', [id]);
  jsonOk(res, { product: productRowToApi(row!), lockedFields: travados });
}));

/**
 * DELETE /api/admin/products/:id/locks — o produto volta a seguir o ERP.
 *
 * Sem uma forma de soltar, a trava vira armadilha: um preço ajustado numa
 * promoção de um dia congelaria para sempre, e ninguém lembraria o motivo meses
 * depois. `?fields=price,stock` solta só os informados; sem parâmetro, solta
 * todos.
 */
adminRoutes.delete('/products/:id/locks', h(async (req, res) => {
  await requireAdmin(req);
  const pedidos = queryStr(req, 'fields', '', 255)
    .split(',').map((x) => x.trim()).filter((x) => x !== '');
  const restantes = await destravarCampos(
    String(req.params.id ?? ''),
    pedidos.length > 0 ? pedidos : null,
  );
  jsonOk(res, { ok: true, lockedFields: restantes });
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

/**
 * GET /api/admin/melhorenvio/servicos — transportadoras que a conta oferece.
 *
 * A lista sai de uma COTAÇÃO de amostra, não de um catálogo: é a mesma chamada
 * que o checkout faz, então o que aparece aqui é o que o cliente vai ver. Um
 * catálogo listaria serviço que, na prática, não cota para a rota — e a lojista
 * marcaria uma transportadora que nunca apareceria na loja.
 *
 * Os serviços que falharam vêm junto, com o motivo, em vez de sumirem: "a Loggi
 * não aparece" é uma pergunta pior do que "Loggi: não atende este CEP".
 */
adminRoutes.get('/melhorenvio/servicos', h(async (req, res) => {
  await requireAdmin(req);
  const { credsFrom, amostraDeServicos, servicosSelecionados } = await import('../melhorenvio.ts');
  const creds = credsFrom(await integrationSecrets('melhorenvio'));

  if (creds.token === '') {
    jsonOk(res, { opcoes: [], selecionados: [], erro: 'Cadastre o token do Melhor Envio e salve.' });
    return;
  }
  if (creds.originCep.length !== 8) {
    jsonOk(res, {
      opcoes: [],
      selecionados: [],
      erro: 'Preencha o CEP de origem e salve: sem ele o Melhor Envio não cota nada.',
    });
    return;
  }

  const { opcoes, erro } = await amostraDeServicos(creds);
  jsonOk(res, { opcoes, selecionados: servicosSelecionados(creds), erro });
}));

// POST /api/admin/whatsapp/test — envia uma mensagem de teste pelo provedor ativo
adminRoutes.post('/whatsapp/test', h(async (req, res) => {
  await requireAdmin(req);
  const phone = digits(bodyStr(body(req), 'phone', '', 20));
  if (phone.length < 10) fail('Informe o número com DDI e DDD.', 422, 'invalid_phone');
  jsonOk(res, await providerSendWhatsapp(phone, 'Mensagem de teste — Quéops Pirâmides ✅'));
}));

/*
 * PUT /api/admin/orders/:id/tracking — grava o código de rastreio do pedido.
 *
 * A consulta aos Correios não acontece aqui: quem quiser o status chama o GET
 * abaixo. Assim salvar o código continua rápido mesmo com a API instável.
 */
adminRoutes.put('/orders/:id/tracking', h(async (req, res) => {
  await requireAdmin(req);
  const code = bodyStr(body(req), 'trackingCode', '', 40).trim().toUpperCase().replace(/\s/g, '');
  if (code !== '' && !/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(code)) {
    fail('Código de rastreio inválido (formato AA123456789BR).', 422, 'invalid_tracking');
  }
  const existe = await q.one('SELECT id FROM orders WHERE id = ?', [req.params.id]);
  if (!existe) fail('Pedido não encontrado.', 404, 'not_found');
  await q.run(
    "UPDATE orders SET tracking_code = ?, tracking_status = '', tracking_at = NULL WHERE id = ?",
    [code, req.params.id],
  );
  jsonOk(res, { trackingCode: code });
}));

// GET /api/admin/orders/:id/tracking — consulta os Correios e guarda o último status
adminRoutes.get('/orders/:id/tracking', h(async (req, res) => {
  await requireAdmin(req);
  const row = await q.one('SELECT tracking_code FROM orders WHERE id = ?', [req.params.id]);
  if (!row) fail('Pedido não encontrado.', 404, 'not_found');

  const code = String(row.tracking_code ?? '');
  if (code === '') jsonOk(res, { trackingCode: '', eventos: [], erro: 'Pedido sem código de rastreio.' });

  const { credsFrom, rastrear } = await import('../correios.ts');
  const { eventos, erro } = await rastrear(credsFrom(await integrationSecrets('correios')), code);

  if (erro === '' && eventos.length > 0) {
    await q.run(
      'UPDATE orders SET tracking_status = ?, tracking_at = NOW() WHERE id = ?',
      [eventos[0].descricao.slice(0, 190), req.params.id],
    );
  }
  jsonOk(res, { trackingCode: code, eventos, erro });
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

// ------------------------------------------------- usuários do painel ----

/**
 * Quem entra no painel.
 *
 * Antes disso, criar um acesso exigia SSH e `node migrate.js --admin-email=…`.
 * Na prática significava que a loja tinha um único usuário e que a senha dele
 * circulava entre as pessoas que precisavam trabalhar — o pior dos dois mundos,
 * porque ninguém pode ser removido sem trocar a senha de todos.
 *
 * Todo usuário criado aqui tem acesso total, como o dono. Foi decisão do dono
 * da loja, e vale saber o que ela implica: qualquer um deles pode ver as
 * credenciais das integrações, gerar chave de API — que hoje dá acesso a CPF de
 * cliente — e criar outros usuários. É acesso de confiança total, não de
 * funcionário. Se um dia precisar de níveis, a coluna `role` já existe.
 */
function usuarioParaApi(r: Row, euId: number): Record<string, unknown> {
  return {
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    active: Boolean(r.active),
    lastLoginAt: iso(r.last_login_at),
    createdAt: iso(r.created_at),
    // Quem é você na lista. A tela usa isso para não oferecer botão que a rota
    // vai recusar (desativar a si mesmo) — o servidor recusa de todo jeito.
    isYou: Number(r.id) === euId,
  };
}

async function listaDeUsuarios(euId: number): Promise<Record<string, unknown>[]> {
  const rows = await q.all(
    `SELECT id, name, email, active, last_login_at, created_at
       FROM admin_users ORDER BY active DESC, name ASC`,
  );
  return rows.map((r) => usuarioParaApi(r, euId));
}

// GET /api/admin/users
adminRoutes.get('/users', h(async (req, res) => {
  const eu = await requireAdmin(req);
  jsonOk(res, { users: await listaDeUsuarios(eu.id) });
}));

// POST /api/admin/users — cria um acesso ao painel
adminRoutes.post('/users', h(async (req, res) => {
  const eu = await requireAdmin(req);
  const b = body(req);

  const nome = nomeValido(bodyStr(b, 'name', '', 160));
  if (nome === '') fail('Informe o nome da pessoa (pelo menos 2 letras).', 422, 'invalid_name');

  const email = normalizarEmail(bodyStr(b, 'email', '', 190));
  if (!emailValido(email)) fail('Informe um e-mail válido.', 422, 'invalid_email');

  const senha = typeof b.password === 'string' ? b.password : '';
  const problema = problemaNaSenha(senha, email);
  if (problema !== '') fail(problema, 422, 'invalid_password');

  const jaExiste = await q.one('SELECT id, active FROM admin_users WHERE email = ?', [email]);
  if (jaExiste !== null) {
    // Mensagem diferente para conta desativada: sem isso, o dono cria de novo,
    // recebe "já existe" e não descobre que a conta está ali, só desligada.
    fail(
      Boolean(jaExiste.active)
        ? 'Já existe um usuário com este e-mail.'
        : 'Já existe um usuário com este e-mail, desativado. Reative-o em vez de criar outro.',
      409,
      'email_taken',
    );
  }

  await q.run(
    'INSERT INTO admin_users (name, email, password_hash, role, active) VALUES (?,?,?,?,1)',
    [nome, email, await hashPassword(senha), 'admin'],
  );
  // O id vem de uma consulta, e não de `lastId()`: no pool cada chamada pode
  // pegar outra conexão, e `LAST_INSERT_ID()` é por conexão — devolveria o id
  // de um insert de outra requisição.
  const criado = await q.one('SELECT id FROM admin_users WHERE email = ?', [email]);

  jsonOk(res, {
    ok: true,
    id: String(criado?.id ?? ''),
    users: await listaDeUsuarios(eu.id),
  }, 201);
}));

/**
 * PATCH /api/admin/users/:id — nome, e-mail, ativar/desativar e senha.
 *
 * A senha do PRÓPRIO usuário não passa por aqui: trocar a sua exige a atual
 * (rota /me/password). Aqui é o caso "esqueci a senha do João" — quem já tem
 * acesso total ao painel define uma nova para ele.
 */
adminRoutes.patch('/users/:id', h(async (req, res) => {
  const eu = await requireAdmin(req);
  const alvoId = Number(req.params.id);
  if (!Number.isInteger(alvoId) || alvoId <= 0) fail('Usuário não encontrado.', 404, 'not_found');

  const alvo = await q.one('SELECT * FROM admin_users WHERE id = ?', [alvoId]);
  if (alvo === null) fail('Usuário não encontrado.', 404, 'not_found');

  const b = body(req);
  const campos: string[] = [];
  const valores: unknown[] = [];

  if (b.name !== undefined) {
    const nome = nomeValido(bodyStr(b, 'name', '', 160));
    if (nome === '') fail('Informe o nome da pessoa (pelo menos 2 letras).', 422, 'invalid_name');
    campos.push('name = ?');
    valores.push(nome);
  }

  if (b.email !== undefined) {
    const email = normalizarEmail(bodyStr(b, 'email', '', 190));
    if (!emailValido(email)) fail('Informe um e-mail válido.', 422, 'invalid_email');
    const outro = await q.one('SELECT id FROM admin_users WHERE email = ? AND id <> ?', [email, alvoId]);
    if (outro !== null) fail('Já existe um usuário com este e-mail.', 409, 'email_taken');
    campos.push('email = ?');
    valores.push(email);
  }

  if (b.password !== undefined) {
    if (alvoId === eu.id) {
      fail(
        'Para trocar a sua própria senha, informe a senha atual (use "Trocar minha senha").',
        422,
        'own_password',
      );
    }
    const senha = typeof b.password === 'string' ? b.password : '';
    const problema = problemaNaSenha(senha, String(alvo.email));
    if (problema !== '') fail(problema, 422, 'invalid_password');
    campos.push('password_hash = ?');
    valores.push(await hashPassword(senha));
  }

  if (b.active !== undefined) {
    const ativar = bodyBool(b, 'active', true);
    if (!ativar) {
      const n = await q.one('SELECT COUNT(*) AS n FROM admin_users WHERE active = 1');
      const motivo = motivoParaNaoDesativar({
        alvoId,
        atorId: eu.id,
        ativasAgora: Number(n?.n ?? 0),
      });
      if (motivo !== '') fail(motivo, 422, 'would_lock_out');
    }
    campos.push('active = ?');
    valores.push(ativar ? 1 : 0);
  }

  if (campos.length === 0) fail('Nada para alterar.', 422, 'nothing_to_update');

  valores.push(alvoId);
  await q.run(`UPDATE admin_users SET ${campos.join(', ')} WHERE id = ?`, valores);
  jsonOk(res, { ok: true, users: await listaDeUsuarios(eu.id) });
}));

/**
 * PUT /api/admin/me/password — trocar a própria senha.
 *
 * Exige a senha atual mesmo com a sessão aberta: sem isso, um notebook
 * desbloqueado por dois minutos vira uma conta roubada em definitivo.
 */
adminRoutes.put('/me/password', h(async (req, res) => {
  const eu = await requireAdmin(req);
  const b = body(req);

  const atual = typeof b.currentPassword === 'string' ? b.currentPassword : '';
  const nova = typeof b.newPassword === 'string' ? b.newPassword : '';

  const row = await q.one('SELECT password_hash FROM admin_users WHERE id = ?', [eu.id]);
  if (row === null) fail('Sessão inválida. Entre de novo.', 401, 'unauthenticated');

  await assertLoginAllowed(req, 'admin', eu.email);
  const confere = await verifyPassword(atual, String(row.password_hash));
  await recordLoginAttempt(req, 'admin', eu.email, confere);
  if (!confere) fail('A senha atual está incorreta.', 401, 'invalid_credentials');

  const problema = problemaNaSenha(nova, eu.email);
  if (problema !== '') fail(problema, 422, 'invalid_password');
  if (atual === nova) fail('A nova senha é igual à atual.', 422, 'same_password');

  await q.run('UPDATE admin_users SET password_hash = ? WHERE id = ?', [await hashPassword(nova), eu.id]);
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
