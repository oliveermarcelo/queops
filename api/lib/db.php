<?php
/**
 * Conexão PDO única com o MySQL.
 *
 * ATENÇÃO: todas as consultas do projeto usam prepared statements com
 * parâmetros. Nenhuma entrada do usuário é concatenada em SQL.
 */

declare(strict_types=1);

function app_config(): array
{
    static $config = null;
    if ($config !== null) {
        return $config;
    }
    $path = __DIR__ . '/../config.php';
    if (!is_file($path)) {
        json_error(
            'API não configurada: copie api/config.example.php para api/config.php.',
            500,
            'not_configured'
        );
    }
    return $config = require $path;
}

function db(): PDO
{
    static $pdo = null;
    if ($pdo instanceof PDO) {
        return $pdo;
    }

    $c = app_config()['db'];
    $dsn = sprintf(
        'mysql:host=%s;port=%d;dbname=%s;charset=%s',
        $c['host'],
        $c['port'],
        $c['name'],
        $c['charset']
    );

    try {
        $pdo = new PDO($dsn, $c['user'], $c['password'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            // Prepares reais no servidor: sem interpolação no lado do PHP.
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);
        $pdo->exec("SET time_zone = '-03:00'");
    } catch (PDOException $e) {
        error_log('[queops] falha ao conectar no MySQL: ' . $e->getMessage());
        json_error('Não foi possível conectar ao banco de dados.', 503, 'db_unavailable');
    }

    return $pdo;
}

/** SELECT que devolve todas as linhas. */
function db_all(string $sql, array $params = []): array
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->fetchAll();
}

/** SELECT que devolve a primeira linha (ou null). */
function db_one(string $sql, array $params = []): ?array
{
    $st = db()->prepare($sql);
    $st->execute($params);
    $row = $st->fetch();
    return $row === false ? null : $row;
}

/** INSERT/UPDATE/DELETE — devolve o número de linhas afetadas. */
function db_run(string $sql, array $params = []): int
{
    $st = db()->prepare($sql);
    $st->execute($params);
    return $st->rowCount();
}

/** Próximo valor de um contador, de forma atômica. */
function next_counter(string $name): int
{
    db_run(
        'INSERT INTO counters (name, value) VALUES (?, 1)
         ON DUPLICATE KEY UPDATE value = value + 1',
        [$name]
    );
    $row = db_one('SELECT value FROM counters WHERE name = ?', [$name]);
    return (int) ($row['value'] ?? 1);
}
