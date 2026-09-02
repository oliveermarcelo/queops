/**
 * Formato do pedido na API — o contrato que o ERP consome.
 *
 * `orderRowToApi` é pura, então dá para fixar o contrato sem banco. E vale
 * fixar: o ERP do cliente lê estes nomes de campo para emitir nota e etiqueta.
 * Renomear ou trocar o tipo de qualquer um deles aqui é quebrar a integração do
 * outro lado — quem faz a mudança precisa ver um teste vermelho antes de
 * descobrir pelo suporte.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import { orderRowToApi } from '../src/store.ts';

const LINHA: Record<string, unknown> = {
  id: 'QP-000142',
  created_at: '2026-08-30 18:22:41',
  customer_name: 'Maria Oliveira',
  customer_email: 'maria@exemplo.com',
  customer_phone: '(11) 98888-7777',
  customer_cpf: '123.456.789-09',
  subtotal: '379.80',
  shipping_cost: '26.63',
  discount: '18.99',
  total: '387.44',
  coupon_code: 'BEMVINDO10',
  status: 'paid',
  payment: 'pix',
  channel: 'site',
  ship_cep: '44823-478',
  ship_street: 'Rua das Flores',
  ship_number: '250',
  ship_complement: 'Apto 42',
  ship_neighborhood: 'Centro',
  ship_city: 'Jacobina',
  ship_state: 'BA',
  shipping_service: 'Jadlog · .Package — até 5 dias úteis',
  delivery_eta: '2026-09-08',
  tracking_code: '',
  tracking_status: '',
};

const ITENS = [
  { product_id: 'piramide-cobre-15cm-1001', name: 'Pirâmide de Cobre 15cm', quantity: 2, unit_price: '189.90' },
] as never[];

test('o pedido leva o endereço de entrega completo', () => {
  const o = orderRowToApi(LINHA as never, ITENS) as Record<string, never>;
  assert.deepEqual(o.shippingAddress, {
    cep: '44823-478',
    street: 'Rua das Flores',
    number: '250',
    complement: 'Apto 42',
    neighborhood: 'Centro',
    city: 'Jacobina',
    state: 'BA',
  });
});

/**
 * `shipping` continua sendo o VALOR do frete.
 *
 * O endereço entrou como `shippingAddress` justamente para não trocar o tipo de
 * um campo já publicado: número virando objeto quebraria quem já consome.
 */
test('shipping continua número, e o endereço é um campo à parte', () => {
  const o = orderRowToApi(LINHA as never, ITENS) as Record<string, never>;
  assert.equal(typeof o.shipping, 'number');
  assert.equal(o.shipping as unknown as number, 26.63);
  assert.equal(typeof o.shippingAddress, 'object');
});

test('transportadora escolhida e previsão de entrega saem no pedido', () => {
  const o = orderRowToApi(LINHA as never, ITENS) as Record<string, never>;
  assert.match(String(o.shippingService), /Jadlog/);
  assert.equal(o.deliveryEta as unknown as string, '2026-09-08');
});

/**
 * O CPF sai no pedido porque o ERP emite NF-e ao consumidor.
 *
 * Fica pinado aqui por dois motivos opostos, e os dois importam: remover o
 * campo para o ERP de nota, e mudar o tipo quando o comprador não informou.
 * Se virar `null` em vez de `''`, o lado do ERP que faz `.replace(/\D/g, '')`
 * quebra no pedido sem CPF — que é exatamente o caso menos testado lá.
 */
test('CPF do comprador sai no pedido, e vazio é string vazia', () => {
  const o = orderRowToApi(LINHA as never, ITENS) as Record<string, never>;
  assert.equal(o.customerCpf as unknown as string, '123.456.789-09');

  const semCpf = orderRowToApi({ ...LINHA, customer_cpf: null } as never, ITENS) as Record<string, never>;
  assert.equal(semCpf.customerCpf as unknown as string, '');
});

test('pedido antigo, sem esses dados, não quebra o formato', () => {
  const antigo = { ...LINHA, shipping_service: null, delivery_eta: null, ship_complement: null };
  const o = orderRowToApi(antigo as never, ITENS) as Record<string, never>;
  assert.equal(o.shippingService as unknown as string, '');
  assert.equal(o.deliveryEta as unknown as null, null);
  assert.equal((o.shippingAddress as unknown as Record<string, string>).complement, '');
});

test('valores monetários são número, não texto do banco', () => {
  const o = orderRowToApi(LINHA as never, ITENS) as Record<string, never>;
  for (const campo of ['subtotal', 'shipping', 'discount', 'total']) {
    assert.equal(typeof o[campo], 'number', campo);
  }
  const itens = o.items as unknown as { unitPrice: number; quantity: number }[];
  assert.equal(itens[0].unitPrice, 189.9);
  assert.equal(itens[0].quantity, 2);
});
