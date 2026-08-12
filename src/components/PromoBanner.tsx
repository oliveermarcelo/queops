/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ArrowRight } from 'lucide-react';
import { motion } from 'motion/react';
import { BANNERS } from '../media';

const BANNER_IMAGE = BANNERS.promo;

interface PromoBannerProps {
  onOpenProducts: () => void;
}

export default function PromoBanner({ onOpenProducts }: PromoBannerProps) {
  return (
    <section className="bg-white py-20 lg:py-24">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="relative rounded-3xl overflow-hidden bg-primary-blue">
          {/* Background image */}
          <img
            src={BANNER_IMAGE}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover opacity-30"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-[#232819] via-primary-blue/90 to-primary-blue/40" />
          <div className="absolute -top-20 -right-16 w-80 h-80 rounded-full bg-brand-gold/15 blur-3xl pointer-events-none" />

          <div className="relative px-7 py-14 sm:px-14 sm:py-20 lg:px-20 max-w-2xl">
            <motion.span
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5 }}
              className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-gold"
            >
              Energia em cada ambiente
            </motion.span>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="mt-4 font-display font-bold text-3xl sm:text-4xl lg:text-5xl text-white leading-[1.1]"
            >
              Da nossa lapidação
              <br />
              <span className="italic text-brand-gold">para o seu lar</span>
            </motion.h2>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.18 }}
              className="mt-5 text-white/80 text-base leading-relaxed max-w-lg"
            >
              Pirâmides artesanais, cristais e incensos selecionados para trazer
              harmonia ao seu espaço. Tudo com o cuidado da Quéops Pirâmides —
              com <strong className="text-white">envio para todo o Brasil</strong>.
            </motion.p>

            <motion.button
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.26 }}
              onClick={onOpenProducts}
              className="group mt-8 inline-flex items-center gap-2 px-7 py-4 rounded-full text-sm font-bold uppercase tracking-wider text-primary-blue bg-white hover:bg-brand-gold hover:text-white transition-all duration-300 shadow-xl cursor-pointer"
            >
              Explorar o catálogo
              <ArrowRight className="w-4 h-4 transform group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </div>
        </div>
      </div>
    </section>
  );
}
