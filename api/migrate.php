<?php
/**
 * Instalador / migrador do banco.
 *
 *   Terminal:  php api/migrate.php --admin-email=voce@dominio.com.br --admin-pass='SenhaForte123' [--demo]
 *   Navegador: https://seudominio.com.br/api/migrate.php?key=<SETUP_KEY>
 *
 * Cria as tabelas (idempotente), carrega o catálogo de api/seed/catalog.json,
 * grava as configurações padrão e cadastra o primeiro administrador.
 *
 * Pela web só roda enquanto NÃO existir nenhum administrador — depois disso o
 * endpoint se recusa a executar. Apague este arquivo após instalar.
 */

declare(strict_types=1);

require __DIR__ . '/lib/http.php';
require __DIR__ . '/lib/db.php';
require __DIR__ . '/lib/crypto.php';
require __DIR__ . '/lib/store.php';

$isCli = PHP_SAPI === 'cli';
$log = [];
$say = static function (string $m) use (&$log, $isCli): void {
    $log[] = $m;
    if ($isCli) {
        echo $m, PHP_EOL;
    }
};

// ----------------------------------------------------------- parâmetros ----

$opts = [];
if ($isCli) {
    foreach (array_slice($argv, 1) as $arg) {
        if (preg_match('/^--([a-z-]+)(?:=(.*))?$/', $arg, $m)) {
            $opts[$m[1]] = $m[2] ?? '1';
        }
    }
} else {
    header('Content-Type: text/plain; charset=utf-8');
    $cfg = app_config();
    $key = (string) ($cfg['setup_key'] ?? '');
    if ($key === '' || ($_GET['key'] ?? '') !== $key) {
        http_response_code(403);
        exit("Chave de instalação inválida. Defina 'setup_key' em api/config.php.\n");
    }
    $opts = [
        'admin-email' => (string) ($_GET['admin-email'] ?? ''),
        'admin-pass'  => (string) ($_GET['admin-pass'] ?? ''),
        'demo'        => isset($_GET['demo']) ? '1' : null,
    ];
}

// -------------------------------------------------------------- schema ----

$sql = file_get_contents(__DIR__ . '/schema.sql');
if ($sql === false) {
    exit("schema.sql não encontrado.\n");
}
// Remove as linhas de comentário ANTES de dividir: um bloco que começa com
// "-- ..." continua sendo um CREATE TABLE válido logo abaixo, e descartá-lo
// inteiro deixaria tabelas faltando (e chaves estrangeiras quebradas).
$sqlNoComments = preg_replace('/^\s*--.*$/m', '', $sql) ?? $sql;
$statements = array_filter(
    array_map('trim', explode(';', $sqlNoComments)),
    static fn ($s) => $s !== ''
);
foreach ($statements as $stmt) {
    db()->exec($stmt);
}
$say('Tabelas criadas/verificadas: ' . count($statements) . ' comandos.');

/**
 * `CREATE TABLE IF NOT EXISTS` cria tabelas novas, mas ignora colunas novas em
 * tabelas que já existem — um deploy futuro que adicionasse uma coluna falharia
 * em silêncio até alguém abrir a tela que a usa. Aqui comparamos o schema.sql
 * com o banco e emitimos os ALTER que faltarem.
 */
$adicionadas = 0;
preg_match_all(
    '/CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\((.*?)\)\s*ENGINE=/s',
    $sqlNoComments,
    $tabelas,
    PREG_SET_ORDER
);

foreach ($tabelas as [, $tabela, $corpo]) {
    // Colunas declaradas no schema, na ordem em que aparecem.
    //
    // Só conta como coluna a linha cujo segundo token é um tipo SQL. Índices,
    // chaves e a continuação de um FOREIGN KEY ("REFERENCES ...") ficam de fora
    // — sem isso, "REFERENCES" viraria uma coluna e o ALTER falharia.
    $tipos = 'VARCHAR|VARBINARY|BINARY|CHAR|TINYTEXT|TEXT|MEDIUMTEXT|LONGTEXT|TINYINT|SMALLINT'
        . '|MEDIUMINT|BIGINT|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|DATETIME|TIMESTAMP|DATE|TIME'
        . '|YEAR|ENUM|SET|JSON|BLOB|MEDIUMBLOB|LONGBLOB|BOOLEAN|BOOL';

    $declaradas = [];
    foreach (explode("\n", $corpo) as $linha) {
        $linha = trim($linha);
        if ($linha === '') {
            continue;
        }
        if (preg_match('/^`?(\w+)`?\s+((?:' . $tipos . ')\b.*?),?$/i', $linha, $m)) {
            $declaradas[$m[1]] = rtrim(trim($m[2]), ',');
        }
    }

    $existentes = array_column(db_all("SHOW COLUMNS FROM `{$tabela}`"), 'Field');
    $anterior = null;
    foreach ($declaradas as $coluna => $definicao) {
        if (!in_array($coluna, $existentes, true)) {
            $posicao = $anterior === null ? 'FIRST' : "AFTER `{$anterior}`";
            db()->exec("ALTER TABLE `{$tabela}` ADD COLUMN `{$coluna}` {$definicao} {$posicao}");
            $say("  + coluna {$tabela}.{$coluna}");
            $adicionadas++;
        }
        $anterior = $coluna;
    }
}
$say($adicionadas === 0 ? 'Nenhuma coluna nova a adicionar.' : "Colunas adicionadas: {$adicionadas}.");

// Trava de segurança para execução via navegador.
$adminCount = (int) (db_one('SELECT COUNT(*) AS n FROM admin_users')['n'] ?? 0);
if (!$isCli && $adminCount > 0) {
    http_response_code(409);
    exit("Já existe administrador cadastrado. Rode as migrações pelo terminal.\n");
}

// ------------------------------------------------------------ catálogo ----

$catalogPath = __DIR__ . '/seed/catalog.json';
if (is_file($catalogPath)) {
    $catalog = json_decode((string) file_get_contents($catalogPath), true);

    // Categorias-mãe (a partir do menu) e subcategorias.
    $descriptions = [];
    foreach ($catalog['categories'] ?? [] as $c) {
        $descriptions[$c['id']] = $c['description'] ?? '';
    }
    $pos = 0;
    foreach ($catalog['menu'] ?? [] as $m) {
        db_run(
            'INSERT INTO categories (id, name, description, icon, featured, position)
             VALUES (?,?,?,?,?,?)
             ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description),
                icon=VALUES(icon), featured=VALUES(featured), position=VALUES(position)',
            [$m['id'], $m['name'], $descriptions[$m['id']] ?? '', $m['icon'] ?? '', !empty($m['featured']) ? 1 : 0, $pos++]
        );
        $subPos = 0;
        foreach ($m['subcategories'] ?? [] as $s) {
            db_run(
                'INSERT INTO subcategories (parent_id, id, name, position) VALUES (?,?,?,?)
                 ON DUPLICATE KEY UPDATE name=VALUES(name), position=VALUES(position)',
                [$m['id'], $s['id'], $s['name'], $subPos++]
            );
        }
    }
    $say('Categorias importadas.');

    // Produtos. Estoque inicial determinístico para a loja não nascer zerada.
    $defaultStock = [12, 8, 25, 4, 7, 18, 33, 6, 15, 9];
    $i = 0;
    foreach ($catalog['products'] ?? [] as $p) {
        db_run(
            'INSERT INTO products (
                id, sku, name, category, subcategory, category_label, description, long_description,
                price, old_price, stock, image, tag, weight, ingredients,
                highlight, active, position
             ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)
             ON DUPLICATE KEY UPDATE
                sku=VALUES(sku), name=VALUES(name), category=VALUES(category),
                subcategory=VALUES(subcategory), category_label=VALUES(category_label),
                description=VALUES(description), long_description=VALUES(long_description),
                price=VALUES(price), old_price=VALUES(old_price), image=VALUES(image),
                tag=VALUES(tag), weight=VALUES(weight), ingredients=VALUES(ingredients),
                highlight=VALUES(highlight), position=VALUES(position)',
            [
                $p['id'], $p['sku'] ?? '', $p['name'], $p['category'] ?? '', $p['subcategory'] ?? null,
                $p['categoryLabel'] ?? '', $p['description'] ?? '', $p['longDescription'] ?? null,
                $p['price'] ?? 0, $p['oldPrice'] ?? null,
                $p['stock'] ?? $defaultStock[$i % count($defaultStock)],
                $p['image'] ?? '', $p['tag'] ?? null, $p['weight'] ?? '', $p['ingredients'] ?? null,
                !empty($p['highlight']) ? 1 : 0, $i,
            ]
        );
        $i++;
    }
    $say("Produtos importados: {$i}.");
}

// ----------------------------------------------------------- configuração ----

foreach ([['settings', DEFAULT_SETTINGS], ['shipping', DEFAULT_SHIPPING], ['recovery', DEFAULT_RECOVERY]] as [$k, $v]) {
    if (db_one('SELECT config_key FROM store_config WHERE config_key = ?', [$k]) === null) {
        config_set($k, $v);
    }
}
foreach (INTEGRATION_IDS as $id) {
    db_run('INSERT IGNORE INTO integrations (id, enabled) VALUES (?, 0)', [$id]);
}
db_run("INSERT IGNORE INTO coupons (id, code, type, value, active, min_order) VALUES
    ('c1','BEMVINDO10','percent',10,1,100),
    ('c2','VOLTA10','percent',10,1,NULL)");
$say('Configurações e cupons padrão prontos.');

// -------------------------------------------------------- administrador ----

$email = trim((string) ($opts['admin-email'] ?? ''));
$pass  = (string) ($opts['admin-pass'] ?? '');

if ($email !== '' && $pass !== '') {
    if (strlen($pass) < 10) {
        $say('ERRO: a senha do administrador precisa ter pelo menos 10 caracteres.');
        exit(1);
    }
    db_run(
        'INSERT INTO admin_users (name, email, password_hash) VALUES (?,?,?)
         ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), active = 1',
        ['Administrador', mb_strtolower($email), password_hash($pass, PASSWORD_DEFAULT)]
    );
    $say("Administrador pronto: {$email}");
} elseif ($adminCount === 0) {
    $say('AVISO: nenhum administrador cadastrado. Rode de novo com --admin-email e --admin-pass.');
}

// ------------------------------------------------- histórico de exemplo ----

if (!empty($opts['demo'])) {
    require __DIR__ . '/seed/demo_orders.php';
    seed_demo_orders($say);
}

$say('Migração concluída.');

if (!$isCli) {
    echo implode(PHP_EOL, $log), PHP_EOL;
    echo PHP_EOL, 'IMPORTANTE: apague api/migrate.php do servidor agora.', PHP_EOL;
}
