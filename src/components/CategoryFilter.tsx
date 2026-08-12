/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { CATEGORY_COVERS } from '../media';

interface CategoryFilterProps {
  activeCategory: string;
  setActiveCategory: (category: string) => void;
}

// Full-bleed lookbook cards com fotos reais do catálogo Quéops.
const CATEGORY_CARDS = [
  { id: 'piramides', name: 'Pirâmides', blurb: 'Cobre, cristal e veludo azul', image: CATEGORY_COVERS.piramides },
  { id: 'cristais', name: 'Cristais', blurb: 'Ametistas, quartzos e minerais', image: CATEGORY_COVERS.cristais },
  { id: 'incensos', name: 'Incensos', blurb: 'Incensos, incensários e essências', image: CATEGORY_COVERS.incensos },
  { id: 'acessorios', name: 'Acessórios', blurb: 'Pingentes, pulseiras e prata', image: CATEGORY_COVERS.acessorios },
  { id: 'religiosos', name: 'Religiosos', blurb: 'Cruzes, santos e egípcios', image: CATEGORY_COVERS.religiosos },
  { id: 'decoracao', name: 'Decoração', blurb: 'Estátuas, quadros e velas', image: CATEGORY_COVERS.decoracao },
] as const;

export default function CategoryFilter({ setActiveCategory }: CategoryFilterProps) {
  return (
    <section id="categories-section" className="bg-white py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-red">
              Navegue
            </span>
            <h2 className="mt-3 font-display font-bold text-3xl sm:text-4xl text-primary-blue tracking-tight">
              Explore por categoria
            </h2>
          </div>
          <p className="text-sm text-gray-500 max-w-xs sm:text-right">
            Uma seleção especial para harmonizar cada ambiente da sua vida.
          </p>
        </div>

        {/* Full-bleed photo cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {CATEGORY_CARDS.map((cat, i) => (
            <motion.button
              id={`cat-card-${cat.id}`}
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: '-60px' }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className="group relative h-44 sm:h-60 rounded-2xl overflow-hidden text-left cursor-pointer shadow-sm hover:shadow-2xl transition-all duration-300"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-[#f0eae0] to-[#e6ded0]" />
              <img
                src={cat.image}
                alt={cat.name}
                className="absolute inset-0 w-full h-full object-contain p-6 transform group-hover:scale-110 transition-transform duration-700 ease-out"
                loading="lazy"
                referrerPolicy="no-referrer"
              />
              {/* Readability gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#232819]/85 via-[#414a36]/25 to-transparent" />

              <div className="absolute inset-0 p-5 sm:p-6 flex flex-col justify-end">
                <h3 className="text-lg sm:text-2xl font-extrabold text-white leading-tight drop-shadow-sm">
                  {cat.name}
                </h3>
                <p className="text-xs sm:text-sm text-white/80 mt-0.5">{cat.blurb}</p>
              </div>

              <div className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/20 backdrop-blur-sm border border-white/25 flex items-center justify-center text-white opacity-0 group-hover:opacity-100 translate-y-1 group-hover:translate-y-0 transition-all duration-300">
                <ArrowUpRight size={18} />
              </div>
            </motion.button>
          ))}
        </div>
      </div>
    </section>
  );
}
