<?php
/**
 * Configuração da API — copie para `config.php` e preencha.
 *
 * O `config.php` real NÃO vai para o Git (está no .gitignore) e não é servido
 * pelo Apache (bloqueado no api/.htaccess). Na Hostinger, os dados de MySQL
 * ficam em hPanel → Bancos de Dados → Gerenciamento de bancos MySQL.
 */

return [
    'db' => [
        'host'     => getenv('DB_HOST') ?: 'localhost',
        'port'     => (int) (getenv('DB_PORT') ?: 3306),
        'name'     => getenv('DB_NAME') ?: 'u000000000_queops',
        'user'     => getenv('DB_USER') ?: 'u000000000_queops',
        'password' => getenv('DB_PASS') ?: 'TROQUE_ESTA_SENHA',
        'charset'  => 'utf8mb4',
    ],

    /**
     * Chave de 32 bytes em base64, usada para cifrar as credenciais das
     * integrações (AES-256-GCM). Gere a sua com:
     *
     *     php -r "echo base64_encode(random_bytes(32)), PHP_EOL;"
     *
     * Trocar esta chave torna ilegíveis as credenciais já salvas.
     */
    'app_key' => getenv('APP_KEY') ?: '',

    /** Origem pública da loja — usada em links e na checagem de CSRF. */
    'app_url' => getenv('APP_URL') ?: 'https://queopspiramides.com.br',

    /** true em produção: exige HTTPS nos cookies de sessão. */
    'secure_cookies' => (getenv('SECURE_COOKIES') ?: 'true') === 'true',

    /** Ambiente: 'production' esconde detalhes de erro do cliente. */
    'env' => getenv('APP_ENV') ?: 'production',
];
