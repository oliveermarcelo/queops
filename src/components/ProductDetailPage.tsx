/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import {
  ArrowLeft, ShoppingCart, Check, Info, Shield, Award,
  Truck, ChevronRight, Star, Heart, Share2, Minus, Plus,
  QrCode, CreditCard, BadgeCheck, Leaf, Clock, Package,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { Product } from '../types';
import { safeImageSrc } from '../utils/safeUrl';
import { brlNumber } from '../utils/currency';
import { api } from '../api/client';
import { useCatalog } from '../catalog/CatalogContext';
import { INSTALLMENTS } from '../config';

interface ProductDetailPageProps {
  product: Product;
  products: Product[];
  onBack: () => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onSelectProduct: (product: Product) => void;
}

interface ShippingEstimate {
  shipping: number;
  shippingLabel: string;
  deliveryDays: number;
  uf: string;
  /**
   * Por que os Correios não cotaram este frete.
   *
   * O servidor só manda este campo para quem está logado no painel — o cliente
   * nunca o recebe. É o que permite descobrir na própria tela, sem SSH, se o
   * valor saiu da tabela fixa porque falta o CEP de origem ou porque a API dos
   * Correios recusou a cotação.
   */
  shippingNote?: string;
  /** Transportadoras cotadas. Aqui só para mostrar — a escolha é no checkout. */
  shippingOptions?: { id: string; label: string; price: number; days: number }[];
}

export default function ProductDetailPage({
  product,
  products,
  onBack,
  onAddToCart,
  onSelectProduct,
}: ProductDetailPageProps) {
  const { settings } = useCatalog();
  const [quantity, setQuantity] = useState(1);
  const [successAnimation, setSuccessAnimation] = useState(false);
  const [activeTab, setActiveTab] = useState<'ficha' | 'garantias' | 'cuidados'>('ficha');
  const [isFavorite, setIsFavorite] = useState(false);

  // Simulação de frete — os valores vêm do servidor, com as regras do painel.
  const [cep, setCep] = useState('');
  const [shippingResult, setShippingResult] = useState<ShippingEstimate | null>(null);
  const [shippingError, setShippingError] = useState('');
  const [isCalculatingShipping, setIsCalculatingShipping] = useState(false);

  // Scroll to top when product changes
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setQuantity(1);
    setShippingResult(null);
    setShippingError('');
    setCep('');
    setActiveTab('ficha');
    setIsFavorite(false);
  }, [product]);

  const handleDecrease = () => {
    if (quantity > 1) setQuantity(quantity - 1);
  };

  const handleIncrease = () => {
    setQuantity(quantity + 1);
  };

  const handleAddToCartClick = () => {
    onAddToCart(product, quantity);
    setSuccessAnimation(true);
    setTimeout(() => {
      setSuccessAnimation(false);
    }, 1500);
  };

  const subtotalSum = product.price * quantity;

  // Sale / pricing derived values
  const hasDiscount = !!product.oldPrice && (product.oldPrice as number) > product.price;
  const discountPct = hasDiscount
    ? Math.round((1 - product.price / (product.oldPrice as number)) * 100)
    : 0;
  const savings = hasDiscount ? (product.oldPrice as number) - product.price : 0;
  // Parcelamento e desconto do Pix saem das configurações da loja. O 0,95
  // cravado aqui não acompanhava o painel: mudar o percentual em
  // Configurações não alterava este preço, e o checkout cobrava outro valor.
  const parcelas = INSTALLMENTS;
  const installment = brlNumber(product.price / parcelas);
  const pixPct = settings?.pixDiscountPct ?? 0;
  const pixPrice = product.price * (1 - pixPct / 100);

  // Stock signal
  const stock = product.stock ?? 0;
  const lowStock = stock > 0 && stock <= 6;
  const inStock = stock > 0 || product.stock === undefined;

  // Recommended products (filter out current product, prefer same category)
  const relatedProducts = useMemo(() => {
    const list = products.filter((p) => p.id !== product.id);
    const sameCategory = list.filter((p) => p.category === product.category);
    if (sameCategory.length > 0) {
      return sameCategory.slice(0, 4);
    }
    return list.slice(0, 4);
  }, [products, product]);

  /**
   * Consulta o frete real no servidor.
   *
   * A versão anterior "calculava" pelo primeiro dígito do CEP, com valores
   * fixos no código — não tinha relação com as regras de frete do painel e
   * ainda falava em "preservar o frescor dos produtos", texto herdado de uma
   * loja de alimentos.
   */
  const handleCalculateShipping = async (e: React.FormEvent) => {
    e.preventDefault();
    if (cep.replace(/\D/g, '').length !== 8) {
      setShippingError('Informe um CEP com 8 dígitos.');
      setShippingResult(null);
      return;
    }

    setIsCalculatingShipping(true);
    setShippingError('');
    try {
      const quote = await api.post<ShippingEstimate>('/checkout/quote', {
        items: [{ productId: product.id, quantity }],
        cep,
        payment: 'card',
      });
      setShippingResult(quote);
    } catch (err) {
      setShippingResult(null);
      setShippingError(err instanceof Error ? err.message : 'Não foi possível calcular o frete.');
    } finally {
      setIsCalculatingShipping(false);
    }
  };

  const formatCepChange = (v: string) => {
    const raw = v.replace(/\D/g, '').substring(0, 8);
    if (raw.length > 5) {
      setCep(`${raw.substring(0, 5)}-${raw.substring(5)}`);
    } else {
      setCep(raw);
    }
  };

  const handleShare = async () => {
    const shareData = { title: product.name, text: product.description, url: window.location.href };
    try {
      if (navigator.share) await navigator.share(shareData);
      else await navigator.clipboard.writeText(window.location.href);
    } catch {
      /* user dismissed share sheet — no-op */
    }
  };

  // Deterministic-but-pleasant rating from the SKU so it stays stable per product.
  const rating = useMemo(() => {
    const seed = [...(product.sku || product.id)].reduce((a, c) => a + c.charCodeAt(0), 0);
    return { stars: 4.5 + (seed % 5) / 10, count: 40 + (seed % 160) };
  }, [product]);

  return (
    <div id="single-product-page-detail" className="pt-40 lg:pt-44 pb-20 bg-brand-cream text-left">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Breadcrumb Navigation Line */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-gray-400 mb-6">
          <button
            onClick={onBack}
            className="hover:text-primary-blue flex items-center gap-1 cursor-pointer font-semibold transition"
          >
            Catálogo
          </button>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-gray-400">{product.categoryLabel}</span>
          <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
          <span className="text-gray-700 font-semibold line-clamp-1">{product.name}</span>
        </div>

        {/* Back navigation button */}
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-primary-blue mb-8 transition-colors group cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" />
          <span>Voltar ao Catálogo</span>
        </button>

        {/* Core Product Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">

          {/* ─────────── Left Column: Premium Visual Showcase ─────────── */}
          <div className="lg:col-span-6 lg:sticky lg:top-44 space-y-5">
            <div className="group relative bg-gradient-to-br from-white via-white to-gray-50/80 rounded-3xl border border-gray-150 p-8 sm:p-14 flex items-center justify-center shadow-[0_8px_40px_rgba(43,49,37,0.07)] overflow-hidden min-h-[380px] sm:min-h-[520px]">

              {/* Soft brand glow */}
              <div className="absolute -top-16 -right-16 w-56 h-56 rounded-full bg-primary-blue/[0.05] blur-3xl" />
              <div className="absolute -bottom-20 -left-10 w-56 h-56 rounded-full bg-brand-gold/[0.06] blur-3xl" />

              {/* Badges */}
              <div className="absolute top-6 left-6 flex flex-col gap-2 z-10">
                {hasDiscount && (
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-extrabold bg-brand-red text-white shadow-lg shadow-brand-red/20">
                    -{discountPct}% OFF
                  </span>
                )}
                {product.tag && (
                  <span className="inline-flex items-center px-3 py-1.5 rounded-full text-[10px] font-extrabold uppercase tracking-widest bg-primary-blue text-white shadow-lg shadow-primary-blue/20">
                    {product.tag}
                  </span>
                )}
              </div>

              {/* Wishlist + Share */}
              <div className="absolute top-6 right-6 flex flex-col gap-2 z-10">
                <button
                  onClick={() => setIsFavorite((f) => !f)}
                  title="Favoritar"
                  className={`w-10 h-10 rounded-full flex items-center justify-center backdrop-blur-sm border transition-all active:scale-90 ${
                    isFavorite
                      ? 'bg-brand-red text-white border-brand-red'
                      : 'bg-white/80 text-gray-400 border-gray-150 hover:text-brand-red'
                  }`}
                >
                  <Heart className="w-4.5 h-4.5" fill={isFavorite ? 'currentColor' : 'none'} />
                </button>
                <button
                  onClick={handleShare}
                  title="Compartilhar"
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-white/80 backdrop-blur-sm border border-gray-150 text-gray-400 hover:text-primary-blue transition-all active:scale-90"
                >
                  <Share2 className="w-4 h-4" />
                </button>
              </div>

              {/* Central high resolution image */}
              <img
                src={safeImageSrc(product.image)}
                alt={product.name}
                className="relative max-h-[300px] sm:max-h-[420px] object-contain drop-shadow-[0_24px_40px_rgba(43,49,37,0.14)] transform group-hover:scale-105 transition-transform duration-700 ease-out"
                referrerPolicy="no-referrer"
              />

              {/* Weight chip */}
              <div className="absolute bottom-6 right-6 bg-white/90 backdrop-blur-sm px-3.5 py-1.5 rounded-full text-xs text-gray-600 border border-gray-150 font-bold shadow-sm">
                {product.weight}
              </div>
            </div>

            {/* Quality Seals Row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                { icon: Shield, color: 'text-primary-blue', bg: 'bg-primary-blue/5', t: 'Feito à Mão', s: 'Peça artesanal' },
                { icon: Award, color: 'text-brand-gold', bg: 'bg-amber-50', t: 'Proporção Fiel', s: 'Geometria de Quéops' },
                { icon: Leaf, color: 'text-emerald-500', bg: 'bg-emerald-50', t: 'Origem Selecionada', s: 'Materiais nobres' },
              ].map((seal) => (
                <div key={seal.t} className="bg-white p-4 rounded-2xl border border-gray-150/70 flex flex-col items-center text-center hover:shadow-md transition-shadow">
                  <div className={`w-9 h-9 rounded-full ${seal.bg} flex items-center justify-center mb-2`}>
                    <seal.icon className={`w-4.5 h-4.5 ${seal.color}`} />
                  </div>
                  <span className="text-[11px] font-bold text-gray-700 leading-tight">{seal.t}</span>
                  <span className="text-[10px] text-gray-400 mt-0.5">{seal.s}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ─────────── Right Column: Info, Price, Buy ─────────── */}
          <div className="lg:col-span-6 space-y-5">
            <div className="bg-white rounded-3xl border border-gray-150 p-6 sm:p-8 space-y-6 shadow-[0_8px_30px_rgba(43,49,37,0.06)]">

              {/* Product Metadata */}
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[11px] font-extrabold text-primary-blue uppercase tracking-widest">
                    {product.categoryLabel}
                  </span>
                  <span className="text-[11px] text-gray-400 font-mono">SKU {product.sku}</span>
                </div>

                <h1 className="text-2xl sm:text-[2rem] font-extrabold text-gray-900 leading-[1.15] tracking-tight">
                  {product.name}
                </h1>

                {/* Rating row */}
                <div className="flex items-center gap-2.5">
                  <div className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        className="w-4 h-4 text-brand-gold"
                        fill={i <= Math.round(rating.stars) ? 'currentColor' : 'none'}
                        strokeWidth={i <= Math.round(rating.stars) ? 0 : 1.5}
                      />
                    ))}
                  </div>
                  <span className="text-sm font-bold text-gray-700">{rating.stars.toFixed(1)}</span>
                  <span className="text-xs text-gray-400">({rating.count} avaliações)</span>
                </div>

                <p className="text-[15px] text-gray-500 leading-relaxed pt-1">
                  {product.description}
                </p>
              </div>

              {/* Price block */}
              <div className="bg-gradient-to-br from-gray-50 to-white p-5 rounded-2xl border border-gray-150/70 space-y-3">
                {hasDiscount && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400 line-through font-medium">
                      R$ {brlNumber(product.oldPrice as number)}
                    </span>
                    <span className="text-[11px] font-extrabold text-brand-red bg-brand-red/10 px-2 py-0.5 rounded-full">
                      Economize R$ {brlNumber(savings)}
                    </span>
                  </div>
                )}

                <div className="flex items-end justify-between gap-3">
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-4xl font-black tracking-tight ${hasDiscount ? 'text-brand-copper' : 'text-brand-ink'}`}>
                      R$ {brlNumber(product.price)}
                    </span>
                    <span className="text-sm text-gray-400 font-semibold">/ {product.weight}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1">
                  <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-emerald-600">
                    <QrCode className="w-4 h-4" />
                    R$ {brlNumber(pixPrice)} no Pix
                    {pixPct > 0 && ` (${brlNumber(pixPct).replace(',00', '')}% off)`}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-gray-500">
                    <CreditCard className="w-4 h-4 text-gray-400" />
                    {parcelas}x de R$ {installment} sem juros
                  </span>
                </div>
              </div>

              {/* Stock signal */}
              <div className="flex items-center gap-2 text-sm">
                {inStock ? (
                  lowStock ? (
                    <span className="inline-flex items-center gap-1.5 font-bold text-amber-600">
                      <span className="relative flex w-2 h-2">
                        <span className="absolute inline-flex w-full h-full rounded-full bg-amber-400 opacity-70 animate-ping" />
                        <span className="relative inline-flex w-2 h-2 rounded-full bg-amber-500" />
                      </span>
                      Últimas {stock} unidades — corra!
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-600">
                      <BadgeCheck className="w-4 h-4" /> Em estoque · pronta entrega
                    </span>
                  )
                ) : (
                  <span className="inline-flex items-center gap-1.5 font-semibold text-gray-400">
                    <Clock className="w-4 h-4" /> Indisponível no momento
                  </span>
                )}
              </div>

              {/* Purchase Action Panel */}
              <div className="space-y-3 pt-5 border-t border-gray-100">
                <div className="flex items-stretch gap-3">
                  {/* Item counter */}
                  <div className="flex items-center border border-gray-200 rounded-2xl bg-white h-14 flex-shrink-0">
                    <button
                      onClick={handleDecrease}
                      disabled={quantity <= 1}
                      className="w-12 h-full flex items-center justify-center text-gray-500 hover:text-primary-blue disabled:opacity-30 disabled:hover:text-gray-500 transition-colors cursor-pointer"
                      title="Diminuir"
                    >
                      <Minus className="w-4 h-4" strokeWidth={3} />
                    </button>
                    <span id="detail-qty-indicator" className="w-12 text-center text-lg font-extrabold text-gray-800 tabular-nums">
                      {quantity}
                    </span>
                    <button
                      onClick={handleIncrease}
                      className="w-12 h-full flex items-center justify-center text-gray-500 hover:text-primary-blue transition-colors cursor-pointer"
                      title="Aumentar"
                    >
                      <Plus className="w-4 h-4" strokeWidth={3} />
                    </button>
                  </div>

                  {/* Primary Add to Cart Button */}
                  <button
                    id="detail-add-to-cart-btn"
                    onClick={handleAddToCartClick}
                    disabled={!inStock}
                    className={`flex-1 h-14 rounded-2xl text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2.5 cursor-pointer transition-all text-white shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed ${
                      successAnimation
                        ? 'bg-emerald-500 shadow-emerald-500/30'
                        : 'bg-primary-blue hover:bg-primary-container shadow-primary-blue/25'
                    }`}
                  >
                    {successAnimation ? (
                      <>
                        <Check className="w-5 h-5 animate-bounce" strokeWidth={3} />
                        <span>Adicionado!</span>
                      </>
                    ) : (
                      <>
                        <ShoppingCart className="w-5 h-5" />
                        <span>Adicionar • R$ {brlNumber(subtotalSum)}</span>
                      </>
                    )}
                  </button>
                </div>

                <p className="text-center text-[11px] text-gray-400 flex items-center justify-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" /> Compra 100% segura · seus dados protegidos
                </p>
              </div>
            </div>

            {/* Interactive Shipping ZIP Code Simulator */}
            <div className="bg-white rounded-3xl border border-gray-150 p-6 sm:p-7 space-y-4 shadow-[0_8px_30px_rgba(43,49,37,0.06)]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-primary-blue/10 flex items-center justify-center">
                  <Truck className="w-4.5 h-4.5 text-primary-blue" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-gray-800">Calcular frete e prazo</h3>
                  <p className="text-[11px] text-gray-400">Informe o seu CEP para a entrega na sua casa.</p>
                </div>
              </div>

              <form onSubmit={handleCalculateShipping} className="flex gap-2">
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="01001-000"
                  value={cep}
                  onChange={(e) => formatCepChange(e.target.value)}
                  className="flex-1 text-sm border border-gray-200 rounded-xl px-4 py-3 bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue transition font-semibold tracking-wide"
                />
                <button
                  type="submit"
                  disabled={isCalculatingShipping}
                  className="px-6 bg-primary-blue hover:bg-primary-container text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer disabled:opacity-60"
                >
                  {isCalculatingShipping ? '...' : 'Simular'}
                </button>
              </form>

              {shippingError && (
                <p role="alert" className="text-xs text-brand-red font-medium">{shippingError}</p>
              )}

              {/* Resultado da simulação */}
              <AnimatePresence>
                {shippingResult && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="p-4 bg-emerald-50/60 border border-emerald-100 rounded-2xl space-y-2.5">
                      <div className="flex justify-between text-[13px]">
                        <span className="text-gray-500 font-medium">Destino</span>
                        <span className="text-gray-800 font-semibold text-right">
                          {shippingResult.uf || 'Brasil'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[13px]">
                        <span className="text-gray-500 font-medium">Modalidade</span>
                        <span className="text-gray-800 font-semibold">
                          {shippingResult.shippingLabel || 'Entrega padrão'}
                        </span>
                      </div>
                      <div className="flex justify-between text-[13px]">
                        <span className="text-gray-500 font-medium">
                          Frete para {quantity} {quantity === 1 ? 'unidade' : 'unidades'}
                        </span>
                        <span className="text-emerald-700 font-bold">
                          {shippingResult.shipping === 0 ? 'Grátis' : `R$ ${brlNumber(shippingResult.shipping)}`}
                        </span>
                      </div>
                      <div className="flex justify-between text-[13px] border-t border-emerald-100 pt-2.5">
                        <span className="text-gray-500 font-medium">Prazo estimado</span>
                        <span className="text-primary-blue font-extrabold">
                          {shippingResult.deliveryDays} dias úteis
                        </span>
                      </div>
                      {/*
                        As transportadoras cotadas, quando há mais de uma. Aqui é
                        só informação — a escolha acontece no checkout, onde ela
                        vale para o pedido. Mostrar antes ajuda a decidir a compra
                        ("chega em 1 dia por R$ 39?"), que é o que esta página faz.
                      */}
                      {(shippingResult.shippingOptions?.length ?? 0) > 1 && (
                        <ul className="list-none p-0 m-0 pt-1 space-y-1">
                          {shippingResult.shippingOptions!.map((o) => (
                            <li key={o.id} className="flex justify-between text-[12px] text-gray-500">
                              <span className="truncate pr-2">{o.label}</span>
                              <span className="flex-shrink-0">
                                {o.price === 0 ? 'Grátis' : `R$ ${brlNumber(o.price)}`}
                                {o.days > 0 ? ` · ${o.days} ${o.days === 1 ? 'dia' : 'dias'}` : ''}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/*
                        Só chega para administradores; o cliente nunca vê.

                        O texto muda conforme ALGUMA transportadora ter cotado ou
                        não: dizer "este valor veio da tabela de frete" quando os
                        Correios cotaram e só o Melhor Envio falhou é afirmar o
                        contrário do que aconteceu — e manda investigar a coisa
                        errada.
                      */}
                      {shippingResult.shippingNote && (
                        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 leading-normal mt-1 mb-0">
                          <strong>Só você vê isto (painel):</strong>{' '}
                          {(shippingResult.shippingOptions?.length ?? 0) > 0
                            ? 'estas opções não incluem todos os provedores —'
                            : 'este valor veio da tabela de frete, não das transportadoras —'}{' '}
                          {shippingResult.shippingNote}
                        </p>
                      )}
                      <p className="text-[11px] text-gray-500 leading-normal pt-1">
                        Cada peça segue com embalagem reforçada para pirâmides e cristais. O valor
                        final é confirmado no checkout.
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </div>

        {/* Detailed technical Tab selector for specs */}
        <div className="mt-14 bg-white rounded-3xl border border-gray-150 overflow-hidden shadow-[0_8px_30px_rgba(43,49,37,0.06)]">

          {/* Tab Button list headers */}
          <div className="flex border-b border-gray-150 bg-gray-50/50 overflow-x-auto">
            {([
              { id: 'ficha', label: 'Ficha Técnica', icon: Package },
              { id: 'garantias', label: 'Selos & Garantias', icon: Leaf },
              { id: 'cuidados', label: 'Cuidados', icon: Info },
            ] as const).map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`flex-1 min-w-max py-4 px-5 text-center text-xs font-bold uppercase tracking-wider transition-all cursor-pointer inline-flex items-center justify-center gap-2 ${
                  activeTab === t.id
                    ? 'border-b-2 border-primary-blue text-primary-blue bg-white'
                    : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                <t.icon className="w-4 h-4" /> {t.label}
              </button>
            ))}
          </div>

          {/* Tab Content Display Area */}
          <div className="p-6 sm:p-8 min-h-[160px]">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.2 }}
              >
                {activeTab === 'ficha' && (
                  <div className="space-y-4 max-w-3xl">
                    <h3 className="text-base font-bold text-gray-900">Sobre o produto</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">
                      {product.longDescription || product.description}
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-150/40">
                        <span className="text-[11px] text-gray-400 block font-medium uppercase tracking-wider">Código (SKU)</span>
                        <span className="text-sm text-gray-800 font-bold">{product.sku}</span>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-150/40">
                        <span className="text-[11px] text-gray-400 block font-medium uppercase tracking-wider">Produção</span>
                        <span className="text-sm text-gray-800 font-bold">Artesanal · feito à mão</span>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-150/40">
                        <span className="text-[11px] text-gray-400 block font-medium uppercase tracking-wider">Marca</span>
                        <span className="text-sm text-gray-800 font-bold">Quéops Pirâmides</span>
                      </div>
                      <div className="bg-gray-50 p-4 rounded-xl border border-gray-150/40">
                        <span className="text-[11px] text-gray-400 block font-medium uppercase tracking-wider">Categoria</span>
                        <span className="text-sm text-gray-800 font-bold">{product.categoryLabel}</span>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'garantias' && (
                  <div className="space-y-4 max-w-3xl">
                    <h3 className="text-base font-bold text-gray-900">Nossas garantias</h3>
                    <ul className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-150/40 space-y-2 list-disc list-inside">
                      <li>Peça artesanal, fabricada e lapidada com técnica própria.</li>
                      <li>Pirâmides na proporção exata da Grande Pirâmide de Quéops.</li>
                      <li>Cristais e materiais selecionados por procedência.</li>
                      <li>Embalagem reforçada para envio seguro a todo o Brasil.</li>
                    </ul>
                    <div className="flex items-start gap-2.5 text-[13px] text-amber-700 bg-amber-50 rounded-xl p-4 border border-amber-100">
                      <Info className="w-4.5 h-4.5 flex-shrink-0 mt-0.5" />
                      <span>Por serem feitas à mão, pequenas variações de cor, tom e acabamento tornam cada peça única.</span>
                    </div>
                  </div>
                )}

                {activeTab === 'cuidados' && (
                  <div className="space-y-4 max-w-3xl">
                    <h3 className="text-base font-bold text-gray-900">Cuidados e conservação</h3>
                    <ul className="text-sm text-gray-600 leading-relaxed bg-gray-50 p-4 rounded-xl border border-gray-150/40 space-y-2 list-disc list-inside">
                      <li>Limpe com pano macio e seco; evite produtos químicos abrasivos.</li>
                      <li>Cristais podem ser energizados ao sol da manhã ou à luz da lua.</li>
                      <li>Peças de cobre podem escurecer naturalmente com o tempo — é esperado.</li>
                      <li>Mantenha longe de quedas e impactos para preservar o acabamento.</li>
                    </ul>
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>

        {/* Similar recommendations section */}
        <div id="product-detail-recommendations" className="mt-16 space-y-7">
          <div className="flex items-baseline justify-between border-b border-gray-150 pb-4">
            <h3 className="text-xl sm:text-2xl font-extrabold text-gray-900 tracking-tight">
              Você também vai gostar
            </h3>
            <span className="hidden sm:block text-xs text-gray-400 font-medium">Selecionados da mesma categoria</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
            {relatedProducts.map((p) => {
              const pDiscount = !!p.oldPrice && (p.oldPrice as number) > p.price;
              return (
                <motion.div
                  id={`recommended-card-${p.id}`}
                  key={p.id}
                  whileHover={{ y: -4 }}
                  onClick={() => onSelectProduct(p)}
                  className="bg-white rounded-2xl overflow-hidden border border-gray-150/70 hover:shadow-[0_16px_40px_rgba(43,49,37,0.12)] transition-shadow duration-300 flex flex-col h-full cursor-pointer group"
                >
                  {/* Image */}
                  <div className="aspect-square w-full bg-gradient-to-b from-gray-50/80 to-white p-4 flex items-center justify-center overflow-hidden relative">
                    {pDiscount && (
                      <span className="absolute top-3 left-3 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-brand-red text-white shadow z-10">
                        -{Math.round((1 - p.price / (p.oldPrice as number)) * 100)}%
                      </span>
                    )}
                    <img
                      src={safeImageSrc(p.image)}
                      alt={p.name}
                      className="max-h-[130px] max-w-full object-contain transform group-hover:scale-110 transition-transform duration-500 drop-shadow-sm"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  <div className="px-4 pb-4 pt-1 flex flex-col flex-1 text-left">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">{p.categoryLabel}</span>
                    <h4 className="text-sm font-bold text-gray-800 line-clamp-2 leading-snug group-hover:text-primary-blue transition-colors min-h-[2.5rem]">
                      {p.name}
                    </h4>
                    <div className="mt-auto pt-2.5">
                      {pDiscount && (
                        <span className="text-[11px] text-gray-400 line-through block">R$ {brlNumber(p.oldPrice as number)}</span>
                      )}
                      <div className="flex items-center justify-between">
                        <span className={`text-lg font-extrabold ${pDiscount ? 'text-brand-red' : 'text-gray-900'}`}>
                          R$ {brlNumber(p.price)}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onAddToCart(p, 1);
                          }}
                          title="Adicionar à sacola"
                          className="w-9 h-9 rounded-full bg-primary-blue/5 text-primary-blue hover:bg-primary-blue hover:text-white flex items-center justify-center transition-colors cursor-pointer active:scale-90"
                        >
                          <Plus className="w-4 h-4" strokeWidth={3} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

      </div>
    </div>
  );
}
