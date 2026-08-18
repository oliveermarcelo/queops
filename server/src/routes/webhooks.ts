/**
 * Avisos de mudança de pagamento (webhooks dos provedores).
 *
 * Fica fora do CSRF de propósito: quem chama é o servidor do Mercado Pago, não
 * o navegador de ninguém — não existe cookie envolvido, logo não existe
 * requisição forjada a barrar. Em compensação, a autenticidade é verificada de
 * duas formas independentes, e as duas precisam passar:
 *
 *   1. ASSINATURA. O cabeçalho `x-signature` traz um HMAC-SHA256 do corpo,
 *      feito com uma chave secreta que só nós e o Mercado Pago conhecemos. A
 *      verificação usa o validador do SDK oficial — comparação em tempo
 *      constante e janela de tolerância contra reenvio de um aviso antigo.
 *
 *   2. CONSULTA. Mesmo com assinatura válida, o corpo do aviso NÃO é
 *      acreditado. Ele diz apenas "o pedido X mudou"; o status verdadeiro vem
 *      de uma consulta autenticada à API. É essa segunda etapa que impede que
 *      alguém libere mercadoria mandando um JSON dizendo "pago".
 *
 * A resposta é sempre 200 quando o aviso foi entendido, mesmo que não haja o
 * que fazer: o Mercado Pago reenvia o que não recebe 200, e uma fila de
 * reenvios por um pedido que nem existe mais só atrapalha.
 */

import { Router } from 'express';

import { InvalidWebhookSignatureError, WebhookSignatureValidator } from 'mercadopago';

import { q } from '../db.ts';
import { queryStr } from '../http.ts';
import {
  consultarPedido, credenciais, PROVEDOR, type CredenciaisMP,
} from '../payments/mercadopago.ts';
import { aplicarPagamento } from '../payments/pedidos.ts';
import { h } from './helpers.ts';

export const webhookRoutes = Router();

/**
 * Aviso mais velho que isto, mesmo com assinatura válida, é reenvio de um aviso
 * antigo — a defesa contra alguém capturar uma notificação legítima e repeti-la
 * depois. Cinco minutos cobrem a latência real e as retentativas normais.
 */
const TOLERANCIA_SEGUNDOS = 300;

/**
 * A checagem de tempo é feita AQUI, e não pelo `toleranceSeconds` do SDK.
 *
 * O SDK 3.4.0 assume que o `ts` da assinatura vem em segundos
 * (`const tsMs = Number(ts) * 1000`), mas o Mercado Pago envia em
 * MILISSEGUNDOS — o exemplo da própria documentação é `ts=1742505638683`, 13
 * dígitos, que como segundos daria o ano 57.000. Passar `toleranceSeconds` ao
 * SDK faria ele multiplicar por mil um valor que já está em milissegundos e
 * recusar TODO webhook legítimo, com a mensagem enganosa de
 * "TimestampOutOfTolerance".
 *
 * A verificação do HMAC do SDK continua sendo usada: aquela parte está certa, e
 * é comparação em tempo constante. Só a janela de tempo vem para cá.
 *
 * A unidade é deduzida pela grandeza do número, e não fixada, para o dia em que
 * o SDK corrigir ou o Mercado Pago mudar: acima de 10^11 só pode ser
 * milissegundos (como segundos seria o ano 5138).
 */
function tempoDentroDaJanela(ts: string, agora = Date.now()): boolean {
  if (!/^\d+$/.test(ts)) return false;
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return false;
  const emMs = n > 1e11 ? n : n * 1000;
  return Math.abs(agora - emMs) / 1000 <= TOLERANCIA_SEGUNDOS;
}

/** Extrai o `ts=` do cabeçalho `x-signature` (formato `ts=...,v1=...`). */
function carimboDaAssinatura(xSignature: unknown): string {
  const bruto = Array.isArray(xSignature) ? xSignature[0] : xSignature;
  const m = /(?:^|,)\s*ts\s*=\s*([^,\s]+)/.exec(String(bruto ?? ''));
  return m ? m[1] : '';
}

export const _internos = { tempoDentroDaJanela, carimboDaAssinatura };

function conferirAssinatura(
  req: Parameters<Parameters<typeof h>[0]>[0],
  cred: CredenciaisMP,
  dataId: string,
): { ok: true } | { ok: false; motivo: string } {
  if (cred.webhookSecret === '') {
    /*
     * Sem chave secreta cadastrada não há como distinguir o Mercado Pago de
     * qualquer pessoa na internet. Recusar é a única resposta correta: aceitar
     * "por enquanto" transformaria o endereço numa forma de liberar pedidos de
     * graça, e "por enquanto" é o que vira permanente.
     */
    return { ok: false, motivo: 'webhookSecret não cadastrado em Painel → Integrações' };
  }
  try {
    // Sem `toleranceSeconds` — ver o comentário de `tempoDentroDaJanela`.
    WebhookSignatureValidator.validate({
      xSignature: req.headers['x-signature'],
      xRequestId: req.headers['x-request-id'],
      dataId,
      secret: cred.webhookSecret,
    });
  } catch (e) {
    if (e instanceof InvalidWebhookSignatureError) {
      return { ok: false, motivo: e.reason };
    }
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }

  // Assinatura confere; falta o aviso ser recente.
  const ts = carimboDaAssinatura(req.headers['x-signature']);
  if (!tempoDentroDaJanela(ts)) {
    return { ok: false, motivo: `carimbo fora da janela de ${TOLERANCIA_SEGUNDOS}s (ts=${ts})` };
  }
  return { ok: true };
}

// POST /api/webhooks/mercadopago
webhookRoutes.post('/mercadopago', h(async (req, res) => {
  const corpo = (req.body ?? {}) as { type?: string; action?: string; data?: { id?: unknown } };

  /*
   * O `data.id` chega ora na query, ora no corpo, dependendo do tipo de aviso.
   * A assinatura é calculada sobre o da QUERY quando ele existe — é assim que o
   * Mercado Pago monta o manifesto.
   */
  const idQuery = queryStr(req, 'data.id', '', 64) || queryStr(req, 'id', '', 64);
  const idCorpo = corpo.data?.id === undefined || corpo.data?.id === null
    ? '' : String(corpo.data.id);
  const dataId = idQuery || idCorpo;

  const cred = await credenciais();
  if (cred === null) {
    console.error('[queops] webhook do Mercado Pago recebido sem credenciais cadastradas');
    res.status(200).json({ ok: false, ignorado: 'sem credenciais' });
    return;
  }

  const assinatura = conferirAssinatura(req, cred, idQuery);
  if (assinatura.ok === false) {
    /*
     * 401 e nada mais. Não dizemos o que falhou: para quem estiver sondando, a
     * resposta é indistinguível entre "chave errada" e "assinatura forjada".
     * O motivo real vai só para o nosso log.
     */
    console.error(
      '[queops] webhook do Mercado Pago com assinatura inválida:',
      assinatura.motivo,
      '· x-request-id:', String(req.headers['x-request-id'] ?? '—'),
    );
    res.status(401).json({ error: { code: 'invalid_signature', message: 'Assinatura inválida.' } });
    return;
  }

  // Só nos interessam avisos sobre pedidos/pagamentos.
  const tipo = String(corpo.type ?? corpo.action ?? '');
  if (dataId === '') {
    res.status(200).json({ ok: true, ignorado: 'sem data.id' });
    return;
  }

  /*
   * A partir daqui, o corpo do aviso não é mais usado para nada além do id.
   * O que vale é o que a API responde.
   */
  const real = await consultarPedido(dataId, cred);
  if (real === null) {
    // Não conseguimos confirmar: devolver 500 faz o Mercado Pago tentar de novo,
    // que é o comportamento certo para uma falha temporária nossa.
    res.status(500).json({ error: { code: 'lookup_failed', message: 'Não foi possível consultar o pagamento.' } });
    return;
  }

  // O pedido é encontrado pela referência externa que enviamos na cobrança e,
  // como reserva, pela coluna payment_ref gravada quando a cobrança foi criada.
  let orderId = real.orderId;
  if (orderId === '') {
    const linha = await q.one('SELECT id FROM orders WHERE payment_ref = ?', [dataId]);
    orderId = linha ? String(linha.id) : '';
  }
  if (orderId === '') {
    console.error('[queops] webhook do Mercado Pago sem pedido correspondente:', dataId, tipo);
    res.status(200).json({ ok: true, ignorado: 'pedido não encontrado' });
    return;
  }

  const aplicado = await aplicarPagamento({
    orderId,
    status: real.status,
    detalhe: real.detalhe,
    provedor: PROVEDOR,
    ref: dataId,
  });

  console.log(
    `[queops] webhook ${PROVEDOR}: pedido ${orderId} → ${real.status} (${real.detalhe})`,
    aplicado.mudou ? '· aplicado' : '· sem mudança',
    aplicado.estoqueDevolvido ? '· estoque devolvido' : '',
  );

  res.status(200).json({ ok: true });
}));
