/**
 * Efeito do pagamento sobre o pedido.
 *
 * Esta é a função que o checkout E o webhook chamam. Ter um lugar só evita a
 * divergência clássica: o checkout marca pago de um jeito, o webhook de outro,
 * e um dia os dois discordam sobre o mesmo pedido.
 *
 * Três garantias, todas dentro de uma transação com a linha travada
 * (`FOR UPDATE`), porque o aviso do provedor e a consulta da própria página do
 * cliente chegam ao mesmo tempo, o tempo todo:
 *
 *   1. PAGO NÃO VOLTA ATRÁS. Um webhook atrasado dizendo "recusado" não pode
 *      cancelar um pedido já aprovado — o dinheiro entrou.
 *   2. ESTOQUE VOLTA UMA VEZ SÓ. A trava é a coluna `stock_restored`. Sem ela,
 *      dois avisos para o mesmo pedido devolveriam a peça duas vezes e o
 *      estoque cresceria sozinho.
 *   3. `paid_at` SÓ SE ESCREVE UMA VEZ, senão o relatório de faturamento move a
 *      venda de dia a cada notificação repetida.
 */

import { transaction, type Q } from '../db.ts';
import { fireWebhooks } from '../providers.ts';
import type { StatusPagamento } from './mercadopago.ts';

/** Status do pedido na loja, como o painel já usa. */
export type StatusPedido = 'pending' | 'paid' | 'shipped' | 'delivered' | 'canceled';

/** Depois destes, nenhum aviso de pagamento muda mais nada. */
const JA_RESOLVIDO: StatusPedido[] = ['paid', 'shipped', 'delivered'];

export interface ResultadoAplicacao {
  /** false = o pedido não existe, ou o aviso não mudou nada. */
  mudou: boolean;
  status: StatusPedido;
  estoqueDevolvido: boolean;
}

/**
 * Devolve ao estoque os itens de um pedido cancelado.
 *
 * A trava `stock_restored = 0` no WHERE do UPDATE é a proteção: quem conseguir
 * marcar a coluna é quem devolve. Um segundo aviso encontra o pedido já
 * marcado, não afeta nenhuma linha, e sai sem mexer no estoque.
 */
async function devolverEstoque(tx: Q, orderId: string): Promise<boolean> {
  const marcou = await tx.run(
    'UPDATE orders SET stock_restored = 1 WHERE id = ? AND stock_restored = 0',
    [orderId],
  );
  if (marcou === 0) return false;

  const itens = await tx.all(
    'SELECT product_id, quantity FROM order_items WHERE order_id = ?',
    [orderId],
  );
  for (const item of itens) {
    await tx.run('UPDATE products SET stock = stock + ? WHERE id = ?', [
      Number(item.quantity) || 0,
      item.product_id,
    ]);
  }
  return true;
}

/**
 * Aplica ao pedido o que o provedor respondeu.
 *
 * `ref` é o identificador da cobrança no provedor: gravado na primeira vez,
 * é por ele que o webhook reencontra o pedido depois.
 */
export async function aplicarPagamento(opts: {
  orderId: string;
  status: StatusPagamento;
  detalhe: string;
  provedor: string;
  ref?: string;
}): Promise<ResultadoAplicacao> {
  const { orderId, status, detalhe, provedor, ref } = opts;

  const resultado = await transaction(async (tx) => {
    // FOR UPDATE: segura a linha até o fim da transação. Sem isso, o webhook e
    // a consulta da página do cliente leem o mesmo estado antigo e os dois
    // decidem devolver o estoque.
    const pedido = await tx.one('SELECT * FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (pedido === null) {
      return { mudou: false, status: 'pending' as StatusPedido, estoqueDevolvido: false };
    }

    const atual = String(pedido.status) as StatusPedido;

    // Guarda a referência da cobrança assim que ela existir.
    if (ref && ref !== '' && !pedido.payment_ref) {
      await tx.run('UPDATE orders SET payment_provider = ?, payment_ref = ? WHERE id = ?', [
        provedor, ref, orderId,
      ]);
    }

    // Já resolvido: nada de reabrir, cancelar ou repagar.
    if (JA_RESOLVIDO.includes(atual)) {
      return { mudou: false, status: atual, estoqueDevolvido: false };
    }

    if (status === 'aprovado') {
      await tx.run(
        `UPDATE orders
            SET status = 'paid',
                payment_detail = ?,
                paid_at = COALESCE(paid_at, NOW())
          WHERE id = ?`,
        [detalhe.slice(0, 60), orderId],
      );
      return { mudou: true, status: 'paid' as StatusPedido, estoqueDevolvido: false };
    }

    if (status === 'recusado') {
      // Um pedido cancelado que recebe outra recusa não devolve estoque de novo.
      const devolveu = await devolverEstoque(tx, orderId);
      await tx.run(
        "UPDATE orders SET status = 'canceled', payment_detail = ? WHERE id = ?",
        [detalhe.slice(0, 60), orderId],
      );
      return {
        mudou: atual !== 'canceled',
        status: 'canceled' as StatusPedido,
        estoqueDevolvido: devolveu,
      };
    }

    // Aguardando (Pix emitido, cartão em análise): só registra o detalhe.
    await tx.run("UPDATE orders SET status = 'pending', payment_detail = ? WHERE id = ?", [
      detalhe.slice(0, 60), orderId,
    ]);
    return { mudou: atual !== 'pending', status: 'pending' as StatusPedido, estoqueDevolvido: false };
  });

  // Avisa as automações do cliente — fora da transação, e sem bloquear.
  if (resultado.mudou) {
    fireWebhooks('order.status_changed', { orderId, status: resultado.status, detalhe });
  }
  return resultado;
}

/**
 * Cancela um pedido cuja cobrança nem chegou a existir.
 *
 * Acontece quando o provedor não responde: o pedido já foi gravado e o estoque
 * já baixou, mas ninguém foi cobrado. Deixar assim seguraria peças que na
 * verdade continuam à venda.
 */
export async function cancelarSemCobranca(orderId: string, motivo: string): Promise<void> {
  await transaction(async (tx) => {
    const pedido = await tx.one('SELECT status FROM orders WHERE id = ? FOR UPDATE', [orderId]);
    if (pedido === null || JA_RESOLVIDO.includes(String(pedido.status) as StatusPedido)) return;
    await devolverEstoque(tx, orderId);
    await tx.run("UPDATE orders SET status = 'canceled', payment_detail = ? WHERE id = ?", [
      motivo.slice(0, 60), orderId,
    ]);
  });
}
