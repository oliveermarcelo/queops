<?php
/**
 * Área do cliente: cadastro, login com senha real, perfil, endereços e
 * histórico de pedidos vindo do banco.
 */

declare(strict_types=1);

function customer_payload(int $id): array
{
    $c = db_one('SELECT id, name, email, phone, cpf FROM customers WHERE id = ?', [$id]);
    if ($c === null) {
        json_error('Conta não encontrada.', 404, 'not_found');
    }

    $addresses = array_map(static fn ($a) => [
        'id'           => (string) $a['id'],
        'label'        => $a['label'],
        'cep'          => $a['cep'],
        'street'       => $a['street'],
        'number'       => $a['number'],
        'complement'   => $a['complement'],
        'neighborhood' => $a['neighborhood'],
        'city'         => $a['city'],
        'state'        => $a['state'],
        'isDefault'    => (bool) $a['is_default'],
    ], db_all('SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC', [$id]));

    $orders = db_all('SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50', [$id]);
    $orderPayload = [];
    foreach ($orders as $o) {
        $items = db_all('SELECT name, quantity, unit_price FROM order_items WHERE order_id = ?', [$o['id']]);
        $orderPayload[] = [
            'id'     => $o['id'],
            'date'   => iso($o['created_at']),
            'status' => $o['status'],
            'total'  => (float) $o['total'],
            'items'  => array_map(static fn ($i) => [
                'name'      => $i['name'],
                'quantity'  => (int) $i['quantity'],
                'unitPrice' => (float) $i['unit_price'],
            ], $items),
        ];
    }

    return [
        'name'      => $c['name'],
        'email'     => $c['email'],
        'phone'     => $c['phone'],
        'cpf'       => $c['cpf'],
        'addresses' => $addresses,
        'orders'    => $orderPayload,
        'favorites' => array_column(
            db_all('SELECT product_id FROM customer_favorites WHERE customer_id = ?', [$id]),
            'product_id'
        ),
    ];
}

// POST /api/account/register
if (route('POST', ['account', 'register'], $segments, $method) !== null) {
    $b     = request_body();
    $name  = body_str($b, 'name', '', 160);
    $email = mb_strtolower(body_str($b, 'email', '', 190));
    $pass  = (string) ($b['password'] ?? '');

    if ($name === '')                               json_error('Informe o seu nome.', 422, 'invalid_name');
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) json_error('Informe um e-mail válido.', 422, 'invalid_email');
    if (mb_strlen($pass) < 8)                       json_error('A senha precisa ter pelo menos 8 caracteres.', 422, 'weak_password');

    /*
     * Qualquer cadastro pré-existente com este e-mail bloqueia o registro,
     * inclusive o de quem comprou como visitante (senha nula).
     *
     * Deixar o visitante "assumir" o próprio cadastro parece conveniente, mas
     * como não há confirmação de e-mail, bastava saber o endereço de alguém
     * para criar uma senha e receber CPF, telefone, endereço e o histórico de
     * pedidos daquela pessoa. Definir senha para um cadastro existente só é
     * seguro depois de um link de confirmação enviado por e-mail.
     */
    if (db_one('SELECT id FROM customers WHERE email = ?', [$email]) !== null) {
        json_error(
            'Já existe cadastro com este e-mail. Faça login ou fale com a loja para recuperar o acesso.',
            409,
            'email_taken'
        );
    }

    db_run('INSERT INTO customers (name, email, password_hash) VALUES (?,?,?)', [$name, $email, password_hash($pass, PASSWORD_DEFAULT)]);
    $id = (int) db()->lastInsertId();

    customer_login_session($id);
    json_response(['account' => customer_payload($id)], 201);
}

// POST /api/account/login
if (route('POST', ['account', 'login'], $segments, $method) !== null) {
    $b     = request_body();
    $email = mb_strtolower(body_str($b, 'email', '', 190));
    $pass  = (string) ($b['password'] ?? '');

    assert_login_allowed('customer', $email);
    $c = db_one('SELECT id, password_hash FROM customers WHERE email = ?', [$email]);
    $hash = $c['password_hash'] ?? '$2y$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
    $ok = $c !== null && $c['password_hash'] !== null && password_verify($pass, $hash);

    record_login_attempt('customer', $email, $ok);
    if (!$ok) {
        json_error('E-mail ou senha inválidos.', 401, 'invalid_credentials');
    }

    customer_login_session((int) $c['id']);
    json_response(['account' => customer_payload((int) $c['id'])]);
}

// POST /api/account/logout
if (route('POST', ['account', 'logout'], $segments, $method) !== null) {
    customer_logout();
    json_response(['ok' => true]);
}

// GET /api/account
if (route('GET', ['account'], $segments, $method) !== null) {
    $id = current_customer_id();
    json_response(['account' => $id === null ? null : customer_payload($id)]);
}

// PUT /api/account — dados pessoais e endereço padrão
if (route('PUT', ['account'], $segments, $method) !== null) {
    $id = require_customer();
    $b  = request_body();

    $name  = body_str($b, 'name', '', 160);
    $phone = body_str($b, 'phone', '', 30);
    $cpf   = body_str($b, 'cpf', '', 20);
    if ($cpf !== '' && !valid_cpf($cpf)) {
        json_error('CPF inválido.', 422, 'invalid_cpf');
    }
    db_run('UPDATE customers SET name = COALESCE(NULLIF(?, \'\'), name), phone = ?, cpf = ? WHERE id = ?', [$name, $phone, $cpf, $id]);

    if (is_array($b['address'] ?? null)) {
        $a = $b['address'];
        db_run('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [$id]);
        $addrId = body_str($a, 'id', '', 20);
        $params = [
            body_str($a, 'label', 'Principal', 60), body_str($a, 'cep', '', 12),
            body_str($a, 'street', '', 160), body_str($a, 'number', '', 20),
            body_str($a, 'complement', '', 120), body_str($a, 'neighborhood', '', 120),
            body_str($a, 'city', '', 120), strtoupper(body_str($a, 'state', 'SP', 2)),
        ];
        $exists = $addrId !== '' && ctype_digit($addrId)
            ? db_one('SELECT id FROM customer_addresses WHERE id = ? AND customer_id = ?', [$addrId, $id])
            : null;
        if ($exists) {
            db_run('UPDATE customer_addresses SET label=?, cep=?, street=?, number=?, complement=?, neighborhood=?, city=?, state=?, is_default=1 WHERE id = ? AND customer_id = ?', [...$params, $addrId, $id]);
        } else {
            db_run('INSERT INTO customer_addresses (label, cep, street, number, complement, neighborhood, city, state, is_default, customer_id) VALUES (?,?,?,?,?,?,?,?,1,?)', [...$params, $id]);
        }
    }

    json_response(['account' => customer_payload($id)]);
}

// ---------------------------------------------------------------- endereços ----

// POST /api/account/addresses — novo endereço
if (route('POST', ['account', 'addresses'], $segments, $method) !== null) {
    $id = require_customer();
    $a  = request_body();
    if (body_bool($a, 'isDefault')) {
        db_run('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [$id]);
    }
    db_run(
        'INSERT INTO customer_addresses
            (customer_id, label, cep, street, number, complement, neighborhood, city, state, is_default)
         VALUES (?,?,?,?,?,?,?,?,?,?)',
        [
            $id, body_str($a, 'label', 'Endereço', 60), body_str($a, 'cep', '', 12),
            body_str($a, 'street', '', 160), body_str($a, 'number', '', 20),
            body_str($a, 'complement', '', 120), body_str($a, 'neighborhood', '', 120),
            body_str($a, 'city', '', 120), strtoupper(body_str($a, 'state', 'SP', 2)),
            body_bool($a, 'isDefault') ? 1 : 0,
        ]
    );
    json_response(['account' => customer_payload($id)], 201);
}

// PUT /api/account/addresses/{id}
if (($p = route('PUT', ['account', 'addresses', '*'], $segments, $method)) !== null) {
    $id = require_customer();
    $a  = request_body();
    // O WHERE inclui customer_id: ninguém edita endereço de outra conta.
    $owned = db_one('SELECT id FROM customer_addresses WHERE id = ? AND customer_id = ?', [$p[0], $id]);
    if ($owned === null) {
        json_error('Endereço não encontrado.', 404, 'not_found');
    }
    if (body_bool($a, 'isDefault')) {
        db_run('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [$id]);
    }
    db_run(
        'UPDATE customer_addresses
            SET label=?, cep=?, street=?, number=?, complement=?, neighborhood=?, city=?, state=?, is_default=?
          WHERE id = ? AND customer_id = ?',
        [
            body_str($a, 'label', 'Endereço', 60), body_str($a, 'cep', '', 12),
            body_str($a, 'street', '', 160), body_str($a, 'number', '', 20),
            body_str($a, 'complement', '', 120), body_str($a, 'neighborhood', '', 120),
            body_str($a, 'city', '', 120), strtoupper(body_str($a, 'state', 'SP', 2)),
            body_bool($a, 'isDefault') ? 1 : 0, $p[0], $id,
        ]
    );
    json_response(['account' => customer_payload($id)]);
}

// DELETE /api/account/addresses/{id}
if (($p = route('DELETE', ['account', 'addresses', '*'], $segments, $method)) !== null) {
    $id = require_customer();
    db_run('DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?', [$p[0], $id]);
    json_response(['account' => customer_payload($id)]);
}

// PUT /api/account/favorites — lista completa de ids favoritos
if (route('PUT', ['account', 'favorites'], $segments, $method) !== null) {
    $id  = require_customer();
    $b   = request_body();
    $ids = array_values(array_unique(array_filter(
        array_map(static fn ($v) => is_string($v) ? mb_substr($v, 0, 100) : '', (array) ($b['favorites'] ?? [])),
        static fn ($v) => $v !== ''
    )));

    db_run('DELETE FROM customer_favorites WHERE customer_id = ?', [$id]);
    foreach (array_slice($ids, 0, 300) as $pid) {
        db_run('INSERT IGNORE INTO customer_favorites (customer_id, product_id) VALUES (?,?)', [$id, $pid]);
    }
    json_response(['account' => customer_payload($id)]);
}
