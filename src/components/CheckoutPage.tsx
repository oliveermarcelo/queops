/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Checkout em três etapas.
 *
 * Todo valor exibido aqui vem de `POST /api/checkout/quote`: frete por UF e
 * faixa de CEP, cupom e desconto Pix saem das regras cadastradas no painel, e
 * não de números fixos no código. O mesmo cálculo roda de novo ao gravar o
 * pedido, então o que aparece na tela é exatamente o que é cobrado.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Check, ShieldCheck, CreditCard, User, MapPin,
  AlertCircle, Truck, QrCode, Clock, Lock, Tag, Loader2, X,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CartItem } from '../types';
import { CustomerAccount, fetchAccount } from '../account/session';
import { api, ApiError } from '../api/client';
import { safeImageSrc } from '../utils/safeUrl';
import { brlNumber } from '../utils/currency';
import { INSTALLMENTS } from '../config';
import { useCatalog } from '../catalog/CatalogContext';
import { type ConfigPagamento, type DadosCartao } from '../pagamento/mercadopago';
import CartaoMercadoPago from './checkout/CartaoMercadoPago';
import PixMercadoPago, { type DadosPix } from './checkout/PixMercadoPago';

interface CheckoutPageProps {
  cartItems: CartItem[];
  account?: CustomerAccount | null;
  onBack: () => void;
  onClearCart: () => void;
  onProfileSaved?: (account: CustomerAccount) => void;
}

/** Uma opção de entrega cotada pelo servidor (Correios ou Melhor Envio). */
interface OpcaoDeFrete {
  id: string;
  label: string;
  carrier: string;
  price: number;
  days: number;
  source: 'correios' | 'melhorenvio';
}

interface Quote {
  subtotal: number;
  shipping: number;
  shippingLabel: string;
  /** Por que os Correios não cotaram. O servidor só manda para o painel. */
  shippingNote?: string;
  /** Opções de entrega cotadas. Vazio = frete pelas regras do painel. */
  shippingOptions?: OpcaoDeFrete[];
  /** Qual opção está valendo no total atual. */
  shippingChoice?: string;
  couponCode: string | null;
  couponDiscount: number;
  couponError: string | null;
  pixDiscount: number;
  pixDiscountPct: number;
  discount: number;
  total: number;
  issues: string[];
}

interface ConfirmedOrder {
  id: string;
  customerName: string;
  total: number;
  payment: 'card' | 'pix';
  deliveryEta: string;
  /**
   * O que o meio de pagamento respondeu. É por causa deste campo que a tela
   * pode deixar de mentir: sem ele, o antigo checkout dizia "Total pago" para
   * qualquer pedido gravado, inclusive os que ninguém pagou.
   */
  paymentStatus: 'aprovado' | 'aguardando' | 'recusado';
  pix: DadosPix | null;
  /** 'teste' → ambiente de sandbox, nenhum dinheiro se move. */
  ambiente: 'teste' | 'producao' | null;
}

const labelCls = 'block text-[13px] font-semibold text-gray-700 mb-2';
const inputCls =
  'w-full text-[15px] border border-gray-200 rounded-xl px-4 py-3.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue transition placeholder:text-gray-300';

const STEPS = [
  { id: 1, label: 'Identificação', icon: User },
  { id: 2, label: 'Entrega', icon: MapPin },
  { id: 3, label: 'Pagamento', icon: CreditCard },
];

const PAYMENT_LABELS: Record<ConfirmedOrder['payment'], string> = {
  card: 'Cartão de Crédito',
  pix: 'Pix',
};

/** Valida um CPF brasileiro pelos dois dígitos verificadores. */
function isValidCPF(value: string): boolean {
  const cpf = value.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false;
  const digits = cpf.split('').map(Number);
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += digits[i] * (t + 1 - i);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== digits[t]) return false;
  }
  return true;
}

export default function CheckoutPage({
  cartItems,
  account,
  onBack,
  onClearCart,
  onProfileSaved,
}: CheckoutPageProps) {
  const [stage, setStage] = useState<'checkout' | 'pix' | 'pix_expirado' | 'success'>('checkout');

  const addr = account?.addresses?.find((a) => a.isDefault) ?? account?.addresses?.[0];

  const profileComplete = !!(
    account &&
    account.name?.trim() &&
    isValidCPF(account.cpf ?? '') &&
    (account.phone ?? '').replace(/\D/g, '').length >= 10 &&
    (account.email ?? '').includes('@')
  );

  const [step, setStep] = useState(profileComplete ? 2 : 1);

  const [fullName, setFullName] = useState(account?.name ?? '');
  const [cpf, setCpf] = useState(account?.cpf ?? '');
  const [phone, setPhone] = useState(account?.phone ?? '');
  const [email, setEmail] = useState(account?.email ?? '');

  const [cep, setCep] = useState(addr?.cep ?? '');
  const [street, setStreet] = useState(addr?.street ?? '');
  const [number, setNumber] = useState(addr?.number ?? '');
  const [complement, setComplement] = useState(addr?.complement ?? '');
  const [neighborhood, setNeighborhood] = useState(addr?.neighborhood ?? '');
  const [city, setCity] = useState(addr?.city ?? '');
  const [stateCode, setStateCode] = useState(addr?.state ?? 'SP');

  const { settings } = useCatalog();

  /*
   * Configuração do meio de pagamento (chave pública, ambiente, métodos).
   *
   * `null` = ainda carregando; `enabled: false` = não há credencial cadastrada.
   * A tela precisa distinguir os dois: "carregando" mostra o esqueleto, "não
   * configurado" mostra o aviso — nunca um botão que só falharia no fim.
   */
  const [configPagamento, setConfigPagamento] = useState<ConfigPagamento | null>(null);
  const [configFalhou, setConfigFalhou] = useState(false);

  useEffect(() => {
    let vivo = true;
    api
      .get<ConfigPagamento>('/payments/config')
      .then((c) => vivo && setConfigPagamento(c))
      .catch(() => vivo && setConfigFalhou(true));
    return () => {
      vivo = false;
    };
  }, []);

  // Formas de pagamento habilitadas no painel E suportadas pelo provedor. Se a
  // lojista desligar o Pix, ele some daqui — e o servidor recusa o pedido que
  // insista nele.
  const enabledPayments = useMemo(() => {
    const p = settings?.payments;
    const doProvedor = configPagamento?.methods;
    const lista = (['pix', 'card'] as const).filter(
      (m) => p?.[m] !== false && doProvedor?.[m] !== false,
    );
    return lista.length ? lista : (['pix'] as const);
  }, [settings, configPagamento]);

  const [paymentMethod, setPaymentMethod] = useState<'card' | 'pix'>('pix');

  /**
   * A pessoa já escolheu como pagar?
   *
   * O método começa em 'pix' porque alguém tem de estar marcado quando a etapa 3
   * abre. Só que a cotação usava esse palpite desde a primeira etapa, e o resumo
   * mostrava "Desconto Pix − R$ 2,50" para quem ainda estava digitando o nome —
   * um desconto que a pessoa não pediu, num total que mudaria sozinho se ela
   * escolhesse cartão. Enquanto não houver escolha, a cotação vai sem forma de
   * pagamento e o desconto não entra.
   */
  const [pagamentoEscolhido, setPagamentoEscolhido] = useState(false);

  /** Máximo de parcelas: o servidor manda o número, e é o mesmo que ele aceita. */
  const parcelasMax = configPagamento?.installmentsMax ?? INSTALLMENTS;

  /**
   * Muda a cada recusa para remontar o formulário de cartão.
   *
   * O token do cartão é de uso único: depois de uma recusa ele já foi gastado, e
   * reenviar o mesmo daria erro de token inválido em vez do motivo real. Um
   * formulário novo gera um token novo.
   */
  const [tentativaCartao, setTentativaCartao] = useState(0);

  /*
   * Chegar à etapa 3 conta como escolha: lá as opções estão à vista e uma delas
   * aparece marcada. Sem isto, quem seguisse com o Pix já pré-marcado (sem
   * clicar) pagaria o preço cheio olhando a tela dizer "Pix".
   */
  useEffect(() => {
    if (step === 3) setPagamentoEscolhido(true);
  }, [step]);

  // Se o método escolhido deixar de estar disponível, cai no primeiro válido.
  useEffect(() => {
    if (!enabledPayments.includes(paymentMethod)) {
      setPaymentMethod(enabledPayments[0]);
    }
  }, [enabledPayments, paymentMethod]);

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState('');

  /**
   * Opção de entrega escolhida (`correios:03220`, `melhorenvio:2`).
   *
   * Vazio = a mais barata, que é o que o servidor usa por omissão. O navegador
   * manda só este id: o preço vem sempre da cotação do servidor.
   */
  const [freteEscolhido, setFreteEscolhido] = useState('');

  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [order, setOrder] = useState<ConfirmedOrder | null>(null);

  const items = useMemo(
    () => cartItems.map((i) => ({ productId: i.product.id, quantity: i.quantity })),
    [cartItems],
  );

  // ---- Cotação no servidor, com debounce para não disparar a cada tecla ----
  const requestId = useRef(0);
  const refreshQuote = useCallback(async () => {
    if (items.length === 0) {
      setQuote(null);
      return;
    }
    const id = ++requestId.current;
    setQuoting(true);
    try {
      const result = await api.post<Quote>('/checkout/quote', {
        items,
        state: stateCode,
        cep,
        coupon: appliedCoupon,
        // Sem escolha feita, nenhuma forma de pagamento: assim o desconto do
        // Pix não entra num total que a pessoa ainda não decidiu.
        payment: pagamentoEscolhido ? paymentMethod : '',
        shipping: freteEscolhido,
      });
      // Ignora respostas de requisições antigas que chegaram fora de ordem.
      if (id === requestId.current) setQuote(result);
    } catch (err) {
      if (id === requestId.current) {
        setErrorMsg(err instanceof Error ? err.message : 'Falha ao calcular os valores.');
      }
    } finally {
      if (id === requestId.current) setQuoting(false);
    }
  }, [items, stateCode, cep, appliedCoupon, paymentMethod, pagamentoEscolhido, freteEscolhido]);

  useEffect(() => {
    const t = setTimeout(refreshQuote, 300);
    return () => clearTimeout(t);
  }, [refreshQuote]);

  const handleCpfChange = (v: string) => {
    const raw = v.replace(/\D/g, '').substring(0, 11);
    let f = raw;
    if (raw.length > 3) f = `${raw.substring(0, 3)}.${raw.substring(3)}`;
    if (raw.length > 6) f = `${f.substring(0, 7)}.${raw.substring(6)}`;
    if (raw.length > 9) f = `${f.substring(0, 11)}-${raw.substring(9)}`;
    setCpf(f);
  };
  const handlePhoneChange = (v: string) => {
    const raw = v.replace(/\D/g, '').substring(0, 11);
    let f = raw;
    if (raw.length > 2) f = `(${raw.substring(0, 2)}) ${raw.substring(2)}`;
    if (raw.length > 7) f = `${f.substring(0, 10)}-${raw.substring(7)}`;
    setPhone(f);
  };
  const handleCepChange = (v: string) => {
    const raw = v.replace(/\D/g, '').substring(0, 8);
    setCep(raw.length > 5 ? `${raw.substring(0, 5)}-${raw.substring(5)}` : raw);
  };

  /*
   * Só há valores confiáveis quando a cotação do servidor chega. Antes disso —
   * e se ela falhar — o resumo mostra "calculando…" em vez de "Frete: Grátis"
   * e um total igual ao subtotal, que era menor do que o cobrado de fato.
   */
  const temCotacao = quote !== null;
  const subtotal = quote?.subtotal ?? cartItems.reduce((a, i) => a + i.product.price * i.quantity, 0);
  const shippingCost = quote?.shipping ?? 0;
  const grandTotal = quote?.total ?? subtotal;

  /*
   * Frete só existe depois do CEP.
   *
   * Sem CEP o servidor cai na regra padrão, e o resumo anunciava
   * "Frete · Entrega padrão — Grátis" na etapa de identificação. Duas coisas
   * erradas de uma vez: uma modalidade que ninguém escolheu e um preço que pode
   * subir depois. Quem lê "Grátis" e depois vê frete no total desconfia da loja
   * — e com razão.
   */
  const temCep = cep.replace(/\D/g, '').length === 8;
  const freteConhecido = temCotacao && temCep;

  const opcoesFrete = quote?.shippingOptions ?? [];

  /*
   * A opção escolhida deixou de existir?
   *
   * Trocar o CEP muda a lista: a transportadora que atendia São Paulo pode não
   * atender a Bahia. Manter o id antigo faria o servidor recusar o pedido no
   * final ("opção não disponível"), o pior momento para descobrir. Ao perceber
   * que a escolha saiu da lista, voltamos para a mais barata.
   */
  useEffect(() => {
    if (freteEscolhido === '') return;
    if (opcoesFrete.length === 0) return;
    if (!opcoesFrete.some((o) => o.id === freteEscolhido)) setFreteEscolhido('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quote]);

  /*
   * Enquanto o frete é desconhecido, o total mostrado NÃO o inclui.
   *
   * O servidor sempre devolve um frete — sem CEP ele cai na regra padrão. Somar
   * esse valor num total enquanto a linha do frete diz "informe o CEP" produzia
   * a pior combinação possível: subtotal R$ 2,00, frete "informe o CEP", total
   * R$ 16,90. Os R$ 14,90 apareciam do nada. Melhor mostrar só o que já se sabe
   * e dizer que o frete entra depois.
   */
  const totalExibido = freteConhecido
    ? grandTotal
    : Math.max(0, Math.round((grandTotal - shippingCost) * 100) / 100);

  const ALL_PAYMENTS = [
    { id: 'pix' as const, icon: QrCode, title: 'Pix', desc: 'Aprovação na hora', tag: quote?.pixDiscountPct ? `${brlNumber(quote.pixDiscountPct).replace(',00', '')}% OFF` : '' },
    { id: 'card' as const, icon: CreditCard, title: 'Cartão de Crédito', desc: `Em até ${parcelasMax}x sem juros`, tag: '' },
  ];
  const PAYMENTS = ALL_PAYMENTS.filter((pm) => enabledPayments.includes(pm.id));

  const validateStep = (s: number): string => {
    if (s === 1) {
      if (!fullName.trim()) return 'Informe o seu nome completo.';
      if (!cpf.trim()) return 'Informe o seu CPF.';
      if (!isValidCPF(cpf)) return 'CPF inválido. Confira os números digitados.';
      if (phone.replace(/\D/g, '').length < 10) return 'Informe um telefone com DDD válido.';
      if (!email.trim() || !email.includes('@')) return 'Informe um e-mail válido.';
    }
    if (s === 2) {
      if (cep.replace(/\D/g, '').length !== 8) return 'Informe um CEP válido com 8 dígitos.';
      if (!street.trim() || !number.trim() || !city.trim())
        return 'Preencha Rua, Número e Cidade.';
    }
    return '';
  };

  const firstStep = profileComplete ? 2 : 1;

  const next = () => {
    const err = validateStep(step);
    if (err) {
      setErrorMsg(err);
      return;
    }
    setErrorMsg('');
    // Ao sair da identificação, registra a sacola para recuperação futura.
    if (step === 1 && email.includes('@')) {
      api
        .post('/carts/abandoned', { name: fullName, email, phone, items })
        .catch(() => undefined);
    }
    setStep((s) => Math.min(3, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const prev = () => {
    setErrorMsg('');
    setStep((s) => Math.max(firstStep, s - 1));
  };
  const onFirst = step <= firstStep;
  const handleBack = () => (onFirst ? onBack() : prev());

  const applyCoupon = () => {
    setAppliedCoupon(couponInput.trim().toUpperCase());
  };

  /**
   * Fecha o pedido — e cobra.
   *
   * Só existe pedido depois de o servidor falar com o meio de pagamento. No
   * cartão, `cartao` traz o token que o formulário do Mercado Pago gerou (o
   * número do cartão não passa por aqui). No Pix, não há token: a resposta traz
   * o QR code e a tela passa a esperar o pagamento.
   *
   * A função REJEITA em caso de falha, de propósito: é assim que o formulário do
   * cartão sabe que precisa reabilitar o botão.
   */
  const finalizarPedido = async (cartao?: DadosCartao): Promise<void> => {
    if (cartItems.length === 0) {
      setErrorMsg('A sua sacola está vazia.');
      throw new Error('sacola vazia');
    }
    if (!temCotacao) {
      setErrorMsg('Aguarde o cálculo do frete e do total.');
      throw new Error('sem cotação');
    }
    setErrorMsg('');
    setIsSubmitting(true);
    try {
      const res = await api.post<{ order: ConfirmedOrder }>('/orders', {
        items,
        name: fullName,
        email,
        phone,
        cpf,
        payment: paymentMethod,
        coupon: appliedCoupon,
        shipping: freteEscolhido,
        address: { cep, street, number, complement, neighborhood, city, state: stateCode },
        card: cartao === undefined ? undefined : {
          token: cartao.token,
          paymentMethodId: cartao.payment_method_id,
          installments: cartao.installments,
        },
      });
      const pedido = res.order;
      setOrder(pedido);
      // Limpa aqui, e não só no botão "Voltar à loja": quem fechava a aba na
      // tela de confirmação reencontrava a sacola cheia e repetia o pedido.
      onClearCart();
      // O servidor já gravou cliente e endereço: recarrega o perfil.
      fetchAccount()
        .then((acc) => acc && onProfileSaved?.(acc))
        .catch(() => undefined);

      /*
       * Pix vai para a tela de espera, não para a de confirmação: o pedido está
       * reservado, mas ninguém pagou ainda. Cartão aprovado (ou em análise) vai
       * para a confirmação — que informa qual dos dois é.
       */
      setStage(pedido.payment === 'pix' && pedido.pix !== null ? 'pix' : 'success');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      const msg =
        err instanceof ApiError ? err.message : 'Não foi possível concluir o pedido.';
      setErrorMsg(msg);
      refreshQuote();
      /*
       * Recusa do cartão queima o token. Sem um formulário novo, a segunda
       * tentativa falharia por "token inválido" e esconderia o motivo real —
       * que é justamente o que o cliente precisa ler para resolver.
       */
      if (err instanceof ApiError && (err.code === 'payment_rejected' || err.code === 'missing_card_token')) {
        setTentativaCartao((t) => t + 1);
      }
      /*
       * A transportadora escolhida saiu do ar entre a escolha e o clique. Volta
       * para a etapa da entrega com a escolha limpa: a pessoa vê a lista nova e
       * decide de novo, em vez de ser cobrada por uma opção que não escolheu.
       */
      if (err instanceof ApiError && err.code === 'shipping_option_gone') {
        setFreteEscolhido('');
        setStep(2);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      throw err;
    } finally {
      setIsSubmitting(false);
    }
  };

  /** Para os botões da própria tela, onde a rejeição não tem quem a trate. */
  const finalizarSemPropagar = (): void => {
    void finalizarPedido().catch(() => undefined);
  };

  // ---- Tela do Pix: pedido reservado, dinheiro ainda NÃO ----
  if (stage === 'pix' && order?.pix) {
    return (
      <PixMercadoPago
        pedidoId={order.id}
        total={order.total}
        pix={order.pix}
        onPago={() => {
          setOrder({ ...order, paymentStatus: 'aprovado' });
          setStage('success');
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }}
        onExpirado={() => setStage('pix_expirado')}
      />
    );
  }

  // ---- Pix vencido: o pedido foi cancelado e o estoque voltou ----
  if (stage === 'pix_expirado') {
    return (
      <div className="pt-40 lg:pt-44 pb-24 bg-brand-cream min-h-screen">
        <div className="max-w-xl mx-auto px-4">
          <div className="bg-white rounded-3xl border border-gray-100 p-8 sm:p-12 text-center shadow-[0_20px_60px_rgba(43,49,37,0.12)]">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-600 mb-5">
              <Clock size={30} aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-extrabold text-gray-900 m-0">Este Pix venceu</h2>
            <p className="text-gray-500 leading-relaxed mt-3 mb-0">
              O prazo para pagar terminou e o pedido {order ? <strong className="text-gray-700">{order.id}</strong> : null} foi
              cancelado. <strong className="text-gray-700">Nada foi cobrado.</strong> As peças
              voltaram para a loja e você pode fazer o pedido de novo.
            </p>
            <button
              onClick={onBack}
              className="mt-8 px-8 py-4 bg-primary-blue hover:bg-primary-container text-white rounded-full text-sm font-bold uppercase tracking-wider transition cursor-pointer"
            >
              Voltar à loja
            </button>
          </div>
        </div>
      </div>
    );
  }

  /*
   * ---- Tela final ----
   *
   * Duas versões, e a diferença entre elas é o ponto mais importante desta tela:
   * "Pagamento aprovado / Total pago" só aparece quando o dinheiro entrou de
   * verdade. Cartão em análise mostra "em análise" e "Total do pedido".
   *
   * A versão antiga afirmava "PEDIDO CONFIRMADO · Total pago" para qualquer
   * pedido gravado — inclusive quando nenhuma cobrança havia acontecido. A
   * lojista via pedidos achando que tinha dinheiro entrando, e o cliente ia
   * embora achando que tinha pagado.
   */
  if (stage === 'success' && order) {
    const aprovado = order.paymentStatus === 'aprovado';
    return (
      <div className="pt-40 lg:pt-44 pb-24 bg-brand-cream min-h-screen">
        <div className="max-w-xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl border border-gray-100 p-8 sm:p-12 text-center shadow-[0_20px_60px_rgba(43,49,37,0.12)]"
          >
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ring-8 ${
                aprovado
                  ? 'bg-emerald-50 text-emerald-600 ring-emerald-50/50'
                  : 'bg-amber-50 text-amber-600 ring-amber-50/50'
              }`}
            >
              {aprovado
                ? <Check size={40} strokeWidth={3} aria-hidden="true" />
                : <Clock size={38} aria-hidden="true" />}
            </div>
            <span
              className={`text-[11px] uppercase px-3 py-1 rounded-full font-bold tracking-widest ${
                aprovado ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'
              }`}
            >
              {aprovado ? 'Pagamento aprovado' : 'Pagamento em análise'}
            </span>
            <h2 className="text-3xl font-extrabold text-gray-900 mt-5">
              Obrigado, {order.customerName.split(' ')[0]}!
            </h2>
            <p className="text-gray-500 max-w-md mx-auto leading-relaxed mt-3">
              {aprovado ? (
                <>
                  O pagamento do pedido <strong className="text-gray-700">{order.id}</strong> foi
                  confirmado e já estamos preparando o envio. Guarde este número para acompanhar.
                </>
              ) : (
                <>
                  Recebemos o pedido <strong className="text-gray-700">{order.id}</strong>. O
                  emissor do cartão está analisando o pagamento — isso costuma levar alguns
                  minutos. O envio só começa depois da aprovação.
                </>
              )}
            </p>

            {order.ambiente === 'teste' && (
              <p role="status" className="mt-6 mb-0 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[12px] text-amber-800 font-semibold">
                Ambiente de teste do Mercado Pago: nenhum valor real foi movimentado.
              </p>
            )}

            <div className="bg-gray-50/70 rounded-2xl p-6 border border-gray-100 text-left text-sm space-y-3.5 mt-8">
              <div className="flex justify-between">
                <span className="text-gray-400">Nº do pedido</span>
                <span className="font-bold text-gray-800 font-mono">{order.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-400">Pagamento</span>
                <span className="font-semibold text-gray-800">{PAYMENT_LABELS[order.payment]}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 flex items-center gap-1.5">
                  <Truck className="w-4 h-4" aria-hidden="true" /> Entrega prevista
                </span>
                <span className="font-semibold text-gray-800">
                  {aprovado ? order.deliveryEta : 'após a aprovação'}
                </span>
              </div>
              <div className="border-t border-dashed border-gray-200 pt-3.5 flex justify-between items-baseline">
                <span className="font-bold text-gray-900">
                  {aprovado ? 'Total pago' : 'Total do pedido'}
                </span>
                <span className="text-2xl font-extrabold text-primary-blue">
                  R$ {brlNumber(order.total)}
                </span>
              </div>
            </div>
            <button
              onClick={onBack}
              className="mt-8 px-8 py-4 bg-primary-blue hover:bg-primary-container text-white rounded-full text-sm font-bold uppercase tracking-wider transition cursor-pointer"
            >
              Voltar à loja
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // ---- Wizard ----
  return (
    <div className="pt-40 lg:pt-44 pb-24 bg-brand-cream text-left scroll-mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="mb-7 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-primary-blue transition-colors group"
          >
            <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" aria-hidden="true" />
            {onFirst ? 'Continuar comprando' : 'Voltar'}
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400">
            <Lock size={13} aria-hidden="true" /> Pagamento seguro
          </span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-8">Finalizar compra</h1>

        {/* Stepper */}
        <nav aria-label="Etapas do checkout" className="mb-10">
          <ol className="flex items-center list-none p-0 m-0">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = step > s.id;
              const active = step === s.id;
              return (
                <React.Fragment key={s.id}>
                  <li className="flex items-center gap-3" aria-current={active ? 'step' : undefined}>
                    <div
                      className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
                        done
                          ? 'bg-emerald-500 text-white'
                          : active
                            ? 'bg-primary-blue text-white ring-4 ring-primary-blue/15'
                            : 'bg-white border-2 border-gray-200 text-gray-400'
                      }`}
                    >
                      {done ? <Check size={20} strokeWidth={3} aria-hidden="true" /> : <Icon size={19} aria-hidden="true" />}
                    </div>
                    <div className="hidden sm:block">
                      <p className={`text-[11px] font-bold uppercase tracking-wider ${active || done ? 'text-primary-blue' : 'text-gray-400'}`}>
                        Etapa {s.id}
                      </p>
                      <p className={`text-sm font-bold ${active || done ? 'text-gray-900' : 'text-gray-400'}`}>
                        {s.label}
                      </p>
                    </div>
                  </li>
                  {i < STEPS.length - 1 && (
                    <li aria-hidden="true" className="flex-1 h-0.5 mx-3 sm:mx-5 rounded-full bg-gray-200 overflow-hidden">
                      <div className={`h-full bg-emerald-500 transition-all duration-500 ${step > s.id ? 'w-full' : 'w-0'}`} />
                    </li>
                  )}
                </React.Fragment>
              );
            })}
          </ol>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          <div className="lg:col-span-7 xl:col-span-8">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgba(43,49,37,0.06)] p-6 sm:p-9 min-h-[420px] flex flex-col">
              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 24 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -24 }}
                  transition={{ duration: 0.25 }}
                  className="flex-1"
                >
                  {step === 1 && (
                    <div>
                      <h2 className="text-xl font-extrabold text-gray-900">Seus dados</h2>
                      <p className="text-sm text-gray-400 mb-7">Para acompanharmos o seu pedido.</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="sm:col-span-2">
                          <label className={labelCls} htmlFor="ck-name">Nome completo *</label>
                          <input id="ck-name" type="text" autoComplete="name" placeholder="Maria Oliveira" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls} htmlFor="ck-cpf">CPF *</label>
                          <input id="ck-cpf" type="text" inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={(e) => handleCpfChange(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls} htmlFor="ck-phone">Celular / WhatsApp *</label>
                          <input id="ck-phone" type="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={phone} onChange={(e) => handlePhoneChange(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelCls} htmlFor="ck-email">E-mail *</label>
                          <input id="ck-email" type="email" autoComplete="email" placeholder="voce@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h2 className="text-xl font-extrabold text-gray-900">Endereço de entrega</h2>
                          <p className="text-sm text-gray-400 mb-5">Onde você quer receber os seus produtos.</p>
                        </div>
                        {profileComplete && (
                          <button onClick={() => setStep(1)} className="text-xs font-bold text-primary-blue hover:underline whitespace-nowrap mt-1">
                            Alterar meus dados
                          </button>
                        )}
                      </div>
                      {profileComplete && (
                        <div className="mb-5 flex items-center gap-2 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
                          <User size={15} className="text-primary-blue" aria-hidden="true" />
                          Comprando como <strong className="text-gray-700">{fullName}</strong> · {email}
                        </div>
                      )}
                      {addr && (
                        <div className="mb-5 flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
                          <Check size={15} aria-hidden="true" />
                          Preenchemos com o endereço salvo na sua conta — confira e ajuste se precisar.
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-5">
                        <div className="sm:col-span-4">
                          <label className={labelCls} htmlFor="ck-cep">CEP *</label>
                          <input id="ck-cep" type="text" inputMode="numeric" autoComplete="postal-code" placeholder="01001-000" value={cep} onChange={(e) => handleCepChange(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-8">
                          <label className={labelCls} htmlFor="ck-street">Rua / Avenida *</label>
                          <input id="ck-street" type="text" autoComplete="address-line1" placeholder="Rua das Flores" value={street} onChange={(e) => setStreet(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-3">
                          <label className={labelCls} htmlFor="ck-number">Número *</label>
                          <input id="ck-number" type="text" placeholder="250" value={number} onChange={(e) => setNumber(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-5">
                          <label className={labelCls} htmlFor="ck-comp">Complemento</label>
                          <input id="ck-comp" type="text" placeholder="Apto 42" value={complement} onChange={(e) => setComplement(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-4">
                          <label className={labelCls} htmlFor="ck-hood">Bairro *</label>
                          <input id="ck-hood" type="text" placeholder="Centro" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-8">
                          <label className={labelCls} htmlFor="ck-city">Cidade *</label>
                          <input id="ck-city" type="text" autoComplete="address-level2" placeholder="São Paulo" value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-4">
                          <label className={labelCls} htmlFor="ck-uf">UF *</label>
                          <select id="ck-uf" value={stateCode} onChange={(e) => setStateCode(e.target.value)} className={inputCls}>
                            {['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'].map((uf) => (
                              <option key={uf} value={uf}>{uf}</option>
                            ))}
                          </select>
                        </div>
                      </div>

                      {/*
                        OPÇÕES DE ENTREGA.
                        Só aparecem quando alguma transportadora cotou de verdade
                        (Correios ou Melhor Envio). Sem cotação, o frete sai das
                        regras do painel e não há o que escolher — mostrar uma
                        lista de um item só seria escolha de fachada.
                      */}
                      {opcoesFrete.length > 0 && (
                        <fieldset className="mt-8 border-0 p-0 m-0">
                          <legend className="text-sm font-extrabold text-gray-900 mb-1 p-0">
                            Como você prefere receber?
                          </legend>
                          <p className="text-xs text-gray-400 mt-0 mb-4">
                            Prazos em dias úteis, contados após a confirmação do pagamento.
                          </p>
                          <div className="space-y-2.5">
                            {opcoesFrete.map((o) => {
                              const ativo = (quote?.shippingChoice ?? '') === o.id;
                              return (
                                <button
                                  type="button"
                                  key={o.id}
                                  aria-pressed={ativo}
                                  onClick={() => setFreteEscolhido(o.id)}
                                  disabled={quoting}
                                  className={`w-full flex items-center gap-3 text-left p-3.5 rounded-2xl border-2 transition-all disabled:opacity-60 ${
                                    ativo ? 'border-primary-blue bg-primary-blue/[0.03] shadow-sm' : 'border-gray-200 hover:border-gray-300'
                                  }`}
                                >
                                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${ativo ? 'bg-primary-blue text-white' : 'bg-gray-100 text-gray-500'}`}>
                                    <Truck size={18} aria-hidden="true" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-gray-900 text-sm truncate">{o.label}</p>
                                    <p className="text-xs text-gray-400 mt-0.5">
                                      {o.days > 0
                                        ? `até ${o.days} ${o.days === 1 ? 'dia útil' : 'dias úteis'}`
                                        : 'prazo a confirmar'}
                                    </p>
                                  </div>
                                  <span className={`text-sm font-extrabold flex-shrink-0 ${o.price === 0 ? 'text-emerald-600' : 'text-gray-900'}`}>
                                    {o.price === 0 ? 'Grátis' : `R$ ${brlNumber(o.price)}`}
                                  </span>
                                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${ativo ? 'border-primary-blue' : 'border-gray-300'}`}>
                                    {ativo && <div className="w-2.5 h-2.5 rounded-full bg-primary-blue" />}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </fieldset>
                      )}
                    </div>
                  )}

                  {step === 3 && (
                    <div>
                      <h2 className="text-xl font-extrabold text-gray-900">Forma de pagamento</h2>
                      <p className="text-sm text-gray-400 mb-7">Escolha como prefere pagar.</p>
                      <fieldset className="space-y-3 border-0 p-0 m-0">
                        <legend className="sr-only">Forma de pagamento</legend>
                        {PAYMENTS.map((pm) => {
                          const Icon = pm.icon;
                          const active = paymentMethod === pm.id;
                          return (
                            <button
                              type="button"
                              key={pm.id}
                              aria-pressed={active}
                              onClick={() => {
                                setPaymentMethod(pm.id);
                                setPagamentoEscolhido(true);
                              }}
                              className={`w-full flex items-center gap-4 text-left p-4 rounded-2xl border-2 transition-all ${
                                active ? 'border-primary-blue bg-primary-blue/[0.03] shadow-sm' : 'border-gray-200 hover:border-gray-300'
                              }`}
                            >
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${active ? 'bg-primary-blue text-white' : 'bg-gray-100 text-gray-500'}`}>
                                <Icon size={22} aria-hidden="true" />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-gray-900">{pm.title}</p>
                                  {pm.tag && (
                                    <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{pm.tag}</span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">{pm.desc}</p>
                              </div>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'border-primary-blue' : 'border-gray-300'}`}>
                                {active && <div className="w-2.5 h-2.5 rounded-full bg-primary-blue" />}
                              </div>
                            </button>
                          );
                        })}
                      </fieldset>

                      {/* Meio de pagamento não configurado: avisar, não fingir. */}
                      {(configFalhou || (configPagamento !== null && !configPagamento.enabled)) && (
                        <div role="alert" className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-xl text-amber-900 text-sm">
                          <p className="font-bold m-0">A loja ainda não está aceitando pagamento online.</p>
                          <p className="m-0 mt-1 text-amber-800">
                            Fale com a gente pelo WhatsApp para concluir a sua compra — o seu
                            carrinho fica guardado.
                          </p>
                        </div>
                      )}

                      {configPagamento?.ambiente === 'teste' && (
                        <p role="status" className="mt-6 mb-0 p-3 bg-amber-50 border border-amber-200 rounded-xl text-[12px] text-amber-800 font-semibold">
                          Ambiente de teste: nenhuma cobrança real acontece aqui.
                        </p>
                      )}

                      {/* Cartão: o formulário é do Mercado Pago, dentro da página. */}
                      {paymentMethod === 'card' && configPagamento?.enabled && (
                        <div className="mt-7 pt-7 border-t border-gray-100">
                          <h3 className="text-sm font-extrabold text-gray-900 m-0 mb-1">
                            Dados do cartão
                          </h3>
                          <p className="text-xs text-gray-400 mt-0 mb-5 flex items-center gap-1.5">
                            <Lock size={12} aria-hidden="true" />
                            Preenchido direto no Mercado Pago — os números do cartão não passam pela
                            nossa loja.
                          </p>
                          <CartaoMercadoPago
                            remontar={tentativaCartao}
                            publicKey={configPagamento.publicKey}
                            valor={grandTotal}
                            email={email}
                            cpf={cpf.replace(/\D/g, '')}
                            parcelasMax={parcelasMax}
                            onPagar={finalizarPedido}
                          />
                        </div>
                      )}

                      {/* Pix: o QR nasce só depois de o pedido ser criado. */}
                      {paymentMethod === 'pix' && configPagamento?.enabled && (
                        <div className="mt-7 pt-7 border-t border-gray-100">
                          <p className="text-sm text-gray-500 m-0">
                            Ao continuar, geramos um QR code válido por 30 minutos. As peças ficam
                            reservadas nesse período e a confirmação é automática — você não precisa
                            enviar comprovante.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {/*
                Comparações explícitas, e não `errorMsg || quote?.issues?.length`.
                Com a mensagem vazia e zero avisos, aquela expressão vale 0 — e
                o React IMPRIME o zero na tela. Era o "0" solto que aparecia
                embaixo do campo de e-mail.
              */}
              {(errorMsg !== '' || (quote?.issues?.length ?? 0) > 0) && (
                <div role="alert" className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium space-y-1">
                  {errorMsg && (
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" aria-hidden="true" />
                      <span>{errorMsg}</span>
                    </div>
                  )}
                  {quote?.issues?.map((issue) => (
                    <div key={issue} className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" aria-hidden="true" />
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t border-gray-100">
                <button onClick={handleBack} className="px-5 py-3 rounded-full text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors">
                  {onFirst ? 'Cancelar' : 'Voltar'}
                </button>
                {step < 3 ? (
                  <button
                    onClick={next}
                    className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary-blue hover:bg-primary-container text-white rounded-full text-sm font-bold uppercase tracking-wider transition-all shadow-md active:scale-[0.98]"
                  >
                    Continuar <ArrowRight size={16} aria-hidden="true" />
                  </button>
                ) : (
                  /*
                   * No cartão, quem tem botão é o formulário do Mercado Pago —
                   * ele só libera o envio quando os campos estão válidos, e um
                   * segundo botão nosso conseguiria disparar um pedido sem
                   * cartão nenhum. No Pix, o botão é este.
                   */
                  paymentMethod === 'pix' && (
                    <button
                      onClick={finalizarSemPropagar}
                      disabled={isSubmitting || quoting || !temCotacao || configPagamento?.enabled !== true}
                      className="inline-flex items-center gap-2 px-8 py-3.5 bg-brand-red hover:bg-[#82502d] text-white rounded-full text-sm font-bold uppercase tracking-wider transition-all shadow-md active:scale-[0.98] disabled:opacity-60"
                    >
                      {isSubmitting ? (
                        <><Loader2 size={16} className="animate-spin" aria-hidden="true" /> Gerando o código…</>
                      ) : (
                        <><QrCode size={16} aria-hidden="true" /> Gerar código Pix</>
                      )}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Resumo */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgba(43,49,37,0.06)] sticky top-44 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <h2 className="font-extrabold text-gray-900">Resumo do pedido</h2>
                <span className="text-xs bg-primary-blue/10 text-primary-blue px-2.5 py-1 rounded-full font-bold">
                  {cartItems.length} {cartItems.length === 1 ? 'item' : 'itens'}
                </span>
              </div>

              <ul className="px-6 py-4 space-y-3.5 max-h-[280px] overflow-y-auto list-none m-0">
                {cartItems.map((item) => (
                  <li key={item.product.id} className="flex gap-3 items-center">
                    <div className="relative w-14 h-14 bg-gray-50 rounded-xl border border-gray-100 flex-shrink-0 flex items-center justify-center overflow-hidden">
                      <img src={safeImageSrc(item.product.image)} alt="" className="max-h-full max-w-full object-contain p-1" loading="lazy" />
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary-blue text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                        {item.quantity}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-800 truncate">{item.product.name}</h3>
                      <p className="text-[11px] text-gray-400">R$ {brlNumber(item.product.price)} / un</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900">
                      R$ {brlNumber(item.product.price * item.quantity)}
                    </span>
                  </li>
                ))}
              </ul>

              {/* Cupom */}
              <div className="px-6 pb-1">
                <label htmlFor="ck-coupon" className="block text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                  Cupom de desconto
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Tag className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                    <input
                      id="ck-coupon"
                      type="text"
                      value={couponInput}
                      onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                      onKeyDown={(e) => e.key === 'Enter' && applyCoupon()}
                      placeholder="BEMVINDO10"
                      className="w-full text-sm border border-gray-200 rounded-xl py-2.5 pl-9 pr-3 uppercase focus:outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue"
                    />
                  </div>
                  <button
                    onClick={applyCoupon}
                    className="px-4 rounded-xl bg-gray-100 hover:bg-gray-200 text-xs font-bold uppercase tracking-wider text-gray-700 transition-colors"
                  >
                    Aplicar
                  </button>
                </div>
                {quote?.couponError && (
                  <p role="alert" className="text-[11px] text-brand-red font-medium mt-1.5">{quote.couponError}</p>
                )}
                {quote?.couponCode && (
                  <p className="text-[11px] text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                    <Check size={12} aria-hidden="true" /> Cupom {quote.couponCode} aplicado
                    <button
                      onClick={() => { setAppliedCoupon(''); setCouponInput(''); }}
                      className="ml-1 text-gray-400 hover:text-brand-red"
                      aria-label="Remover cupom"
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  </p>
                )}
              </div>

              <div className="px-6 py-5 space-y-2.5 text-sm" aria-busy={quoting}>
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span>R$ {brlNumber(subtotal)}</span>
                </div>
                {!!quote?.couponDiscount && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Cupom {quote.couponCode}</span>
                    <span>- R$ {brlNumber(quote.couponDiscount)}</span>
                  </div>
                )}
                {!!quote?.pixDiscount && (
                  <div className="flex justify-between text-emerald-600 font-medium">
                    <span>Desconto Pix</span>
                    <span>- R$ {brlNumber(quote.pixDiscount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-gray-500">
                  <span>Frete{freteConhecido && quote.shippingLabel ? ` · ${quote.shippingLabel}` : ''}</span>
                  <span className={freteConhecido && shippingCost === 0 ? 'text-emerald-600 font-semibold' : ''}>
                    {!temCotacao || quoting
                      ? 'calculando…'
                      : !temCep
                        ? 'informe o CEP'
                        : shippingCost === 0
                          ? 'Grátis'
                          : `R$ ${brlNumber(shippingCost)}`}
                  </span>
                </div>
                {/* Bastidor: só chega para quem está logado no painel. */}
                {quote?.shippingNote && (
                  <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-normal m-0">
                    <strong>Só você vê isto (painel):</strong> frete da tabela fixa, não dos
                    Correios — {quote.shippingNote}
                  </p>
                )}
                <div className="flex justify-between items-baseline pt-3.5 border-t border-dashed border-gray-200">
                  {/*
                    "Total parcial" enquanto o frete é desconhecido. Chamar de
                    "Total" um número que ainda vai subir é o tipo de detalhe que
                    faz a pessoa desistir na última tela.
                  */}
                  <span className="font-bold text-gray-900">
                    {freteConhecido ? 'Total' : 'Total parcial'}
                  </span>
                  <span className="text-2xl font-extrabold text-primary-blue">
                    {temCotacao ? `R$ ${brlNumber(totalExibido)}` : '—'}
                  </span>
                </div>
                {temCotacao && !temCep && (
                  <p className="text-[11px] text-gray-400 m-0">
                    O frete entra no total quando você informar o CEP, na próxima etapa.
                  </p>
                )}
              </div>

              <div className="px-6 pb-6">
                <p className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400 bg-gray-50/70 rounded-xl py-3 m-0">
                  <ShieldCheck size={14} className="text-emerald-500" aria-hidden="true" />
                  Valores conferidos no servidor a cada etapa
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
