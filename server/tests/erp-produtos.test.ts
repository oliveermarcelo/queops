/**
 * Recepção de produto do ERP — as regras que não dependem de banco.
 *
 * Duas coisas aqui custam dinheiro se estiverem erradas, e as duas são
 * silenciosas: peso que a loja não sabe interpretar (frete calculado por baixo,
 * e ninguém reclama de frete barato) e campo escrito errado pelo ERP ("preco"
 * em vez de "price"), que sem aviso seria aceito e nunca mudaria o preço.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { camposTravados, converter, serializarTravas } from '../src/erp-produtos.ts';

test('lista de campos travados vem da coluna, tolerando espaço e vazio', () => {
  assert.deepEqual(camposTravados({ locked_fields: 'price,stock' } as never), ['price', 'stock']);
  assert.deepEqual(camposTravados({ locked_fields: ' price , stock ' } as never), ['price', 'stock']);
  assert.deepEqual(camposTravados({ locked_fields: '' } as never), []);
  assert.deepEqual(camposTravados(null), []);
});

test('serializar remove duplicatas e ordena, para a coluna ser estável', () => {
  assert.equal(serializarTravas(['stock', 'price', 'stock']), 'price,stock');
  assert.equal(serializarTravas([]), '');
});

/**
 * Campo inventado não entra na trava.
 *
 * Sem esse filtro, um erro de digitação do ERP encheria a coluna de lixo até
 * estourar os 255 caracteres — e aí travas de verdade começariam a ser
 * perdidas em silêncio.
 */
test('só campo gravável pode ser travado', () => {
  assert.equal(serializarTravas(['price', 'campo_inventado', 'id']), 'price');
});

/**
 * Estoque fracionado.
 *
 * O ERP trabalha o saldo como número fracionário; a loja exigia inteiro e
 * recusava 7,5 com 422. Aceitar e arredondar em silêncio seria pior: os dois
 * sistemas passariam a discordar do saldo, cada um confiante no seu número, e
 * a diferença apareceria num inventário meses depois.
 */
test('estoque aceita fração, recusa negativo e avisa ao arredondar', () => {
  assert.equal(converter('stock', 7.5).valor, 7.5);
  assert.equal(converter('stock', 7).valor, 7);
  assert.equal(converter('stock', '7.5').valor, 7.5);
  assert.equal(converter('stock', 0).valor, 0);

  assert.match(String(converter('stock', -1).erro), /maior ou igual a zero/);
  assert.match(String(converter('stock', 'muito').erro), /número/);

  // Além de 3 casas a coluna não guarda: arredonda, mas conta o que fez.
  const quatroCasas = converter('stock', 1.2345);
  assert.equal(quatroCasas.valor, 1.235);
  assert.match(String(quatroCasas.aviso), /arredondado/);
});

/**
 * Peso: número em quilos.
 *
 * Peso errado é a falha mais cara deste DTO e a mais silenciosa — ninguém abre
 * chamado porque o frete saiu barato. Por isso todo caminho duvidoso avisa.
 */
test('peso é número em quilos', () => {
  assert.equal(converter('weight', 0.2).valor, 0.2);
  assert.equal(converter('weight', 3).valor, 3);
  assert.equal(converter('weight', '0,2').valor, 0.2);
  assert.equal(converter('weight', '1.5').valor, 1.5);
});

test('peso vazio ou zero avisa que o frete vai usar o padrão', () => {
  for (const v of [null, undefined, '', 0]) {
    const r = converter('weight', v);
    assert.equal(r.valor, 0, String(v));
    assert.match(String(r.aviso), /peso padrão de 500 g/, String(v));
  }
});

/**
 * Gramas no lugar de quilos multiplica o frete por mil.
 *
 * Não recuso — não me cabe decidir que a loja nunca vai vender uma peça de
 * 150 kg —, mas o aviso já traz a conta feita, para quem lê a resposta não ter
 * que desconfiar por conta própria.
 */
test('peso alto passa, com aviso de unidade e a conta feita', () => {
  const r = converter('weight', 200);
  assert.equal(r.valor, 200);
  assert.match(String(r.aviso), /QUILO/);
  assert.match(String(r.aviso), /0\.2 kg/);
});

test('peso em texto com unidade é convertido, com aviso', () => {
  const r = converter('weight', '0,2kg');
  assert.equal(r.valor, 0.2);
  assert.match(String(r.aviso), /numérico, em quilos/);

  const g = converter('weight', '800 g');
  assert.equal(g.valor, 0.8);
});

test('texto sem número nenhum no peso é erro, não aviso', () => {
  const r = converter('weight', 'a definir');
  assert.equal(r.valor, null);
  assert.match(String(r.erro), /weightLabel/);
});

test('weightLabel é só rótulo de vitrine', () => {
  assert.equal(converter('weightLabel', 'Base 15cm · cobre').valor, 'Base 15cm · cobre');
  assert.equal(converter('weightLabel', '').valor, '');
});
