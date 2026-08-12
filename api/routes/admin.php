<?php
/**
 * Painel administrativo. Exceto o login, toda rota daqui exige sessão de
 * administrador — `require_admin()` interrompe com 401 caso contrário.
 */

declare(strict_types=1);

// POST /api/admin/login
if (route('POST', ['admin', 'login'], $segments, $method) !== null) {
    $b = request_body();
    $user = admin_login(body_str($b, 'email', '', 190), (string) ($b['password'] ?? ''));
    if ($user === null) {
        json_error('E-mail ou senha inválidos.', 401, 'invalid_credentials');
    }
    json_response(['admin' => ['name' => $user['name'], 'email' => $user['email']]]);
}

// POST /api/admin/logout
if (route('POST', ['admin', 'logout'], $segments, $method) !== null) {
    admin_logout();
    json_response(['ok' => true]);
}

// GET /api/admin/me
if (route('GET', ['admin', 'me'], $segments, $method) !== null) {
    $a = current_admin();
    json_response(['admin' => $a ? ['name' => $a['name'], 'email' => $a['email']] : null]);
}

// GET /api/admin/state — estado completo do painel numa requisição
if (route('GET', ['admin', 'state'], $segments, $method) !== null) {
    require_admin();

    $orders = fetch_orders();

    $customers = array_map(static fn ($c) => [
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
          ORDER BY total_spent DESC"
    ));

    $carts = db_all('SELECT * FROM abandoned_carts ORDER BY abandoned_at DESC LIMIT 200');
    $cartItems = [];
    if ($carts) {
        $ids = array_column($carts, 'id');
        $ph  = implode(',', array_fill(0, count($ids), '?'));
        foreach (db_all("SELECT * FROM abandoned_cart_items WHERE cart_id IN ($ph)", $ids) as $i) {
            $cartItems[$i['cart_id']][] = [
                'productId' => $i['product_id'],
                'name'      => $i['name'],
                'quantity'  => (int) $i['quantity'],
                'unitPrice' => (float) $i['unit_price'],
            ];
        }
    }

    $subs = [];
    foreach (db_all('SELECT * FROM subcategories ORDER BY position ASC, name ASC') as $sub) {
        $subs[$sub['parent_id']][] = ['id' => $sub['id'], 'name' => $sub['name']];
    }

    json_response([
        'menu' => array_map(static fn ($c) => [
            'id'            => $c['id'],
            'name'          => $c['name'],
            'icon'          => $c['icon'],
            'featured'      => (bool) $c['featured'],
            'subcategories' => $subs[$c['id']] ?? [],
        ], db_all('SELECT * FROM categories ORDER BY position ASC, name ASC')),
        'products'  => fetch_products(false),
        'orders'    => $orders,
        'customers' => $customers,
        'coupons'   => array_map(static fn ($c) => [
            'id'        => $c['id'],
            'code'      => $c['code'],
            'type'      => $c['type'],
            'value'     => (float) $c['value'],
            'active'    => (bool) $c['active'],
            'minOrder'  => $c['min_order'] === null ? null : (float) $c['min_order'],
            'expiresAt' => $c['expires_at'],
            'uses'      => (int) $c['uses'],
            'maxUses'   => $c['max_uses'] === null ? null : (int) $c['max_uses'],
        ], db_all('SELECT * FROM coupons ORDER BY created_at DESC')),
        'settings'       => get_settings(),
        'shipping'       => get_shipping(),
        'recovery'       => get_recovery(),
        'integrations'   => fetch_integrations(),
        'abandonedCarts' => array_map(static fn ($c) => [
            'id'            => $c['id'],
            'customerName'  => $c['customer_name'],
            'customerEmail' => $c['customer_email'],
            'customerPhone' => $c['customer_phone'],
            'items'         => $cartItems[$c['id']] ?? [],
            'total'         => (float) $c['total'],
            'abandonedAt'   => iso($c['abandoned_at']),
            'status'        => $c['status'],
            'remindersSent' => (int) $c['reminders_sent'],
        ], $carts),
        'apiKeys' => array_map(static fn ($k) => [
            'id'         => $k['id'],
            'name'       => $k['name'],
            // Só o prefixo volta: o token completo aparece uma única vez, na criação.
            'token'      => $k['token_prefix'] . '••••••••••••',
            'createdAt'  => iso($k['created_at']),
            'lastUsedAt' => iso($k['last_used_at']),
            'revoked'    => (bool) $k['revoked'],
        ], db_all('SELECT * FROM api_keys ORDER BY created_at DESC')),
        'webhooks' => array_map(static fn ($w) => [
            'id'     => $w['id'],
            'url'    => $w['url'],
            'event'  => $w['event'],
            'active' => (bool) $w['active'],
        ], db_all('SELECT * FROM webhooks ORDER BY created_at DESC')),
    ]);
}

// POST /api/admin/products — cria ou atualiza
if (route('POST', ['admin', 'products'], $segments, $method) !== null) {
    require_admin();
    $b  = request_body();
    $id = body_str($b, 'id', '', 64);
    if ($id === '') {
        $id = 'p-' . bin2hex(random_bytes(6));
    }
    $name = body_str($b, 'name', '', 255);
    if ($name === '') {
        json_error('O produto precisa de um nome.', 422, 'invalid_name');
    }
    $price = body_float($b, 'price');
    if ($price < 0) {
        json_error('Preço não pode ser negativo.', 422, 'invalid_price');
    }
    $image = body_str($b, 'image', '', 500);
    if ($image !== '' && !safe_image_url($image)) {
        json_error('Endereço de imagem inválido.', 422, 'invalid_image');
    }

    $atual = db_one('SELECT active FROM products WHERE id = ?', [$id]);

    db_run(
        'INSERT INTO products (
            id, sku, name, category, subcategory, category_label, description, long_description,
            price, old_price, stock, image, tag, weight, ingredients, highlight, active
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE
            sku=VALUES(sku), name=VALUES(name), category=VALUES(category), subcategory=VALUES(subcategory),
            category_label=VALUES(category_label), description=VALUES(description),
            long_description=VALUES(long_description), price=VALUES(price), old_price=VALUES(old_price),
            stock=VALUES(stock), image=VALUES(image), tag=VALUES(tag), weight=VALUES(weight),
            ingredients=VALUES(ingredients), highlight=VALUES(highlight), active=VALUES(active)',
        [
            $id,
            body_str($b, 'sku', '', 64),
            $name,
            body_str($b, 'category', '', 64),
            body_str($b, 'subcategory', '', 64) ?: null,
            body_str($b, 'categoryLabel', '', 120),
            body_str($b, 'description', '', 2000),
            body_str($b, 'longDescription', '', 20000),
            $price,
            isset($b['oldPrice']) && is_numeric($b['oldPrice']) && (float) $b['oldPrice'] > 0 ? (float) $b['oldPrice'] : null,
            max(0, body_int($b, 'stock')),
            $image,
            body_str($b, 'tag', '', 40) ?: null,
            body_str($b, 'weight', '', 120),
            body_str($b, 'ingredients', '', 2000),
            body_bool($b, 'highlight') ? 1 : 0,
            // Sem `active` no corpo, mantém o estado atual: salvar uma edição
            // de produto excluído não pode trazê-lo de volta à vitrine.
            body_bool($b, 'active', $atual === null || (bool) $atual['active']) ? 1 : 0,
        ]
    );

    $row = db_one('SELECT * FROM products WHERE id = ?', [$id]);
    json_response(['product' => product_row_to_api($row)]);
}

// DELETE /api/admin/products/{id}
if (($p = route('DELETE', ['admin', 'products', '*'], $segments, $method)) !== null) {
    require_admin();
    // Soft delete: pedidos antigos continuam mostrando o item corretamente.
    db_run('UPDATE products SET active = 0 WHERE id = ?', [$p[0]]);
    json_response(['ok' => true]);
}

// PATCH /api/admin/orders/{id}
if (($p = route('PATCH', ['admin', 'orders', '*'], $segments, $method)) !== null) {
    require_admin();
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

// POST /api/admin/coupons
if (route('POST', ['admin', 'coupons'], $segments, $method) !== null) {
    require_admin();
    $b    = request_body();
    $code = mb_strtoupper(body_str($b, 'code', '', 40));
    if ($code === '') {
        json_error('Informe o código do cupom.', 422, 'invalid_code');
    }
    $type = body_str($b, 'type', 'percent', 10);
    if (!in_array($type, ['percent', 'fixed'], true)) {
        json_error('Tipo de cupom inválido.', 422, 'invalid_type');
    }
    $value = body_float($b, 'value');
    if ($value <= 0 || ($type === 'percent' && $value > 100)) {
        json_error('Valor de desconto inválido.', 422, 'invalid_value');
    }
    $id = body_str($b, 'id', '', 40) ?: ('c-' . bin2hex(random_bytes(5)));

    db_run(
        'INSERT INTO coupons (id, code, type, value, active, min_order, expires_at, max_uses)
         VALUES (?,?,?,?,?,?,?,?)
         ON DUPLICATE KEY UPDATE code=VALUES(code), type=VALUES(type), value=VALUES(value),
            active=VALUES(active), min_order=VALUES(min_order), expires_at=VALUES(expires_at),
            max_uses=VALUES(max_uses)',
        [
            $id, $code, $type, $value, body_bool($b, 'active', true) ? 1 : 0,
            isset($b['minOrder']) && is_numeric($b['minOrder']) ? (float) $b['minOrder'] : null,
            body_str($b, 'expiresAt', '', 10) ?: null,
            isset($b['maxUses']) && is_numeric($b['maxUses']) && (int) $b['maxUses'] > 0 ? (int) $b['maxUses'] : null,
        ]
    );
    json_response(['ok' => true, 'id' => $id]);
}

// DELETE /api/admin/coupons/{id}
if (($p = route('DELETE', ['admin', 'coupons', '*'], $segments, $method)) !== null) {
    require_admin();
    db_run('DELETE FROM coupons WHERE id = ?', [$p[0]]);
    json_response(['ok' => true]);
}

// PUT /api/admin/settings | shipping | recovery
foreach (['settings' => DEFAULT_SETTINGS, 'shipping' => DEFAULT_SHIPPING, 'recovery' => DEFAULT_RECOVERY] as $key => $default) {
    if (route('PUT', ['admin', $key], $segments, $method) !== null) {
        require_admin();
        $patch = request_body();
        config_set($key, config_merge(config_get($key, $default), $patch));
        json_response([$key => config_get($key, $default)]);
    }
}

// PUT /api/admin/integrations/{id}
if (($p = route('PUT', ['admin', 'integrations', '*'], $segments, $method)) !== null) {
    require_admin();
    $id = $p[0];
    if (!in_array($id, INTEGRATION_IDS, true)) {
        json_error('Integração desconhecida.', 404, 'not_found');
    }
    $b = request_body();

    // Campos em branco preservam o segredo já salvo — o painel nunca recebe o
    // valor de volta, então mandar '' significa "não mexi neste campo".
    $current = integration_secrets($id);
    $incoming = is_array($b['fields'] ?? null) ? $b['fields'] : [];
    foreach ($incoming as $k => $v) {
        if (!is_string($k) || !is_scalar($v)) {
            continue;
        }
        $v = trim((string) $v);
        if ($v === '' && in_array($k, INTEGRATION_SECRET_FIELDS, true)) {
            continue;
        }
        $current[$k] = mb_substr($v, 0, 2000);
    }

    db_run(
        'INSERT INTO integrations (id, enabled, fields_enc) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), fields_enc = VALUES(fields_enc)',
        [$id, body_bool($b, 'enabled') ? 1 : 0, encrypt_payload($current)]
    );

    $row = db_one('SELECT * FROM integrations WHERE id = ?', [$id]);
    json_response(['integration' => integration_to_api($row)]);
}

// POST /api/admin/integrations/{id}/test — o handshake acontece aqui, não no navegador
if (($p = route('POST', ['admin', 'integrations', '*', 'test'], $segments, $method)) !== null) {
    require_admin();
    $id = $p[0];
    if (!in_array($id, INTEGRATION_IDS, true)) {
        json_error('Integração desconhecida.', 404, 'not_found');
    }
    $result = provider_test($id, integration_secrets($id));
    db_run(
        'INSERT INTO integrations (id, last_status, last_checked_at) VALUES (?,?,NOW())
         ON DUPLICATE KEY UPDATE last_status = VALUES(last_status), last_checked_at = NOW()',
        [$id, $result['ok'] ? 'connected' : 'error']
    );
    json_response($result);
}

// POST /api/admin/whatsapp/test — envia uma mensagem de teste pelo provedor ativo
if (route('POST', ['admin', 'whatsapp', 'test'], $segments, $method) !== null) {
    require_admin();
    $phone = preg_replace('/\D/', '', body_str(request_body(), 'phone', '', 20)) ?? '';
    if (strlen($phone) < 10) {
        json_error('Informe o número com DDI e DDD.', 422, 'invalid_phone');
    }
    json_response(provider_send_whatsapp($phone, 'Mensagem de teste — Quéops Pirâmides ✅'));
}

// PATCH /api/admin/carts/{id} — muda o status do carrinho abandonado
if (($p = route('PATCH', ['admin', 'carts', '*'], $segments, $method)) !== null) {
    require_admin();
    $status = body_str(request_body(), 'status', '', 20);
    if (!in_array($status, ['open', 'recovered', 'discarded'], true)) {
        json_error('Status inválido.', 422, 'invalid_status');
    }
    db_run('UPDATE abandoned_carts SET status = ? WHERE id = ?', [$status, $p[0]]);
    json_response(['ok' => true]);
}

// POST /api/admin/carts/{id}/remind — dispara o WhatsApp de recuperação
if (($p = route('POST', ['admin', 'carts', '*', 'remind'], $segments, $method)) !== null) {
    require_admin();
    $cart = db_one('SELECT * FROM abandoned_carts WHERE id = ?', [$p[0]]);
    if ($cart === null) {
        json_error('Carrinho não encontrado.', 404, 'not_found');
    }
    $rec = get_recovery();
    $msg = strtr($rec['message'], [
        '{nome}'  => $cart['customer_name'] ?: 'tudo bem?',
        '{valor}' => 'R$ ' . number_format((float) $cart['total'], 2, ',', '.'),
        '{cupom}' => $rec['couponCode'],
    ]) . (app_config()['app_url'] ?? '');

    $res = provider_send_whatsapp($cart['customer_phone'], $msg);
    if ($res['ok']) {
        db_run('UPDATE abandoned_carts SET reminders_sent = reminders_sent + 1 WHERE id = ?', [$p[0]]);
    }
    json_response($res);
}

// POST /api/admin/api-keys — devolve o token completo UMA única vez
if (route('POST', ['admin', 'api-keys'], $segments, $method) !== null) {
    require_admin();
    $name  = body_str(request_body(), 'name', 'Nova chave', 120);
    $token = 'qp_live_' . bin2hex(random_bytes(20));
    $id    = 'k-' . bin2hex(random_bytes(6));

    db_run(
        'INSERT INTO api_keys (id, name, token_prefix, token_hash) VALUES (?,?,?,?)',
        [$id, $name, substr($token, 0, 16), password_hash($token, PASSWORD_DEFAULT)]
    );
    json_response(['id' => $id, 'name' => $name, 'token' => $token], 201);
}

// PATCH /api/admin/api-keys/{id} — revogar
if (($p = route('PATCH', ['admin', 'api-keys', '*'], $segments, $method)) !== null) {
    require_admin();
    db_run('UPDATE api_keys SET revoked = 1 WHERE id = ?', [$p[0]]);
    json_response(['ok' => true]);
}

// DELETE /api/admin/api-keys/{id}
if (($p = route('DELETE', ['admin', 'api-keys', '*'], $segments, $method)) !== null) {
    require_admin();
    db_run('DELETE FROM api_keys WHERE id = ?', [$p[0]]);
    json_response(['ok' => true]);
}

// POST /api/admin/webhooks
if (route('POST', ['admin', 'webhooks'], $segments, $method) !== null) {
    require_admin();
    $b   = request_body();
    $url = body_str($b, 'url', '', 500);
    if (!filter_var($url, FILTER_VALIDATE_URL) || !preg_match('#^https?://#i', $url)) {
        json_error('Informe uma URL http(s) válida.', 422, 'invalid_url');
    }
    if (is_internal_host((string) (parse_url($url, PHP_URL_HOST) ?: ''))) {
        json_error('Não é possível apontar um webhook para um endereço interno.', 422, 'internal_url');
    }
    $id = 'wh-' . bin2hex(random_bytes(6));
    db_run('INSERT INTO webhooks (id, url, event, active) VALUES (?,?,?,1)', [$id, $url, body_str($b, 'event', 'order.created', 60)]);
    json_response(['ok' => true, 'id' => $id], 201);
}

// DELETE /api/admin/webhooks/{id}
if (($p = route('DELETE', ['admin', 'webhooks', '*'], $segments, $method)) !== null) {
    require_admin();
    db_run('DELETE FROM webhooks WHERE id = ?', [$p[0]]);
    json_response(['ok' => true]);
}

/** Aceita apenas http(s) e data URLs de imagem raster — espelha o safeUrl.ts do front. */
function safe_image_url(string $url): bool
{
    if (preg_match('#^data:image/(png|jpe?g|gif|webp|avif|bmp|x-icon);base64,#i', $url)) {
        return true;
    }
    if (preg_match('#^/[^/]#', $url)) {
        return true; // caminho local: /produtos/foo.jpg
    }
    return (bool) preg_match('#^https?://#i', $url) && filter_var($url, FILTER_VALIDATE_URL) !== false;
}
