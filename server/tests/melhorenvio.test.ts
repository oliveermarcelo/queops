/**
 * Leitura da resposta do Melhor Envio — sem rede.
 *
 * O que estes testes protegem: é neste mapeamento que um campo renomeado pela
 * API viraria frete R$ 0,00 no checkout, e um serviço com erro viraria opção
 * "grátis" na tela. Nenhum dos dois quebra nada visivelmente — apenas cobra
 * errado, o que é pior.
 *
 * Os exemplos seguem o formato documentado em
 * https://docs.melhorenvio.com.br/reference/calculo-de-fretes-por-produtos
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { detalheDoErro, mapearOpcoes } from '../src/melhorenvio.ts';

test('cotação normal vira opção da loja', () => {
  const [o] = mapearOpcoes([{
    id: 2,
    name: '.Package',
    price: '18.50',
    custom_price: '17.90',
    discount: '0.60',
    delivery_time: 5,
    company: { id: 2, name: 'Jadlog' },
  }]);

  assert.equal(o.servico, '2');
  assert.equal(o.nome, 'Jadlog · .Package');
  assert.equal(o.transportadora, 'Jadlog');
  assert.equal(o.prazoDias, 5);
  assert.equal(o.erro, '');
});

/**
 * `custom_price` é o preço com o que a lojista configurou no Melhor Envio.
 * Cobrar o `price` cru daria um valor diferente do que ela vê no painel dela.
 */
test('o preço cobrado é o custom_price, não o price cru', () => {
  const [o] = mapearOpcoes([{
    id: 1, name: 'PAC', price: '25.00', custom_price: '19.90',
    delivery_time: 8, company: { name: 'Correios' },
  }]);
  assert.equal(o.preco, 19.9);
});

test('sem custom_price, usa o price', () => {
  const [o] = mapearOpcoes([{ id: 3, name: 'SEDEX', price: '41.10', delivery_time: 2 }]);
  assert.equal(o.preco, 41.1);
});

/**
 * Serviço que não atende a rota vem na lista COM erro. Tratar como opção válida
 * colocaria "R$ 0,00 — grátis" no checkout, e a loja entregaria de graça.
 */
test('serviço com erro não vira frete grátis', () => {
  const [o] = mapearOpcoes([{
    id: 15,
    name: 'Express',
    company: { name: 'Loggi' },
    error: 'Serviço não disponível para o trecho selecionado',
  }]);
  assert.equal(o.preco, 0);
  assert.match(o.erro, /não disponível/);
});

test('preço ausente ou zero é tratado como falha, não como grátis', () => {
  const [semPreco] = mapearOpcoes([{ id: 4, name: 'X', company: { name: 'Y' } }]);
  assert.equal(semPreco.erro, 'sem preço');
  const [zerado] = mapearOpcoes([{ id: 5, name: 'X', price: '0', company: { name: 'Y' } }]);
  assert.equal(zerado.erro, 'sem preço');
});

test('prazo ausente não quebra o mapeamento', () => {
  const [o] = mapearOpcoes([{ id: 6, name: 'X', price: '10.00', company: { name: 'Y' } }]);
  assert.equal(o.prazoDias, 0);
});

test('sem transportadora, o nome fica só com a modalidade', () => {
  const [o] = mapearOpcoes([{ id: 7, name: 'Mini Envios', price: '9.90' }]);
  assert.equal(o.nome, 'Mini Envios');
  assert.equal(o.transportadora, '');
});

// ------------------------------------------------------------- erros ----

test('erro em texto simples', () => {
  assert.equal(detalheDoErro('{"error":"Unauthenticated."}'), 'Unauthenticated.');
  assert.equal(detalheDoErro('{"message":"CEP de origem inválido"}'), 'CEP de origem inválido');
});

/** Validação do Laravel: mapa de campo → lista de mensagens. */
test('erro de validação por campo', () => {
  assert.equal(
    detalheDoErro('{"errors":{"products.0.weight":["O campo peso é obrigatório."]}}'),
    'products.0.weight: O campo peso é obrigatório.',
  );
});

test('formato desconhecido devolve o corpo cru em vez de nada', () => {
  const corpo = '{"campoNovo":"limite de cotações excedido"}';
  assert.equal(detalheDoErro(corpo), corpo);
});

test('corpo vazio não vira mensagem', () => {
  assert.equal(detalheDoErro(''), '');
  assert.equal(detalheDoErro('   '), '');
});
