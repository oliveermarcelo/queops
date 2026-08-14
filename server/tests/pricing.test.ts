/**
 * Testes do motor de preços — o código onde um erro custa dinheiro.
 *
 *   npm run teste
 *
 * Não precisa de banco: as funções de frete e prazo são puras e recebem a
 * configuração por parâmetro. `quoteCart` (que consulta produtos) é coberta
 * pelos testes de ponta a ponta em tests/e2e/.
 *
 * São os MESMOS casos da versão PHP (tests/pricing_test.php), um a um: é o que
 * prova que a troca de runtime não mudou nenhuma regra de cobrança.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { round2 } from '../src/http.ts';
import {
  calculateShipping,
  deliveryDaysFor,
  normalizeCep,
  pesoEmGramas,
  ufFromCep,
} from '../src/pricing.ts';
import type { ShippingConfig } from '../src/store.ts';

test('CEP → UF', () => {
  assert.equal(ufFromCep('01310-100'), 'SP', 'capital de SP');
  assert.equal(ufFromCep('19900000'), 'SP', 'interior de SP');
  assert.equal(ufFromCep('20040-002'), 'RJ', 'Rio de Janeiro');
  assert.equal(ufFromCep('90010000'), 'RS', 'Porto Alegre');
  assert.equal(ufFromCep('70040-010'), 'DF', 'Brasília');
  assert.equal(ufFromCep('74000-000'), 'GO', 'Goiânia (depois da faixa do DF)');
  assert.equal(ufFromCep('69050-000'), 'AM', 'Manaus (faixa alta)');
  assert.equal(ufFromCep('1234'), '', 'CEP curto é inválido');
  assert.equal(ufFromCep('abcdefgh'), '', 'CEP com letras');
});

test('normalização de CEP', () => {
  assert.equal(normalizeCep('01310-100'), '01310100');
  assert.equal(normalizeCep('  01310100 '), '01310100');
  assert.equal(normalizeCep('013101001'), '', 'nove dígitos não é CEP');
});

test('prazo de entrega', () => {
  assert.equal(deliveryDaysFor('SP'), 3, 'SP em 3 dias');
  assert.equal(deliveryDaysFor('PR'), 4, 'Sul/Sudeste em 4');
  assert.equal(deliveryDaysFor('BA'), 6, 'Nordeste próximo em 6');
  assert.equal(deliveryDaysFor(''), 7, 'sem UF, estimativa conservadora');
  assert.equal(deliveryDaysFor('ZZ'), 8, 'UF desconhecida');
});

/** A mesma configuração usada nos testes da versão PHP. */
const base: ShippingConfig = {
  defaultPrice: 24.9,
  perState: { SP: 14.9, RJ: 19.9 },
  cepRanges: [
    { id: 'cr1', from: '01000000', to: '05999999', price: 9.9, label: 'Capital SP' },
    { id: 'cr2', from: '06000000', to: '06999999', free: true, label: 'Osasco grátis' },
  ],
  freeShipping: { enabled: true, minOrder: 199.0, states: [] },
};

/** Cópia profunda rasa o suficiente para os casos abaixo. */
const com = (patch: Partial<ShippingConfig['freeShipping']>): ShippingConfig => ({
  ...base,
  freeShipping: { ...base.freeShipping, ...patch },
});

test('cálculo do frete', () => {
  assert.equal(
    calculateShipping(base, 100, 'SP', '01310-100').cost, 9.9,
    'faixa de CEP tem prioridade sobre a UF',
  );
  assert.equal(
    calculateShipping(base, 100, 'SP', '06000-000').cost, 0,
    'faixa marcada como grátis zera o frete',
  );
  assert.equal(
    calculateShipping(base, 100, 'SP', '19900-000').cost, 14.9,
    'fora das faixas, usa o preço da UF',
  );
  assert.equal(
    calculateShipping(base, 100, 'BA', '40000-000').cost, 24.9,
    'UF sem preço cai no padrão',
  );

  const acima = calculateShipping(base, 250, 'BA', '40000-000');
  assert.equal(acima.cost, 0, 'acima do mínimo, frete grátis');
  assert.equal(acima.reason, 'free_min_order', 'e o motivo é registrado');

  assert.equal(
    calculateShipping(base, 0, 'SP', '01310-100').cost, 9.9,
    'sacola vazia não ganha frete grátis por valor',
  );
  assert.equal(
    calculateShipping(com({ states: ['SP'] }), 10, 'SP', '01310-100').cost, 0,
    'UF em freeShipping.states zera qualquer valor',
  );
  assert.equal(
    calculateShipping(com({ enabled: false }), 5000, 'BA', '40000-000').cost, 24.9,
    'com frete grátis desligado, sempre cobra',
  );
});

test('regressões já corrigidas', () => {
  assert.equal(
    calculateShipping(com({ minOrder: 0 }), 5, 'BA', '40000-000').cost, 24.9,
    'minOrder 0 significa regra desligada, não tudo grátis',
  );
  assert.equal(
    calculateShipping(base, 250, 'SP', '01310-100').cost, 0,
    'mínimo atingido zera até a faixa de CEP',
  );
  assert.equal(
    calculateShipping(base, 250, 'SP', '06000-000').cost, 0,
    'faixa marcada grátis continua grátis acima do mínimo',
  );
  assert.equal(
    calculateShipping(com({ states: ['SP'] }), 10, 'SP', '01310-100').reason, 'free_state',
    'UF sempre grátis vence a faixa de CEP',
  );
});

/**
 * Arredondamento — específico da versão Node.
 *
 * O `Math.round(v * 100) / 100` puro erra em 2.675 (dá 2.67, porque o produto
 * binário é 267.49999999999997), e o PHP dava 2.68. Um centavo de diferença
 * entre a prévia do checkout e o pedido gravado é o tipo de bug que só aparece
 * na conciliação do fim do mês.
 */
test('arredondamento igual ao do PHP', () => {
  assert.equal(round2(2.675), 2.68);
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(0.145), 0.15);
  assert.equal(round2(10), 10);
  assert.equal(round2(19.899999999999999), 19.9);
  // 5% de Pix sobre 249,90
  assert.equal(round2(249.9 * 0.05), 12.5);
});

/**
 * Peso do produto — campo de texto livre.
 *
 * `products.weight` é VARCHAR: quem cadastra escreve "1,2 kg", "800g" ou
 * deixa vazio. O peso vira preço de frete nos Correios, então cada forma de
 * escrever precisa cair no número certo.
 *
 * O caso que motivou o teste: "1.5 kg" era lido como 15 kg, porque o ponto
 * decimal estava sendo removido como se fosse separador de milhar. O frete
 * saía dez vezes maior.
 */
test('peso do produto em gramas', () => {
  // Com unidade explícita
  assert.equal(pesoEmGramas('1,2 kg'), 1200);
  assert.equal(pesoEmGramas('1.5 kg'), 1500);
  assert.equal(pesoEmGramas('2kg'), 2000);
  assert.equal(pesoEmGramas('800g'), 800);
  assert.equal(pesoEmGramas('250 gramas'), 250);
  assert.equal(pesoEmGramas('3 quilos'), 3000);

  // Ponto como separador de milhar (3 dígitos depois) vs. decimal
  assert.equal(pesoEmGramas('1.200 g'), 1200);
  assert.equal(pesoEmGramas('2.5kg'), 2500);

  // Sem unidade: número pequeno é kg, grande é grama
  assert.equal(pesoEmGramas('0.5'), 500);
  assert.equal(pesoEmGramas('0,3'), 300);
  assert.equal(pesoEmGramas('1500'), 1500);

  // Sem valor utilizável, cai no padrão
  assert.equal(pesoEmGramas(''), 500);
  assert.equal(pesoEmGramas('abc'), 500);
  assert.equal(pesoEmGramas('0'), 500);
  assert.equal(pesoEmGramas('a definir', 800), 800);
});
