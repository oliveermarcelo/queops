<?php
/**
 * Adaptadores das integrações — LADO SERVIDOR.
 *
 * Antes, o navegador chamava Z-API, Chatwoot e afins direto, o que exigia ter
 * o token no JavaScript. Agora o painel pede ao servidor ("teste a Z-API") e
 * é o PHP que usa a credencial cifrada guardada no banco. O segredo nunca
 * chega ao cliente, e some o problema de CORS de quebra.
 */

declare(strict_types=1);

/** Catálogo de provedores e os campos que cada um exige. */
function providers_meta(): array
{
    return [
        'mercadopago' => ['fields' => ['publicKey', 'accessToken']],
        'pagseguro'   => ['fields' => ['email', 'token']],
        'stripe'      => ['fields' => ['publishableKey', 'secretKey']],
        'pagarme'     => ['fields' => ['apiKey', 'encryptionKey']],
        'correios'    => ['fields' => ['user', 'password']],
        'melhorenvio' => ['fields' => ['token']],
        'frenet'      => ['fields' => ['token']],
        'uno'         => ['fields' => ['token', 'company']],
        'erp'         => ['fields' => ['baseUrl', 'token']],
        'zapi'        => ['fields' => ['instanceId', 'token']],
        'evolution'   => ['fields' => ['baseUrl', 'instance', 'apiKey']],
        'chatwoot'    => ['fields' => ['baseUrl', 'accountId', 'apiToken']],
        'chatvolt'    => ['fields' => ['apiKey', 'agentId']],
    ];
}

/**
 * O endereço aponta para a própria infraestrutura?
 *
 * URLs de ERP e de webhook são digitadas no painel. Sem esta checagem, elas
 * viram uma janela para a rede interna: `http://127.0.0.1:9200`,
 * `http://10.0.0.5/admin` ou `http://169.254.169.254/latest/meta-data/`
 * (credenciais da instância em nuvem) seriam requisitadas pelo servidor, e as
 * mensagens de erro já revelariam quais portas respondem.
 */
function is_internal_host(string $host): bool
{
    $host = trim($host, '[]');

    if ($host === '' || strcasecmp($host, 'localhost') === 0 || str_ends_with(strtolower($host), '.localhost')) {
        return true;
    }
    if (str_ends_with(strtolower($host), '.internal') || str_ends_with(strtolower($host), '.local')) {
        return true;
    }

    // Resolve o nome: um domínio público pode apontar para um IP privado.
    $ips = [];
    if (filter_var($host, FILTER_VALIDATE_IP)) {
        $ips[] = $host;
    } else {
        $records = @dns_get_record($host, DNS_A | DNS_AAAA) ?: [];
        foreach ($records as $r) {
            $ips[] = $r['ip'] ?? $r['ipv6'] ?? '';
        }
        if (!$ips) {
            $resolved = @gethostbyname($host);
            if ($resolved !== $host) {
                $ips[] = $resolved;
            }
        }
    }

    foreach (array_filter($ips) as $ip) {
        // FILTER_FLAG_NO_PRIV_RANGE cobre 10/8, 172.16/12, 192.168/16 e fd00::/8;
        // NO_RES_RANGE cobre loopback, link-local (169.254/16) e reservados.
        if (!filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE)) {
            return true;
        }
    }
    return false;
}

/**
 * Requisição HTTP simples com cURL.
 *
 * Só http(s) e só para hosts públicos — ver `is_internal_host`. Sem a checagem
 * de esquema, um valor como `file:///etc/passwd` viraria leitura de arquivo
 * local; sem a de host, o painel viraria um scanner da rede interna.
 */
function http_call(string $method, string $url, array $headers = [], ?array $json = null, int $timeout = 12): array
{
    $parts = parse_url($url);
    $scheme = strtolower($parts['scheme'] ?? '');
    if (!in_array($scheme, ['http', 'https'], true)) {
        return ['ok' => false, 'status' => 0, 'body' => '', 'error' => 'URL inválida (use http ou https).'];
    }
    if (is_internal_host((string) ($parts['host'] ?? ''))) {
        return [
            'ok' => false, 'status' => 0, 'body' => '',
            'error' => 'Endereço interno ou reservado não é permitido.',
        ];
    }

    $ch = curl_init($url);
    $hdr = [];
    foreach ($headers as $k => $v) {
        $hdr[] = $k . ': ' . $v;
    }
    if ($json !== null) {
        $hdr[] = 'Content-Type: application/json';
    }

    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_HTTPHEADER     => $hdr,
        CURLOPT_TIMEOUT        => $timeout,
        CURLOPT_CONNECTTIMEOUT => 6,
        CURLOPT_FOLLOWLOCATION => false,   // evita redirect para host interno
        CURLOPT_PROTOCOLS      => CURLPROTO_HTTP | CURLPROTO_HTTPS,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);
    if ($json !== null) {
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($json, JSON_UNESCAPED_UNICODE));
    }

    $body   = curl_exec($ch);
    $status = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err    = curl_error($ch);
    curl_close($ch);

    return [
        'ok'     => $status >= 200 && $status < 300,
        'status' => $status,
        'body'   => is_string($body) ? $body : '',
        'error'  => $err,
    ];
}

function trim_slash(string $s): string
{
    return rtrim($s, '/');
}

/** Testa a conexão de um provedor usando as credenciais salvas. */
function provider_test(string $id, array $f): array
{
    $meta = providers_meta()[$id] ?? null;
    if ($meta === null) {
        return ['ok' => false, 'message' => 'Provedor desconhecido.'];
    }
    $missing = array_values(array_filter(
        $meta['fields'],
        static fn ($k) => trim((string) ($f[$k] ?? '')) === ''
    ));
    if ($missing) {
        return ['ok' => false, 'message' => 'Preencha: ' . implode(', ', $missing)];
    }

    switch ($id) {
        case 'zapi':
            $r = http_call('GET', sprintf(
                'https://api.z-api.io/instances/%s/token/%s/status',
                rawurlencode($f['instanceId']),
                rawurlencode($f['token'])
            ), !empty($f['clientToken']) ? ['Client-Token' => $f['clientToken']] : []);
            return ['ok' => $r['ok'], 'message' => $r['ok'] ? 'Conexão Z-API OK.' : "Falha (HTTP {$r['status']}). {$r['error']}"];

        case 'evolution':
            $r = http_call('GET', trim_slash($f['baseUrl']) . '/instance/connectionState/' . rawurlencode($f['instance']), ['apikey' => $f['apiKey']]);
            return ['ok' => $r['ok'], 'message' => $r['ok'] ? 'Conexão Evolution OK.' : "Falha (HTTP {$r['status']}). {$r['error']}"];

        case 'chatwoot':
            $r = http_call('GET', trim_slash($f['baseUrl']) . '/api/v1/accounts/' . rawurlencode($f['accountId']) . '/conversations', ['api_access_token' => $f['apiToken']]);
            return ['ok' => $r['ok'], 'message' => $r['ok'] ? 'Conexão Chatwoot OK.' : "Falha (HTTP {$r['status']}). {$r['error']}"];

        case 'chatvolt':
            $r = http_call('GET', 'https://api.chatvolt.ai/agents', ['Authorization' => 'Bearer ' . $f['apiKey']]);
            return ['ok' => $r['ok'], 'message' => $r['ok'] ? 'Conexão Chatvolt OK.' : "Falha (HTTP {$r['status']}). {$r['error']}"];

        case 'mercadopago':
            $r = http_call('GET', 'https://api.mercadopago.com/users/me', ['Authorization' => 'Bearer ' . $f['accessToken']]);
            return ['ok' => $r['ok'], 'message' => $r['ok'] ? 'Mercado Pago conectado.' : "Falha (HTTP {$r['status']}). Confira o Access Token."];

        case 'stripe':
            $r = http_call('GET', 'https://api.stripe.com/v1/account', ['Authorization' => 'Bearer ' . $f['secretKey']]);
            return ['ok' => $r['ok'], 'message' => $r['ok'] ? 'Stripe conectado.' : "Falha (HTTP {$r['status']}). Confira a Secret Key."];

        case 'pagarme':
            $r = http_call('GET', 'https://api.pagar.me/core/v5/balance', ['Authorization' => 'Basic ' . base64_encode($f['apiKey'] . ':')]);
            return ['ok' => $r['ok'], 'message' => $r['ok'] ? 'Pagar.me conectado.' : "Falha (HTTP {$r['status']}). Confira a API Key."];

        case 'melhorenvio':
            $base = (($f['sandbox'] ?? 'production') === 'sandbox')
                ? 'https://sandbox.melhorenvio.com.br' : 'https://melhorenvio.com.br';
            $r = http_call('GET', $base . '/api/v2/me', ['Authorization' => 'Bearer ' . $f['token'], 'Accept' => 'application/json']);
            return ['ok' => $r['ok'], 'message' => $r['ok'] ? 'Melhor Envio conectado.' : "Falha (HTTP {$r['status']})."];

        case 'uno':
            $r = http_call('GET', 'https://api.unoerp.com/v1/ping', ['Authorization' => 'Bearer ' . $f['token']]);
            return ['ok' => $r['ok'], 'message' => $r['ok'] ? 'UNO ERP conectado.' : "Falha (HTTP {$r['status']}). {$r['error']}"];

        case 'erp':
            $r = http_call('GET', trim_slash($f['baseUrl']) . '/health', ['Authorization' => 'Bearer ' . $f['token']]);
            return ['ok' => $r['ok'], 'message' => $r['ok'] ? 'ERP respondeu OK.' : "Falha (HTTP {$r['status']}). {$r['error']}"];

        case 'pagseguro':
        case 'correios':
        case 'frenet':
        default:
            // Provedores sem endpoint público de verificação barato.
            return ['ok' => true, 'message' => 'Credenciais salvas com segurança no servidor.'];
    }
}

/** Envia uma mensagem de WhatsApp pelo provedor configurado e habilitado. */
function provider_send_whatsapp(string $phone, string $message): array
{
    foreach (['zapi', 'evolution'] as $id) {
        $row = db_one('SELECT enabled FROM integrations WHERE id = ?', [$id]);
        if (!$row || !$row['enabled']) {
            continue;
        }
        $f = integration_secrets($id);
        if ($id === 'zapi') {
            $r = http_call('POST', sprintf(
                'https://api.z-api.io/instances/%s/token/%s/send-text',
                rawurlencode($f['instanceId'] ?? ''),
                rawurlencode($f['token'] ?? '')
            ), !empty($f['clientToken']) ? ['Client-Token' => $f['clientToken']] : [], ['phone' => $phone, 'message' => $message]);
        } else {
            $r = http_call('POST', trim_slash($f['baseUrl'] ?? '') . '/message/sendText/' . rawurlencode($f['instance'] ?? ''), ['apikey' => $f['apiKey'] ?? ''], ['number' => $phone, 'text' => $message]);
        }
        return ['ok' => $r['ok'], 'message' => $r['ok'] ? 'Mensagem enviada.' : "Falha (HTTP {$r['status']})."];
    }
    return ['ok' => false, 'message' => 'Nenhum provedor de WhatsApp está ativo em Integrações.'];
}

/** Dispara os webhooks cadastrados para um evento (best-effort, não bloqueia). */
function fire_webhooks(string $event, array $payload): void
{
    $hooks = db_all('SELECT url FROM webhooks WHERE event = ? AND active = 1', [$event]);
    foreach ($hooks as $h) {
        http_call('POST', $h['url'], ['X-Queops-Event' => $event], $payload, 5);
    }
}
