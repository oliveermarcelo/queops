/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  ArrowLeft, ArrowRight, Check, ShieldCheck, CreditCard, User, MapPin,
  AlertCircle, Truck, QrCode, Barcode, Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { CartItem } from '../types';
import { CustomerAccount } from '../account/session';
import { safeImageSrc } from '../utils/safeUrl';
import { brlNumber } from '../utils/currency';

interface CheckoutPageProps {
  cartItems: CartItem[];
  account?: CustomerAccount | null;
  onBack: () => void;
  onClearCart: () => void;
  onSaveProfile?: (data: {
    name: string; cpf: string; phone: string; email: string;
    address: { cep: string; street: string; number: string; complement?: string; neighborhood: string; city: string; state: string };
  }) => void;
}

interface ConfirmedOrder {
  id: string;
  customerName: string;
  paymentLabel: string;
  total: number;
  deliveryDate: string;
}

const labelCls = 'block text-[13px] font-semibold text-gray-700 mb-2';
const inputCls =
  'w-full text-[15px] border border-gray-200 rounded-xl px-4 py-3.5 bg-white focus:outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue transition placeholder:text-gray-300';

const STEPS = [
  { id: 1, label: 'Identificação', icon: User },
  { id: 2, label: 'Entrega', icon: MapPin },
  { id: 3, label: 'Pagamento', icon: CreditCard },
];

// Validates a Brazilian CPF using the check-digit algorithm.
function isValidCPF(value: string): boolean {
  const cpf = value.replace(/\D/g, '');
  if (cpf.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(cpf)) return false; // rejects 000.000.000-00 etc.
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

export default function CheckoutPage({ cartItems, account, onBack, onClearCart, onSaveProfile }: CheckoutPageProps) {
  const [stage, setStage] = useState<'checkout' | 'success'>('checkout');

  // Pre-fill from the logged-in customer's saved profile + default address.
  const addr = account?.addresses?.find((a) => a.isDefault) ?? account?.addresses?.[0];

  // If the logged-in customer already has complete identification, skip step 1.
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

  const [paymentMethod, setPaymentMethod] = useState<'card' | 'pix' | 'boleto'>('card');

  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [order, setOrder] = useState<ConfirmedOrder | null>(null);

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

  const subtotal = useMemo(
    () => cartItems.reduce((acc, item) => acc + item.product.price * item.quantity, 0),
    [cartItems]
  );
  const shippingCost = subtotal >= 199 || subtotal === 0 ? 0 : 19.9;
  const isPixSelected = paymentMethod === 'pix';
  const pixDiscount = isPixSelected ? subtotal * 0.05 : 0;
  const grandTotal = subtotal + shippingCost - pixDiscount;

  const paymentLabels = {
    card: 'Cartão de Crédito',
    pix: 'Pix (5% de desconto)',
    boleto: 'Boleto Bancário',
  };

  const PAYMENTS = [
    { id: 'card' as const, icon: CreditCard, title: 'Cartão de Crédito', desc: 'Em até 6x sem juros', tag: '' },
    { id: 'pix' as const, icon: QrCode, title: 'Pix', desc: 'Aprovação na hora', tag: '5% OFF' },
    { id: 'boleto' as const, icon: Barcode, title: 'Boleto', desc: 'Compensa em 2 dias úteis', tag: '' },
  ];

  // Per-step validation
  const validateStep = (s: number): string => {
    if (s === 1) {
      if (!fullName.trim()) return 'Informe o seu nome completo.';
      if (!cpf.trim()) return 'Informe o seu CPF.';
      if (!isValidCPF(cpf)) return 'CPF inválido. Confira os números digitados.';
      if (phone.replace(/\D/g, '').length < 10) return 'Informe um telefone com DDD válido.';
      if (!email.trim() || !email.includes('@')) return 'Informe um e-mail válido.';
    }
    if (s === 2) {
      if (!cep.trim() || !street.trim() || !number.trim() || !city.trim())
        return 'Preencha CEP, Rua, Número e Cidade.';
    }
    return '';
  };

  const firstStep = profileComplete ? 2 : 1;

  const next = () => {
    const err = validateStep(step);
    if (err) { setErrorMsg(err); return; }
    setErrorMsg('');
    setStep((s) => Math.min(3, s + 1));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  const prev = () => {
    setErrorMsg('');
    setStep((s) => Math.max(firstStep, s - 1));
  };
  // On the first visible step, "back" leaves the checkout.
  const onFirst = step <= firstStep;
  const handleBack = () => (onFirst ? onBack() : prev());

  const handlePlaceOrder = () => {
    if (cartItems.length === 0) { setErrorMsg('A sua sacola está vazia.'); return; }
    setErrorMsg('');
    // Persist the data/address back to the customer's account for next time.
    onSaveProfile?.({
      name: fullName, cpf, phone, email,
      address: { cep, street, number, complement, neighborhood, city, state: stateCode },
    });
    setIsSubmitting(true);
    setTimeout(() => {
      const deliveryDays = stateCode === 'SP' ? 3 : 5;
      const estDeliveryDate = new Date();
      estDeliveryDate.setDate(estDeliveryDate.getDate() + deliveryDays);
      setOrder({
        id: `KM-${Math.floor(100000 + Math.random() * 900000)}`,
        customerName: fullName,
        paymentLabel: paymentLabels[paymentMethod],
        total: grandTotal,
        deliveryDate: estDeliveryDate.toLocaleDateString('pt-BR'),
      });
      setStage('success');
      setIsSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 1200);
  };

  // ---- Success screen ----
  if (stage === 'success') {
    return (
      <div className="pt-40 lg:pt-44 pb-24 bg-[#fcf9f8] min-h-screen">
        <div className="max-w-xl mx-auto px-4">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-white rounded-3xl border border-gray-100 p-8 sm:p-12 text-center shadow-[0_20px_60px_rgba(21,20,125,0.12)]"
          >
            <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-600 mb-6 ring-8 ring-emerald-50/50">
              <Check size={40} strokeWidth={3} />
            </div>
            <span className="text-[11px] bg-emerald-100 text-emerald-700 uppercase px-3 py-1 rounded-full font-bold tracking-widest">
              Pedido confirmado
            </span>
            <h2 className="text-3xl font-extrabold text-gray-900 mt-5">
              Obrigado, {order?.customerName?.split(' ')[0]}!
            </h2>
            <p className="text-gray-500 max-w-md mx-auto leading-relaxed mt-3">
              Recebemos o seu pedido <strong className="text-gray-700">{order?.id}</strong>. A confirmação foi enviada para o seu e-mail.
            </p>
            <div className="bg-gray-50/70 rounded-2xl p-6 border border-gray-100 text-left text-sm space-y-3.5 mt-8">
              <div className="flex justify-between"><span className="text-gray-400">Nº do pedido</span><span className="font-bold text-gray-800 font-mono">{order?.id}</span></div>
              <div className="flex justify-between"><span className="text-gray-400">Pagamento</span><span className="font-semibold text-gray-800">{order?.paymentLabel}</span></div>
              <div className="flex justify-between items-center"><span className="text-gray-400 flex items-center gap-1.5"><Truck className="w-4 h-4" /> Entrega prevista</span><span className="font-semibold text-gray-800">{order?.deliveryDate}</span></div>
              <div className="border-t border-dashed border-gray-200 pt-3.5 flex justify-between items-baseline">
                <span className="font-bold text-gray-900">Total pago</span>
                <span className="text-2xl font-extrabold text-primary-blue">R$ {order ? brlNumber(order.total) : ''}</span>
              </div>
            </div>
            <button
              onClick={() => { onClearCart(); onBack(); }}
              className="mt-8 px-8 py-4 bg-primary-blue hover:bg-primary-container text-white rounded-full text-sm font-bold uppercase tracking-wider transition cursor-pointer"
            >
              Voltar à loja
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // ---- Checkout wizard ----
  return (
    <div className="pt-40 lg:pt-44 pb-24 bg-[#fcf9f8] text-left scroll-mt-20">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Top bar */}
        <div className="mb-7 flex items-center justify-between">
          <button onClick={handleBack} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-primary-blue transition-colors group">
            <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" />
            {onFirst ? 'Continuar comprando' : 'Voltar'}
          </button>
          <span className="inline-flex items-center gap-1.5 text-xs text-gray-400"><Lock size={13} /> Pagamento seguro</span>
        </div>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-gray-900 mb-8">Finalizar compra</h1>

        {/* Stepper */}
        <div className="mb-10">
          <div className="flex items-center">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = step > s.id;
              const active = step === s.id;
              return (
                <React.Fragment key={s.id}>
                  <div className="flex items-center gap-3">
                    <div className={`w-11 h-11 rounded-full flex items-center justify-center transition-all duration-300 flex-shrink-0 ${
                      done ? 'bg-emerald-500 text-white'
                        : active ? 'bg-primary-blue text-white ring-4 ring-primary-blue/15'
                        : 'bg-white border-2 border-gray-200 text-gray-400'
                    }`}>
                      {done ? <Check size={20} strokeWidth={3} /> : <Icon size={19} />}
                    </div>
                    <div className="hidden sm:block">
                      <p className={`text-[11px] font-bold uppercase tracking-wider ${active || done ? 'text-primary-blue' : 'text-gray-400'}`}>
                        Etapa {s.id}
                      </p>
                      <p className={`text-sm font-bold ${active || done ? 'text-gray-900' : 'text-gray-400'}`}>{s.label}</p>
                    </div>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className="flex-1 h-0.5 mx-3 sm:mx-5 rounded-full bg-gray-200 overflow-hidden">
                      <div className={`h-full bg-emerald-500 transition-all duration-500 ${step > s.id ? 'w-full' : 'w-0'}`} />
                    </div>
                  )}
                </React.Fragment>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">

          {/* Left: step content */}
          <div className="lg:col-span-7 xl:col-span-8">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgba(21,20,125,0.06)] p-6 sm:p-9 min-h-[420px] flex flex-col">
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
                          <label className={labelCls}>Nome completo *</label>
                          <input type="text" placeholder="Maria Oliveira" value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>CPF *</label>
                          <input type="text" inputMode="numeric" placeholder="000.000.000-00" value={cpf} onChange={(e) => handleCpfChange(e.target.value)} className={inputCls} />
                        </div>
                        <div>
                          <label className={labelCls}>Celular / WhatsApp *</label>
                          <input type="tel" placeholder="(11) 99999-9999" value={phone} onChange={(e) => handlePhoneChange(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-2">
                          <label className={labelCls}>E-mail *</label>
                          <input type="email" placeholder="voce@email.com" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
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
                          <button
                            onClick={() => setStep(1)}
                            className="text-xs font-bold text-primary-blue hover:underline whitespace-nowrap mt-1"
                          >
                            Alterar meus dados
                          </button>
                        )}
                      </div>
                      {profileComplete && (
                        <div className="mb-5 flex items-center gap-2 text-xs font-medium text-gray-500 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5">
                          <User size={15} className="text-primary-blue" />
                          Comprando como <strong className="text-gray-700">{fullName}</strong> · {email}
                        </div>
                      )}
                      {addr && (
                        <div className="mb-5 flex items-center gap-2 text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-2.5">
                          <Check size={15} />
                          Preenchemos com o endereço salvo na sua conta — confira e ajuste se precisar.
                        </div>
                      )}
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-5">
                        <div className="sm:col-span-4">
                          <label className={labelCls}>CEP *</label>
                          <input type="text" placeholder="01001-000" value={cep} onChange={(e) => handleCepChange(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-8">
                          <label className={labelCls}>Rua / Avenida *</label>
                          <input type="text" placeholder="Rua das Flores" value={street} onChange={(e) => setStreet(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-3">
                          <label className={labelCls}>Número *</label>
                          <input type="text" placeholder="250" value={number} onChange={(e) => setNumber(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-5">
                          <label className={labelCls}>Complemento</label>
                          <input type="text" placeholder="Apto 42" value={complement} onChange={(e) => setComplement(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-4">
                          <label className={labelCls}>Bairro *</label>
                          <input type="text" placeholder="Centro" value={neighborhood} onChange={(e) => setNeighborhood(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-8">
                          <label className={labelCls}>Cidade *</label>
                          <input type="text" placeholder="São Paulo" value={city} onChange={(e) => setCity(e.target.value)} className={inputCls} />
                        </div>
                        <div className="sm:col-span-4">
                          <label className={labelCls}>UF *</label>
                          <select value={stateCode} onChange={(e) => setStateCode(e.target.value)} className={inputCls}>
                            <option value="SP">São Paulo (SP)</option>
                            <option value="RJ">Rio de Janeiro (RJ)</option>
                            <option value="MG">Minas Gerais (MG)</option>
                            <option value="ES">Espírito Santo (ES)</option>
                            <option value="PR">Paraná (PR)</option>
                            <option value="SC">Santa Catarina (SC)</option>
                            <option value="RS">Rio Grande do Sul (RS)</option>
                            <option value="DF">Distrito Federal (DF)</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  )}

                  {step === 3 && (
                    <div>
                      <h2 className="text-xl font-extrabold text-gray-900">Forma de pagamento</h2>
                      <p className="text-sm text-gray-400 mb-7">Escolha como prefere pagar.</p>
                      <div className="space-y-3">
                        {PAYMENTS.map((pm) => {
                          const Icon = pm.icon;
                          const active = paymentMethod === pm.id;
                          return (
                            <button
                              type="button"
                              key={pm.id}
                              onClick={() => setPaymentMethod(pm.id)}
                              className={`w-full flex items-center gap-4 text-left p-4 rounded-2xl border-2 transition-all ${
                                active ? 'border-primary-blue bg-primary-blue/[0.03] shadow-sm' : 'border-gray-150 hover:border-gray-300'
                              }`}
                            >
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${active ? 'bg-primary-blue text-white' : 'bg-gray-100 text-gray-500'}`}>
                                <Icon size={22} />
                              </div>
                              <div className="flex-1">
                                <div className="flex items-center gap-2">
                                  <p className="font-bold text-gray-900">{pm.title}</p>
                                  {pm.tag && <span className="text-[10px] font-extrabold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{pm.tag}</span>}
                                </div>
                                <p className="text-xs text-gray-400 mt-0.5">{pm.desc}</p>
                              </div>
                              <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${active ? 'border-primary-blue' : 'border-gray-300'}`}>
                                {active && <div className="w-2.5 h-2.5 rounded-full bg-primary-blue" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>

              {errorMsg && (
                <div className="mt-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium flex items-center gap-2">
                  <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Nav buttons */}
              <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t border-gray-100">
                <button
                  onClick={handleBack}
                  className="px-5 py-3 rounded-full text-sm font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                >
                  {onFirst ? 'Cancelar' : 'Voltar'}
                </button>
                {step < 3 ? (
                  <button
                    onClick={next}
                    className="inline-flex items-center gap-2 px-8 py-3.5 bg-primary-blue hover:bg-primary-container text-white rounded-full text-sm font-bold uppercase tracking-wider transition-all shadow-md active:scale-[0.98]"
                  >
                    Continuar <ArrowRight size={16} />
                  </button>
                ) : (
                  <button
                    onClick={handlePlaceOrder}
                    disabled={isSubmitting}
                    className="inline-flex items-center gap-2 px-8 py-3.5 bg-brand-red hover:bg-[#a10100] text-white rounded-full text-sm font-bold uppercase tracking-wider transition-all shadow-md active:scale-[0.98] disabled:opacity-60"
                  >
                    {isSubmitting ? 'Processando...' : (<><Lock size={16} /> Concluir pedido</>)}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Right: order summary (always visible) */}
          <div className="lg:col-span-5 xl:col-span-4">
            <div className="bg-white rounded-3xl border border-gray-100 shadow-[0_8px_30px_rgba(21,20,125,0.06)] sticky top-44 overflow-hidden">
              <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
                <h3 className="font-extrabold text-gray-900">Resumo do pedido</h3>
                <span className="text-xs bg-primary-blue/10 text-primary-blue px-2.5 py-1 rounded-full font-bold">
                  {cartItems.length} {cartItems.length === 1 ? 'item' : 'itens'}
                </span>
              </div>

              <div className="px-6 py-4 space-y-3.5 max-h-[280px] overflow-y-auto">
                {cartItems.map((item) => (
                  <div key={item.product.id} className="flex gap-3 items-center">
                    <div className="relative w-14 h-14 bg-gray-50 rounded-xl border border-gray-100 flex-shrink-0 flex items-center justify-center overflow-hidden">
                      <img src={safeImageSrc(item.product.image)} alt={item.product.name} className="max-h-full max-w-full object-contain p-1" referrerPolicy="no-referrer" />
                      <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-primary-blue text-white text-[10px] font-bold rounded-full flex items-center justify-center">{item.quantity}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-semibold text-gray-800 truncate">{item.product.name}</h4>
                      <p className="text-[11px] text-gray-400">R$ {brlNumber(item.product.price)} / un</p>
                    </div>
                    <span className="text-sm font-bold text-gray-900">R$ {brlNumber(item.product.price * item.quantity)}</span>
                  </div>
                ))}
              </div>

              <div className="px-6 py-5 border-t border-gray-100 space-y-2.5 text-sm">
                <div className="flex justify-between text-gray-500"><span>Subtotal</span><span>R$ {brlNumber(subtotal)}</span></div>
                {isPixSelected && (
                  <div className="flex justify-between text-emerald-600 font-medium"><span>Desconto Pix (5%)</span><span>- R$ {brlNumber(pixDiscount)}</span></div>
                )}
                <div className="flex justify-between text-gray-500">
                  <span>Frete</span>
                  <span className={shippingCost === 0 ? 'text-emerald-600 font-semibold' : ''}>{shippingCost === 0 ? 'Grátis' : `R$ ${brlNumber(shippingCost)}`}</span>
                </div>
                <div className="flex justify-between items-baseline pt-3.5 border-t border-dashed border-gray-200">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="text-2xl font-extrabold text-primary-blue">R$ {brlNumber(grandTotal)}</span>
                </div>
              </div>

              <div className="px-6 pb-6">
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-gray-400 bg-gray-50/70 rounded-xl py-3">
                  <ShieldCheck size={14} className="text-emerald-500" />
                  Compra 100% segura · dados protegidos
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
