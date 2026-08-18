/**
 * Testes do pagamento que NÃO dependem do Mercado Pago responder.
 *
 * Cobrem as três coisas que, se estiverem erradas, custam dinheiro de verdade:
 * a tradução do status (liberar mercadoria sem pagamento), a validação da
 * assinatura do webhook (qualquer um liberar pedido) e a mensagem de recusa
 * (venda perdida porque o cliente não entendeu o que fazer).
 *
 * A parte que depende da API — criar cobrança, consultar — é coberta pelo
 * roteiro manual com os cartões de teste, em tests/README.md.
 */

import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';

import { InvalidWebhookSignatureError, WebhookSignatureValidator } from 'mercadopago';

import { motivoRecusa, traduzirStatus } from '../src/payments/mercadopago.ts';
import { _internos } from '../src/routes/webhooks.ts';

const { tempoDentroDaJanela, carimboDaAssinatura } = _internos;

test('status do Mercado Pago → status da loja', () => {
  // Aprovado: o dinheiro entrou.
  assert.equal(traduzirStatus('processed', 'accredited'), 'aprovado');
  assert.equal(traduzirStatus('approved', ''), 'aprovado');

  // Aguardando: Pix emitido, cartão em análise. Pedido fica pendente.
  assert.equal(traduzirStatus('action_required', 'waiting_transfer'), 'aguardando', 'Pix emitido');
  assert.equal(traduzirStatus('pending', ''), 'aguardando');
  assert.equal(traduzirStatus('in_process', 'pending_review_manual'), 'aguardando');

  // Recusado.
  assert.equal(traduzirStatus('rejected', 'cc_rejected_high_risk'), 'recusado');
  assert.equal(traduzirStatus('cancelled', ''), 'recusado');
  assert.equal(traduzirStatus('refunded', ''), 'recusado');
});

/**
 * O caso que justifica o teste existir: um status que o Mercado Pago venha a
 * inventar amanhã NÃO pode virar "aprovado" por omissão. Liberar mercadoria por
 * status desconhecido é o erro que só se descobre no prejuízo.
 */
test('status desconhecido é tratado como recusa, nunca como aprovação', () => {
  assert.equal(traduzirStatus('status_que_nao_existe', ''), 'recusado');
  assert.equal(traduzirStatus('', ''), 'recusado');
  assert.equal(traduzirStatus('APPROVED_MAYBE', 'quem_sabe'), 'recusado');
});

test('motivo da recusa vira instrução em português', () => {
  assert.match(motivoRecusa('cc_rejected_bad_filled_security_code'), /CVV|segurança/i);
  assert.match(motivoRecusa('cc_rejected_insufficient_amount'), /limite/i);
  assert.match(motivoRecusa('cc_rejected_call_for_authorize'), /banco/i);
  // Código novo/desconhecido ainda produz algo acionável.
  assert.match(motivoRecusa('codigo_que_nao_mapeamos'), /Pix|cartão/i);
  assert.notEqual(motivoRecusa('codigo_que_nao_mapeamos'), '');
});

// ------------------------------------------------------ assinatura ----

const SEGREDO = 'segredo-de-teste-do-webhook';

/** Monta uma assinatura como o Mercado Pago monta: HMAC-SHA256 do manifesto. */
function assinar(dataId: string, requestId: string, ts: number): string {
  const manifesto = `id:${dataId};request-id:${requestId};ts:${ts};`;
  const hash = createHmac('sha256', SEGREDO).update(manifesto).digest('hex');
  return `ts=${ts},v1=${hash}`;
}

/**
 * Espelha o que a rota faz: o SDK valida o HMAC, e a janela de tempo é
 * verificada por nós — ver o comentário em `tempoDentroDaJanela`.
 */
const validar = (xSignature: string, dataId = 'ORDER-123', requestId = 'req-abc'): void => {
  WebhookSignatureValidator.validate({
    xSignature,
    xRequestId: requestId,
    dataId,
    secret: SEGREDO,
  });
  if (!tempoDentroDaJanela(carimboDaAssinatura(xSignature))) {
    throw new InvalidWebhookSignatureError('TimestampOutOfTolerance' as never);
  }
};

test('assinatura legítima é aceita', () => {
  const agora = Date.now();
  assert.doesNotThrow(() => validar(assinar('ORDER-123', 'req-abc', agora)));
});

test('assinatura forjada é recusada', () => {
  const agora = Date.now();
  const falsa = `ts=${agora},v1=${'0'.repeat(64)}`;
  assert.throws(() => validar(falsa), InvalidWebhookSignatureError);
});

test('assinatura de outro segredo é recusada', () => {
  const agora = Date.now();
  const manifesto = `id:ORDER-123;request-id:req-abc;ts:${agora};`;
  const outro = createHmac('sha256', 'segredo-errado').update(manifesto).digest('hex');
  assert.throws(() => validar(`ts=${agora},v1=${outro}`), InvalidWebhookSignatureError);
});

/**
 * Assinatura válida para OUTRO pedido não vale para este.
 *
 * Sem isso, quem recebesse um aviso legítimo de uma compra própria de R$ 1
 * poderia reenviá-lo trocando o pedido — e liberar uma compra de R$ 1.000.
 */
test('assinatura de um pedido não serve para outro', () => {
  const agora = Date.now();
  const doOutroPedido = assinar('ORDER-999', 'req-abc', agora);
  assert.throws(() => validar(doOutroPedido, 'ORDER-123'), InvalidWebhookSignatureError);
});

/** Aviso antigo reenviado (ataque de repetição) cai fora da janela de tolerância. */
test('aviso antigo demais é recusado', () => {
  const velho = Date.now() - 3600 * 1000; // uma hora atrás
  assert.throws(() => validar(assinar('ORDER-123', 'req-abc', velho)), InvalidWebhookSignatureError);
});

/**
 * A pegadinha que quebraria a integração inteira em produção.
 *
 * O Mercado Pago envia o `ts` em MILISSEGUNDOS (o exemplo da documentação é
 * `ts=1742505638683`), mas o SDK 3.4.0 trata como segundos. Se a janela de
 * tempo usasse a do SDK, todo webhook legítimo seria recusado com
 * "TimestampOutOfTolerance" — falha silenciosa e confusa, porque a assinatura
 * está certa e a mensagem aponta para o relógio.
 */
test('carimbo em milissegundos (o que o Mercado Pago envia) é aceito', () => {
  const agora = Date.now();
  assert.equal(tempoDentroDaJanela(String(agora), agora), true, 'agora, em ms');
  assert.equal(tempoDentroDaJanela(String(agora - 60_000), agora), true, 'um minuto atrás');
  assert.equal(tempoDentroDaJanela(String(agora - 3_600_000), agora), false, 'uma hora atrás');
});

test('carimbo em segundos também é aceito, caso a unidade mude', () => {
  const agora = Date.now();
  const emSegundos = Math.floor(agora / 1000);
  assert.equal(tempoDentroDaJanela(String(emSegundos), agora), true);
  assert.equal(tempoDentroDaJanela(String(emSegundos - 3600), agora), false, 'uma hora atrás');
});

test('carimbo inválido é recusado', () => {
  assert.equal(tempoDentroDaJanela('', Date.now()), false);
  assert.equal(tempoDentroDaJanela('abc', Date.now()), false);
  assert.equal(tempoDentroDaJanela('0', Date.now()), false);
  assert.equal(tempoDentroDaJanela('-1', Date.now()), false);
});

test('o ts é extraído do cabeçalho em qualquer ordem', () => {
  assert.equal(carimboDaAssinatura('ts=1742505638683,v1=abc'), '1742505638683');
  assert.equal(carimboDaAssinatura('v1=abc,ts=1742505638683'), '1742505638683');
  assert.equal(carimboDaAssinatura('ts=1742505638683, v1=abc'), '1742505638683');
  assert.equal(carimboDaAssinatura('v1=abc'), '', 'sem ts');
  assert.equal(carimboDaAssinatura(undefined), '');
});

test('cabeçalho ausente ou malformado é recusado', () => {
  assert.throws(() => validar(''), InvalidWebhookSignatureError);
  assert.throws(() => validar('lixo'), InvalidWebhookSignatureError);
  assert.throws(() => validar('ts=123'), InvalidWebhookSignatureError, 'sem v1');
  assert.throws(() => validar(`v1=${'a'.repeat(64)}`), InvalidWebhookSignatureError, 'sem ts');
});
