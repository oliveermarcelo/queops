<?php
/**
 * Cifragem simétrica das credenciais de integração (AES-256-GCM).
 *
 * Motivo: tokens de ERP, Z-API, Mercado Pago e afins são segredos de terceiros.
 * Guardá-los em texto puro significa que qualquer leitura indevida do banco
 * (backup vazado, SQL injection em outro sistema, acesso ao phpMyAdmin) entrega
 * as chaves da operação inteira. Com GCM ganhamos também autenticação: um
 * registro adulterado falha ao decifrar em vez de devolver lixo silencioso.
 */

declare(strict_types=1);

const CRYPTO_CIPHER = 'aes-256-gcm';

function app_key(): string
{
    $b64 = app_config()['app_key'] ?? '';
    if ($b64 === '') {
        json_error(
            'APP_KEY não configurada. Gere com: php -r "echo base64_encode(random_bytes(32));"',
            500,
            'missing_app_key'
        );
    }
    $key = base64_decode($b64, true);
    if ($key === false || strlen($key) !== 32) {
        json_error('APP_KEY inválida: precisa ser 32 bytes em base64.', 500, 'invalid_app_key');
    }
    return $key;
}

/** Cifra um array associativo. Devolve "v1.<iv>.<tag>.<payload>" em base64. */
function encrypt_payload(array $data): string
{
    $plain = json_encode($data, JSON_UNESCAPED_UNICODE);
    $iv    = random_bytes(12); // tamanho recomendado para GCM
    $tag   = '';
    $cipher = openssl_encrypt($plain, CRYPTO_CIPHER, app_key(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($cipher === false) {
        throw new RuntimeException('Falha ao cifrar credenciais.');
    }
    return 'v1.' . base64_encode($iv) . '.' . base64_encode($tag) . '.' . base64_encode($cipher);
}

/** Decifra o formato acima. Devolve [] se o dado estiver ausente ou corrompido. */
function decrypt_payload(?string $blob): array
{
    if (!$blob) {
        return [];
    }
    $parts = explode('.', $blob);
    if (count($parts) !== 4 || $parts[0] !== 'v1') {
        return [];
    }
    $iv     = base64_decode($parts[1], true);
    $tag    = base64_decode($parts[2], true);
    $cipher = base64_decode($parts[3], true);
    if ($iv === false || $tag === false || $cipher === false) {
        return [];
    }
    $plain = openssl_decrypt($cipher, CRYPTO_CIPHER, app_key(), OPENSSL_RAW_DATA, $iv, $tag);
    if ($plain === false) {
        error_log('[queops] payload de integração não pôde ser decifrado (chave trocada?)');
        return [];
    }
    $data = json_decode($plain, true);
    return is_array($data) ? $data : [];
}
