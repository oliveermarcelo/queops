<?php
/**
 * API pública v1 — para ERP, automações (n8n, Make, Zapier) e integrações
 * próprias. Autentica por chave gerada no painel, em
 * `Authorization: Bearer qp_live_...`, e não usa cookie nem CSRF: é
 * comunicação servidor-a-servidor.
 *
 * Escopo deliberadamente pequeno: ler catálogo, pedidos e clientes, e mudar o
 * status de um pedido. Criar pedido continua sendo caminho do checkout, que
 * recalcula preço e baixa estoque em transação.
 */

declare(strict_types=1);

// A checagem de CSRF do index.php não se aplica: requisições com chave de API
// não carregam cookie de sessão, então não há o que forjar a partir do navegador.

// GET /api/v1/products
if (route('GET', ['v1', 'products'], $segments, $method) !== null) {
    require_api_key();
    json_response(['products' => fetch_products()]);
}

// GET /api/v1/products/{id}
if (($p = route('GET', ['v1', 'products', '*'], $segments, $method)) !== null) {
    require_api_key();
    $row = db_one('SELECT * FROM products WHERE id = ?', [$p[0]]);
    if ($row === null) {
        json_error('Produto não encontrado.', 404, 'not_found');
    }
    json_response(['product' => product_row_to_api($row)]);
}

// PATCH /api/v1/products/{id}/stock — o ERP sincroniza o estoque
if (($p = route('PATCH', ['v1', 'products', '*', 'stock'], $segments, $method)) !== null) {
    require_api_key();
    $stock = body_int(request_body(), 'stock', -1);
    if ($stock < 0) {
        json_error('Informe "stock" como um inteiro não negativo.', 422, 'invalid_stock');
    }
    if (db_run('UPDATE products SET stock = ? WHERE id = ?', [$stock, $p[0]]) === 0) {
        json_error('Produto não encontrado.', 404, 'not_found');
    }
    json_response(['ok' => true, 'id' => $p[0], 'stock' => $stock]);
}

// GET /api/v1/orders?status=&since=
if (route('GET', ['v1', 'orders'], $segments, $method) !== null) {
    require_api_key();

    $where  = [];
    $params = [];
    $status = (string) ($_GET['status'] ?? '');
    if (in_array($status, ['pending', 'paid', 'shipped', 'delivered', 'canceled'], true)) {
        $where[]  = 'status = ?';
        $params[] = $status;
    }
    $since = (string) ($_GET['since'] ?? '');
    if ($since !== '' && strtotime($since) !== false) {
        $where[]  = 'created_at >= ?';
        $params[] = date('Y-m-d H:i:s', (int) strtotime($since));
    }

    $sql = 'SELECT * FROM orders'
        . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
        . ' ORDER BY created_at DESC LIMIT 200';

    $orders = db_all($sql, $params);
    $items  = [];
    if ($orders) {
        $ids = array_column($orders, 'id');
        $ph  = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT * FROM order_items WHERE order_id IN ($ph)", $ids) as $i) {
            $items[$i['order_id']][] = $i;
        }
    }
    json_response([
        'orders' => array_map(
            static fn ($o) => order_row_to_api($o, $items[$o['id']] ?? []),
            $orders
        ),
    ]);
}

// GET /api/v1/orders/{id}
if (($p = route('GET', ['v1', 'orders', '*'], $segments, $method)) !== null) {
    require_api_key();
    $o = db_one('SELECT * FROM orders WHERE id = ?', [$p[0]]);
    if ($o === null) {
        json_error('Pedido não encontrado.', 404, 'not_found');
    }
    $items = db_all('SELECT * FROM order_items WHERE order_id = ?', [$p[0]]);
    json_response(['order' => order_row_to_api($o, $items)]);
}

// PATCH /api/v1/orders/{id} — muda o status (ERP confirmando faturamento/envio)
if (($p = route('PATCH', ['v1', 'orders', '*'], $segments, $method)) !== null) {
    require_api_key();
    $status = body_str(request_body(), 'status', '', 20);
    if (!in_array($status, ['pending', 'paid', 'shipped', 'delivered', 'canceled'], true)) {
        json_error('Status inválido.', 422, 'invalid_status');
    }
    if (db_run('UPDATE orders SET status = ? WHERE id = ?', [$status, $p[0]]) === 0) {
        json_error('Pedido não encontrado.', 404, 'not_found');
    }
    fire_webhooks('order.status_changed', ['orderId' => $p[0], 'status' => $status]);
    json_response(['ok' => true]);
}

// GET /api/v1/customers
if (route('GET', ['v1', 'customers'], $segments, $method) !== null) {
    require_api_key();
    json_response([
        'customers' => array_map(static fn ($c) => [
            'id'          => (string) $c['id'],
            'name'        => $c['name'],
            'email'       => $c['email'],
            'phone'       => $c['phone'],
            'ordersCount' => (int) $c['orders_count'],
            'totalSpent'  => (float) $c['total_spent'],
            'createdAt'   => iso($c['created_at']),
        ], db_all(
            "SELECT c.id, c.name, c.email, c.phone, c.created_at,
                    COUNT(o.id) AS orders_count,
                    COALESCE(SUM(CASE WHEN o.status <> 'canceled' THEN o.total ELSE 0 END), 0) AS total_spent
               FROM customers c
               LEFT JOIN orders o ON o.customer_id = c.id
              GROUP BY c.id, c.name, c.email, c.phone, c.created_at
              ORDER BY c.created_at DESC
              LIMIT 500"
        )),
    ]);
}
