/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Package, User, MapPin, Heart, LogOut, ArrowLeft, Check, X, Plus,
  Pencil, Trash2, ChevronRight,
} from 'lucide-react';
import { CustomerAccount, CustomerAddress } from '../account/session';
import { Product } from '../types';
import { PRODUCTS } from '../data';
import { safeImageSrc } from '../utils/safeUrl';

type Tab = 'orders' | 'profile' | 'addresses' | 'favorites';

interface AccountPageProps {
  account: CustomerAccount;
  onSave: (acc: CustomerAccount) => void;
  onLogout: () => void;
  onBack: () => void;
  onSelectProduct: (p: Product) => void;
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

const ORDER_STATUS: Record<string, { label: string; cls: string }> = {
  processing: { label: 'Em preparação', cls: 'bg-amber-100 text-amber-700' },
  shipped: { label: 'Enviado', cls: 'bg-blue-100 text-blue-700' },
  delivered: { label: 'Entregue', cls: 'bg-emerald-100 text-emerald-700' },
  canceled: { label: 'Cancelado', cls: 'bg-gray-200 text-gray-500' },
};

const inputCls = 'w-full text-sm border border-gray-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue transition';

export default function AccountPage({ account, onSave, onLogout, onBack, onSelectProduct }: AccountPageProps) {
  const [tab, setTab] = useState<Tab>('orders');

  const TABS: { id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
    { id: 'orders', label: 'Meus pedidos', icon: Package },
    { id: 'profile', label: 'Meus dados', icon: User },
    { id: 'addresses', label: 'Endereços', icon: MapPin },
    { id: 'favorites', label: 'Favoritos', icon: Heart },
  ];

  return (
    <div className="pt-40 lg:pt-44 pb-20 bg-[#fcf9f8] min-h-screen">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">

        <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-gray-600 hover:text-primary-blue transition-colors group mb-6">
          <ArrowLeft className="w-4 h-4 transform group-hover:-translate-x-1 transition-transform" />
          Voltar à loja
        </button>

        {/* Greeting */}
        <div className="flex items-center gap-4 mb-8">
          <div className="w-14 h-14 rounded-full bg-primary-blue text-white flex items-center justify-center text-xl font-extrabold">
            {account.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="text-sm text-gray-400">Bem-vindo(a),</p>
            <h1 className="text-2xl font-extrabold text-gray-900 leading-tight">{account.name}</h1>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Sidebar nav */}
          <aside className="lg:col-span-3">
            <nav className="bg-white rounded-2xl border border-gray-100 shadow-sm p-2 lg:sticky lg:top-44">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setTab(t.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-colors ${
                      active ? 'bg-primary-blue text-white' : 'text-gray-600 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={18} /> {t.label}
                  </button>
                );
              })}
              <button
                onClick={onLogout}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-gray-500 hover:bg-red-50 hover:text-brand-red transition-colors border-t border-gray-100 mt-1 pt-3"
              >
                <LogOut size={18} /> Sair
              </button>
            </nav>
          </aside>

          {/* Content */}
          <div className="lg:col-span-9">
            {tab === 'orders' && <OrdersTab account={account} />}
            {tab === 'profile' && <ProfileTab account={account} onSave={onSave} />}
            {tab === 'addresses' && <AddressesTab account={account} onSave={onSave} />}
            {tab === 'favorites' && <FavoritesTab account={account} onSave={onSave} onSelectProduct={onSelectProduct} />}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Orders ---------- */
function OrdersTab({ account }: { account: CustomerAccount }) {
  if (account.orders.length === 0) {
    return <EmptyState icon={Package} title="Nenhum pedido ainda" text="Quando você fizer um pedido, ele aparece aqui." />;
  }
  return (
    <div className="space-y-4">
      {account.orders.map((o) => {
        const st = ORDER_STATUS[o.status];
        return (
          <div key={o.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 bg-gray-50/50">
              <div className="flex items-center gap-3">
                <span className="font-mono font-bold text-sm text-gray-700">{o.id}</span>
                <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${st.cls}`}>{st.label}</span>
              </div>
              <span className="text-xs text-gray-400">{fmtDate(o.date)}</span>
            </div>
            <div className="px-5 py-4 space-y-2">
              {o.items.map((it, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span className="text-gray-600">{it.quantity}× {it.name}</span>
                  <span className="font-semibold text-gray-800">{brl(it.unitPrice * it.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between pt-2 border-t border-dashed border-gray-200 text-sm">
                <span className="font-bold text-gray-900">Total</span>
                <span className="font-extrabold text-primary-blue">{brl(o.total)}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ---------- Profile ---------- */
function ProfileTab({ account, onSave }: { account: CustomerAccount; onSave: (a: CustomerAccount) => void }) {
  const [form, setForm] = useState(account);
  const [saved, setSaved] = useState(false);
  const set = (patch: Partial<CustomerAccount>) => { setForm((f) => ({ ...f, ...patch })); setSaved(false); };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 sm:p-8 max-w-2xl">
      <h2 className="text-lg font-extrabold text-gray-900 mb-6">Meus dados</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="sm:col-span-2">
          <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Nome completo</label>
          <input value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">E-mail</label>
          <input value={form.email} onChange={(e) => set({ email: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Telefone</label>
          <input value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">CPF</label>
          <input value={form.cpf} onChange={(e) => set({ cpf: e.target.value })} placeholder="000.000.000-00" className={inputCls} />
        </div>
      </div>
      <div className="flex items-center gap-3 mt-6">
        <button
          onClick={() => { onSave(form); setSaved(true); setTimeout(() => setSaved(false), 2500); }}
          className="px-7 py-3 rounded-xl bg-primary-blue hover:bg-primary-container text-white text-sm font-bold uppercase tracking-wider transition-colors"
        >
          Salvar alterações
        </button>
        {saved && <span className="text-sm text-emerald-600 font-medium inline-flex items-center gap-1"><Check size={16} /> Salvo!</span>}
      </div>
    </div>
  );
}

/* ---------- Addresses ---------- */
function AddressesTab({ account, onSave }: { account: CustomerAccount; onSave: (a: CustomerAccount) => void }) {
  const [editing, setEditing] = useState<CustomerAddress | null>(null);

  const save = (addr: CustomerAddress) => {
    const exists = account.addresses.some((a) => a.id === addr.id);
    const addresses = exists
      ? account.addresses.map((a) => (a.id === addr.id ? addr : a))
      : [...account.addresses, addr];
    onSave({ ...account, addresses });
    setEditing(null);
  };
  const remove = (id: string) => onSave({ ...account, addresses: account.addresses.filter((a) => a.id !== id) });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          onClick={() => setEditing({ id: `addr-${Date.now()}`, label: '', cep: '', street: '', number: '', neighborhood: '', city: '', state: 'SP' })}
          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-primary-blue hover:bg-primary-container text-white text-xs font-bold uppercase tracking-wider"
        >
          <Plus size={15} /> Novo endereço
        </button>
      </div>

      {account.addresses.length === 0 ? (
        <EmptyState icon={MapPin} title="Nenhum endereço" text="Cadastre um endereço para agilizar suas compras." />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {account.addresses.map((a) => (
            <div key={a.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-gray-800">{a.label || 'Endereço'}</span>
                  {a.isDefault && <span className="text-[10px] font-bold bg-primary-blue/10 text-primary-blue px-2 py-0.5 rounded-full">Padrão</span>}
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditing(a)} className="p-1.5 text-gray-400 hover:text-primary-blue rounded-lg hover:bg-gray-100"><Pencil size={14} /></button>
                  <button onClick={() => remove(a.id)} className="p-1.5 text-gray-400 hover:text-brand-red rounded-lg hover:bg-gray-100"><Trash2 size={14} /></button>
                </div>
              </div>
              <p className="text-sm text-gray-600 mt-2 leading-relaxed">
                {a.street}, {a.number}{a.complement ? ` · ${a.complement}` : ''}<br />
                {a.neighborhood} — {a.city}/{a.state}<br />
                CEP {a.cep}
              </p>
            </div>
          ))}
        </div>
      )}

      {editing && <AddressEditor initial={editing} onSave={save} onCancel={() => setEditing(null)} />}
    </div>
  );
}

function AddressEditor({ initial, onSave, onCancel }: { initial: CustomerAddress; onSave: (a: CustomerAddress) => void; onCancel: () => void }) {
  const [a, setA] = useState(initial);
  const set = (patch: Partial<CustomerAddress>) => setA((cur) => ({ ...cur, ...patch }));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{account_has(initial) ? 'Editar endereço' : 'Novo endereço'}</h3>
          <button onClick={onCancel} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-6 grid grid-cols-1 sm:grid-cols-12 gap-4">
          <div className="sm:col-span-12">
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Identificação (ex: Casa, Trabalho)</label>
            <input value={a.label} onChange={(e) => set({ label: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-4">
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">CEP</label>
            <input value={a.cep} onChange={(e) => set({ cep: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-8">
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Rua</label>
            <input value={a.street} onChange={(e) => set({ street: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-3">
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Número</label>
            <input value={a.number} onChange={(e) => set({ number: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-9">
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Complemento</label>
            <input value={a.complement ?? ''} onChange={(e) => set({ complement: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-5">
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Bairro</label>
            <input value={a.neighborhood} onChange={(e) => set({ neighborhood: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-5">
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">Cidade</label>
            <input value={a.city} onChange={(e) => set({ city: e.target.value })} className={inputCls} />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-[13px] font-semibold text-gray-700 mb-1.5">UF</label>
            <input value={a.state} onChange={(e) => set({ state: e.target.value.toUpperCase().slice(0, 2) })} className={inputCls} />
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
          <button onClick={onCancel} className="px-5 py-2.5 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-100">Cancelar</button>
          <button onClick={() => onSave(a)} className="px-6 py-2.5 rounded-lg bg-primary-blue hover:bg-primary-container text-white text-sm font-bold">Salvar</button>
        </div>
      </div>
    </div>
  );
}
function account_has(a: CustomerAddress) { return !!a.street; }

/* ---------- Favorites ---------- */
function FavoritesTab({ account, onSave, onSelectProduct }: { account: CustomerAccount; onSave: (a: CustomerAccount) => void; onSelectProduct: (p: Product) => void }) {
  const favs = PRODUCTS.filter((p) => account.favorites.includes(p.id));
  const removeFav = (id: string) => onSave({ ...account, favorites: account.favorites.filter((f) => f !== id) });

  if (favs.length === 0) {
    return <EmptyState icon={Heart} title="Nenhum favorito ainda" text="Toque no coração de um produto para salvá-lo aqui." />;
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {favs.map((p) => (
        <div key={p.id} className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex items-center gap-4">
          <div className="w-16 h-16 bg-gray-50 rounded-xl border border-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
            <img src={safeImageSrc(p.image)} alt={p.name} className="max-h-full max-w-full object-contain p-1" referrerPolicy="no-referrer" />
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-bold text-gray-800 truncate">{p.name}</h4>
            <p className="text-primary-blue font-extrabold">{brl(p.price)}</p>
          </div>
          <button onClick={() => onSelectProduct(p)} className="p-2 text-gray-400 hover:text-primary-blue" title="Ver produto"><ChevronRight size={18} /></button>
          <button onClick={() => removeFav(p.id)} className="p-2 text-gray-400 hover:text-brand-red" title="Remover"><Trash2 size={16} /></button>
        </div>
      ))}
    </div>
  );
}

/* ---------- Shared ---------- */
function EmptyState({ icon: Icon, title, text }: { icon: React.ComponentType<{ size?: number; className?: string }>; title: string; text: string }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-50 flex items-center justify-center mx-auto mb-3 text-gray-300">
        <Icon size={26} />
      </div>
      <h3 className="font-bold text-gray-700">{title}</h3>
      <p className="text-sm text-gray-400 mt-1 max-w-xs mx-auto">{text}</p>
    </div>
  );
}
