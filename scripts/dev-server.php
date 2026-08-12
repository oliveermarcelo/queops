<?php
/**
 * Roteador do servidor embutido do PHP para desenvolvimento local.
 *
 *   php -S 127.0.0.1:8000 scripts/dev-server.php
 *
 * O Vite (npm run dev) já encaminha /api para cá — veja o proxy em
 * vite.config.ts. Em produção quem faz esse papel é o api/.htaccess.
 */

declare(strict_types=1);

$uri = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

if (str_starts_with($uri, '/api')) {
    $_GET['route'] = ltrim(substr($uri, 4), '/');
    require __DIR__ . '/../api/index.php';
    return true;
}

// Arquivo estático existente: deixa o servidor embutido entregar.
$docRoot = $_SERVER['DOCUMENT_ROOT'] ?? '';
if ($docRoot !== '' && $uri !== '/' && is_file($docRoot . $uri)) {
    return false;
}

/**
 * Fallback da SPA: /admin e demais rotas devolvem o index.html, imitando o que
 * o public/.htaccess faz em produção. Sem isso, `php -S ... -t dist` daria 404
 * em /admin e o preview não representaria o servidor real.
 */
$index = $docRoot . '/index.html';
if (is_file($index)) {
    header('Content-Type: text/html; charset=utf-8');
    readfile($index);
    return true;
}

return false;
