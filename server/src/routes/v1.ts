/**
 * API pública v1 — para ERP, automações (n8n, Make, Zapier) e integrações
 * próprias. Autentica por chave gerada no painel, em
 * `Authorization: Bearer qp_live_...`, e não usa cookie nem CSRF: é
 * comunicação servidor-a-servidor, então não há requisição forjada pelo
 * navegador a barrar.
 *
 * Escopo deliberadamente pequeno: ler catálogo, pedidos e clientes, e mudar o
 * status de um pedido. Criar pedido continua sendo caminho do checkout, que
 * recalcula preço e baixa estoque em transação.
 */

import { Router } from 'express';

import { requireApiKey } from '../auth.ts';
import { placeholders, q, type Row } from '../db.ts';
import { fail } from '../errors.ts';
import { body, bodyInt, bodyStr, iso, jsonOk, queryStr } from '../http.ts';
import { fireWebhooks } from '../providers.ts';
import { fetchProducts, orderRowToApi, productRowToApi } from '../store.ts';
import { h } from './helpers.ts';

export const v1Routes = Router();

const STATUS_PEDIDO = ['pending', 'paid', 'shipped', 'delivered', 'canceled'];

// GET /api/v1/products
v1Routes.get('/products', h(async (req, res) => {
  await requireApiKey(req);
  jsonOk(res, { products: await fetchProducts() });
}));

// GET /api/v1/products/:id
v1Routes.get('/products/:id', h(async (req, res) => {
  await requireApiKey(req);
  const row = await q.one('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (row === null) fail('Produto não encontrado.', 404, 'not_found');
  jsonOk(res, { product: productRowToApi(row) });
}));

// PATCH /api/v1/products/:id/stock — o ERP sincroniza o estoque
v1Routes.patch('/products/:id/stock', h(async (req, res) => {
  await requireApiKey(req);
  const stock = bodyInt(body(req), 'stock', -1);
  if (stock < 0) fail('Informe "stock" como um inteiro não negativo.', 422, 'invalid_stock');
  if ((await q.run('UPDATE products SET stock = ? WHERE id = ?', [stock, req.params.id])) === 0) {
    fail('Produto não encontrado.', 404, 'not_found');
  }
  jsonOk(res, { ok: true, id: req.params.id, stock });
}));

// GET /api/v1/orders?status=&since=
v1Routes.get('/orders', h(async (req, res) => {
  await requireApiKey(req);

  const where: string[] = [];
  const params: unknown[] = [];

  const status = queryStr(req, 'status', '', 20);
  if (STATUS_PEDIDO.includes(status)) {
    where.push('status = ?');
    params.push(status);
  }

  const since = queryStr(req, 'since', '', 40);
  if (since !== '') {
    const t = Date.parse(since);
    if (Number.isFinite(t)) {
      // Convertido para a hora de São Paulo, que é o fuso da sessão MySQL.
      where.push('created_at >= ?');
      params.push(new Date(t - 3 * 3_600_000).toISOString().slice(0, 19).replace('T', ' '));
    }
  }

  const orders = await q.all(
    `SELECT * FROM orders${where.length ? ' WHERE ' + where.join(' AND ') : ''}
      ORDER BY created_at DESC LIMIT 200`,
    params,
  );

  const items = new Map<string, Row[]>();
  if (orders.length) {
    const ids = orders.map((o) => o.id);
    for (const i of await q.all(
      `SELECT * FROM order_items WHERE order_id IN (${placeholders(ids.length)}) ORDER BY id ASC`,
      ids,
    )) {
      const key = String(i.order_id);
      const list = items.get(key);
      if (list) list.push(i);
      else items.set(key, [i]);
    }
  }

  jsonOk(res, { orders: orders.map((o) => orderRowToApi(o, items.get(String(o.id)) ?? [])) });
}));

// GET /api/v1/orders/:id
v1Routes.get('/orders/:id', h(async (req, res) => {
  await requireApiKey(req);
  const o = await q.one('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (o === null) fail('Pedido não encontrado.', 404, 'not_found');
  const items = await q.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC', [req.params.id]);
  jsonOk(res, { order: orderRowToApi(o, items) });
}));

// PATCH /api/v1/orders/:id — muda o status (ERP confirmando faturamento/envio)
v1Routes.patch('/orders/:id', h(async (req, res) => {
  await requireApiKey(req);
  const status = bodyStr(body(req), 'status', '', 20);
  if (!STATUS_PEDIDO.includes(status)) fail('Status inválido.', 422, 'invalid_status');
  if ((await q.run('UPDATE orders SET status = ? WHERE id = ?', [status, req.params.id])) === 0) {
    fail('Pedido não encontrado.', 404, 'not_found');
  }
  fireWebhooks('order.status_changed', { orderId: req.params.id, status });
  jsonOk(res, { ok: true });
}));

// GET /api/v1/customers
v1Routes.get('/customers', h(async (req, res) => {
  await requireApiKey(req);
  const rows = await q.all(
    `SELECT c.id, c.name, c.email, c.phone, c.created_at,
            COUNT(o.id) AS orders_count,
            COALESCE(SUM(CASE WHEN o.status <> 'canceled' THEN o.total ELSE 0 END), 0) AS total_spent
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id, c.name, c.email, c.phone, c.created_at
      ORDER BY c.created_at DESC
      LIMIT 500`,
  );
  jsonOk(res, {
    customers: rows.map((c) => ({
      id: String(c.id),
      name: c.name,
      email: c.email,
      phone: c.phone,
      ordersCount: Number(c.orders_count) || 0,
      totalSpent: Number(c.total_spent) || 0,
      createdAt: iso(c.created_at),
    })),
  });
}));
