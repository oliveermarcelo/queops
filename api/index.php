<?php
/**
 * Front controller da API da Quéops Pirâmides.
 *
 * Todo /api/* cai aqui (ver api/.htaccess). O roteador é um match simples de
 * método + segmentos; não há dependência externa nem Composer, para rodar em
 * qualquer plano de hospedagem compartilhada.
 */

declare(strict_types=1);

require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/crypto.php';
require __DIR__ . '/lib/auth.php';
require __DIR__ . '/lib/store.php';
require __DIR__ . '/lib/pricing.php';
require __DIR__ . '/lib/providers.php';

// Em produção o cliente nunca deve ver stack trace.
$isProd = (app_config()['env'] ?? 'production') === 'production';
ini_set('display_errors', $isProd ? '0' : '1');
error_reporting(E_ALL);

set_exception_handler(static function (Throwable $e) use ($isProd): void {
    error_log('[queops] ' . $e::class . ': ' . $e->getMessage() . ' @ ' . $e->getFile() . ':' . $e->getLine());
    json_error(
        $isProd ? 'Erro interno. Tente novamente em instantes.' : $e->getMessage(),
        500,
        'internal_error'
    );
});

// ---------------------------------------------------------------- rota ----

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Caminho após /api/ — funciona tanto com rewrite quanto com ?route=
$path = $_GET['route'] ?? '';
if ($path === '') {
    $uri  = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
    $path = preg_replace('#^.*?/api/?#', '', $uri) ?? '';
}
$segments = array_values(array_filter(explode('/', trim((string) $path, '/')), 'strlen'));
$segments = array_map(static fn ($s) => rawurldecode($s), $segments);

/*
 * CSRF protege as rotas que usam cookie de sessão. As rotas /api/v1/* são
 * servidor-a-servidor, autenticadas por chave no header Authorization — não
 * há cookie envolvido, então não há requisição forjada pelo navegador a barrar.
 */
if (($segments[0] ?? '') !== 'v1') {
    require_csrf();
}

/** Casa a rota atual: seg(0) === $a etc. `*` casa qualquer valor. */
function route(string $verb, array $pattern, array $segments, string $method): ?array
{
    if ($method !== $verb || count($segments) !== count($pattern)) {
        return null;
    }
    $params = [];
    foreach ($pattern as $i => $part) {
        if ($part === '*') {
            $params[] = $segments[$i];
        } elseif ($part !== $segments[$i]) {
            return null;
        }
    }
    return $params;
}

require __DIR__ . '/routes/v1.php';
require __DIR__ . '/routes/public.php';
require __DIR__ . '/routes/account.php';
require __DIR__ . '/routes/admin.php';

json_error('Endpoint não encontrado.', 404, 'not_found');
