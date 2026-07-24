/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, ShoppingBag, Menu, X, User, Truck, Headset, CreditCard } from 'lucide-react';
import { AnimatePresence } from 'motion/react';
import logoUrl from '../assets/logo.svg';
import MegaMenu, { MegaMenuMobile } from './MegaMenu';

interface HeaderProps {
  cartCount: number;
  cartTotal: number;
  onOpenCart: () => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  onSelectCategory: (categoryId: string, subcategoryId?: string) => void;
  onOpenProducts: () => void;
  onGoHome: () => void;
  onOpenAccount: () => void;
  customerName?: string | null;
}

export default function Header({
  cartCount,
  cartTotal,
  onOpenCart,
  searchQuery,
  setSearchQuery,
  onSelectCategory,
  onOpenProducts,
  onGoHome,
  customerName,
  onOpenAccount,
}: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Quick links beside the mega-menu
  const quickLinks = [
    { id: 'all', label: 'Todos os Produtos' },
    { id: 'destaques', label: 'Destaques' },
    { id: 'novidades', label: 'Novidades' },
  ];

  return (
    <header
      id="main-header"
      className="fixed top-0 left-0 w-full z-40"
    >
      {/* Top announcement bar */}
      <div className="bg-primary-blue text-white text-[11px] sm:text-xs font-medium">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-8 flex items-center justify-center gap-2">
          <Truck className="w-3.5 h-3.5 flex-shrink-0" />
          <span className="tracking-wide">
            <strong className="font-bold">Envio para todo o Brasil</strong> • Pirâmides artesanais feitas à mão desde 1990
          </span>
        </div>
      </div>

      {/* Main bar */}
      <div
        className={`w-full transition-all duration-300 border-b border-gray-100 ${
          scrolled ? 'bg-white shadow-md py-2.5' : 'bg-white/95 backdrop-blur-md py-3.5'
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between gap-4 h-11">
            {/* Logo */}
            <div className="flex-shrink-0 cursor-pointer" onClick={onGoHome}>
              <img
                src={logoUrl}
                alt="Quéops Pirâmides"
                className="h-9 sm:h-11 w-auto select-none"
              />
            </div>

            {/* Always-visible search bar (center) */}
            <div className="hidden md:flex flex-1 max-w-xl mx-auto">
              <div className="relative w-full">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="header-search-input"
                  type="text"
                  placeholder="O que você procura hoje? Ex: pirâmide, ametista, incenso..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full border border-gray-200 rounded-full py-2.5 pl-10 pr-4 text-sm bg-gray-50 focus:bg-white focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue focus:outline-none transition"
                />
              </div>
            </div>

            {/* Utility Controls */}
            <div className="flex items-center space-x-1 sm:space-x-2 flex-shrink-0">
              {/* Account */}
              <button
                id="account-btn"
                onClick={onOpenAccount}
                className="hidden sm:flex items-center gap-2 px-3 py-2 text-gray-600 hover:text-primary-blue hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
                title="Entrar ou criar conta"
              >
                <User size={20} />
                <span className="hidden lg:flex flex-col leading-tight text-left">
                  {customerName ? (
                    <>
                      <span className="text-[10px] text-gray-400">Olá, {customerName.split(' ')[0]}</span>
                      <span className="text-xs font-bold">Minha Conta</span>
                    </>
                  ) : (
                    <>
                      <span className="text-[10px] text-gray-400">Entrar</span>
                      <span className="text-xs font-bold">Criar conta</span>
                    </>
                  )}
                </span>
              </button>

              {/* Cart with value */}
              <button
                id="cart-toggle-btn"
                onClick={onOpenCart}
                className="flex items-center gap-2 px-3 py-2 text-gray-700 hover:text-primary-blue hover:bg-gray-100 rounded-lg transition-colors relative cursor-pointer"
                title="Ver sacola"
              >
                <div className="relative">
                  <ShoppingBag size={20} />
                  {cartCount > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 bg-brand-red text-white text-[10px] font-bold h-4.5 w-4.5 min-w-[18px] px-1 rounded-full flex items-center justify-center shadow-sm">
                      {cartCount}
                    </span>
                  )}
                </div>
                <span className="hidden sm:flex flex-col leading-tight text-left">
                  <span className="text-[10px] text-gray-400">Sacola</span>
                  <span className="text-xs font-bold font-mono">R$ {cartTotal.toFixed(2)}</span>
                </span>
              </button>

              {/* Mobile menu button */}
              <button
                id="mobile-menu-toggle-btn"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-2 md:hidden text-gray-600 hover:text-primary-blue hover:bg-gray-100 rounded-lg transition-colors cursor-pointer"
              >
                {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
              </button>
            </div>
          </div>

          {/* Desktop category nav row with mega-menu */}
          <nav className="hidden md:flex items-center gap-2 lg:gap-4 mt-2 pt-2 border-t border-gray-50">
            <MegaMenu onSelect={onSelectCategory} />
            <span className="w-px h-5 bg-gray-150" />
            {quickLinks.map((item) => (
              <button
                id={`nav-item-${item.id}`}
                key={item.id}
                onClick={() => onSelectCategory(item.id)}
                className="text-xs font-semibold font-sans tracking-wide text-gray-600 hover:text-primary-blue transition-colors px-3 py-2 rounded-lg hover:bg-gray-100"
              >
                {item.label}
              </button>
            ))}

            {/* Right-aligned service highlights — fill the empty space */}
            <div className="ml-auto flex items-center gap-5 text-gray-500">
              <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                <CreditCard size={15} className="text-primary-blue" />
                Em até <strong className="text-gray-700">6x sem juros</strong>
              </span>
              <span className="w-px h-4 bg-gray-150" />
              <a
                href="tel:+551130000000"
                className="inline-flex items-center gap-1.5 text-xs font-medium hover:text-primary-blue transition-colors"
              >
                <Headset size={15} className="text-primary-blue" />
                Atendimento <strong className="text-gray-700">(11) 3000-0000</strong>
              </a>
            </div>
          </nav>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <div
            id="mobile-drawer-menu"
            className="md:hidden bg-white border-t border-gray-100 shadow-inner overflow-y-auto max-h-[70vh]"
          >
            <div className="px-4 py-4 space-y-2">
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input
                  id="mobile-search-input"
                  type="text"
                  placeholder="O que você procura hoje?"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setMobileMenuOpen(false);
                  }}
                  className="w-full border border-gray-200 rounded-full py-2.5 pl-10 pr-4 text-sm bg-gray-50 focus:outline-none focus:ring-1 focus:ring-primary-blue"
                />
              </div>
              <button
                onClick={() => {
                  onOpenProducts();
                  setMobileMenuOpen(false);
                }}
                className="w-full text-left py-2.5 px-1 text-sm font-bold text-primary-blue border-b border-gray-50"
              >
                Todos os Produtos
              </button>

              <MegaMenuMobile
                onSelect={(catId, subId) => {
                  onSelectCategory(catId, subId);
                  setMobileMenuOpen(false);
                }}
              />

              <button
                onClick={() => {
                  onOpenAccount();
                  setMobileMenuOpen(false);
                }}
                className="w-full flex items-center gap-2 text-left py-2.5 px-1 text-sm font-medium text-gray-600 hover:bg-gray-50 border-t border-gray-100 mt-2 pt-3"
              >
                <User size={18} /> Minha Conta
              </button>
            </div>
          </div>
        )}
      </AnimatePresence>
    </header>
  );
}
