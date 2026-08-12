/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ChevronRight, ChevronDown, LayoutGrid,
  Star, Triangle, Gem, Flame, Sparkles, Compass, Cross, Frame, BookOpen,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useCatalog } from '../catalog/CatalogContext';
import { MenuCategory } from '../types';

const ICONS: Record<string, React.ComponentType<{ className?: string; size?: number }>> = {
  Star, Triangle, Gem, Flame, Sparkles, Compass, Cross, Frame, BookOpen,
};

interface MegaMenuProps {
  /** Navigate to a category (and optional subcategory) listing */
  onSelect: (categoryId: string, subcategoryId?: string) => void;
}

/**
 * Desktop: "Categorias" button reveals a panel on hover — parent list on the
 * left, subcategories of the hovered parent on the right.
 * Mobile: accordion list rendered separately by the Header drawer.
 */
export default function MegaMenu({ onSelect }: MegaMenuProps) {
  const { menu } = useCatalog();
  const [open, setOpen] = useState(false);
  const [activeId, setActiveId] = useState<string>('');

  const activeCategory: MenuCategory | undefined =
    menu.find((c) => c.id === activeId) ?? menu[0];

  const handleSelect = (categoryId: string, subId?: string) => {
    setOpen(false);
    onSelect(categoryId, subId);
  };

  const Icon = (name: string) => ICONS[name] ?? LayoutGrid;

  const ActiveIcon = Icon(activeCategory?.icon ?? 'LayoutGrid');

  return (
    <div
      className="relative"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {/* Trigger */}
      <button
        id="mega-menu-trigger"
        onClick={() => handleSelect('all')}
        className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors ${
          open ? 'bg-primary-blue text-white' : 'text-gray-700 hover:bg-gray-100'
        }`}
      >
        <LayoutGrid size={16} />
        <span>Categorias</span>
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="absolute left-0 top-full pt-3 z-50"
          >
            <div className="bg-white rounded-2xl shadow-[0_24px_60px_rgba(43,49,37,0.18)] border border-gray-100 overflow-hidden flex w-[840px] max-w-[92vw]">
              {/* Parent categories */}
              <div className="w-[280px] bg-gradient-to-b from-gray-50 to-white border-r border-gray-100 py-3 max-h-[460px] overflow-y-auto">
                {menu.map((cat) => {
                  const C = Icon(cat.icon);
                  const isActive = cat.id === activeId;
                  return (
                    <button
                      key={cat.id}
                      onMouseEnter={() => setActiveId(cat.id)}
                      onClick={() => handleSelect(cat.id)}
                      className={`relative w-full flex items-center justify-between gap-2 pl-5 pr-4 py-2.5 text-left text-sm transition-all ${
                        isActive ? 'bg-white text-primary-blue font-bold' : 'text-gray-600 hover:bg-white/70'
                      }`}
                    >
                      {isActive && <span className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-brand-gold" />}
                      <span className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
                          isActive ? 'bg-primary-blue text-white' : cat.featured ? 'bg-brand-red/10 text-brand-red' : 'bg-gray-100 text-gray-500'
                        }`}>
                          <C size={16} />
                        </span>
                        <span className={cat.featured && !isActive ? 'text-brand-red font-semibold' : ''}>{cat.name}</span>
                      </span>
                      <ChevronRight size={14} className={isActive ? 'text-primary-blue' : 'text-gray-300'} />
                    </button>
                  );
                })}
              </div>

              {/* Subcategories of the hovered parent */}
              <div className="flex-1 p-6 max-h-[460px] overflow-y-auto">
                <div className="flex items-center justify-between mb-5 pb-3 border-b border-gray-100">
                  <div className="flex items-center gap-2.5">
                    <span className="w-9 h-9 rounded-xl bg-primary-blue/10 text-primary-blue flex items-center justify-center">
                      <ActiveIcon size={18} />
                    </span>
                    <h3 className="text-base font-extrabold text-gray-900">{activeCategory?.name}</h3>
                  </div>
                  <button
                    onClick={() => handleSelect(activeCategory!.id)}
                    className="inline-flex items-center gap-1 text-[11px] font-bold text-primary-blue hover:gap-2 transition-all uppercase tracking-wide"
                  >
                    Ver tudo <ChevronRight size={13} />
                  </button>
                </div>

                {activeCategory && activeCategory.subcategories.length > 0 ? (
                  <ul className="grid grid-cols-2 gap-x-5 gap-y-1">
                    {activeCategory.subcategories.map((sub) => (
                      <li key={sub.id}>
                        <button
                          onClick={() => handleSelect(activeCategory.id, sub.id)}
                          className="w-full text-left text-sm text-gray-600 hover:text-primary-blue hover:bg-primary-blue/[0.04] rounded-lg px-3 py-2 transition-colors flex items-center gap-2.5 group"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-gray-200 group-hover:bg-brand-gold transition-colors flex-shrink-0" />
                          {sub.name}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <button
                    onClick={() => handleSelect(activeCategory!.id)}
                    className="text-sm text-primary-blue font-semibold hover:underline"
                  >
                    Ver todos os produtos de {activeCategory?.name} →
                  </button>
                )}
              </div>

              {/* Promo column */}
              <div className="hidden lg:flex w-[220px] flex-shrink-0 bg-gradient-to-br from-[#1b2b18] via-primary-blue to-primary-container text-white p-6 flex-col justify-between relative overflow-hidden">
                <Sparkles size={90} className="absolute -right-3 -bottom-3 text-white/10" />
                <div className="relative">
                  <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-brand-gold">Destaques</span>
                  <p className="mt-2 text-lg font-extrabold leading-tight">As peças preferidas dos nossos clientes</p>
                  <p className="text-xs text-white/60 mt-2">Pirâmides, cristais e incensos selecionados.</p>
                </div>
                <button
                  onClick={() => handleSelect('destaques')}
                  className="relative mt-4 inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-full bg-brand-gold text-primary-blue text-xs font-bold uppercase tracking-wider hover:bg-white transition-colors"
                >
                  Ver destaques <ChevronRight size={14} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/** Accordion variant for the mobile drawer. */
export function MegaMenuMobile({
  onSelect,
}: {
  onSelect: (categoryId: string, subcategoryId?: string) => void;
}) {
  const { menu } = useCatalog();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      {menu.map((cat) => {
        const C = ICONS[cat.icon] ?? LayoutGrid;
        const hasSubs = cat.subcategories.length > 0;
        const isExpanded = expanded === cat.id;
        return (
          <div key={cat.id} className="border-b border-gray-50 last:border-0">
            <button
              onClick={() => {
                if (hasSubs) {
                  setExpanded(isExpanded ? null : cat.id);
                } else {
                  onSelect(cat.id);
                }
              }}
              className="w-full flex items-center justify-between py-2.5 px-1 text-left text-sm font-medium text-gray-700"
            >
              <span className="flex items-center gap-2.5">
                <C size={17} className={cat.featured ? 'text-brand-red' : 'text-gray-400'} />
                <span className={cat.featured ? 'text-brand-red font-bold' : ''}>{cat.name}</span>
              </span>
              {hasSubs && (
                <ChevronDown size={16} className={`text-gray-300 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
              )}
            </button>
            {hasSubs && isExpanded && (
              <ul className="pl-9 pb-2 space-y-0.5">
                <li>
                  <button
                    onClick={() => onSelect(cat.id)}
                    className="w-full text-left text-xs font-bold text-primary-blue py-1.5"
                  >
                    Ver tudo em {cat.name}
                  </button>
                </li>
                {cat.subcategories.map((sub) => (
                  <li key={sub.id}>
                    <button
                      onClick={() => onSelect(cat.id, sub.id)}
                      className="w-full text-left text-xs text-gray-600 hover:text-primary-blue py-1.5"
                    >
                      {sub.name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
