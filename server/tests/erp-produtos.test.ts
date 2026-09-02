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

import { camposTravados, serializarTravas } from '../src/erp-produtos.ts';

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
