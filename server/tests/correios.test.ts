/**
 * O motivo real da recusa dos Correios não pode ser engolido.
 *
 * Estes testes existem por um episódio concreto: a cotação era recusada, a CWS
 * mandava o porquê no corpo da resposta, e o painel exibia um palpite genérico
 * ("confira o cartão de postagem") porque a leitura do corpo cobria apenas dois
 * nomes de campo. Quem configurava ia conferir a coisa errada.
 *
 * A CWS não tem um formato único de erro — muda conforme o endpoint e conforme
 * a camada que recusou. Cada caso abaixo é uma dessas formas.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { _internos } from '../src/correios.ts';

const { detalheDoErro } = _internos;

test('formato com lista de mensagens', () => {
  assert.equal(
    detalheDoErro('{"msgs":["ERP-006: CEP de origem nao pode postar para CEP de destino"]}'),
    'ERP-006: CEP de origem nao pode postar para CEP de destino',
  );
});

test('formatos de campo único', () => {
  assert.equal(detalheDoErro('{"msg":"Cartão de postagem inválido"}'), 'Cartão de postagem inválido');
  assert.equal(detalheDoErro('{"txErro":"ERP-010: produto nao contratado"}'), 'ERP-010: produto nao contratado');
  assert.equal(detalheDoErro('{"descricao":"Contrato não encontrado"}'), 'Contrato não encontrado');
  assert.equal(detalheDoErro('{"causa":"nuDR é obrigatório"}'), 'nuDR é obrigatório');
});

/** Lista de objetos: o que interessa é a descrição de cada um, não o JSON. */
test('lista de objetos com descrição', () => {
  assert.equal(
    detalheDoErro('{"erros":[{"codigo":"400","descricao":"coProduto inválido"},{"codigo":"400","descricao":"psObjeto ausente"}]}'),
    'coProduto inválido · psObjeto ausente',
  );
});

/**
 * O caso que motivou tudo: JSON com um formato que não conhecemos. Devolver
 * vazio faria o palpite genérico aparecer no lugar da informação verdadeira —
 * texto técnico é melhor do que texto inventado.
 */
test('formato desconhecido devolve o corpo cru em vez de nada', () => {
  const corpo = '{"algumCampoNovo":"produto 03220 exige contrato"}';
  assert.equal(detalheDoErro(corpo), corpo);
});

test('corpo não-JSON curto ainda serve; longo demais é descartado', () => {
  assert.equal(detalheDoErro('Bad Request'), 'Bad Request');
  assert.equal(detalheDoErro('x'.repeat(500)), '');
});

test('corpo vazio não vira mensagem', () => {
  assert.equal(detalheDoErro(''), '');
  assert.equal(detalheDoErro('   '), '');
});

test('mensagem muito longa é cortada, não repassada inteira', () => {
  const longa = detalheDoErro(JSON.stringify({ msg: 'e'.repeat(500) }));
  assert.equal(longa.length, 300);
});
