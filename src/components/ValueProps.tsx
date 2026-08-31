/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Factory, Ruler, ShieldCheck, Globe2 } from 'lucide-react';
import { motion } from 'motion/react';

/**
 * Os quatro argumentos da marca, na ordem em que convencem.
 *
 * Cada ícone corresponde ao que o texto afirma — fábrica, medida, garantia,
 * mundo. Ícone genérico ao lado de promessa específica enfraquece as duas.
 */
const ITEMS = [
  {
    icon: Factory,
    title: 'Somos Fabricantes',
    description: 'Pirâmides de cobre desde 1996 e cristais lapidados desde 2019, com técnica própria.',
  },
  {
    icon: Ruler,
    title: 'Medidas Exatas',
    description: 'Cada pirâmide segue a proporção exata da Grande Pirâmide de Quéops.',
  },
  {
    icon: ShieldCheck,
    title: 'Certificado de Garantia',
    description: 'Asseguramos a qualidade e a garantia das nossas pirâmides.',
  },
  {
    icon: Globe2,
    title: 'Enviamos para todo o mundo',
    description: 'Envio nacional e internacional, garantindo que as nossas peças cheguem a todos que precisam.',
  },
];

const STATS = [
  { value: '35+', label: 'anos de tradição' },
  { value: '1.400+', label: 'peças no catálogo' },
  { value: '100%', label: 'feito à mão' },
  { value: '4.9★', label: 'avaliação média' },
];

export default function ValueProps() {
  return (
    <section
      id="brand-values"
      className="relative overflow-hidden bg-gradient-to-br from-[#1b2b18] via-primary-blue to-primary-container text-white py-24 lg:py-32"
    >
      {/* Ambient glows */}
      <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-gold/10 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-32 -right-24 w-[28rem] h-[28rem] rounded-full bg-brand-red/10 blur-3xl pointer-events-none" />

      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Heading */}
        <div className="max-w-2xl mx-auto text-center mb-16">
          <span className="inline-flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-gold">
            <span className="h-px w-8 bg-brand-gold/60" />
            Por que Quéops Pirâmides
            <span className="h-px w-8 bg-brand-gold/60" />
          </span>
          <h2 className="mt-5 font-bold text-3xl sm:text-4xl lg:text-5xl leading-tight tracking-tight">
            Excelência em <span className="text-brand-gold">cada detalhe</span>
          </h2>
          <p className="mt-5 text-white/70 text-base leading-relaxed">
Mais de três décadas dedicadas a criar pirâmides, cristais e artigos
            espirituais que trazem harmonia ao seu ambiente — com o capricho que só
            o trabalho verdadeiramente artesanal proporciona.
          </p>
        </div>

        {/* Value grid (glass cards) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {ITEMS.map((item, i) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: '-60px' }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className="group relative rounded-2xl bg-white/[0.06] border border-white/10 backdrop-blur-sm p-7 hover:bg-white/[0.1] hover:-translate-y-1.5 transition-all duration-300"
              >
                <span className="absolute top-5 right-6 text-5xl font-extrabold text-white/[0.06] group-hover:text-brand-gold/20 transition-colors select-none">
                  0{i + 1}
                </span>
                <div className="w-14 h-14 rounded-2xl bg-brand-gold/15 text-brand-gold flex items-center justify-center mb-5 group-hover:bg-brand-gold group-hover:text-primary-blue transition-colors duration-300">
                  <Icon size={26} />
                </div>
                <h3 className="text-lg font-bold mb-2">{item.title}</h3>
                <p className="text-sm text-white/65 leading-relaxed">{item.description}</p>
              </motion.div>
            );
          })}
        </div>

        {/* Stats strip */}
        <div className="mt-16 pt-12 border-t border-white/10 grid grid-cols-2 lg:grid-cols-4 gap-8">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="text-center"
            >
              <p className="text-3xl sm:text-4xl font-extrabold text-brand-gold">{s.value}</p>
              <p className="text-xs text-white/60 mt-1 uppercase tracking-wider">{s.label}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
