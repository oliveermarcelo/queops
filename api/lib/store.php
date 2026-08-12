<?php
/**
 * Configurações da loja e conversão entre linhas do banco e o formato que o
 * front-end consome (mesmos nomes de campo dos tipos TypeScript).
 */

declare(strict_types=1);

const DEFAULT_SETTINGS = [
    'name'                  => 'Quéops Pirâmides',
    'email'                 => 'contato@queopspiramides.com.br',
    'phone'                 => '(11) 0000-0000',
    'whatsapp'              => '5511000000000',
    'pixDiscountPct'        => 5.0,
    'payments'              => ['card' => true, 'pix' => true, 'boleto' => true],
];

const DEFAULT_SHIPPING = [
    'defaultPrice' => 24.9,
    'perState'     => [
        'SP' => 14.9, 'RJ' => 19.9, 'MG' => 19.9, 'ES' => 22.9,
        'PR' => 24.9, 'SC' => 24.9, 'RS' => 27.9, 'DF' => 22.9,
    ],
    'cepRanges'    => [
        ['id' => 'cr1', 'from' => '01000000', 'to' => '05999999', 'price' => 9.9, 'label' => 'Capital SP'],
    ],
    // `states` lista UFs com frete grátis INCONDICIONAL (qualquer valor). Fica
    // vazio por padrão: com 'SP' aqui, o mínimo de R$ 199 e a faixa de CEP da
    // capital nunca seriam aplicados — todo pedido paulista sairia com frete 0.
    'freeShipping' => ['enabled' => true, 'minOrder' => 199.0, 'states' => []],
];

const DEFAULT_RECOVERY = [
    'enabled'      => true,
    'delayMinutes' => 60,
    'message'      => 'Olá {nome}! 👋 Você esqueceu alguns itens na sua sacola da Quéops Pirâmides '
        . '(total {valor}). Use o cupom {cupom} e finalize com desconto: ',
    'couponCode'   => 'VOLTA10',
];

const INTEGRATION_IDS = [
    'uno', 'erp', 'zapi', 'evolution', 'chatwoot', 'chatvolt',
    'mercadopago', 'pagseguro', 'stripe', 'pagarme',
    'correios', 'melhorenvio', 'frenet',
];

/** Quais campos de cada integração são segredo e nunca voltam para o navegador. */
const INTEGRATION_SECRET_FIELDS = [
    'accessToken', 'secretKey', 'apiKey', 'apiToken', 'token', 'clientToken',
    'password', 'encryptionKey',
];

/**
 * Mescla configuração salva sobre o default.
 *
 * NÃO usa `array_replace_recursive`: aquela função nunca remove chaves nem
 * encurta arrays. Na prática, apagar uma faixa de CEP ou um preço por UF no
 * painel não tinha efeito — a regra excluída voltava do default e continuava
 * sendo cobrada. Aqui, arrays "de lista" (chaves numéricas, como cepRanges) e
 * mapas gerenciados pelo painel (perState, states) são substituídos por
 * inteiro; só objetos de configuração é que recebem merge por chave, para que
 * campos novos de um deploy futuro apareçam com o valor padrão.
 */
function config_merge(array $default, array $saved): array
{
    $out = $default;
    foreach ($saved as $key => $value) {
        $isList = is_array($value) && ($value === [] || array_is_list($value));
        if (is_array($value) && !$isList && isset($default[$key]) && is_array($default[$key]) && !array_is_list($default[$key])) {
            // Mapas livres (UF => preço) são substituídos; objetos fixos, mesclados.
            $out[$key] = $key === 'perState' ? $value : config_merge($default[$key], $value);
            continue;
        }
        $out[$key] = $value;
    }
    return $out;
}

function config_get(string $key, array $default): array
{
    $row = db_one('SELECT config_val FROM store_config WHERE config_key = ?', [$key]);
    if ($row === null) {
        return $default;
    }
    $decoded = json_decode($row['config_val'], true);
    if (!is_array($decoded)) {
        return $default;
    }
    return config_merge($default, $decoded);
}

function config_set(string $key, array $value): void
{
    db_run(
        'INSERT INTO store_config (config_key, config_val) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE config_val = VALUES(config_val)',
        [$key, json_encode($value, JSON_UNESCAPED_UNICODE)]
    );
}

function get_settings(): array
{
    return config_get('settings', DEFAULT_SETTINGS);
}

function get_shipping(): array
{
    return config_get('shipping', DEFAULT_SHIPPING);
}

function get_recovery(): array
{
    return config_get('recovery', DEFAULT_RECOVERY);
}

/**
 * Subconjunto das configurações exposto publicamente na loja.
 *
 * Os dois campos de frete são DERIVADOS da configuração de frete, não de
 * valores próprios: antes existiam "frete grátis acima de" e "frete padrão"
 * também em Configurações, ignorados pelo motor de preços — a gaveta do
 * carrinho anunciava um valor e o checkout cobrava outro.
 */
function public_settings(): array
{
    $s  = get_settings();
    $sh = get_shipping();
    $free = $sh['freeShipping'] ?? [];

    return [
        'name'             => $s['name'],
        'email'            => $s['email'],
        'phone'            => $s['phone'],
        'whatsapp'         => $s['whatsapp'],
        'pixDiscountPct'   => (float) $s['pixDiscountPct'],
        'payments'         => $s['payments'],
        // 0 = não há frete grátis por valor.
        'freeShippingFrom' => !empty($free['enabled']) ? (float) ($free['minOrder'] ?? 0) : 0.0,
        // Estimativa exibida antes de o cliente informar o CEP.
        'shippingFrom'     => (float) ($sh['defaultPrice'] ?? 0),
    ];
}

// ------------------------------------------------------------ Produtos ----

/** Converte uma linha de `products` no objeto Product do front-end. */
function product_row_to_api(array $r): array
{
    $out = [
        'id'            => $r['id'],
        'sku'           => $r['sku'],
        'name'          => $r['name'],
        'category'      => $r['category'],
        'categoryLabel' => $r['category_label'],
        'description'   => (string) ($r['description'] ?? ''),
        'price'         => (float) $r['price'],
        'stock'         => (int) $r['stock'],
        'image'         => $r['image'],
        'weight'        => (string) ($r['weight'] ?? ''),
        'active'        => (bool) $r['active'],
    ];
    if (!empty($r['subcategory']))      $out['subcategory']      = $r['subcategory'];
    if (!empty($r['long_description'])) $out['longDescription']  = $r['long_description'];
    if ($r['old_price'] !== null)       $out['oldPrice']         = (float) $r['old_price'];
    if (!empty($r['tag']))              $out['tag']              = $r['tag'];
    if (!empty($r['ingredients']))      $out['ingredients']      = $r['ingredients'];
    if (!empty($r['highlight']))        $out['highlight']        = true;
    return $out;
}

function fetch_products(bool $onlyActive = true): array
{
    $sql = 'SELECT * FROM products' . ($onlyActive ? ' WHERE active = 1' : '')
        . ' ORDER BY position ASC, name ASC';
    return array_map('product_row_to_api', db_all($sql));
}

// ------------------------------------------------------------- Pedidos ----

function order_row_to_api(array $r, array $items): array
{
    return [
        'id'            => $r['id'],
        'createdAt'     => iso($r['created_at']),
        'customerName'  => $r['customer_name'],
        'customerEmail' => $r['customer_email'],
        'customerPhone' => $r['customer_phone'],
        'items'         => array_map(static fn ($i) => [
            'productId' => $i['product_id'],
            'name'      => $i['name'],
            'quantity'  => (int) $i['quantity'],
            'unitPrice' => (float) $i['unit_price'],
        ], $items),
        'subtotal'   => (float) $r['subtotal'],
        'shipping'   => (float) $r['shipping_cost'],
        'discount'   => (float) $r['discount'],
        'total'      => (float) $r['total'],
        'couponCode' => $r['coupon_code'],
        'status'     => $r['status'],
        'payment'    => $r['payment'],
        'channel'    => $r['channel'],
    ];
}

/** Carrega pedidos com seus itens em duas consultas (evita N+1). */
function fetch_orders(int $limit = 500): array
{
    $orders = db_all('SELECT * FROM orders ORDER BY created_at DESC LIMIT ' . max(1, min($limit, 2000)));
    if (!$orders) {
        return [];
    }
    $ids = array_column($orders, 'id');
    $ph  = implode(',', array_fill(0, count($ids), '?'));
    $rows = db_all("SELECT * FROM order_items WHERE order_id IN ($ph) ORDER BY id ASC", $ids);

    $byOrder = [];
    foreach ($rows as $row) {
        $byOrder[$row['order_id']][] = $row;
    }
    return array_map(
        static fn ($o) => order_row_to_api($o, $byOrder[$o['id']] ?? []),
        $orders
    );
}

// -------------------------------------------------------- Integrações ----

/**
 * Devolve a integração para o painel COM os segredos removidos.
 * O admin vê quais campos já estão preenchidos, mas nunca recebe o valor.
 */
function integration_to_api(array $row): array
{
    $fields = decrypt_payload($row['fields_enc'] ?? null);
    $safe = [];
    $configured = [];
    foreach ($fields as $k => $v) {
        if ($v === '' || $v === null) {
            continue;
        }
        $configured[] = $k;
        $safe[$k] = in_array($k, INTEGRATION_SECRET_FIELDS, true) ? '' : (string) $v;
    }
    return [
        'id'            => $row['id'],
        'enabled'       => (bool) $row['enabled'],
        'fields'        => $safe,
        'configured'    => $configured,
        'lastStatus'    => $row['last_status'] ?: 'unknown',
        'lastCheckedAt' => iso($row['last_checked_at']),
    ];
}

function fetch_integrations(): array
{
    $rows = db_all('SELECT * FROM integrations');
    $byId = [];
    foreach ($rows as $r) {
        $byId[$r['id']] = integration_to_api($r);
    }
    foreach (INTEGRATION_IDS as $id) {
        $byId[$id] ??= [
            'id' => $id, 'enabled' => false, 'fields' => [], 'configured' => [],
            'lastStatus' => 'unknown', 'lastCheckedAt' => null,
        ];
    }
    return $byId;
}

/** Credenciais em claro — uso exclusivo do servidor. */
function integration_secrets(string $id): array
{
    $row = db_one('SELECT fields_enc FROM integrations WHERE id = ?', [$id]);
    return $row ? decrypt_payload($row['fields_enc']) : [];
}
