<?php
/**
 * Testes do motor de preços — o código onde um erro custa dinheiro.
 *
 *   php tests/pricing_test.php
 *
 * Não precisa de banco: as funções de frete e prazo são puras, e recebem a
 * configuração por parâmetro. `quote_cart` (que consulta produtos) é coberta
 * pelos testes de ponta a ponta em tests/e2e/.
 */

declare(strict_types=1);

require __DIR__ . '/../api/lib/http.php';
require __DIR__ . '/../api/lib/pricing.php';

$passed = 0;
$failed = 0;

function check(string $name, mixed $expected, mixed $actual): void
{
    global $passed, $failed;
    if ($expected === $actual) {
        $passed++;
        echo "  ok   {$name}\n";
        return;
    }
    $failed++;
    printf("  FALHA %s\n       esperado: %s\n       obtido:   %s\n", $name, var_export($expected, true), var_export($actual, true));
}

// ---------------------------------------------------------------- CEP ----

echo "CEP → UF\n";
check('capital de SP',        'SP', uf_from_cep('01310-100'));
check('interior de SP',       'SP', uf_from_cep('19900000'));
check('Rio de Janeiro',       'RJ', uf_from_cep('20040-002'));
check('Porto Alegre',         'RS', uf_from_cep('90010000'));
check('Brasília',             'DF', uf_from_cep('70040-010'));
check('Goiânia (após o DF)',  'GO', uf_from_cep('74000-000'));
check('Manaus (faixa alta)',  'AM', uf_from_cep('69050-000'));
check('CEP curto é inválido', '',   uf_from_cep('1234'));
check('CEP com letras',       '',   uf_from_cep('abcdefgh'));

echo "\nPrazo de entrega\n";
check('SP em 3 dias',        3, delivery_days_for('SP'));
check('Sul/Sudeste em 4',    4, delivery_days_for('PR'));
check('UF desconhecida', 8, delivery_days_for('ZZ'));

// ------------------------------------------------------------- frete ----

$config = [
    'defaultPrice' => 24.9,
    'perState'     => ['SP' => 14.9, 'RJ' => 19.9],
    'cepRanges'    => [
        ['id' => 'cr1', 'from' => '01000000', 'to' => '05999999', 'price' => 9.9, 'label' => 'Capital SP'],
        ['id' => 'cr2', 'from' => '06000000', 'to' => '06999999', 'free' => true, 'label' => 'Osasco grátis'],
    ],
    'freeShipping' => ['enabled' => true, 'minOrder' => 199.0, 'states' => []],
];

echo "\nCálculo do frete\n";

$r = calculate_shipping($config, 100.0, 'SP', '01310-100');
check('faixa de CEP tem prioridade sobre a UF', 9.9, $r['cost']);

$r = calculate_shipping($config, 100.0, 'SP', '06000-000');
check('faixa marcada como grátis zera o frete', 0.0, $r['cost']);

$r = calculate_shipping($config, 100.0, 'SP', '19900-000');
check('fora das faixas, usa o preço da UF', 14.9, $r['cost']);

$r = calculate_shipping($config, 100.0, 'BA', '40000-000');
check('UF sem preço cai no padrão', 24.9, $r['cost']);

$r = calculate_shipping($config, 250.0, 'BA', '40000-000');
check('acima do mínimo, frete grátis', 0.0, $r['cost']);
check('e o motivo é registrado', 'free_min_order', $r['reason']);

$r = calculate_shipping($config, 0.0, 'SP', '01310-100');
check('sacola vazia não ganha frete grátis por valor', 9.9, $r['cost']);

// UF na lista de frete grátis incondicional
$semRestricao = $config;
$semRestricao['freeShipping']['states'] = ['SP'];
$r = calculate_shipping($semRestricao, 10.0, 'SP', '01310-100');
check('UF em freeShipping.states zera qualquer valor', 0.0, $r['cost']);

// Frete grátis desligado
$desligado = $config;
$desligado['freeShipping']['enabled'] = false;
$r = calculate_shipping($desligado, 5000.0, 'BA', '40000-000');
check('com frete grátis desligado, sempre cobra', 24.9, $r['cost']);

// Regressões cobertas por revisão de código (ver histórico do projeto).
echo "\nRegressões\n";

$semMinimo = $config;
$semMinimo['freeShipping']['minOrder'] = 0.0;
$r = calculate_shipping($semMinimo, 5.0, 'BA', '40000-000');
check('minOrder 0 significa regra desligada, não tudo grátis', 24.9, $r['cost']);

$r = calculate_shipping($config, 250.0, 'SP', '01310-100');
check('mínimo atingido zera até a faixa de CEP', 0.0, $r['cost']);

$r = calculate_shipping($config, 250.0, 'SP', '06000-000');
check('faixa marcada grátis continua grátis acima do mínimo', 0.0, $r['cost']);

$comUf = $config;
$comUf['freeShipping']['states'] = ['SP'];
$r = calculate_shipping($comUf, 10.0, 'SP', '01310-100');
check('UF sempre grátis vence a faixa de CEP', 'free_state', $r['reason']);

echo "\n";
echo $failed === 0
    ? "Todos os {$passed} testes passaram.\n"
    : "{$passed} passaram, {$failed} falharam.\n";

exit($failed === 0 ? 0 : 1);
