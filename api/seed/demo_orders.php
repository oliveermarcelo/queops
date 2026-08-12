<?php
/**
 * Histórico de exemplo — só roda com `--demo`.
 *
 * Serve para apresentar o dashboard com curva de faturamento antes de a loja
 * ter vendas reais. Numa loja em produção, NÃO use esta opção.
 */

declare(strict_types=1);

function seed_demo_orders(callable $say): void
{
    if ((int) (db_one("SELECT COUNT(*) AS n FROM orders WHERE id LIKE 'QPD-%'")['n'] ?? 0) > 0) {
        $say('Pedidos de demonstração já existem — nada a fazer.');
        return;
    }

    $products = db_all('SELECT id, name, price FROM products WHERE active = 1 ORDER BY position LIMIT 20');
    if (!$products) {
        $say('Sem produtos: pule o --demo até importar o catálogo.');
        return;
    }

    $pool = [
        ['Maria Oliveira', 'maria.oliveira@email.com'],
        ['João Santos', 'joao.santos@email.com'],
        ['Ana Costa', 'ana.costa@email.com'],
        ['Pedro Lima', 'pedro.lima@email.com'],
        ['Espaço Terapêutico Luz Interior', 'compras@luzinterior.com.br'],
        ['Carla Mendes', 'carla.mendes@email.com'],
        ['Loja Caminho de Cristal', 'contato@caminhodecristal.com.br'],
        ['Lucas Ferreira', 'lucas.ferreira@email.com'],
        ['Juliana Prado', 'juliana.prado@email.com'],
        ['Terapias Harmonia Zen', 'pedidos@harmoniazen.com.br'],
    ];
    $statuses = ['paid', 'shipped', 'delivered', 'delivered', 'delivered', 'pending', 'canceled'];
    $payments = ['card', 'pix', 'boleto'];
    $channels = ['site', 'whatsapp', 'erp'];

    // PRNG determinístico: rodar de novo gera exatamente os mesmos números.
    $seed = 20240601;
    $rng = static function () use (&$seed): float {
        $seed = ($seed * 1103515245 + 12345) & 0x7FFFFFFF;
        return $seed / 0x7FFFFFFF;
    };

    $pdo = db();
    $pdo->beginTransaction();

    $customerIds = [];
    foreach ($pool as [$name, $mail]) {
        $row = db_one('SELECT id FROM customers WHERE email = ?', [$mail]);
        if ($row) {
            $customerIds[$mail] = (int) $row['id'];
        } else {
            db_run('INSERT INTO customers (name, email, phone) VALUES (?,?,?)', [$name, $mail, '11999990000']);
            $customerIds[$mail] = (int) $pdo->lastInsertId();
        }
    }

    $count = 140;
    for ($i = 0; $i < $count; $i++) {
        // Distribuição enviesada para os dias recentes (curva de crescimento).
        $daysAgo = (int) floor($rng() ** 1.6 * 180);
        $date = (new DateTimeImmutable("-{$daysAgo} days"))
            ->setTime((int) floor($rng() * 24), (int) floor($rng() * 60));

        [$name, $mail] = $pool[(int) floor($rng() * count($pool))];
        $orderId = 'QPD-' . str_pad((string) (1000 + $i), 6, '0', STR_PAD_LEFT);

        $items = [];
        $subtotal = 0.0;
        $n = 1 + (int) floor($rng() * 3);
        for ($j = 0; $j < $n; $j++) {
            $p = $products[(int) floor($rng() * count($products))];
            $q = 1 + (int) floor($rng() * 3);
            $items[] = [$p['id'], $p['name'], $q, (float) $p['price']];
            $subtotal += $q * (float) $p['price'];
        }
        $subtotal = round($subtotal, 2);
        $ship = $subtotal >= 199 ? 0.0 : 19.9;

        db_run(
            'INSERT INTO orders (id, customer_id, customer_name, customer_email, customer_phone,
                subtotal, shipping_cost, discount, total, status, payment, channel, ship_state, created_at)
             VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?)',
            [
                $orderId, $customerIds[$mail], $name, $mail, '11999990000',
                $subtotal, $ship, round($subtotal + $ship, 2),
                $statuses[(int) floor($rng() * count($statuses))],
                $payments[(int) floor($rng() * 3)],
                $channels[(int) floor($rng() * 3)],
                'SP', $date->format('Y-m-d H:i:s'),
            ]
        );
        foreach ($items as [$pid, $pname, $q, $price]) {
            db_run('INSERT INTO order_items (order_id, product_id, name, quantity, unit_price) VALUES (?,?,?,?,?)', [$orderId, $pid, $pname, $q, $price]);
        }
    }

    // Alguns carrinhos abandonados para a tela de recuperação.
    $samples = [
        ['Fernanda Alves', '5511988887777', 'fernanda@email.com', 2],
        ['Ricardo Souza', '5511977776666', 'ricardo@email.com', 8],
        ['Loja Caminho de Cristal', '5511966665555', 'contato@caminhodecristal.com.br', 26],
        ['Juliana Prado', '5511955554444', 'juliana@email.com', 50],
    ];
    foreach ($samples as $k => [$nm, $phone, $mail, $hours]) {
        $cartId = 'ACD-' . str_pad((string) ($k + 1), 4, '0', STR_PAD_LEFT);
        $p = $products[$k % count($products)];
        $qty = ($k % 2) + 1;
        db_run(
            'INSERT INTO abandoned_carts (id, customer_name, customer_email, customer_phone, total, abandoned_at)
             VALUES (?,?,?,?,?,?)',
            [$cartId, $nm, $mail, $phone, round($qty * (float) $p['price'], 2), (new DateTimeImmutable("-{$hours} hours"))->format('Y-m-d H:i:s')]
        );
        db_run('INSERT INTO abandoned_cart_items (cart_id, product_id, name, quantity, unit_price) VALUES (?,?,?,?,?)', [$cartId, $p['id'], $p['name'], $qty, (float) $p['price']]);
    }

    $pdo->commit();
    $say("Histórico de demonstração criado: {$count} pedidos e 4 carrinhos abandonados.");
}
