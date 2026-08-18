/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Ponte com o SDK do Mercado Pago no navegador.
 *
 * O que este arquivo existe para garantir: o número do cartão NUNCA passa pelo
 * nosso servidor. Quem recebe os dígitos é um iframe do Mercado Pago, dentro do
 * formulário deles; o que chega até nós é um token de uso único. Isso é o que
 * mantém a loja fora do escopo de PCI-DSS e o que faz uma invasão ao nosso
 * servidor não valer cartão de ninguém.
 *
 * O script é carregado sob demanda, e não no index.html: quem entra na vitrine
 * para olhar pirâmides não baixa o SDK de pagamento.
 */

/** O que `GET /api/payments/config` responde. */
export interface ConfigPagamento {
  provider: string;
  /** Falso quando não há credencial cadastrada — a tela avisa em vez de fingir. */
  enabled: boolean;
  publicKey: string;
  /** 'teste' → nenhum dinheiro se move. A tela mostra o aviso. */
  ambiente: 'teste' | 'producao' | null;
  installmentsMax: number;
  methods: { card: boolean; pix: boolean };
}

/** Os dados que o formulário de cartão devolve — só o token, nunca o cartão. */
export interface DadosCartao {
  token: string;
  payment_method_id: string;
  installments: number;
  issuer_id?: string;
}

interface ControladorBrick {
  unmount?: () => void;
  update?: (dados: { amount: number }) => Promise<unknown> | unknown;
}

interface InstanciaMP {
  bricks: () => {
    create: (
      tipo: string,
      containerId: string,
      opcoes: Record<string, unknown>,
    ) => Promise<ControladorBrick>;
  };
}

type ConstrutorMP = new (
  publicKey: string,
  opcoes?: { locale?: string },
) => InstanciaMP;

declare global {
  interface Window {
    MercadoPago?: ConstrutorMP;
  }
}

const URL_SDK = 'https://sdk.mercadopago.com/js/v2';

/**
 * Quanto esperamos pelo script antes de desistir.
 *
 * Sem limite, uma rede ruim deixaria a pessoa olhando um formulário que nunca
 * aparece, sem explicação. Com limite, ela vê a mensagem e o botão de tentar de
 * novo — e ainda tem o Pix como saída.
 */
const ESPERA_MAXIMA_MS = 15_000;

let carregando: Promise<ConstrutorMP> | null = null;

/**
 * Carrega o SDK uma única vez por página.
 *
 * Em caso de falha a promessa é descartada, para que "tentar de novo" realmente
 * tente de novo — uma promessa rejeitada guardada em cache faria toda tentativa
 * seguinte falhar na hora, para sempre.
 */
export function carregarSdkMercadoPago(): Promise<ConstrutorMP> {
  if (window.MercadoPago) return Promise.resolve(window.MercadoPago);

  carregando ??= new Promise<ConstrutorMP>((resolve, reject) => {
    const falhou = (motivo: string): void => {
      carregando = null;
      reject(new Error(motivo));
    };

    const pronto = (): void => {
      if (window.MercadoPago) {
        resolve(window.MercadoPago);
        return;
      }
      falhou('O formulário de pagamento carregou incompleto.');
    };

    const jaExiste = document.querySelector<HTMLScriptElement>(`script[src="${URL_SDK}"]`);
    const script = jaExiste ?? document.createElement('script');

    const temporizador = window.setTimeout(
      () => falhou('O formulário de pagamento demorou demais para carregar.'),
      ESPERA_MAXIMA_MS,
    );
    script.addEventListener('load', () => {
      window.clearTimeout(temporizador);
      pronto();
    });
    script.addEventListener('error', () => {
      window.clearTimeout(temporizador);
      // Costuma ser bloqueio de CSP, extensão de navegador ou rede corporativa.
      falhou('Não foi possível carregar o formulário seguro de pagamento.');
    });

    if (jaExiste === null) {
      script.src = URL_SDK;
      script.async = true;
      document.head.appendChild(script);
    }
  });

  return carregando;
}
