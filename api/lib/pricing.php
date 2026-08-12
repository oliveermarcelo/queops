<?php
/**
 * Motor de preços — FONTE ÚNICA DA VERDADE para frete, cupom e desconto Pix.
 *
 * Regra de ouro: o navegador nunca informa preço. Ele manda apenas
 * `[{productId, quantity}]`; o valor unitário vem sempre do banco. Assim, um
 * cliente que adultere o JavaScript não consegue comprar por R$ 0,01.
 *
 * A mesma função alimenta a prévia do checkout (`POST /checkout/quote`) e a
 * criação do pedido (`POST /orders`), então o que o cliente vê é exatamente o
 * que é cobrado.
 */

declare(strict_types=1);

/** Normaliza um CEP para 8 dígitos ou devolve '' se não for válido. */
function normalize_cep(string $cep): string
{
    $digits = preg_replace('/\D/', '', $cep) ?? '';
    return strlen($digits) === 8 ? $digits : '';
}


/**
 * UF a partir do CEP, pelas faixas oficiais dos Correios.
 *
 * Permite estimar o frete na página do produto (onde só temos o CEP) e
 * preencher a UF sozinho no checkout, sem depender de serviço externo.
 */
function uf_from_cep(string $cep): string
{
    $cep = normalize_cep($cep);
    if ($cep === '') {
        return '';
    }
    $n = (int) substr($cep, 0, 5);

    $ranges = [
        [1000, 19999, 'SP'], [20000, 28999, 'RJ'], [29000, 29999, 'ES'],
        [30000, 39999, 'MG'], [40000, 48999, 'BA'], [49000, 49999, 'SE'],
        [50000, 56999, 'PE'], [57000, 57999, 'AL'], [58000, 58999, 'PB'],
        [59000, 59999, 'RN'], [60000, 63999, 'CE'], [64000, 64999, 'PI'],
        [65000, 65999, 'MA'], [66000, 68899, 'PA'], [68900, 68999, 'AP'],
        [69000, 69299, 'AM'], [69300, 69399, 'RR'], [69400, 69899, 'AM'],
        [69900, 69999, 'AC'], [70000, 72799, 'DF'], [72800, 72999, 'GO'],
        [73000, 73699, 'DF'], [73700, 76799, 'GO'], [76800, 76999, 'RO'],
        [77000, 77999, 'TO'], [78000, 78899, 'MT'], [79000, 79999, 'MS'],
        [80000, 87999, 'PR'], [88000, 89999, 'SC'], [90000, 99999, 'RS'],
    ];
    foreach ($ranges as [$from, $to, $uf]) {
        if ($n >= $from && $n <= $to) {
            return $uf;
        }
    }
    return '';
}

/** Prazo estimado de entrega em dias úteis, por região. */
function delivery_days_for(string $uf): int
{
    return match ($uf) {
        'SP' => 3,
        'RJ', 'MG', 'ES', 'PR', 'SC' => 4,
        'RS', 'GO', 'DF', 'MS', 'BA' => 6,
        '' => 7,
        default => 8,
    };
}

/**
 * Calcula o frete. Ordem de precedência — a MESMA usada pelo simulador do
 * painel (src/admin/modules/ShippingAdmin.tsx), para o que é simulado bater
 * com o que é cobrado:
 *
 *   1. UF marcada como "sempre grátis"
 *   2. faixa de CEP marcada como grátis
 *   3. faixa de CEP com preço  (zerada se o subtotal atingir o mínimo)
 *   4. frete grátis por valor mínimo
 *   5. preço por UF
 *   6. preço padrão
 */
function calculate_shipping(array $shipping, float $subtotal, string $uf, string $cep): array
{
    $uf  = strtoupper(substr($uf, 0, 2));
    $cep = normalize_cep($cep);

    $free    = $shipping['freeShipping'] ?? [];
    $enabled = !empty($free['enabled']);
    // minOrder 0 (ou ausente) = regra desligada. O painel diz "deixe 0 para não
    // dar grátis por valor"; tratar 0 como mínimo faria TODO pedido sair franqueado.
    $minOrder = (float) ($free['minOrder'] ?? 0);

    // UF com frete grátis incondicional vem antes de qualquer faixa de CEP.
    if ($enabled && $uf !== '' && in_array($uf, (array) ($free['states'] ?? []), true)) {
        return ['cost' => 0.0, 'reason' => 'free_state', 'label' => 'Frete grátis para ' . $uf];
    }

    if ($cep !== '') {
        foreach ((array) ($shipping['cepRanges'] ?? []) as $range) {
            $from = normalize_cep((string) ($range['from'] ?? ''));
            $to   = normalize_cep((string) ($range['to'] ?? ''));
            if ($from === '' || $to === '') {
                continue;
            }
            // Comparação numérica: '01000000' < '05999999' funciona como int.
            if ((int) $cep >= (int) $from && (int) $cep <= (int) $to) {
                if (!empty($range['free'])) {
                    return ['cost' => 0.0, 'reason' => 'free_cep_range', 'label' => (string) ($range['label'] ?? 'Frete grátis')];
                }
                if ($enabled && $minOrder > 0 && $subtotal >= $minOrder) {
                    return ['cost' => 0.0, 'reason' => 'free_min_order', 'label' => 'Frete grátis'];
                }
                return [
                    'cost'   => round((float) ($range['price'] ?? 0), 2),
                    'reason' => 'cep_range',
                    'label'  => (string) ($range['label'] ?? 'Entrega'),
                ];
            }
        }
    }

    // Frete grátis por valor mínimo: vale para faixa de CEP, UF e padrão, por
    // isso é avaliado depois das regras "sempre grátis" e antes do preço final.
    if ($enabled && $minOrder > 0 && $subtotal > 0 && $subtotal >= $minOrder) {
        return ['cost' => 0.0, 'reason' => 'free_min_order', 'label' => 'Frete grátis'];
    }

    $perState = (array) ($shipping['perState'] ?? []);
    if ($uf !== '' && isset($perState[$uf])) {
        return ['cost' => round((float) $perState[$uf], 2), 'reason' => 'per_state', 'label' => 'Entrega para ' . $uf];
    }

    return [
        'cost'   => round((float) ($shipping['defaultPrice'] ?? 0), 2),
        'reason' => 'default',
        'label'  => 'Entrega padrão',
    ];
}

/** Valida um cupom e devolve [linha, erro]. Erro null = cupom válido. */
function resolve_coupon(string $code, float $subtotal): array
{
    $code = mb_strtoupper(trim($code));
    if ($code === '') {
        return [null, null];
    }
    $row = db_one('SELECT * FROM coupons WHERE code = ?', [$code]);
    if ($row === null) {
        return [null, 'Cupom não encontrado.'];
    }
    if (!$row['active']) {
        return [null, 'Este cupom não está mais ativo.'];
    }
    if ($row['expires_at'] !== null && $row['expires_at'] < date('Y-m-d')) {
        return [null, 'Este cupom expirou.'];
    }
    if ($row['max_uses'] !== null && (int) $row['uses'] >= (int) $row['max_uses']) {
        return [null, 'Este cupom atingiu o limite de usos.'];
    }
    if ($row['min_order'] !== null && $subtotal < (float) $row['min_order']) {
        return [null, sprintf('Este cupom vale a partir de R$ %s.', number_format((float) $row['min_order'], 2, ',', '.'))];
    }
    return [$row, null];
}

/**
 * Cotação completa do carrinho.
 *
 * @param array $rawItems  [['productId' => string, 'quantity' => int], ...]
 * @return array  resumo com itens resolvidos, frete, descontos e total
 */
function quote_cart(array $rawItems, string $uf, string $cep, string $couponCode, string $payment): array
{
    // Sem UF informada (ex.: simulador da página do produto), deduz pelo CEP.
    $uf = strtoupper(trim($uf));
    if ($uf === '') {
        $uf = uf_from_cep($cep);
    }

    // ---- 1. Resolve os itens contra o banco (preço e estoque reais) --------
    $wanted = [];
    foreach ($rawItems as $item) {
        if (!is_array($item)) {
            continue;
        }
        $id  = (string) ($item['productId'] ?? $item['id'] ?? '');
        $qty = (int) ($item['quantity'] ?? 0);
        if ($id === '' || $qty < 1) {
            continue;
        }
        // Teto por item evita pedidos absurdos por engano ou abuso.
        $wanted[$id] = min(($wanted[$id] ?? 0) + $qty, 999);
    }

    if (!$wanted) {
        return [
            'items' => [], 'subtotal' => 0.0, 'shipping' => 0.0, 'shippingLabel' => '',
            'couponDiscount' => 0.0, 'couponCode' => null, 'couponError' => null,
            'pixDiscount' => 0.0, 'discount' => 0.0, 'total' => 0.0, 'uf' => $uf,
            'deliveryDays' => delivery_days_for($uf), 'issues' => ['Sacola vazia.'],
        ];
    }

    $ids  = array_keys($wanted);
    $ph   = implode(',', array_fill(0, count($ids), '?'));
    $rows = db_all("SELECT * FROM products WHERE id IN ($ph) AND active = 1", $ids);

    $items    = [];
    $issues   = [];
    $subtotal = 0.0;

    $found = [];
    foreach ($rows as $r) {
        $found[$r['id']] = $r;
    }

    foreach ($wanted as $id => $qty) {
        if (!isset($found[$id])) {
            $issues[] = 'Um item da sacola não está mais disponível e foi removido.';
            continue;
        }
        $p     = $found[$id];
        $stock = (int) $p['stock'];
        if ($stock <= 0) {
            $issues[] = sprintf('“%s” está sem estoque e foi removido da sacola.', $p['name']);
            continue;
        }
        if ($qty > $stock) {
            $issues[] = sprintf('“%s”: só temos %d em estoque, ajustamos a quantidade.', $p['name'], $stock);
            $qty = $stock;
        }
        $unit = (float) $p['price'];
        $subtotal += $unit * $qty;
        $items[] = [
            'productId' => $p['id'],
            'name'      => $p['name'],
            'quantity'  => $qty,
            'unitPrice' => $unit,
            'lineTotal' => round($unit * $qty, 2),
            'image'     => $p['image'],
        ];
    }

    $subtotal = round($subtotal, 2);

    // ---- 2. Frete ---------------------------------------------------------
    $ship = calculate_shipping(get_shipping(), $subtotal, $uf, $cep);

    // ---- 3. Cupom ---------------------------------------------------------
    [$coupon, $couponError] = resolve_coupon($couponCode, $subtotal);
    $couponDiscount = 0.0;
    if ($coupon !== null) {
        $couponDiscount = $coupon['type'] === 'percent'
            ? $subtotal * ((float) $coupon['value'] / 100)
            : (float) $coupon['value'];
        // Nunca desconta mais do que o valor dos produtos.
        $couponDiscount = round(min($couponDiscount, $subtotal), 2);
    }

    // ---- 4. Desconto Pix (sobre o subtotal já com cupom) -------------------
    $settings   = get_settings();
    $pixPct     = (float) ($settings['pixDiscountPct'] ?? 0);
    $pixDiscount = ($payment === 'pix' && $pixPct > 0)
        ? round(max(0.0, $subtotal - $couponDiscount) * ($pixPct / 100), 2)
        : 0.0;

    $discount = round($couponDiscount + $pixDiscount, 2);
    $total    = round(max(0.0, $subtotal - $discount) + $ship['cost'], 2);

    return [
        'items'          => $items,
        'subtotal'       => $subtotal,
        'shipping'       => $ship['cost'],
        'shippingLabel'  => $ship['label'],
        'shippingReason' => $ship['reason'],
        'couponCode'     => $coupon['code'] ?? null,
        'couponDiscount' => $couponDiscount,
        'couponError'    => $couponError,
        'pixDiscount'    => $pixDiscount,
        'pixDiscountPct' => $pixPct,
        'discount'       => $discount,
        'total'          => $total,
        'uf'             => $uf,
        'deliveryDays'   => delivery_days_for($uf),
        'issues'         => $issues,
    ];
}
