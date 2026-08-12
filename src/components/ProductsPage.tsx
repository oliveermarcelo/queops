/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Search, SlidersHorizontal, X, ChevronDown } from 'lucide-react';
import { Product } from '../types';
import { useCatalog } from '../catalog/CatalogContext';
import ProductCard from './ProductCard';
import { brlNumber } from '../utils/currency';

interface ProductsPageProps {
  activeCategory: string;
  activeSubcategory: string | null;
  onSelectCategory: (categoryId: string, subcategoryId?: string) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSelectProduct: (product: Product) => void;
  onAddToCart: (product: Product, quantity: number) => void;
}

type SortOption = 'relevance' | 'price-asc' | 'price-desc' | 'name-asc';

// Virtual categories that filter by tag rather than by taxonomy
const isPromo = (p: Product) => !!p.tag && p.tag !== 'NOVIDADE';
const isNew = (p: Product) => p.tag === 'NOVIDADE';

function matchesCategory(p: Product, categoryId: string): boolean {
  if (categoryId === 'all') return true;
  if (categoryId === 'destaques' || categoryId === 'promocoes') return isPromo(p);
  if (categoryId === 'novidades') return isNew(p);
  return p.category === categoryId;
}

export default function ProductsPage({
  activeCategory,
  activeSubcategory,
  onSelectCategory,
  searchQuery,
  setSearchQuery,
  onSelectProduct,
  onAddToCart,
}: ProductsPageProps) {
  const { products, menu } = useCatalog();

  // Os limites do filtro de preço saem do catálogo carregado, não de um
  // cálculo em tempo de módulo (que rodava antes de existirem produtos).
  const { minPrice, maxPriceBound } = useMemo(() => {
    if (products.length === 0) return { minPrice: 0, maxPriceBound: 1000 };
    const prices = products.map((p) => p.price);
    return {
      minPrice: Math.floor(Math.min(...prices)),
      maxPriceBound: Math.ceil(Math.max(...prices)),
    };
  }, [products]);

  const [maxPrice, setMaxPrice] = useState<number | null>(null);
  const [sort, setSort] = useState<SortOption>('relevance');
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const priceCeiling = maxPrice ?? maxPriceBound;
  const menuCategory = menu.find((c) => c.id === activeCategory);
  const activeCategoryName =
    activeCategory === 'all'
      ? 'Todos os Produtos'
      : menuCategory?.name ?? 'Produtos';
  const activeSubName = menuCategory?.subcategories.find((s) => s.id === activeSubcategory)?.name;

  const filteredProducts = useMemo(() => {
    const q = searchQuery.toLowerCase();
    const list = products.filter((product) => {
      const matchCat = matchesCategory(product, activeCategory);
      const matchSub = !activeSubcategory || product.subcategory === activeSubcategory;
      const matchSearch =
        !q ||
        product.name.toLowerCase().includes(q) ||
        product.description.toLowerCase().includes(q) ||
        product.categoryLabel.toLowerCase().includes(q);
      const matchPrice = product.price <= priceCeiling;
      return matchCat && matchSub && matchSearch && matchPrice;
    });

    const sorted = [...list];
    switch (sort) {
      case 'price-asc':
        sorted.sort((a, b) => a.price - b.price);
        break;
      case 'price-desc':
        sorted.sort((a, b) => b.price - a.price);
        break;
      case 'name-asc':
        sorted.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        break;
      default:
        break;
    }
    return sorted;
  }, [products, activeCategory, activeSubcategory, searchQuery, priceCeiling, sort]);

  const handleResetFilters = () => {
    onSelectCategory('all');
    setSearchQuery('');
    setMaxPrice(null);
    setSort('relevance');
  };

  const countFor = (categoryId: string) =>
    products.filter((p) => matchesCategory(p, categoryId)).length;

  // Filters panel (shared between sidebar and mobile drawer)
  const FiltersContent = () => (
    <div className="space-y-8">
      {/* Categories */}
      <div className="space-y-3">
        <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-gray-800">Categorias</h3>
        <ul className="space-y-0.5 max-h-[360px] overflow-y-auto pr-1">
          <li>
            <button
              onClick={() => {
                onSelectCategory('all');
                setMobileFiltersOpen(false);
              }}
              className={`w-full flex items-center justify-between text-left py-2 px-3 rounded-lg text-sm transition-colors ${
                activeCategory === 'all'
                  ? 'bg-brand-green-100 text-brand-green-700 font-bold'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <span>Todos os Produtos</span>
              <span className="text-[11px] text-gray-400 font-mono">{products.length}</span>
            </button>
          </li>

          {menu.map((cat) => {
            const isActiveCat = activeCategory === cat.id;
            const count = countFor(cat.id);
            return (
              <li key={cat.id}>
                <button
                  onClick={() => {
                    onSelectCategory(cat.id);
                    setMobileFiltersOpen(false);
                  }}
                  className={`w-full flex items-center justify-between text-left py-2 px-3 rounded-lg text-sm transition-colors ${
                    isActiveCat
                      ? 'bg-brand-green-100 text-brand-green-700 font-bold'
                      : cat.featured
                        ? 'text-brand-red font-semibold hover:bg-gray-50'
                        : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  <span>{cat.name}</span>
                  <span className="text-[11px] text-gray-400 font-mono">{count}</span>
                </button>

                {/* Subcategories for the active parent */}
                {isActiveCat && cat.subcategories.length > 0 && (
                  <ul className="mt-0.5 mb-1 ml-3 pl-3 border-l border-gray-150 space-y-0.5">
                    {cat.subcategories.map((sub) => {
                      const isActiveSub = activeSubcategory === sub.id;
                      return (
                        <li key={sub.id}>
                          <button
                            onClick={() => {
                              onSelectCategory(cat.id, isActiveSub ? undefined : sub.id);
                              setMobileFiltersOpen(false);
                            }}
                            className={`w-full text-left py-1.5 px-2 rounded text-[13px] transition-colors ${
                              isActiveSub
                                ? 'text-primary-blue font-bold'
                                : 'text-gray-500 hover:text-primary-blue'
                            }`}
                          >
                            {sub.name}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Price range */}
      <div className="space-y-3 border-t border-gray-100 pt-6">
        <h3 className="text-[11px] font-extrabold uppercase tracking-widest text-gray-800">Faixa de Preço</h3>
        <input
          type="range"
          aria-label="Preço máximo"
          min={minPrice}
          max={maxPriceBound}
          value={priceCeiling}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="w-full accent-primary-blue cursor-pointer"
        />
        <div className="flex items-center justify-between text-xs text-gray-500 font-mono">
          <span>R$ {brlNumber(minPrice)}</span>
          <span className="font-bold text-primary-blue">até R$ {brlNumber(priceCeiling)}</span>
        </div>
      </div>

      <button
        onClick={handleResetFilters}
        className="w-full py-2.5 text-xs font-bold uppercase tracking-wider text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
      >
        Limpar Filtros
      </button>
    </div>
  );

  return (
    <div id="products-page" className="pt-40 lg:pt-44 pb-20 bg-brand-cream text-left scroll-mt-20 min-h-[70vh]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Page header */}
        <div className="mb-8 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <p className="text-xs text-gray-400 font-medium mb-1">
              Loja / {activeCategoryName}{activeSubName ? ` / ${activeSubName}` : ''}
            </p>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-primary-blue tracking-tight font-sans">
              {activeSubName ?? activeCategoryName}
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              {filteredProducts.length} {filteredProducts.length === 1 ? 'produto encontrado' : 'produtos encontrados'}
              {searchQuery && <> para “{searchQuery}”</>}
            </p>
          </div>

          {/* Toolbar: mobile filter button + sort */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMobileFiltersOpen(true)}
              className="lg:hidden inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-xs font-bold uppercase tracking-wider text-gray-700 shadow-sm"
            >
              <SlidersHorizontal size={16} />
              Filtros
            </button>

            <div className="relative ml-auto">
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortOption)}
                className="appearance-none bg-white border border-gray-200 rounded-lg pl-4 pr-9 py-2.5 text-xs font-semibold text-gray-700 shadow-sm focus:outline-none focus:ring-1 focus:ring-primary-blue cursor-pointer"
              >
                <option value="relevance">Ordenar por: Relevância</option>
                <option value="price-asc">Menor preço</option>
                <option value="price-desc">Maior preço</option>
                <option value="name-asc">Nome (A-Z)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* Sidebar Filters (desktop) */}
          <aside className="hidden lg:block lg:col-span-3">
            <div className="bg-white rounded-2xl border border-gray-150 shadow-sm p-6 sticky top-44">
              <FiltersContent />
            </div>
          </aside>

          {/* Main column */}
          <div className="lg:col-span-9">

            {/* Grid / Empty state */}
            {filteredProducts.length === 0 ? (
              <div className="bg-white border border-gray-150 rounded-2xl py-16 px-4 text-center max-w-md mx-auto shadow-sm">
                <div className="w-12 h-12 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-3 text-gray-400">
                  <Search size={22} />
                </div>
                <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Nenhum produto encontrado</h3>
                <p className="text-xs text-gray-400 mt-1.5 leading-relaxed max-w-xs mx-auto">
                  Não encontramos produtos com os filtros atuais. Tente ampliar a faixa de preço ou limpar os filtros.
                </p>
                <button
                  onClick={handleResetFilters}
                  className="mt-5 py-2 px-4 bg-primary-container hover:bg-primary-blue text-white rounded-lg text-xs font-bold uppercase tracking-wider transition-colors"
                >
                  Limpar Filtros
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-6">
                {filteredProducts.map((product) => (
                  <ProductCard
                    key={product.id}
                    product={product}
                    onSelect={onSelectProduct}
                    onAddToCart={(prod, e) => {
                      e.stopPropagation();
                      onAddToCart(prod, 1);
                    }}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile filters drawer */}
      {mobileFiltersOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileFiltersOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-[85%] max-w-xs bg-white shadow-2xl p-6 overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-sm font-extrabold uppercase tracking-widest text-gray-800">Filtros</h2>
              <button
                onClick={() => setMobileFiltersOpen(false)}
                className="p-1.5 hover:bg-gray-100 rounded-full text-gray-400"
              >
                <X size={20} />
              </button>
            </div>
            <FiltersContent />
          </div>
        </div>
      )}
    </div>
  );
}
