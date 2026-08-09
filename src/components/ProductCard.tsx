/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ShoppingCart, ImageOff } from 'lucide-react';
import { motion } from 'motion/react';
import { Product } from '../types';
import { safeImageSrc } from '../utils/safeUrl';
import { brlNumber } from '../utils/currency';

interface ProductCardProps {
  product: Product;
  onSelect: (product: Product) => void;
  onAddToCart: (product: Product, e: React.MouseEvent) => void;
  key?: React.Key;
}

export default function ProductCard({ product, onSelect, onAddToCart }: ProductCardProps) {
  const [imgError, setImgError] = useState(false);

  const hasDiscount = !!product.oldPrice && product.oldPrice > product.price;
  const discountPct = hasDiscount
    ? Math.round((1 - product.price / (product.oldPrice as number)) * 100)
    : 0;
  const installment = brlNumber(product.price / 3);

  return (
    <motion.div
      id={`product-card-${product.id}`}
      whileHover={{ y: -6 }}
      transition={{ duration: 0.2 }}
      onClick={() => onSelect(product)}
      className="group relative bg-white rounded-2xl shadow-[0_2px_12px_rgba(21,20,125,0.06)] hover:shadow-[0_16px_40px_rgba(21,20,125,0.16)] transition-shadow duration-300 flex flex-col h-full cursor-pointer overflow-hidden"
    >
      {/* Image stage */}
      <div className="relative aspect-square w-full bg-gradient-to-b from-gray-50/80 to-white flex items-center justify-center overflow-hidden p-5">
        {imgError ? (
          <div className="flex flex-col items-center justify-center text-gray-300 gap-2">
            <ImageOff size={28} />
            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-300">
              Quéops Pirâmides
            </span>
          </div>
        ) : (
          <img
            src={safeImageSrc(product.image)}
            alt={product.name}
            onError={() => setImgError(true)}
            loading="lazy"
            decoding="async"
            className="max-h-full max-w-full object-contain transform transition-transform duration-500 group-hover:scale-110 drop-shadow-sm"
            referrerPolicy="no-referrer"
          />
        )}

        {/* Discount / tag badge */}
        {hasDiscount ? (
          <span className="absolute top-3 left-3 inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-brand-red text-white shadow-md z-10">
            -{discountPct}%
          </span>
        ) : product.tag ? (
          <span className="absolute top-3 left-3 inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-primary-blue text-white shadow-md z-10">
            {product.tag}
          </span>
        ) : null}
      </div>

      {/* Content */}
      <div className="px-4 pb-4 pt-1 flex flex-col flex-1 text-left">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest block mb-1">
          {product.categoryLabel}
        </span>

        <h3 className="text-sm font-bold text-gray-800 leading-snug group-hover:text-primary-blue transition-colors mb-3 line-clamp-2 min-h-[2.5rem]">
          {product.name}
        </h3>

        {/* Price */}
        <div className="mt-auto">
          {hasDiscount && (
            <span className="text-xs text-gray-400 line-through font-medium block">
              R$ {brlNumber(product.oldPrice as number)}
            </span>
          )}
          <div className="flex items-baseline gap-1.5">
            <span className={`text-xl font-extrabold ${hasDiscount ? 'text-brand-red' : 'text-gray-900'}`}>
              R$ {brlNumber(product.price)}
            </span>
          </div>
          <span className="text-[11px] text-emerald-600 font-semibold">
            3x de R$ {installment} sem juros
          </span>
        </div>

        {/* Buy button */}
        <button
          onClick={(e) => onAddToCart(product, e)}
          className="mt-3 w-full py-2.5 rounded-xl bg-primary-blue hover:bg-primary-container text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors cursor-pointer active:scale-[0.98]"
        >
          <ShoppingCart size={15} />
          Comprar
        </button>
      </div>
    </motion.div>
  );
}
