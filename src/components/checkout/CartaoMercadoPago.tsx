/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Formulário de cartão do Mercado Pago dentro da nossa página.
 *
 * É o "Brick" oficial: os campos sensíveis são iframes do Mercado Pago, com a
 * validação, a detecção de bandeira e as parcelas vindo de lá. O que sai daqui
 * é apenas um token de uso único — o número do cartão não passa pelo nosso
 * JavaScript nem pelo nosso servidor.
 *
 * Por que não construímos os campos à mão: bandeira, dígito verificador,
 * parcelamento por emissor e o desafio 3-D Secure são regras que mudam sem
 * avisar. Reimplementar isso é assumir a manutenção — e errar em qualquer um
 * deles aparece como venda recusada sem explicação.
 */

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, RotateCcw } from 'lucide-react';

import { carregarSdkMercadoPago, type DadosCartao } from '../../pagamento/mercadopago';

interface Props {
  publicKey: string;
  /** Total em reais, já conferido pelo servidor. */
  valor: number;
  email: string;
  /** CPF só com dígitos. */
  cpf: string;
  parcelasMax: number;
  /**
   * Muda de valor para forçar um formulário NOVO — e, com ele, um token novo.
   * O token do cartão é de uso único: depois de uma recusa, reenviar o mesmo dá
   * "token inválido" em vez do motivo real da recusa.
   */
  remontar?: number;
  /**
   * Chamado quando a pessoa envia o cartão. Deve resolver quando a cobrança deu
   * certo e REJEITAR quando não — o formulário se reabilita sozinho na rejeição.
   */
  onPagar: (dados: DadosCartao) => Promise<void>;
}

const CONTAINER = 'mp-cartao-container';

/** Cores da loja repassadas ao formulário, para ele não parecer um enxerto. */
const ESTILO = {
  theme: 'default',
  customVariables: {
    formBackgroundColor: '#ffffff',
    baseColor: '#3a5634', // verde estrutural da Quéops
    baseColorFirstVariant: '#2a4125',
    baseColorSecondVariant: '#f4efe7',
    textPrimaryColor: '#1f2937',
    textSecondaryColor: '#6b7280',
    inputBackgroundColor: '#ffffff',
    formPadding: '0px',
    borderRadiusLarge: '16px',
    borderRadiusMedium: '12px',
    fontSizeMedium: '15px',
  },
};

export default function CartaoMercadoPago({
  publicKey, valor, email, cpf, parcelasMax, remontar = 0, onPagar,
}: Props) {
  const [pronto, setPronto] = useState(false);
  const [falha, setFalha] = useState('');
  /** Soma-se a `remontar`: é o "tentar de novo" pedido aqui dentro. */
  const [tentativa, setTentativa] = useState(0);

  const controlador = useRef<{ unmount?: () => void; update?: (d: { amount: number }) => unknown } | null>(null);

  /*
   * O valor e o callback ficam em refs para NÃO entrarem nas dependências do
   * efeito: remontar o formulário apagaria o que a pessoa já digitou. A troca
   * de valor é aplicada pelo `update` do próprio Brick, no efeito de baixo.
   */
  const valorRef = useRef(valor);
  valorRef.current = valor;
  const onPagarRef = useRef(onPagar);
  onPagarRef.current = onPagar;

  useEffect(() => {
    let cancelado = false;
    setPronto(false);
    setFalha('');

    (async () => {
      try {
        const MercadoPago = await carregarSdkMercadoPago();
        if (cancelado) return;

        const mp = new MercadoPago(publicKey, { locale: 'pt-BR' });
        const ctrl = await mp.bricks().create('cardPayment', CONTAINER, {
          initialization: {
            amount: valorRef.current,
            payer: {
              email,
              identification: cpf === '' ? undefined : { type: 'CPF', number: cpf },
            },
          },
          customization: {
            visual: {
              style: ESTILO,
              hideFormTitle: true,
              texts: { formSubmit: 'Pagar agora' },
            },
            paymentMethods: {
              minInstallments: 1,
              maxInstallments: parcelasMax,
            },
          },
          callbacks: {
            onReady: () => {
              if (!cancelado) setPronto(true);
            },
            onSubmit: (dados: DadosCartao) => onPagarRef.current(dados),
            onError: (erro: { message?: string }) => {
              if (cancelado) return;
              /*
               * Erro do próprio formulário (campo inválido, bandeira não
               * aceita). O Brick já marca o campo; aqui fica só o aviso geral,
               * porque um erro invisível vira "cliquei e não aconteceu nada".
               */
              console.error('[queops] erro no formulário de cartão:', erro);
              setFalha(erro?.message ?? 'Confira os dados do cartão.');
            },
          },
        });

        if (cancelado) {
          ctrl.unmount?.();
          return;
        }
        controlador.current = ctrl;
      } catch (e) {
        if (!cancelado) {
          setFalha(e instanceof Error ? e.message : 'Não foi possível carregar o pagamento por cartão.');
        }
      }
    })();

    return () => {
      cancelado = true;
      try {
        controlador.current?.unmount?.();
      } catch {
        /* o Brick já pode ter saído do DOM */
      }
      controlador.current = null;
    };
  }, [publicKey, email, cpf, parcelasMax, tentativa, remontar]);

  // Cupom aplicado ou frete recalculado no meio do preenchimento: o Brick
  // aprende o novo valor sem perder o que já foi digitado.
  useEffect(() => {
    controlador.current?.update?.({ amount: valor });
  }, [valor]);

  return (
    <div>
      <div id={CONTAINER} className="min-h-[120px]" />

      {!pronto && falha === '' && (
        <p className="flex items-center gap-2 text-sm text-gray-400 py-6 m-0">
          <Loader2 size={16} className="animate-spin" aria-hidden="true" />
          Carregando o formulário seguro do Mercado Pago…
        </p>
      )}

      {falha !== '' && (
        <div role="alert" className="mt-3 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm space-y-3">
          <p className="flex items-start gap-2 m-0 font-medium">
            <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" aria-hidden="true" />
            <span>{falha}</span>
          </p>
          <button
            type="button"
            onClick={() => setTentativa((t) => t + 1)}
            className="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-red-700 hover:text-red-900"
          >
            <RotateCcw size={13} aria-hidden="true" /> Tentar de novo
          </button>
        </div>
      )}
    </div>
  );
}
