<?php
/**
 * Sessões, CSRF e limitação de tentativas de login.
 *
 * Duas identidades independentes convivem na mesma sessão PHP:
 *   $_SESSION['admin_id']    → painel administrativo
 *   $_SESSION['customer_id'] → área do cliente na loja
 *
 * Entrar como cliente nunca concede acesso ao painel, e vice-versa.
 */

declare(strict_types=1);

function start_session(): void
{
    if (session_status() === PHP_SESSION_ACTIVE) {
        return;
    }
    $secure = (bool) (app_config()['secure_cookies'] ?? true);

    session_name('qp_session');
    session_set_cookie_params([
        'lifetime' => 0,          // expira ao fechar o navegador
        'path'     => '/',
        'httponly' => true,       // inacessível a JavaScript → imune a roubo por XSS
        'secure'   => $secure,    // só trafega em HTTPS
        'samesite' => 'Lax',      // barra envio em requisições cross-site
    ]);
    session_start();

    // Regenera o ID periodicamente para reduzir a janela de fixation.
    $now = time();
    if (!isset($_SESSION['created_at'])) {
        $_SESSION['created_at'] = $now;
    } elseif ($now - (int) $_SESSION['created_at'] > 1800) {
        session_regenerate_id(true);
        $_SESSION['created_at'] = $now;
    }
}

// ---------------------------------------------------------------- CSRF ----

function csrf_token(): string
{
    start_session();
    if (empty($_SESSION['csrf'])) {
        $_SESSION['csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['csrf'];
}

/**
 * Exige o token CSRF em toda requisição que altera estado.
 *
 * O cookie de sessão é SameSite=Lax, o que já barra a maior parte dos ataques,
 * mas o token cobre o caso de navegadores antigos e de subdomínios hostis.
 */
function require_csrf(): void
{
    $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (in_array($method, ['GET', 'HEAD', 'OPTIONS'], true)) {
        return;
    }
    start_session();
    $sent = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    $known = $_SESSION['csrf'] ?? '';
    if ($known === '' || !is_string($sent) || !hash_equals($known, $sent)) {
        json_error('Token de segurança inválido. Recarregue a página.', 419, 'csrf_mismatch');
    }
}

// ------------------------------------------------------- Rate limiting ----

/** Bloqueia após muitas falhas seguidas do mesmo e-mail ou do mesmo IP. */
function assert_login_allowed(string $scope, string $identifier): void
{
    $ip = client_ip_binary();

    $byUser = db_one(
        "SELECT COUNT(*) AS n FROM login_attempts
          WHERE scope = ? AND identifier = ? AND success = 0
            AND created_at > (NOW() - INTERVAL 15 MINUTE)",
        [$scope, mb_strtolower($identifier)]
    );
    if ((int) ($byUser['n'] ?? 0) >= 8) {
        json_error('Muitas tentativas. Aguarde 15 minutos e tente de novo.', 429, 'too_many_attempts');
    }

    if ($ip !== null) {
        $byIp = db_one(
            "SELECT COUNT(*) AS n FROM login_attempts
              WHERE ip = ? AND success = 0 AND created_at > (NOW() - INTERVAL 15 MINUTE)",
            [$ip]
        );
        if ((int) ($byIp['n'] ?? 0) >= 25) {
            json_error('Muitas tentativas a partir deste endereço.', 429, 'too_many_attempts');
        }
    }
}

function record_login_attempt(string $scope, string $identifier, bool $success): void
{
    db_run(
        'INSERT INTO login_attempts (scope, identifier, ip, success) VALUES (?, ?, ?, ?)',
        [$scope, mb_strtolower($identifier), client_ip_binary(), $success ? 1 : 0]
    );
    // Higiene: mantém a tabela pequena.
    if (random_int(1, 50) === 1) {
        db_run('DELETE FROM login_attempts WHERE created_at < (NOW() - INTERVAL 7 DAY)');
    }
}

// --------------------------------------------------------------- Admin ----

function current_admin(): ?array
{
    start_session();
    $id = $_SESSION['admin_id'] ?? null;
    if (!$id) {
        return null;
    }
    return db_one(
        'SELECT id, name, email, role FROM admin_users WHERE id = ? AND active = 1',
        [$id]
    );
}

function require_admin(): array
{
    $admin = current_admin();
    if ($admin === null) {
        json_error('Faça login no painel para continuar.', 401, 'unauthenticated');
    }
    return $admin;
}

function admin_login(string $email, string $password): ?array
{
    $email = mb_strtolower(trim($email));
    assert_login_allowed('admin', $email);

    $user = db_one('SELECT * FROM admin_users WHERE email = ? AND active = 1', [$email]);

    // password_verify roda em tempo constante; o hash falso mantém o custo
    // parecido quando o e-mail não existe, evitando enumeração por timing.
    $hash = $user['password_hash'] ?? '$2y$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidin';
    $ok = password_verify($password, $hash) && $user !== null;

    record_login_attempt('admin', $email, $ok);
    if (!$ok) {
        return null;
    }

    start_session();
    session_regenerate_id(true);
    $_SESSION['admin_id']   = (int) $user['id'];
    $_SESSION['created_at'] = time();
    db_run('UPDATE admin_users SET last_login_at = NOW() WHERE id = ?', [$user['id']]);

    return ['id' => (int) $user['id'], 'name' => $user['name'], 'email' => $user['email'], 'role' => $user['role']];
}

function admin_logout(): void
{
    start_session();
    unset($_SESSION['admin_id']);
    session_regenerate_id(true);
}

// ------------------------------------------------------------ Cliente ----

function current_customer_id(): ?int
{
    start_session();
    $id = $_SESSION['customer_id'] ?? null;
    return $id ? (int) $id : null;
}

function require_customer(): int
{
    $id = current_customer_id();
    if ($id === null) {
        json_error('Entre na sua conta para continuar.', 401, 'unauthenticated');
    }
    return $id;
}

function customer_login_session(int $customerId): void
{
    start_session();
    session_regenerate_id(true);
    $_SESSION['customer_id'] = $customerId;
    $_SESSION['created_at']  = time();
}

function customer_logout(): void
{
    start_session();
    unset($_SESSION['customer_id']);
    session_regenerate_id(true);
}

// ------------------------------------------------------- Chaves de API ----

/**
 * Autentica pelo header `Authorization: Bearer qp_live_...`.
 *
 * Só o hash do token fica no banco, então a verificação percorre as chaves
 * ativas com o prefixo correspondente — o prefixo (16 caracteres) é indexado,
 * o que mantém a busca barata sem precisar guardar o segredo em claro.
 */
function current_api_key(): ?array
{
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(\S+)$/i', (string) $header, $m)) {
        return null;
    }
    $token = $m[1];

    $candidatas = db_all(
        'SELECT * FROM api_keys WHERE token_prefix = ? AND revoked = 0',
        [substr($token, 0, 16)]
    );
    foreach ($candidatas as $k) {
        if (password_verify($token, $k['token_hash'])) {
            db_run('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [$k['id']]);
            return $k;
        }
    }
    return null;
}

/** Exige uma chave de API válida (usada pelos endpoints /api/v1/*). */
function require_api_key(): array
{
    $key = current_api_key();
    if ($key === null) {
        json_error(
            'Envie uma chave válida no header Authorization: Bearer <token>.',
            401,
            'invalid_api_key'
        );
    }
    return $key;
}
