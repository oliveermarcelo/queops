/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, ShoppingBag, Trash2, ArrowRight, Minus, Plus, Truck, ShieldCheck, Lock } from 'lucide-react';
import { motion } from 'motion/react';
import { CartItem } from '../types';
import { safeImageSrc } from '../utils/safeUrl';
import { brl } from '../utils/currency';
import { useCatalog } from '../catalog/CatalogContext';
import ModalShell from './ModalShell';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cartItems: CartItem[];
  onUpdateQty: (productId: string, quantity: number) => void;
  onRemoveItem: (productId: string) => void;
  onProceedToCheckout: () => void;
}

export default function CartDrawer({
  isOpen, onClose, cartItems, onUpdateQty, onRemoveItem, onProceedToCheckout,
}: CartDrawerProps) {
  const { settings } = useCatalog();

  if (!isOpen) return null;

  // Estimativa: as regras de frete (faixa de CEP, UF) dependem do endereço,
  // que só existe no checkout. Aqui usamos o valor padrão da loja e deixamos
  // claro que o número final é calculado no servidor, na finalização.
  const freeShippingFrom = settings?.freeShippingFrom ?? 0;
  const shippingFrom = settings?.shippingFrom ?? 0;

  const subtotal = cartItems.reduce((acc, item) => acc + item.product.price * item.quantity, 0);
  const itemCount = cartItems.reduce((acc, item) => acc + item.quantity, 0);
  const hasFreeShipping = freeShippingFrom > 0 && subtotal >= freeShippingFrom;
  const shipping = hasFreeShipping || subtotal === 0 ? 0 : shippingFrom;
  const total = subtotal + shipping;
  const progress = freeShippingFrom > 0 ? Math.min(100, (subtotal / freeShippingFrom) * 100) : 100;
  const remaining = Math.max(0, freeShippingFrom - subtotal);

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="cart-drawer-title"
      overlayClassName="fixed inset-0 z-50 flex justify-end bg-black/50 backdrop-blur-sm"
      className="w-full max-w-md h-full"
    >
      <motion.div
        id="cart-drawer-container"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 320, damping: 34 }}
        className="relative bg-brand-cream w-full h-full shadow-2xl flex flex-col"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-white border-b border-gray-100 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <ShoppingBag className="w-6 h-6 text-primary-blue" />
              {itemCount > 0 && (
                <span className="absolute -top-2 -right-2 bg-brand-red text-white text-[10px] font-bold h-4.5 w-4.5 min-w-[18px] px-1 rounded-full flex items-center justify-center">
                  {itemCount}
                </span>
              )}
            </div>
            <h2 id="cart-drawer-title" className="text-lg font-extrabold text-gray-900">Sua sacola</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 hover:text-gray-700 transition">
            <X size={20} />
          </button>
        </div>

        {cartItems.length === 0 ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="w-20 h-20 rounded-full bg-primary-blue/5 flex items-center justify-center mb-4">
              <ShoppingBag className="w-9 h-9 text-primary-blue/40" />
            </div>
            <h4 className="text-base font-bold text-gray-700 mb-1">Sua sacola está vazia</h4>
            <p className="text-sm text-gray-400 max-w-xs leading-relaxed mb-6">
              Escolha pirâmides, cristais e incensos e adicione à sua sacola.
            </p>
            <button
              onClick={onClose}
              className="py-3 px-7 rounded-full bg-primary-blue text-white text-xs font-bold uppercase tracking-widest hover:bg-primary-container transition"
            >
              Explorar produtos
            </button>
          </div>
        ) : (
          <>
            {/* Free shipping progress */}
            <div className="px-5 pt-4 pb-3 bg-white border-b border-gray-100 flex-shrink-0">
              <div className="flex items-center gap-2 mb-2">
                <Truck size={15} className={hasFreeShipping ? 'text-emerald-500' : 'text-primary-blue'} />
                {hasFreeShipping ? (
                  <p className="text-xs font-semibold text-emerald-600">Você ganhou frete grátis! 🎉</p>
                ) : (
                  <p className="text-xs text-gray-600">
                    Faltam <strong className="text-primary-blue">{brl(remaining)}</strong> para o <strong>frete grátis</strong>
                  </p>
                )}
              </div>
              <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${hasFreeShipping ? 'bg-emerald-500' : 'bg-gradient-to-r from-primary-blue to-primary-container'}`}
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            {/* Items */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {cartItems.map((item) => {
                const lineTotal = item.product.price * item.quantity;
                return (
                  <div
                    id={`cart-row-${item.product.id}`}
                    key={item.product.id}
                    className="bg-white p-3 rounded-2xl border border-gray-100 shadow-[0_2px_8px_rgba(43,49,37,0.04)] flex gap-3 group"
                  >
                    {/* Image */}
                    <div className="w-20 h-20 bg-gray-50 rounded-xl flex-shrink-0 flex items-center justify-center overflow-hidden">
                      <img src={safeImageSrc(item.product.image)} alt={item.product.name} className="max-h-full max-w-full object-contain p-1.5" referrerPolicy="no-referrer" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <span className="text-[9px] font-bold text-primary-blue uppercase tracking-widest block">{item.product.categoryLabel}</span>
                            <h4 className="text-sm font-bold text-gray-800 leading-snug line-clamp-2">{item.product.name}</h4>
                          </div>
                          <button
                            onClick={() => onRemoveItem(item.product.id)}
                            className="p-1.5 text-gray-300 hover:text-brand-red rounded-lg hover:bg-red-50 transition-colors flex-shrink-0"
                            title="Remover"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between mt-2">
                        {/* Stepper */}
                        <div className="flex items-center bg-gray-50 border border-gray-150 rounded-full h-8">
                          <button
                            onClick={() => onUpdateQty(item.product.id, item.quantity - 1)}
                            className="w-8 h-full flex items-center justify-center text-gray-500 hover:text-primary-blue rounded-l-full transition-colors"
                          >
                            <Minus size={14} />
                          </button>
                          <span className="w-8 text-center text-sm font-bold text-gray-800">{item.quantity}</span>
                          <button
                            onClick={() => onUpdateQty(item.product.id, item.quantity + 1)}
                            className="w-8 h-full flex items-center justify-center text-gray-500 hover:text-primary-blue rounded-r-full transition-colors"
                          >
                            <Plus size={14} />
                          </button>
                        </div>

                        {/* Price */}
                        <div className="text-right">
                          <p className="text-sm font-extrabold text-gray-900">{brl(lineTotal)}</p>
                          {item.quantity > 1 && (
                            <p className="text-[10px] text-gray-400">{brl(item.product.price)} cada</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Footer */}
            <div className="bg-white border-t border-gray-100 px-5 pt-4 pb-5 flex-shrink-0 space-y-3">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span><span>{brl(subtotal)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Frete estimado</span>
                  <span className={shipping === 0 ? 'text-emerald-600 font-semibold' : ''}>
                    {shipping === 0 ? 'Grátis' : `a partir de ${brl(shipping)}`}
                  </span>
                </div>
                <div className="flex justify-between items-baseline pt-2 border-t border-dashed border-gray-200">
                  <span className="font-bold text-gray-900">Total estimado</span>
                  <span className="text-2xl font-extrabold text-primary-blue">{brl(total)}</span>
                </div>
                <p className="text-[11px] text-gray-400 pt-1">
                  O frete exato depende do CEP e é calculado na finalização.
                </p>
              </div>

              <button
                id="btn-checkout"
                onClick={onProceedToCheckout}
                className="w-full py-4 bg-brand-red hover:bg-[#82502d] text-white font-bold text-sm uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-2 shadow-md active:scale-[0.98] cursor-pointer"
              >
                Finalizar compra
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="flex items-center justify-center gap-4 text-[11px] text-gray-400 pt-1">
                <span className="inline-flex items-center gap-1"><Lock size={12} /> Compra segura</span>
                <span className="inline-flex items-center gap-1"><ShieldCheck size={12} className="text-emerald-500" /> Dados protegidos</span>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </ModalShell>
  );
}
