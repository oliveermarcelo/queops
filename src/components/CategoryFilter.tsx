/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowUpRight } from 'lucide-react';
import { motion } from 'motion/react';
import { useCatalog } from '../catalog/CatalogContext';
import { safeImageSrc } from '../utils/safeUrl';

interface CategoryFilterProps {
  activeCategory: string;
  setActiveCategory: (category: string) => void;
}

export default function CategoryFilter({ setActiveCategory }: CategoryFilterProps) {
  const { menu } = useCatalog();

  /*
   * Os cartões saem das categorias DE VERDADE, marcadas no painel.
   *
   * Aqui havia seis cartões cravados no código — id, nome, frase e foto fixos.
   * Enquanto a loja tinha exatamente aquelas seis categorias, funcionava.
   * Quando ela passou a espelhar a árvore do ERP, os ids deixaram de existir:
   * os cartões continuavam bonitos na home e levavam a uma lista vazia.
   *
   * `featured` fica de fora porque é entrada de menu (Promoções, Novidades) e
   * não categoria de catálogo.
   */
  const cartoes = menu.filter((c) => c.home === true && c.featured !== true);

  /*
   * Sem nenhuma categoria marcada, a seção inteira SOME.
   *
   * Uma seção chamada "Explore por categoria" com zero cartões, ou com um
   * cartão de exemplo, é pior do que não existir: quem visita lê como defeito,
   * e quem administra não descobre que precisa marcar alguma.
   */
  if (cartoes.length === 0) return null;

  return (
    <section id="categories-section" className="bg-white py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Section header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
          <div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.25em] text-primary-blue">
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
          {cartoes.map((cat, i) => (
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
              {/*
                O fundo em degradê fica SEMPRE, atrás da foto.
                Categoria sem foto cadastrada continua um cartão legível, com o
                nome em cima do verde da marca — e não um retângulo quebrado.
              */}
              <div className="absolute inset-0 bg-gradient-to-br from-brand-green-200 to-brand-green-300" />
              {(cat.image ?? '') !== '' && (
                <img
                  src={safeImageSrc(cat.image ?? '')}
                  alt=""
                  className="absolute inset-0 w-full h-full object-contain p-6 transform group-hover:scale-110 transition-transform duration-700 ease-out"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  /*
                    Arquivo que não carrega vira degradê, não ícone quebrado.
                    Uma foto pode sumir do disco depois de cadastrada — e o
                    ícone de imagem quebrada em cima do nome da categoria faz a
                    loja inteira parecer abandonada, por um arquivo só.
                  */
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )}
              {/* Readability gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-[#1b2b18]/85 via-[#3a5634]/25 to-transparent" />

              <div className="absolute inset-0 p-5 sm:p-6 flex flex-col justify-end">
                <h3 className="text-lg sm:text-2xl font-extrabold text-white leading-tight drop-shadow-sm">
                  {cat.name}
                </h3>
                {(cat.blurb ?? '') !== '' && (
                  <p className="text-xs sm:text-sm text-white/80 mt-0.5">{cat.blurb}</p>
                )}
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
