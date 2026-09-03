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
  pesoDoProduto,
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
 * Peso do produto — leitura do texto livre antigo.
 *
 * `pesoEmGramas` deixou de ser a via principal: hoje o peso mora em
 * `products.weight_kg`, numérico. Ele continua existindo, e continua testado,
 * porque ainda lê o rótulo de medida de quem cadastrou "800g" ali antes da
 * separação dos campos — e porque é ele que converte o texto que o ERP
 * eventualmente mande no lugar do número.
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

/**
 * De onde sai o peso de um produto, e em que ordem.
 *
 * A ordem é o que este teste protege. Quando existem os dois — número e
 * rótulo —, quem manda é o número: um produto com `weight_kg = 3` e o rótulo
 * "Base 15cm" não pode ir para o frete como 15 cm interpretados como 15 kg.
 * Foi para acabar com esse tipo de adivinhação que o campo numérico existe.
 */
test('peso vem do campo numérico; o rótulo é só reserva', () => {
  // Número presente: manda ele, mesmo com rótulo que "parece" peso.
  assert.deepEqual(pesoDoProduto({ weight_kg: 3, weight: '800g' }), {
    gramas: 3000,
    origem: 'weight_kg',
  });

  // Sem número, aproveita o que estiver escrito no rótulo.
  assert.deepEqual(pesoDoProduto({ weight_kg: 0, weight: '800g' }), {
    gramas: 800,
    origem: 'rotulo',
  });

  /*
   * Rótulo que é MEDIDA, não peso: cai no padrão.
   *
   * Este é o caso que mais importa. Sem a exigência de unidade de massa,
   * "Base 15cm · cobre" era lido como 15 kg — o parser achava o 15, não achava
   * unidade, e assumia quilo. Trinta vezes o peso real, a partir de um campo
   * que nunca falou de peso, e sem erro nenhum aparecendo.
   */
  assert.deepEqual(pesoDoProduto({ weight_kg: 0, weight: 'Base 15cm · cobre' }), {
    gramas: 500,
    origem: 'padrao',
  });
  assert.equal(pesoDoProduto({ weight: '15cm' }).origem, 'padrao');
  assert.equal(pesoDoProduto({ weight: 'tamanho 40' }).origem, 'padrao');

  // Com unidade de massa escrita, o rótulo antigo continua valendo.
  assert.equal(pesoDoProduto({ weight: '1,2 kg' }).gramas, 1200);
  assert.equal(pesoDoProduto({ weight: '250 gramas' }).gramas, 250);

  // Produto inexistente no mapa, ou sem nenhum dos dois campos.
  assert.equal(pesoDoProduto(undefined).origem, 'padrao');
  assert.equal(pesoDoProduto({}).gramas, 500);

  // Fração de quilo sobrevive à conversão para gramas.
  assert.equal(pesoDoProduto({ weight_kg: 0.2 }).gramas, 200);
  assert.equal(pesoDoProduto({ weight_kg: 1.234 }).gramas, 1234);
});
