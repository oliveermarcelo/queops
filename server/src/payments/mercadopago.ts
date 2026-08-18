/**
 * Cobrança pelo Mercado Pago — Orders API (Checkout Transparente).
 *
 * O cliente paga SEM SAIR da loja: o navegador tokeniza o cartão com o SDK do
 * Mercado Pago (o número do cartão nunca chega ao nosso servidor) e manda só o
 * token; o Pix devolve um QR code que a própria página desenha.
 *
 * Três regras que valem para tudo aqui:
 *
 *   1. O VALOR NUNCA VEM DO NAVEGADOR. A cobrança usa o total que o
 *      `pricing.ts` calculou a partir do banco. Um cliente que adultere o
 *      JavaScript consegue no máximo mudar a tela dele.
 *
 *   2. TODA COBRANÇA LEVA CHAVE DE IDEMPOTÊNCIA, derivada do número do pedido.
 *      Se a rede cair depois de o Mercado Pago receber a cobrança e o cliente
 *      clicar de novo, a segunda chamada devolve a MESMA cobrança em vez de
 *      criar outra. Cobrar duas vezes é o pior erro possível numa loja.
 *
 *   3. O QUE O PROVEDOR DIZ SÓ VALE SE FOR CONSULTADO. O aviso (webhook) serve
 *      para saber QUE algo mudou; o status verdadeiro vem sempre de uma
 *      consulta autenticada — ver `consultarPedido`.
 */

import { randomUUID } from 'node:crypto';

import { MercadoPagoConfig, Order } from 'mercadopago';

import { fail } from '../errors.ts';
import { integrationSecrets } from '../store.ts';
import { q, type Q } from '../db.ts';

/** Como a loja chama esta integração no painel e na coluna `payment_provider`. */
export const PROVEDOR = 'mercadopago';

/** Status que a loja entende. O mapa para os do Mercado Pago está abaixo. */
export type StatusPagamento = 'aprovado' | 'aguardando' | 'recusado';

export interface CredenciaisMP {
  publicKey: string;
  accessToken: string;
  /** Assina os webhooks. Sem ela não dá para confiar em nenhuma notificação. */
  webhookSecret: string;
}

/**
 * Credenciais salvas no painel (cifradas com AES-256-GCM no banco).
 *
 * Ficam ali, e não numa variável de ambiente, porque quem troca a conta do
 * Mercado Pago é a lojista — e ela não tem acesso ao servidor.
 */
export async function credenciais(exec: Q = q): Promise<CredenciaisMP | null> {
  const f = await integrationSecrets(PROVEDOR, exec);
  const texto = (k: string): string => {
    const v = f[k];
    return v === null || v === undefined || typeof v === 'object' ? '' : String(v).trim();
  };
  const accessToken = texto('accessToken');
  if (accessToken === '') return null;
  return {
    publicKey: texto('publicKey'),
    accessToken,
    webhookSecret: texto('webhookSecret'),
  };
}

/** A integração está ligada no painel E com credencial preenchida? */
export async function habilitado(exec: Q = q): Promise<boolean> {
  const row = await exec.one('SELECT enabled FROM integrations WHERE id = ?', [PROVEDOR]);
  if (!row?.enabled) return false;
  return (await credenciais(exec)) !== null;
}

function cliente(cred: CredenciaisMP): Order {
  return new Order(
    new MercadoPagoConfig({
      accessToken: cred.accessToken,
      options: { timeout: 15_000 },
    }),
  );
}

/**
 * Ambiente das credenciais.
 *
 * `TEST-` é sandbox (nenhum dinheiro se move), `APP_USR-` é produção. Vale a
 * pena saber: rodar produção sem perceber é caro, e rodar teste achando que é
 * produção faz a lojista esperar um dinheiro que nunca vai cair.
 */
export function ambiente(cred: CredenciaisMP): 'teste' | 'producao' {
  return cred.accessToken.startsWith('TEST-') ? 'teste' : 'producao';
}

// ------------------------------------------------------------- tradução ----

/**
 * Status do Mercado Pago → status da loja.
 *
 * A Orders API responde com um status do pedido e um `status_detail`. Só
 * `processed`/`approved` significa dinheiro garantido; tudo que não for uma
 * aprovação nem uma espera legítima é tratado como recusa — na dúvida, NÃO
 * liberamos a mercadoria.
 */
export function traduzirStatus(status: string, detalhe: string): StatusPagamento {
  const s = String(status ?? '').toLowerCase();
  const d = String(detalhe ?? '').toLowerCase();

  if (s === 'processed' || s === 'approved' || d === 'accredited') return 'aprovado';

  // Pix emitido e esperando a transferência; cartão em análise manual.
  if (
    s === 'action_required' || s === 'pending' || s === 'in_process'
    || s === 'authorized' || s === 'created'
    || d === 'waiting_transfer' || d === 'pending_capture'
  ) {
    return 'aguardando';
  }

  return 'recusado';
}

/**
 * Motivo da recusa em português, para a tela do cliente.
 *
 * O Mercado Pago devolve códigos como `cc_rejected_bad_filled_security_code`.
 * Mostrar o código cru faz o cliente abandonar a compra sem saber que bastava
 * conferir o CVV; a mensagem certa recupera a venda.
 */
export function motivoRecusa(detalhe: string): string {
  const mapa: Record<string, string> = {
    cc_rejected_bad_filled_card_number: 'Confira o número do cartão.',
    cc_rejected_bad_filled_date: 'Confira a data de validade do cartão.',
    cc_rejected_bad_filled_security_code: 'Confira o código de segurança (CVV).',
    cc_rejected_bad_filled_other: 'Confira os dados do cartão.',
    cc_rejected_insufficient_amount: 'O cartão não tem limite suficiente para esta compra.',
    cc_rejected_high_risk: 'O pagamento foi recusado pelo banco. Tente outro cartão ou pague com Pix.',
    cc_rejected_max_attempts: 'Muitas tentativas com este cartão. Tente outro ou pague com Pix.',
    cc_rejected_call_for_authorize: 'Ligue para o seu banco e autorize o valor desta compra.',
    cc_rejected_card_disabled: 'O cartão está desativado. Fale com o seu banco.',
    cc_rejected_duplicated_payment: 'Este pagamento já foi feito. Confira antes de tentar de novo.',
    cc_rejected_card_error: 'Não foi possível processar o cartão. Tente novamente.',
    cc_rejected_blacklist: 'O pagamento não foi autorizado. Tente outro cartão ou pague com Pix.',
    cc_rejected_invalid_installments: 'O cartão não aceita esse número de parcelas.',
    rejected_by_bank: 'O banco recusou a compra. Tente outro cartão ou pague com Pix.',
    expired: 'O prazo para pagamento expirou.',
  };
  return mapa[String(detalhe ?? '').toLowerCase()]
    ?? 'O pagamento não foi aprovado. Tente outro cartão ou pague com Pix.';
}

// -------------------------------------------------------------- cobrança ----

export interface DadosCobranca {
  /** Número do pedido na loja (QP-000123) — vira a referência externa no MP. */
  orderId: string;
  /** Total em reais, já calculado pelo servidor. */
  total: number;
  descricao: string;
  pagador: {
    email: string;
    nome: string;
    sobrenome: string;
    /** CPF só com dígitos. */
    cpf: string;
  };
  /** Endereço público da loja, para o Mercado Pago avisar as mudanças. */
  webhookUrl: string;
}

export interface CobrancaCartao extends DadosCobranca {
  metodo: 'card';
  /** Token gerado pelo SDK no navegador. O cartão nunca passa por aqui. */
  token: string;
  parcelas: number;
  /** Bandeira/meio detectado pelo Brick (visa, master, elo…). */
  paymentMethodId: string;
}

export interface CobrancaPix extends DadosCobranca {
  metodo: 'pix';
  /** Minutos até o QR code expirar. */
  expiraEmMinutos: number;
}

export interface ResultadoCobranca {
  status: StatusPagamento;
  /** Id da cobrança no Mercado Pago — guardado para casar com o webhook. */
  ref: string;
  detalhe: string;
  /** Só no Pix: código copia-e-cola e a imagem do QR em base64. */
  pix?: { copiaECola: string; qrCodeBase64: string; expiraEm: string | null };
  /** Mensagem pronta para o cliente quando foi recusado. */
  mensagem?: string;
}

/** Valor em reais → string decimal, que é o formato que a Orders API espera. */
function valor(n: number): string {
  return (Math.round(n * 100) / 100).toFixed(2);
}

/**
 * Chave de idempotência derivada do pedido.
 *
 * Precisa ser ESTÁVEL para o mesmo pedido (senão não protege contra a segunda
 * tentativa) e diferente entre pedidos. O número do pedido já é único e
 * sequencial, então serve — com um prefixo para não colidir com outra
 * integração que use o mesmo namespace.
 */
function chaveIdempotencia(orderId: string, tentativa: number): string {
  return `queops-${orderId}-${tentativa}`;
}

/** Extrai a cobrança de dentro da resposta da Orders API. */
function primeiroPagamento(resposta: any): any {
  const transacoes = resposta?.transactions?.payments;
  return Array.isArray(transacoes) && transacoes.length > 0 ? transacoes[0] : null;
}

function lerPix(pagamento: any): ResultadoCobranca['pix'] {
  const metodo = pagamento?.payment_method ?? {};
  const copiaECola = String(metodo.qr_code ?? '');
  const qrCodeBase64 = String(metodo.qr_code_base64 ?? '');
  if (copiaECola === '' && qrCodeBase64 === '') return undefined;
  return {
    copiaECola,
    qrCodeBase64,
    expiraEm: pagamento?.expiration_time ? String(pagamento.expiration_time) : null,
  };
}

/**
 * Cria a cobrança no Mercado Pago.
 *
 * `tentativa` entra na chave de idempotência: 0 é a cobrança original; quando o
 * cliente escolhe conscientemente tentar outro cartão depois de uma recusa,
 * sobe para 1, 2… — aí é uma cobrança nova de propósito, não uma repetição
 * acidental da mesma.
 */
export async function cobrar(
  dados: CobrancaCartao | CobrancaPix,
  cred: CredenciaisMP,
  tentativa = 0,
): Promise<ResultadoCobranca> {
  const pagamento: Record<string, unknown> = { amount: valor(dados.total) };

  if (dados.metodo === 'card') {
    pagamento.payment_method = {
      id: dados.paymentMethodId,
      type: 'credit_card',
      token: dados.token,
      installments: dados.parcelas,
      // Aparece na fatura do cliente. Cartão com nome irreconhecível vira
      // contestação — e contestação custa mais caro que a venda.
      statement_descriptor: 'QUEOPS',
    };
  } else {
    pagamento.payment_method = { id: 'pix', type: 'bank_transfer' };
    pagamento.expiration_time = `PT${dados.expiraEmMinutos}M`;
  }

  const corpo = {
    type: 'online',
    processing_mode: 'automatic',
    total_amount: valor(dados.total),
    external_reference: dados.orderId,
    description: dados.descricao,
    payer: {
      email: dados.pagador.email,
      first_name: dados.pagador.nome,
      last_name: dados.pagador.sobrenome,
      identification: { type: 'CPF', number: dados.pagador.cpf },
    },
    transactions: { payments: [pagamento] },
    config: { online: { callback_url: dados.webhookUrl } },
  };

  let resposta: any;
  try {
    resposta = await cliente(cred).create({
      body: corpo as never,
      requestOptions: { idempotencyKey: chaveIdempotencia(dados.orderId, tentativa) },
    });
  } catch (e) {
    /*
     * Falha de comunicação — NÃO é o mesmo que pagamento recusado.
     *
     * A cobrança pode ter sido criada do lado do Mercado Pago mesmo com o erro
     * chegando aqui (timeout depois do processamento, por exemplo). Por isso o
     * chamador cancela o pedido e devolve o estoque, e a chave de idempotência
     * garante que a próxima tentativa reaproveite a cobrança em vez de duplicar.
     */
    const err = e as { message?: string; cause?: unknown; status?: number };
    console.error('[queops] falha ao cobrar no Mercado Pago:', err.status ?? '', err.message ?? e);
    fail(
      'Não conseguimos falar com o meio de pagamento. Nada foi cobrado — tente de novo em instantes.',
      502,
      'gateway_unavailable',
      e,
    );
  }

  const pago = primeiroPagamento(resposta);
  const status = String(pago?.status ?? resposta?.status ?? '');
  const detalhe = String(pago?.status_detail ?? resposta?.status_detail ?? '');
  const traduzido = traduzirStatus(status, detalhe);

  return {
    status: traduzido,
    // O id do PEDIDO no MP é o que o webhook manda de volta; guardamos ele.
    ref: String(resposta?.id ?? ''),
    detalhe: detalhe || status,
    pix: dados.metodo === 'pix' ? lerPix(pago) : undefined,
    mensagem: traduzido === 'recusado' ? motivoRecusa(detalhe) : undefined,
  };
}

/**
 * Consulta o estado real de uma cobrança.
 *
 * É esta função — e não o corpo do webhook — que decide se um pedido está pago.
 * O aviso do Mercado Pago diz apenas "algo mudou no pedido X"; acreditar no que
 * ele afirma sobre o status deixaria qualquer um liberar mercadoria mandando um
 * JSON para o nosso endereço.
 */
export async function consultarPedido(
  ref: string,
  cred: CredenciaisMP,
): Promise<{ status: StatusPagamento; detalhe: string; orderId: string } | null> {
  try {
    const resposta: any = await cliente(cred).get({ id: ref });
    const pago = primeiroPagamento(resposta);
    const status = String(pago?.status ?? resposta?.status ?? '');
    const detalhe = String(pago?.status_detail ?? resposta?.status_detail ?? '');
    return {
      status: traduzirStatus(status, detalhe),
      detalhe: detalhe || status,
      orderId: String(resposta?.external_reference ?? ''),
    };
  } catch (e) {
    const err = e as { message?: string; status?: number };
    console.error('[queops] falha ao consultar pedido no Mercado Pago:', ref, err.status ?? '', err.message ?? e);
    return null;
  }
}

/** UUID para quem precisar de uma chave de idempotência avulsa. */
export const novaChave = (): string => randomUUID();
