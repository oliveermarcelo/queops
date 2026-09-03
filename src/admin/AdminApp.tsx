/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard, Package, ShoppingCart, Users, Ticket,
  Plug, Settings, LogOut, Menu, Store, ShoppingBag, Truck, UserCog, FolderTree,
} from 'lucide-react';
import { AdminProvider } from './AdminContext';
import { AdminUser, currentUser, logout } from './auth';
import LoginScreen from './LoginScreen';
import logoWhite from '../assets/logo-white.svg';
import Dashboard from './modules/Dashboard';
import ProductsAdmin from './modules/ProductsAdmin';
import OrdersAdmin from './modules/OrdersAdmin';
import CustomersAdmin from './modules/CustomersAdmin';
import CouponsAdmin from './modules/CouponsAdmin';
import IntegrationsAdmin from './modules/IntegrationsAdmin';
import SettingsAdmin from './modules/SettingsAdmin';
import AbandonedCartsAdmin from './modules/AbandonedCartsAdmin';
import ShippingAdmin from './modules/ShippingAdmin';
import UsersAdmin from './modules/UsersAdmin';
import CategoriesAdmin from './modules/CategoriesAdmin';

type ModuleId =
  | 'dashboard' | 'products' | 'orders' | 'abandoned' | 'customers'
  | 'coupons' | 'shipping' | 'integrations' | 'categories' | 'users' | 'settings';

const NAV: { id: ModuleId; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'products', label: 'Produtos', icon: Package },
  { id: 'orders', label: 'Pedidos', icon: ShoppingCart },
  { id: 'abandoned', label: 'Carrinhos Abandonados', icon: ShoppingBag },
  { id: 'customers', label: 'Clientes', icon: Users },
  { id: 'coupons', label: 'Cupons & Promoções', icon: Ticket },
  { id: 'shipping', label: 'Frete & Entrega', icon: Truck },
  { id: 'integrations', label: 'Integrações', icon: Plug },
  { id: 'categories', label: 'Categorias do ERP', icon: FolderTree },
  { id: 'users', label: 'Usuários do Painel', icon: UserCog },
  { id: 'settings', label: 'Configurações', icon: Settings },
];

export default function AdminApp() {
  // A sessão vive num cookie httpOnly: só o servidor sabe se ela é válida.
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checking, setChecking] = useState(true);
  const [active, setActive] = useState<ModuleId>('dashboard');
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    currentUser()
      .then((u) => alive && setUser(u))
      .catch(() => alive && setUser(null))
      .finally(() => alive && setChecking(false));
    return () => {
      alive = false;
    };
  }, []);

  if (checking) {
    return (
      <div className="min-h-screen bg-primary-blue flex items-center justify-center">
        <p className="text-white/70 text-sm tracking-wide">Verificando a sua sessão…</p>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen onSuccess={setUser} />;
  }

  const renderModule = () => {
    switch (active) {
      case 'dashboard': return <Dashboard goTo={setActive} />;
      case 'products': return <ProductsAdmin />;
      case 'orders': return <OrdersAdmin />;
      case 'abandoned': return <AbandonedCartsAdmin />;
      case 'customers': return <CustomersAdmin />;
      case 'coupons': return <CouponsAdmin />;
      case 'shipping': return <ShippingAdmin />;
      case 'integrations': return <IntegrationsAdmin />;
      case 'categories': return <CategoriesAdmin />;
      case 'users': return <UsersAdmin />;
      case 'settings': return <SettingsAdmin />;
    }
  };

  const activeLabel = NAV.find((n) => n.id === active)?.label ?? '';

  const SidebarContent = (
    <>
      <div className="flex items-center gap-3 px-5 h-20 border-b border-white/10">
        <img src={logoWhite} alt="Quéops Pirâmides" className="h-12 w-auto" />
        <span className="text-white/50 text-[10px] uppercase tracking-widest border-l border-white/15 pl-3">
          Admin
        </span>
      </div>
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {NAV.map((item) => {
          const Icon = item.icon;
          const isActive = active === item.id;
          return (
            <button
              key={item.id}
              onClick={() => { setActive(item.id); setMobileOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>
      <div className="p-3 border-t border-white/10 space-y-2">
        <a
          href="/"
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-white/10 hover:text-white transition-colors"
        >
          <Store size={18} /> Ver a loja
        </a>
        <button
          onClick={() => { void logout().finally(() => setUser(null)); }}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-white/70 hover:bg-brand-red/80 hover:text-white transition-colors"
        >
          <LogOut size={18} /> Sair
        </button>
      </div>
    </>
  );

  return (
    <AdminProvider>
      <div className="min-h-screen bg-gray-50 font-sans text-gray-800 flex">
        {/* Sidebar (desktop) */}
        <aside className="hidden lg:flex flex-col w-64 bg-primary-blue fixed inset-y-0 left-0 z-30">
          {SidebarContent}
        </aside>

        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
            <aside className="relative flex flex-col w-64 bg-primary-blue">{SidebarContent}</aside>
          </div>
        )}

        {/* Main area */}
        <div className="flex-1 lg:ml-64 flex flex-col min-w-0">
          {/* Topbar */}
          <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 sm:px-6 sticky top-0 z-20">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setMobileOpen(true)}
                className="lg:hidden p-2 -ml-2 text-gray-500 hover:text-primary-blue"
              >
                <Menu size={22} />
              </button>
              <h1 className="text-lg font-bold text-gray-800">{activeLabel}</h1>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block leading-tight">
                <p className="text-xs text-gray-400">Conectado como</p>
                <p className="text-xs font-bold text-gray-700">{user.email}</p>
              </div>
              <div className="w-9 h-9 rounded-full bg-primary-blue text-white flex items-center justify-center font-bold text-sm">
                {user.name.charAt(0).toUpperCase()}
              </div>
            </div>
          </header>

          <main className="flex-1 p-4 sm:p-6 max-w-[1400px] w-full mx-auto">
            {renderModule()}
          </main>
        </div>
      </div>
    </AdminProvider>
  );
}
