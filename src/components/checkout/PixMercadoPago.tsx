/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tela do Pix: QR code, copia-e-cola e a espera pelo pagamento.
 *
 * A regra que organiza esta tela: enquanto o dinheiro não caiu, ela NÃO diz que
 * o pedido está pago. O pedido existe e está reservado; o texto é "aguardando o
 * pagamento" até o servidor confirmar. Quem confirma é o servidor consultando o
 * Mercado Pago (`GET /api/orders/:id/status`) — nunca esta página.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Copy, Loader2, QrCode, Timer } from 'lucide-react';

import { api } from '../../api/client';
import { brlNumber } from '../../utils/currency';

export interface DadosPix {
  copiaECola: string;
  qrCodeBase64: string;
  /** Instante em que o QR expira, como o Mercado Pago devolveu (ISO). */
  expiraEm: string | null;
}

interface Props {
  pedidoId: string;
  total: number;
  pix: DadosPix;
  /** Chamado quando o servidor confirma que o dinheiro entrou. */
  onPago: () => void;
  /** Chamado quando o pedido foi cancelado (Pix expirou sem pagamento). */
  onExpirado: () => void;
}

/** De quanto em quanto tempo perguntamos ao servidor se o Pix caiu. */
const INTERVALO_MS = 5_000;

/** Quanto o QR vale, quando o Mercado Pago não devolve a data de expiração. */
const VALIDADE_PADRAO_MS = 30 * 60 * 1000;

function formatarRelogio(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const min = String(Math.floor(total / 60)).padStart(2, '0');
  const seg = String(total % 60).padStart(2, '0');
  return `${min}:${seg}`;
}

export default function PixMercadoPago({ pedidoId, total, pix, onPago, onExpirado }: Props) {
  const [copiado, setCopiado] = useState(false);
  const [restante, setRestante] = useState<number>(() => {
    const fim = pix.expiraEm === null ? NaN : Date.parse(pix.expiraEm);
    return Number.isNaN(fim) ? VALIDADE_PADRAO_MS : fim - Date.now();
  });

  const acabou = restante <= 0;

  // Relógio.
  useEffect(() => {
    const fim = Date.now() + restante;
    const t = window.setInterval(() => setRestante(fim - Date.now()), 1000);
    return () => window.clearInterval(t);
    // Roda uma vez: o alvo é fixado na montagem, então o relógio não reinicia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * Consulta de status.
   *
   * Callbacks em ref para o intervalo não ser recriado a cada render — e para o
   * `onPago` não disparar duas vezes por causa de uma remontagem do efeito.
   */
  const onPagoRef = useRef(onPago);
  onPagoRef.current = onPago;
  const onExpiradoRef = useRef(onExpirado);
  onExpiradoRef.current = onExpirado;

  useEffect(() => {
    let vivo = true;

    const conferir = async (): Promise<void> => {
      try {
        const r = await api.get<{ status: string; pago: boolean; cancelado: boolean }>(
          `/orders/${encodeURIComponent(pedidoId)}/status`,
        );
        if (!vivo) return;
        if (r.pago) {
          vivo = false;
          onPagoRef.current();
          return;
        }
        if (r.cancelado) {
          vivo = false;
          onExpiradoRef.current();
        }
      } catch {
        // Falha de rede numa consulta não é notícia: a próxima tenta de novo.
      }
    };

    void conferir();
    const t = window.setInterval(() => {
      if (vivo) void conferir();
    }, INTERVALO_MS);

    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [pedidoId]);

  const copiar = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(pix.copiaECola);
      setCopiado(true);
      window.setTimeout(() => setCopiado(false), 2500);
    } catch {
      // Navegador sem permissão de área de transferência: o código está à vista
      // no campo abaixo, que já vem selecionável.
      setCopiado(false);
    }
  }, [pix.copiaECola]);

  return (
    <div className="pt-40 lg:pt-44 pb-24 bg-brand-cream min-h-screen">
      <div className="max-w-xl mx-auto px-4">
        <div className="bg-white rounded-3xl border border-gray-100 p-8 sm:p-10 text-center shadow-[0_20px_60px_rgba(43,49,37,0.12)]">
          <div className="w-16 h-16 bg-primary-blue/10 rounded-full flex items-center justify-center mx-auto text-primary-blue mb-5">
            <QrCode size={30} aria-hidden="true" />
          </div>

          <span className="text-[11px] bg-amber-100 text-amber-800 uppercase px-3 py-1 rounded-full font-bold tracking-widest">
            Aguardando o pagamento
          </span>

          <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 mt-5">
            Pague R$ {brlNumber(total)} com Pix
          </h2>
          <p className="text-gray-500 leading-relaxed mt-3 mb-0">
            Pedido <strong className="text-gray-700">{pedidoId}</strong> reservado. Abra o aplicativo
            do seu banco, aponte para o código e confirme — esta página avisa sozinha quando o
            pagamento entrar.
          </p>

          {acabou ? (
            <p role="alert" className="mt-7 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">
              O prazo deste Pix terminou. Você pode fazer o pedido de novo — nada foi cobrado.
            </p>
          ) : (
            <>
              <p className="inline-flex items-center gap-2 text-sm font-bold text-gray-700 bg-gray-50 rounded-full px-4 py-2 mt-6">
                <Timer size={15} className="text-primary-blue" aria-hidden="true" />
                Válido por {formatarRelogio(restante)}
              </p>

              {pix.qrCodeBase64 !== '' && (
                <div className="mt-6 flex justify-center">
                  <img
                    src={`data:image/png;base64,${pix.qrCodeBase64}`}
                    alt={`QR code do Pix para o pedido ${pedidoId}`}
                    className="w-56 h-56 rounded-2xl border border-gray-100 p-2 bg-white"
                  />
                </div>
              )}

              {pix.copiaECola !== '' && (
                <div className="mt-6 text-left">
                  <label htmlFor="pix-codigo" className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                    Ou use o código copia-e-cola
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="pix-codigo"
                      readOnly
                      value={pix.copiaECola}
                      onFocus={(e) => e.currentTarget.select()}
                      className="flex-1 min-w-0 text-xs font-mono border border-gray-200 rounded-xl px-3 py-3 bg-gray-50 text-gray-600"
                    />
                    <button
                      type="button"
                      onClick={copiar}
                      className="inline-flex items-center gap-1.5 px-4 rounded-xl bg-primary-blue hover:bg-primary-container text-white text-xs font-bold uppercase tracking-wider transition-colors"
                    >
                      {copiado ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
                      {copiado ? 'Copiado' : 'Copiar'}
                    </button>
                  </div>
                </div>
              )}

              <p className="flex items-center justify-center gap-2 text-xs text-gray-400 mt-7 mb-0">
                <Loader2 size={13} className="animate-spin" aria-hidden="true" />
                Conferindo o pagamento…
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
