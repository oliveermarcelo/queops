/**
 * Categorias do ERP — as regras que não dependem de banco.
 *
 * O tema desta tela é tradução entre duas identidades: código (ERP) e slug
 * (loja). Errar a tradução não produz erro nenhum — produz produto na seção
 * errada da vitrine, que ninguém percebe olhando log.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  codigoNoMapa, erpCategoriaParaApi, normalizarCodigo, problemaNaCategoria,
} from '../src/erp-categorias.ts';

test('código é normalizado: é chave, não pode variar por espaço', () => {
  assert.equal(normalizarCodigo('  0012 '), '0012');
  assert.equal(normalizarCodigo(12), '12');
  assert.equal(normalizarCodigo(null), '');
  assert.equal(normalizarCodigo(undefined), '');
  assert.equal(normalizarCodigo('x'.repeat(80)).length, 60);
});

test('categoria sem código ou sem nome é recusada, item a item', () => {
  assert.equal(problemaNaCategoria({ code: '1', name: 'Pirâmides' }), '');
  assert.match(problemaNaCategoria({ name: 'Sem código' }), /code/);
  assert.match(problemaNaCategoria({ code: '1' }), /name/);
  assert.match(problemaNaCategoria({ code: '  ', name: 'x' }), /code/);
  assert.match(problemaNaCategoria({ code: '1', name: '   ' }), /name/);
  assert.match(problemaNaCategoria('não é objeto'), /objeto/);
  assert.match(problemaNaCategoria(null), /objeto/);
});

/**
 * A busca do código prefere a amarração mais específica.
 *
 * O ERP costuma ter um código por subcategoria, e a loja pode ter amarrado
 * tanto o nível-mãe quanto o filho. Devolver o código da mãe para um produto
 * que está numa subcategoria amarrada faria o ERP receber de volta um código
 * diferente do que enviou — e concluir, com razão, que a loja mudou a
 * categoria do produto por conta própria.
 */
test('código devolvido é o da amarração mais específica', () => {
  // A chave junta categoria e subcategoria com um byte nulo — nenhum slug tem
  // um, então "a" + "b-c" nunca colide com "a-b" + "c".
  const mapa = new Map<string, string>([
    ['acessorios\u0000', 'ACE'],
    ['acessorios\u0000pulseiras', 'ACE-PUL'],
  ]);

  assert.equal(codigoNoMapa(mapa, 'acessorios', 'pulseiras'), 'ACE-PUL');
  // Subcategoria sem amarração própria cai na da categoria-mãe.
  assert.equal(codigoNoMapa(mapa, 'acessorios', 'chaveiros'), 'ACE');
  assert.equal(codigoNoMapa(mapa, 'acessorios', null), 'ACE');
});

test('categoria sem amarração devolve null, não string vazia', () => {
  const mapa = new Map<string, string>([['acessorios\u0000', 'ACE']]);

  // `null` distingue "não sei traduzir" de "o campo não veio" — para o ERP,
  // as duas coisas pedem ações diferentes.
  assert.equal(codigoNoMapa(mapa, 'cristais', null), null);
  assert.equal(codigoNoMapa(mapa, '', null), null);
  assert.equal(codigoNoMapa(undefined, 'acessorios', null), null);
});

test('a linha do ERP vira API com o estado da amarração explícito', () => {
  const pendente = erpCategoriaParaApi({
    code: '0012', name: 'Pirâmides', parent_code: null,
    category_id: null, subcategory_id: null, active: 1,
  });
  assert.equal(pendente.linked, false);
  assert.equal(pendente.category, null);

  const amarrada = erpCategoriaParaApi({
    code: '0013', name: 'Pulseiras', parent_code: '0012',
    category_id: 'acessorios', subcategory_id: 'pulseiras', active: 1,
  });
  assert.equal(amarrada.linked, true);
  assert.equal(amarrada.category, 'acessorios');
  assert.equal(amarrada.subcategory, 'pulseiras');
  assert.equal(amarrada.parentCode, '0012');
});
