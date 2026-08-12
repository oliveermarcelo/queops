<?php
/**
 * Helpers de requisição/resposta HTTP.
 *
 * A API fala exclusivamente JSON. Nada aqui ecoa entrada do usuário sem
 * passar por json_encode, então não há vetor de injeção de HTML na resposta.
 */

declare(strict_types=1);

/** Envia uma resposta JSON e encerra a requisição. */
function json_response(mixed $data, int $status = 200): never
{
    http_response_code($status);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    // A API nunca deve ser cacheada por intermediários.
    header('Cache-Control: no-store');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Erro padronizado: { error: { code, message } }. */
function json_error(string $message, int $status = 400, string $code = 'bad_request'): never
{
    json_response(['error' => ['code' => $code, 'message' => $message]], $status);
}

/** Corpo JSON da requisição, já decodificado (array vazio se não houver). */
function request_body(): array
{
    static $cached = null;
    if ($cached !== null) {
        return $cached;
    }
    $raw = file_get_contents('php://input') ?: '';
    if ($raw === '') {
        return $cached = [];
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        json_error('Corpo da requisição não é um JSON válido.', 400, 'invalid_json');
    }
    return $cached = $decoded;
}

/** Lê um campo string do corpo, com trim e limite de tamanho. */
function body_str(array $body, string $key, string $default = '', int $max = 500): string
{
    $v = $body[$key] ?? $default;
    if (!is_scalar($v)) {
        return $default;
    }
    return mb_substr(trim((string) $v), 0, $max);
}

function body_float(array $body, string $key, float $default = 0.0): float
{
    $v = $body[$key] ?? $default;
    return is_numeric($v) ? (float) $v : $default;
}

function body_int(array $body, string $key, int $default = 0): int
{
    $v = $body[$key] ?? $default;
    return is_numeric($v) ? (int) $v : $default;
}

function body_bool(array $body, string $key, bool $default = false): bool
{
    if (!array_key_exists($key, $body)) {
        return $default;
    }
    return filter_var($body[$key], FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE) ?? $default;
}

/** IP do cliente em formato binário (para a tabela de tentativas de login). */
function client_ip_binary(): ?string
{
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    $packed = @inet_pton($ip);
    return $packed === false ? null : $packed;
}

/** Data ISO-8601 a partir de um DATETIME do MySQL. */
function iso(?string $mysqlDatetime): ?string
{
    if (!$mysqlDatetime) {
        return null;
    }
    try {
        return (new DateTimeImmutable($mysqlDatetime, new DateTimeZone('America/Sao_Paulo')))
            ->format(DateTimeInterface::ATOM);
    } catch (Throwable) {
        return $mysqlDatetime;
    }
}
