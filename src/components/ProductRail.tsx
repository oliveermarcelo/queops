/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';
import { Product } from '../types';
import ProductCard from './ProductCard';

interface ProductRailProps {
  eyebrow?: string;
  title: string;
  products: Product[];
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product, quantity: number) => void;
  onViewAll?: () => void;
  /** Alternate background for visual rhythm between rails */
  alt?: boolean;
}

export default function ProductRail({
  eyebrow,
  title,
  products,
  onSelectProduct,
  onAddToCart,
  onViewAll,
  alt = false,
}: ProductRailProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  if (products.length === 0) return null;

  const scrollBy = (dir: number) => {
    scrollerRef.current?.scrollBy({ left: dir * 320, behavior: 'smooth' });
  };

  return (
    <section className={`py-10 lg:py-12 ${alt ? 'bg-brand-green-50' : 'bg-brand-bg'}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="flex items-end justify-between gap-4 mb-6">
          <div>
            {eyebrow && (
              <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-primary-blue">
                {eyebrow}
              </span>
            )}
            <h2 className="mt-1 text-2xl sm:text-3xl font-extrabold text-primary-blue tracking-tight">
              {title}
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {onViewAll && (
              <button
                onClick={onViewAll}
                className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-primary-blue hover:text-brand-red transition-colors mr-1"
              >
                Ver todos
                <ArrowRight size={15} />
              </button>
            )}
            <button
              onClick={() => scrollBy(-1)}
              aria-label="Anterior"
              className="w-9 h-9 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-primary-blue hover:border-primary-blue flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronLeft size={18} />
            </button>
            <button
              onClick={() => scrollBy(1)}
              aria-label="Próximo"
              className="w-9 h-9 rounded-full border border-gray-200 bg-white text-gray-500 hover:text-primary-blue hover:border-primary-blue flex items-center justify-center transition-colors cursor-pointer"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>

        {/* Horizontal scroller */}
        <div
          ref={scrollerRef}
          className="flex gap-4 sm:gap-5 overflow-x-auto pb-4 -mx-1 px-1 snap-x snap-mandatory scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        >
          {products.map((product) => (
            <div
              key={product.id}
              className="snap-start shrink-0 w-[180px] sm:w-[230px]"
            >
              <ProductCard
                product={product}
                onSelect={onSelectProduct}
                onAddToCart={(prod, e) => {
                  e.stopPropagation();
                  onAddToCart(prod, 1);
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
