/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AnimatePresence } from 'motion/react';

// Data and Types
import { Product, CartItem } from './types';
import { PRODUCTS } from './data';

// Components
import Header from './components/Header';
import Hero from './components/Hero';
import CategoryFilter from './components/CategoryFilter';
import ProductRail from './components/ProductRail';
import ValueProps from './components/ValueProps';
import ProductsPage from './components/ProductsPage';
import PromoBanner from './components/PromoBanner';
import TrustBar from './components/TrustBar';
import Footer from './components/Footer';

// Modals and Drawers
import CartDrawer from './components/CartDrawer';
import ProductDetailPage from './components/ProductDetailPage';
import CheckoutPage from './components/CheckoutPage';
import StoryModal from './components/StoryModal';
import CertificationsModal from './components/CertificationsModal';
import AccountModal from './components/AccountModal';
import AccountPage from './components/AccountPage';
import { CustomerAccount, getSession, saveSession, endSession, startSession } from './account/session';

type View = 'home' | 'products' | 'detail' | 'checkout' | 'account';

export default function App() {
  // Navigation & Filtering States
  const [view, setView] = useState<View>('home');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // Cart State (Pre-populated with exactly 2 items to match the "2" badge in the mockup)
  const [cartItems, setCartItems] = useState<CartItem[]>([
    {
      product: PRODUCTS[0], // Palmito Inteiro Premium
      quantity: 1,
    },
    {
      product: PRODUCTS[1], // Azeitonas Verdes Recheadas
      quantity: 1,
    },
  ]);

  // UI Control States
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isStoryOpen, setIsStoryOpen] = useState(false);
  const [isCertificationsOpen, setIsCertificationsOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  // Customer session (mock)
  const [account, setAccount] = useState<CustomerAccount | null>(() => getSession());

  const persistAccount = (acc: CustomerAccount) => { saveSession(acc); setAccount(acc); };

  // Header "Minha Conta": if logged in → account page, else open login modal
  const handleAccountClick = () => {
    if (account) {
      setSelectedProduct(null);
      setView('account');
      scrollTop();
    } else {
      setIsAccountOpen(true);
    }
  };

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // Navigation helpers
  const goHome = () => {
    setSelectedProduct(null);
    setActiveCategory('all');
    setActiveSubcategory(null);
    setView('home');
    scrollTop();
  };

  // Open the products listing, optionally scoped to a category / subcategory
  const selectCategory = (categoryId: string, subcategoryId?: string) => {
    setSelectedProduct(null);
    setActiveCategory(categoryId);
    setActiveSubcategory(subcategoryId ?? null);
    setSearchQuery('');
    setView('products');
    scrollTop();
  };

  // Open the full listing without changing the active category
  const openProducts = () => {
    setSelectedProduct(null);
    setView('products');
    scrollTop();
  };

  const openProductDetail = (product: Product) => {
    setSelectedProduct(product);
    setView('detail');
    scrollTop();
  };

  // Cart operations
  const handleAddToCart = (product: Product, quantity: number = 1) => {
    setCartItems((prevItems) => {
      const existing = prevItems.find((item) => item.product.id === product.id);
      if (existing) {
        return prevItems.map((item) =>
          item.product.id === product.id
            ? { ...item, quantity: item.quantity + quantity }
            : item
        );
      }
      return [...prevItems, { product, quantity }];
    });
  };

  const handleUpdateCartQty = (productId: string, quantity: number) => {
    if (quantity < 1) {
      handleRemoveCartItem(productId);
      return;
    }
    setCartItems((prevItems) =>
      prevItems.map((item) =>
        item.product.id === productId ? { ...item, quantity } : item
      )
    );
  };

  const handleRemoveCartItem = (productId: string) => {
    setCartItems((prevItems) => prevItems.filter((item) => item.product.id !== productId));
  };

  const handleClearCart = () => {
    setCartItems([]);
  };

  // Totals for the navbar
  const totalItemsCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  // Home product rails
  const onSale = PRODUCTS.filter((p) => p.oldPrice && p.oldPrice > p.price);
  const newArrivals = PRODUCTS.filter((p) => p.tag === 'NOVIDADE');
  const bestSellers = [...PRODUCTS]
    .filter((p) => p.tag !== 'NOVIDADE')
    .slice(0, 12);

  return (
    <div className="min-h-screen bg-[#fcf9f8] text-brand-text font-sans antialiased flex flex-col justify-between">

      {/* Navbar Container */}
      <Header
        cartCount={totalItemsCount}
        cartTotal={cartTotal}
        onOpenCart={() => setIsCartOpen(true)}
        searchQuery={searchQuery}
        setSearchQuery={(q) => {
          setSearchQuery(q);
          if (view !== 'products') setView('products');
        }}
        onSelectCategory={selectCategory}
        onOpenProducts={openProducts}
        onGoHome={goHome}
        onOpenAccount={handleAccountClick}
        customerName={account?.name ?? null}
      />

      {view === 'account' && account ? (
        <AccountPage
          account={account}
          onSave={persistAccount}
          onLogout={() => { endSession(); setAccount(null); goHome(); }}
          onBack={goHome}
          onSelectProduct={openProductDetail}
        />
      ) : view === 'checkout' ? (
        <CheckoutPage
          cartItems={cartItems}
          account={account}
          onBack={() => setView('home')}
          onClearCart={handleClearCart}
          onSaveProfile={(data) => {
            if (!account) return;
            const addr = {
              id: account.addresses[0]?.id ?? `addr-${Date.now()}`,
              label: account.addresses[0]?.label ?? 'Principal',
              ...data.address,
              isDefault: true,
            };
            persistAccount({
              ...account,
              name: data.name || account.name,
              cpf: data.cpf || account.cpf,
              phone: data.phone || account.phone,
              email: data.email || account.email,
              addresses: [addr, ...account.addresses.filter((a) => a.id !== addr.id)],
            });
          }}
        />
      ) : view === 'detail' && selectedProduct ? (
        <ProductDetailPage
          product={selectedProduct}
          products={PRODUCTS}
          onBack={() => openProducts()}
          onAddToCart={handleAddToCart}
          onSelectProduct={openProductDetail}
        />
      ) : view === 'products' ? (
        <ProductsPage
          activeCategory={activeCategory}
          activeSubcategory={activeSubcategory}
          onSelectCategory={selectCategory}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          onSelectProduct={openProductDetail}
          onAddToCart={handleAddToCart}
        />
      ) : (
        <>
          {/* Hero: rotating shop banner + side mini-banners */}
          <Hero
            onOpenProducts={() => selectCategory('all')}
            onSelectCategory={selectCategory}
          />

          {/* Trust / benefits strip */}
          <TrustBar />

          {/* Shop by category (lookbook) */}
          <CategoryFilter
            activeCategory={activeCategory}
            setActiveCategory={(cat) => selectCategory(cat)}
          />

          {/* Best sellers rail */}
          <ProductRail
            eyebrow="Favoritos da casa"
            title="Mais vendidos"
            products={bestSellers}
            onSelectProduct={openProductDetail}
            onAddToCart={handleAddToCart}
            onViewAll={() => selectCategory('all')}
          />

          {/* Offers rail */}
          <ProductRail
            alt
            eyebrow="Aproveite"
            title="Ofertas da semana"
            products={onSale}
            onSelectProduct={openProductDetail}
            onAddToCart={handleAddToCart}
            onViewAll={() => selectCategory('destaques')}
          />

          {/* Editorial promo / CTA */}
          <PromoBanner onOpenProducts={() => selectCategory('all')} />

          {/* New arrivals rail */}
          <ProductRail
            eyebrow="Acabou de chegar"
            title="Novidades"
            products={newArrivals}
            onSelectProduct={openProductDetail}
            onAddToCart={handleAddToCart}
            onViewAll={() => selectCategory('novidades')}
          />

          {/* Why Quéops Pirâmides */}
          <ValueProps />
        </>
      )}

      {/* Main Footer structure */}
      <Footer
        onOpenStory={() => setIsStoryOpen(true)}
        onOpenCertifications={() => setIsCertificationsOpen(true)}
      />

      {/* Drawers and Modals Overlays with AnimatePresence */}
      <AnimatePresence>
        {isCartOpen && (
          <CartDrawer
            isOpen={isCartOpen}
            onClose={() => setIsCartOpen(false)}
            cartItems={cartItems}
            onUpdateQty={handleUpdateCartQty}
            onRemoveItem={handleRemoveCartItem}
            onProceedToCheckout={() => {
              setIsCartOpen(false);
              setView('checkout');
              scrollTop();
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isStoryOpen && (
          <StoryModal onClose={() => setIsStoryOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isCertificationsOpen && (
          <CertificationsModal onClose={() => setIsCertificationsOpen(false)} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isAccountOpen && (
          <AccountModal
            onClose={() => setIsAccountOpen(false)}
            onSuccess={(name, email) => {
              const acc = startSession(name, email);
              setAccount(acc);
              setIsAccountOpen(false);
              setSelectedProduct(null);
              setView('account');
              scrollTop();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
