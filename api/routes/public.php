<?php
/**
 * Rotas públicas da loja: sessão, catálogo, cotação, pedido e carrinho
 * abandonado. Nada aqui exige login — mas nada aqui confia em preço vindo
 * do navegador.
 */

declare(strict_types=1);

// GET /api/session — token CSRF + quem está logado (loja e painel)
if (route('GET', ['session'], $segments, $method) !== null) {
    $admin = current_admin();
    json_response([
        'csrfToken' => csrf_token(),
        'admin'     => $admin ? ['name' => $admin['name'], 'email' => $admin['email']] : null,
        'customer'  => current_customer_id() !== null,
    ]);
}

// GET /api/catalog — tudo que a vitrine precisa em uma requisição só
if (route('GET', ['catalog'], $segments, $method) !== null) {
    $parents = db_all('SELECT * FROM categories ORDER BY position ASC, name ASC');

    $children = [];
    foreach (db_all('SELECT * FROM subcategories ORDER BY position ASC, name ASC') as $s) {
        $children[$s['parent_id']][] = ['id' => $s['id'], 'name' => $s['name']];
    }

    json_response([
        'products'   => fetch_products(),
        'categories' => array_map(static fn ($c) => [
            'id'          => $c['id'],
            'name'        => $c['name'],
            'description' => $c['description'],
        ], $parents),
        'menu'       => array_map(static fn ($c) => [
            'id'            => $c['id'],
            'name'          => $c['name'],
            'icon'          => $c['icon'],
            'featured'      => (bool) $c['featured'],
            'subcategories' => $children[$c['id']] ?? [],
        ], $parents),
        'settings'   => public_settings(),
    ]);
}

// GET /api/products
if (route('GET', ['products'], $segments, $method) !== null) {
    json_response(['products' => fetch_products()]);
}

// GET /api/products/{id}
if (($p = route('GET', ['products', '*'], $segments, $method)) !== null) {
    $row = db_one('SELECT * FROM products WHERE id = ? AND active = 1', [$p[0]]);
    if ($row === null) {
        json_error('Produto não encontrado.', 404, 'not_found');
    }
    json_response(['product' => product_row_to_api($row)]);
}

// POST /api/checkout/quote — prévia de frete/cupom/total (sem gravar nada)
if (route('POST', ['checkout', 'quote'], $segments, $method) !== null) {
    $b = request_body();
    json_response(quote_cart(
        is_array($b['items'] ?? null) ? $b['items'] : [],
        body_str($b, 'state', '', 2),
        body_str($b, 'cep', '', 12),
        body_str($b, 'coupon', '', 40),
        body_str($b, 'payment', 'card', 10)
    ));
}

// POST /api/orders — cria o pedido de verdade
if (route('POST', ['orders'], $segments, $method) !== null) {
    $b = request_body();

    $name  = body_str($b, 'name', '', 160);
    $email = mb_strtolower(body_str($b, 'email', '', 190));
    $phone = body_str($b, 'phone', '', 30);
    $cpf   = body_str($b, 'cpf', '', 20);
    $payment = body_str($b, 'payment', 'pix', 10);

    if ($name === '')                                  json_error('Informe o nome completo.', 422, 'invalid_name');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL))    json_error('Informe um e-mail válido.', 422, 'invalid_email');
    if (strlen(preg_replace('/\D/', '', $phone) ?? '') < 10) json_error('Informe um telefone com DDD.', 422, 'invalid_phone');
    if (!valid_cpf($cpf))                              json_error('CPF inválido.', 422, 'invalid_cpf');
    if (!in_array($payment, ['card', 'pix', 'boleto'], true)) json_error('Forma de pagamento inválida.', 422, 'invalid_payment');
    // Respeita o que está habilitado no painel: esconder o boleto na tela não
    // adianta se a API continuar aceitando um pedido com boleto.
    if (empty(get_settings()['payments'][$payment])) {
        json_error('Esta forma de pagamento não está disponível.', 422, 'payment_disabled');
    }

    $addr = is_array($b['address'] ?? null) ? $b['address'] : [];
    $cep   = body_str($addr, 'cep', '', 12);
    $uf    = strtoupper(body_str($addr, 'state', 'SP', 2));
    if (normalize_cep($cep) === '')                    json_error('Informe um CEP válido com 8 dígitos.', 422, 'invalid_cep');
    if (body_str($addr, 'street') === '' || body_str($addr, 'number') === '' || body_str($addr, 'city') === '') {
        json_error('Preencha rua, número e cidade.', 422, 'invalid_address');
    }

    // O total é recalculado aqui — o valor que veio do navegador é ignorado.
    $quote = quote_cart(
        is_array($b['items'] ?? null) ? $b['items'] : [],
        $uf,
        $cep,
        body_str($b, 'coupon', '', 40),
        $payment
    );
    if (!$quote['items']) {
        json_error('A sua sacola está vazia ou os itens não estão mais disponíveis.', 422, 'empty_cart');
    }

    $pdo = db();
    $pdo->beginTransaction();
    try {
        /*
         * Vínculo com o cliente.
         *
         * Se houver sessão, é o próprio dono da conta: pode atualizar o
         * cadastro. Sem sessão (compra como visitante), o pedido é apenas
         * ASSOCIADO ao cadastro existente daquele e-mail — nada do perfil é
         * sobrescrito. Caso contrário, quem soubesse o e-mail de um cliente
         * conseguiria trocar nome, CPF, telefone e endereço padrão dele
         * apenas finalizando um pedido.
         */
        $customerId = current_customer_id();
        $isOwner    = $customerId !== null;

        if ($isOwner) {
            db_run('UPDATE customers SET name = ?, phone = ?, cpf = ? WHERE id = ?', [$name, $phone, $cpf, $customerId]);
        } else {
            $existing = db_one('SELECT id FROM customers WHERE email = ?', [$email]);
            if ($existing) {
                $customerId = (int) $existing['id'];
            } else {
                db_run('INSERT INTO customers (name, email, phone, cpf) VALUES (?, ?, ?, ?)', [$name, $email, $phone, $cpf]);
                $customerId = (int) $pdo->lastInsertId();
            }
        }

        $orderId = 'QP-' . str_pad((string) next_counter('order'), 6, '0', STR_PAD_LEFT);
        $etaDays = delivery_days_for($uf);

        db_run(
            'INSERT INTO orders (
                id, customer_id, customer_name, customer_email, customer_phone, customer_cpf,
                subtotal, shipping_cost, discount, total, coupon_code, status, payment, channel,
                ship_cep, ship_street, ship_number, ship_complement, ship_neighborhood, ship_city, ship_state,
                delivery_eta
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
            [
                $orderId, $customerId, $name, $email, $phone, $cpf,
                $quote['subtotal'], $quote['shipping'], $quote['discount'], $quote['total'],
                $quote['couponCode'], 'pending', $payment, 'site',
                $cep, body_str($addr, 'street', '', 160), body_str($addr, 'number', '', 20),
                body_str($addr, 'complement', '', 120), body_str($addr, 'neighborhood', '', 120),
                body_str($addr, 'city', '', 120), $uf,
                (new DateTimeImmutable("+{$etaDays} days"))->format('Y-m-d'),
            ]
        );

        foreach ($quote['items'] as $it) {
            db_run(
                'INSERT INTO order_items (order_id, product_id, name, quantity, unit_price) VALUES (?,?,?,?,?)',
                [$orderId, $it['productId'], $it['name'], $it['quantity'], $it['unitPrice']]
            );
            // Baixa de estoque com trava no próprio UPDATE: nunca fica negativo,
            // mesmo com dois pedidos simultâneos do último item.
            $affected = db_run(
                'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
                [$it['quantity'], $it['productId'], $it['quantity']]
            );
            if ($affected === 0) {
                throw new RuntimeException('Estoque insuficiente para ' . $it['name']);
            }
        }

        if ($quote['couponCode'] !== null) {
            // O UPDATE condicional é a própria checagem do limite: se outro
            // pedido consumiu a última utilização entre a cotação e agora,
            // nenhuma linha é afetada e a transação inteira é desfeita.
            $usado = db_run(
                'UPDATE coupons SET uses = uses + 1
                  WHERE code = ? AND active = 1
                    AND (max_uses IS NULL OR uses < max_uses)',
                [$quote['couponCode']]
            );
            if ($usado === 0) {
                throw new RuntimeException('Cupom esgotado: ' . $quote['couponCode']);
            }
        }

        // O endereço só entra na agenda de quem está logado. O endereço de
        // entrega do pedido fica gravado no próprio pedido, de qualquer forma.
        if ($isOwner) {
            db_run('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [$customerId]);
            db_run(
                'INSERT INTO customer_addresses
                   (customer_id, label, cep, street, number, complement, neighborhood, city, state, is_default)
                 VALUES (?,?,?,?,?,?,?,?,?,1)',
                [
                    $customerId, 'Principal', $cep, body_str($addr, 'street', '', 160),
                    body_str($addr, 'number', '', 20), body_str($addr, 'complement', '', 120),
                    body_str($addr, 'neighborhood', '', 120), body_str($addr, 'city', '', 120), $uf,
                ]
            );
        }

        $pdo->commit();
    } catch (Throwable $e) {
        $pdo->rollBack();
        error_log('[queops] falha ao gravar pedido: ' . $e->getMessage());
        json_error('Não foi possível concluir o pedido. Confira o estoque e tente de novo.', 409, 'order_failed');
    }

    // Marca como recuperado qualquer carrinho abandonado deste e-mail.
    db_run("UPDATE abandoned_carts SET status = 'recovered' WHERE customer_email = ? AND status = 'open'", [$email]);

    fire_webhooks('order.created', ['orderId' => $orderId, 'total' => $quote['total'], 'email' => $email]);

    json_response([
        'order' => [
            'id'           => $orderId,
            'customerName' => $name,
            'total'        => $quote['total'],
            'subtotal'     => $quote['subtotal'],
            'shipping'     => $quote['shipping'],
            'discount'     => $quote['discount'],
            'payment'      => $payment,
            'deliveryEta'  => (new DateTimeImmutable("+{$etaDays} days"))->format('d/m/Y'),
        ],
    ], 201);
}

// POST /api/carts/abandoned — registra a sacola para recuperação
if (route('POST', ['carts', 'abandoned'], $segments, $method) !== null) {
    $b     = request_body();
    $email = mb_strtolower(body_str($b, 'email', '', 190));
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
        json_error('E-mail inválido.', 422, 'invalid_email');
    }
    $quote = quote_cart(is_array($b['items'] ?? null) ? $b['items'] : [], '', '', '', 'card');
    if (!$quote['items']) {
        json_response(['ok' => true, 'skipped' => true]);
    }

    // Um carrinho aberto por e-mail: atualiza em vez de acumular lixo.
    $existing = db_one("SELECT id FROM abandoned_carts WHERE customer_email = ? AND status = 'open'", [$email]);
    $cartId = $existing['id'] ?? ('AC-' . str_pad((string) next_counter('cart'), 5, '0', STR_PAD_LEFT));

    if ($existing) {
        db_run('UPDATE abandoned_carts SET customer_name = ?, customer_phone = ?, total = ?, abandoned_at = NOW() WHERE id = ?', [
            body_str($b, 'name', '', 160), body_str($b, 'phone', '', 30), $quote['subtotal'], $cartId,
        ]);
        db_run('DELETE FROM abandoned_cart_items WHERE cart_id = ?', [$cartId]);
    } else {
        db_run('INSERT INTO abandoned_carts (id, customer_name, customer_email, customer_phone, total) VALUES (?,?,?,?,?)', [
            $cartId, body_str($b, 'name', '', 160), $email, body_str($b, 'phone', '', 30), $quote['subtotal'],
        ]);
    }
    foreach ($quote['items'] as $it) {
        db_run('INSERT INTO abandoned_cart_items (cart_id, product_id, name, quantity, unit_price) VALUES (?,?,?,?,?)', [
            $cartId, $it['productId'], $it['name'], $it['quantity'], $it['unitPrice'],
        ]);
    }
    json_response(['ok' => true, 'cartId' => $cartId]);
}

/** Validação de CPF com os dois dígitos verificadores. */
function valid_cpf(string $value): bool
{
    $cpf = preg_replace('/\D/', '', $value) ?? '';
    if (strlen($cpf) !== 11 || preg_match('/^(\d)\1{10}$/', $cpf)) {
        return false;
    }
    for ($t = 9; $t < 11; $t++) {
        $sum = 0;
        for ($i = 0; $i < $t; $i++) {
            $sum += (int) $cpf[$i] * ($t + 1 - $i);
        }
        $check = ($sum * 10) % 11;
        if ($check === 10) {
            $check = 0;
        }
        if ($check !== (int) $cpf[$t]) {
            return false;
        }
    }
    return true;
}
