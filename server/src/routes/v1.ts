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
import { gravarProdutoDoErp } from '../erp-produtos.ts';
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

/**
 * PUT /api/v1/products/:id — o ERP grava o produto (cria ou atualiza).
 *
 * Aceita o MESMO formato que a leitura devolve, o que permite ao ERP ler um
 * item, mudar um campo e devolver o objeto. Só os campos presentes no corpo são
 * tocados: `{"price": 10}` muda o preço e não zera o resto.
 *
 * Responde 200 mesmo quando algum campo é recusado por estar travado no painel
 * — `applied` e `ignored` dizem o que aconteceu. Ver o comentário em
 * `erp-produtos.ts`: recusar a requisição inteira faria o ERP repetir para
 * sempre, e responder 200 mudo faria ele acreditar que aplicou.
 */
v1Routes.put('/products/:id', h(async (req, res) => {
  await requireApiKey(req);
  const resultado = await gravarProdutoDoErp(String(req.params.id ?? ''), body(req));
  if (!resultado.ok) {
    fail(
      resultado.error?.message ?? 'Não foi possível gravar o produto.',
      422,
      resultado.error?.code ?? 'invalid_product',
    );
  }
  jsonOk(res, resultado, resultado.criado ? 201 : 200);
}));

/**
 * POST /api/v1/products/batch — vários produtos numa chamada.
 *
 * Com mais de mil itens no catálogo, uma requisição por produto transforma um
 * ciclo de sincronização em milhares de chamadas. Aqui vão até 200 por vez.
 *
 * Um item inválido NÃO derruba o lote: cada produto tem o seu resultado. Abortar
 * tudo por causa de um faria o ERP reenviar as gravações que já tinham dado
 * certo — e a repetição esconderia qual era o item ruim.
 */
v1Routes.post('/products/batch', h(async (req, res) => {
  await requireApiKey(req);
  const b = body(req);
  const lista = Array.isArray(b.products) ? b.products : null;
  if (lista === null) fail('Envie {"products": [...]}.', 422, 'invalid_batch');
  if (lista.length === 0) fail('A lista está vazia.', 422, 'invalid_batch');
  if (lista.length > LOTE_MAXIMO) {
    fail(`Máximo de ${LOTE_MAXIMO} produtos por chamada.`, 422, 'batch_too_large');
  }

  const resultados = [];
  for (const bruto of lista) {
    if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) {
      resultados.push({
        id: '', ok: false, criado: false, applied: [], ignored: [], warnings: [],
        error: { code: 'invalid_product', message: 'Cada item precisa ser um objeto.' },
      });
      continue;
    }
    const dto = bruto as Record<string, unknown>;
    resultados.push(await gravarProdutoDoErp(String(dto.id ?? ''), dto));
  }

  jsonOk(res, {
    total: resultados.length,
    gravados: resultados.filter((r) => r.ok).length,
    falhas: resultados.filter((r) => !r.ok).length,
    results: resultados,
  });
}));

/**
 * Teto por chamada em lote: alto o bastante para um catálogo inteiro em poucas
 * chamadas, baixo o bastante para a requisição não estourar tempo nem memória.
 */
const LOTE_MAXIMO = 200;

/**
 * PATCH /api/v1/products/:id/stock — o ERP sincroniza o estoque.
 *
 * Atalho para o caminho de gravação acima, mantido porque já está em uso: o
 * valor é absoluto (saldo, não variação), o que torna a chamada idempotente.
 * Passa pela MESMA regra de travas — estoque ajustado à mão no painel não é
 * sobrescrito, e a resposta diz quando isso aconteceu.
 */
v1Routes.patch('/products/:id/stock', h(async (req, res) => {
  await requireApiKey(req);
  const id = String(req.params.id ?? '');
  const stock = bodyInt(body(req), 'stock', -1);
  if (stock < 0) fail('Informe "stock" como um inteiro não negativo.', 422, 'invalid_stock');

  // Este endpoint não cria produto: id desconhecido é 404, como sempre foi.
  if ((await q.one('SELECT id FROM products WHERE id = ?', [id])) === null) {
    fail('Produto não encontrado.', 404, 'not_found');
  }

  const r = await gravarProdutoDoErp(id, { stock });
  jsonOk(res, {
    ok: true,
    id,
    stock,
    applied: r.applied,
    ignored: r.ignored,
    warnings: r.warnings,
  });
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
