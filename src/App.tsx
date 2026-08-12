/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'motion/react';

import { Product, CartItem } from './types';
import { useCatalog } from './catalog/CatalogContext';
import { loadCart, saveCart, clearCart as clearStoredCart, StoredCartLine } from './cart/storage';
import { CustomerAccount, fetchAccount, logout as endSession } from './account/session';

import Header from './components/Header';
import Hero from './components/Hero';
import CategoryFilter from './components/CategoryFilter';
import ProductRail from './components/ProductRail';
import ValueProps from './components/ValueProps';
import ProductsPage from './components/ProductsPage';
import PromoBanner from './components/PromoBanner';
import TrustBar from './components/TrustBar';
import Footer from './components/Footer';

import CartDrawer from './components/CartDrawer';
import ProductDetailPage from './components/ProductDetailPage';
import CheckoutPage from './components/CheckoutPage';
import StoryModal from './components/StoryModal';
import CertificationsModal from './components/CertificationsModal';
import AccountModal from './components/AccountModal';
import AccountPage from './components/AccountPage';

type View = 'home' | 'products' | 'detail' | 'checkout' | 'account';

export default function App() {
  const { products, loading, error, reload, productById } = useCatalog();

  const [view, setView] = useState<View>('home');
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [activeSubcategory, setActiveSubcategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  // A sacola guarda só id + quantidade; os dados do produto vêm do catálogo.
  const [lines, setLines] = useState<StoredCartLine[]>(() => loadCart());
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [isStoryOpen, setIsStoryOpen] = useState(false);
  const [isCertificationsOpen, setIsCertificationsOpen] = useState(false);
  const [isAccountOpen, setIsAccountOpen] = useState(false);

  const [account, setAccount] = useState<CustomerAccount | null>(null);

  // Quem já tem sessão ativa volta logado ao abrir o site.
  useEffect(() => {
    let alive = true;
    fetchAccount()
      .then((acc) => {
        if (alive) setAccount(acc);
      })
      .catch(() => {
        /* visitante sem sessão: segue anônimo */
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    saveCart(lines);
  }, [lines]);

  // Junta as linhas salvas com o catálogo atual. Item que saiu do ar some da
  // sacola sozinho, em vez de quebrar o carrinho.
  const cartItems = useMemo<CartItem[]>(() => {
    if (!products.length) return [];
    return lines
      .map((line) => {
        const product = productById(line.id);
        return product ? { product, quantity: line.qty } : null;
      })
      .filter((x): x is CartItem => x !== null);
  }, [lines, products, productById]);

  const scrollTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const handleAccountClick = () => {
    if (account) {
      setSelectedProduct(null);
      setView('account');
      scrollTop();
    } else {
      setIsAccountOpen(true);
    }
  };

  const goHome = () => {
    setSelectedProduct(null);
    setActiveCategory('all');
    setActiveSubcategory(null);
    setView('home');
    scrollTop();
  };

  const selectCategory = (categoryId: string, subcategoryId?: string) => {
    setSelectedProduct(null);
    setActiveCategory(categoryId);
    setActiveSubcategory(subcategoryId ?? null);
    setSearchQuery('');
    setView('products');
    scrollTop();
  };

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

  // ---- Operações da sacola ----
  const handleAddToCart = useCallback((product: Product, quantity: number = 1) => {
    setLines((prev) => {
      const existing = prev.find((l) => l.id === product.id);
      if (existing) {
        return prev.map((l) =>
          l.id === product.id ? { ...l, qty: Math.min(999, l.qty + quantity) } : l,
        );
      }
      return [...prev, { id: product.id, qty: quantity }];
    });
  }, []);

  const handleRemoveCartItem = useCallback((productId: string) => {
    setLines((prev) => prev.filter((l) => l.id !== productId));
  }, []);

  const handleUpdateCartQty = useCallback(
    (productId: string, quantity: number) => {
      if (quantity < 1) {
        handleRemoveCartItem(productId);
        return;
      }
      setLines((prev) =>
        prev.map((l) => (l.id === productId ? { ...l, qty: Math.min(999, quantity) } : l)),
      );
    },
    [handleRemoveCartItem],
  );

  const handleClearCart = useCallback(() => {
    setLines([]);
    clearStoredCart();
  }, []);

  const totalItemsCount = cartItems.reduce((sum, item) => sum + item.quantity, 0);
  const cartTotal = cartItems.reduce((sum, item) => sum + item.product.price * item.quantity, 0);

  // ---- Vitrines da home ----
  const onSale = useMemo(
    () => products.filter((p) => p.oldPrice && p.oldPrice > p.price),
    [products],
  );
  const newArrivals = useMemo(() => products.filter((p) => p.tag === 'NOVIDADE'), [products]);
  const bestSellers = useMemo(
    () => products.filter((p) => p.tag !== 'NOVIDADE').slice(0, 12),
    [products],
  );

  // ---- Estados de carregamento / falha do catálogo ----
  if (loading && !products.length) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center">
        <p className="text-sm text-gray-500 animate-pulse">Carregando a loja…</p>
      </div>
    );
  }

  if (error && !products.length) {
    return (
      <div className="min-h-screen bg-brand-cream flex items-center justify-center px-6">
        <div className="max-w-md text-center space-y-4">
          <h1 className="text-xl font-extrabold text-primary-blue">A loja não respondeu</h1>
          <p className="text-sm text-gray-500 leading-relaxed">{error}</p>
          <button
            onClick={reload}
            className="px-6 py-3 rounded-full bg-primary-blue text-white text-xs font-bold uppercase tracking-wider"
          >
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-brand-cream text-brand-text font-sans antialiased flex flex-col justify-between">
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
          onSave={setAccount}
          onLogout={async () => {
            await endSession().catch(() => undefined);
            setAccount(null);
            goHome();
          }}
          onBack={goHome}
          onSelectProduct={openProductDetail}
        />
      ) : view === 'checkout' ? (
        <CheckoutPage
          cartItems={cartItems}
          account={account}
          onBack={() => setView('home')}
          onClearCart={handleClearCart}
          onProfileSaved={setAccount}
        />
      ) : view === 'detail' && selectedProduct ? (
        <ProductDetailPage
          product={selectedProduct}
          products={products}
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
          <Hero onOpenProducts={() => selectCategory('all')} onSelectCategory={selectCategory} />
          <TrustBar />
          <CategoryFilter
            activeCategory={activeCategory}
            setActiveCategory={(cat) => selectCategory(cat)}
          />
          <ProductRail
            eyebrow="Favoritos da casa"
            title="Mais vendidos"
            products={bestSellers}
            onSelectProduct={openProductDetail}
            onAddToCart={handleAddToCart}
            onViewAll={() => selectCategory('all')}
          />
          <ProductRail
            alt
            eyebrow="Aproveite"
            title="Ofertas da semana"
            products={onSale}
            onSelectProduct={openProductDetail}
            onAddToCart={handleAddToCart}
            onViewAll={() => selectCategory('destaques')}
          />
          <PromoBanner onOpenProducts={() => selectCategory('all')} />
          <ProductRail
            eyebrow="Acabou de chegar"
            title="Novidades"
            products={newArrivals}
            onSelectProduct={openProductDetail}
            onAddToCart={handleAddToCart}
            onViewAll={() => selectCategory('novidades')}
          />
          <ValueProps />
        </>
      )}

      <Footer
        onOpenStory={() => setIsStoryOpen(true)}
        onOpenCertifications={() => setIsCertificationsOpen(true)}
      />

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
        {isStoryOpen && <StoryModal onClose={() => setIsStoryOpen(false)} />}
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
            onSuccess={(acc) => {
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
