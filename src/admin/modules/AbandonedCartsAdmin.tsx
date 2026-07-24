/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  ShoppingCart, Clock, MessageCircle, Check, X, Settings2,
  TrendingDown, DollarSign, RotateCcw, Trash2, Mail, Send, Loader2, CheckCircle2,
} from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { AbandonedCart, AbandonedStatus } from '../types';
import { brl, Card, Btn, inputCls } from '../ui';
import { openExternal } from '../../utils/safeUrl';

const FILTERS: { id: AbandonedStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'open', label: 'Em aberto' },
  { id: 'recovered', label: 'Recuperados' },
  { id: 'discarded', label: 'Descartados' },
];

function timeAgo(iso: string): string {
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `há ${mins} min`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `há ${hrs}h`;
  const days = Math.floor(hrs / 24);
  return `há ${days}d`;
}

function statusBadge(status: AbandonedStatus) {
  const map = {
    open: { c: 'bg-amber-100 text-amber-700', l: 'Em aberto' },
    recovered: { c: 'bg-emerald-100 text-emerald-700', l: 'Recuperado' },
    discarded: { c: 'bg-gray-200 text-gray-500', l: 'Descartado' },
  }[status];
  return <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold ${map.c}`}>{map.l}</span>;
}

export default function AbandonedCartsAdmin() {
  const { state, setCartStatus, markReminderSent, updateRecovery } = useAdmin();
  const { abandonedCarts: carts, recovery } = state;

  const [filter, setFilter] = useState<AbandonedStatus | 'all'>('all');
  const [selected, setSelected] = useState<AbandonedCart | null>(null);
  const [emailCart, setEmailCart] = useState<AbandonedCart | null>(null);
  const [showConfig, setShowConfig] = useState(false);

  const list = useMemo(
    () => carts
      .filter((c) => (filter === 'all' ? true : c.status === filter))
      .sort((a, b) => +new Date(b.abandonedAt) - +new Date(a.abandonedAt)),
    [carts, filter]
  );

  // KPIs
  const open = carts.filter((c) => c.status === 'open');
  const lostValue = open.reduce((s, c) => s + c.total, 0);
  const recovered = carts.filter((c) => c.status === 'recovered').length;
  const recoveryRate = carts.length ? Math.round((recovered / carts.length) * 100) : 0;

  const buildMessage = (cart: AbandonedCart) =>
    recovery.message
      .replace('{nome}', cart.customerName.split(' ')[0])
      .replace('{valor}', brl(cart.total))
      .replace('{cupom}', recovery.couponCode);

  const handleWhatsApp = (cart: AbandonedCart) => {
    const text = encodeURIComponent(buildMessage(cart));
    const phone = cart.customerPhone.replace(/\D/g, '');
    openExternal(`https://wa.me/${phone}?text=${text}`);
    markReminderSent(cart.id);
  };

  // Opens the in-admin email composer (no external mail app).
  const handleEmail = (cart: AbandonedCart) => {
    setSelected(null);
    setEmailCart(cart);
  };

  const kpis = [
    { label: 'Carrinhos em aberto', value: String(open.length), icon: ShoppingCart, color: 'text-amber-600 bg-amber-50' },
    { label: 'Valor a recuperar', value: brl(lostValue), icon: DollarSign, color: 'text-brand-red bg-red-50' },
    { label: 'Recuperados', value: String(recovered), icon: RotateCcw, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Taxa de recuperação', value: `${recoveryRate}%`, icon: TrendingDown, color: 'text-primary-blue bg-blue-50' },
  ];

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <Card key={k.label} className="p-5">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${k.color}`}>
                <Icon size={20} />
              </div>
              <p className="text-2xl font-extrabold text-gray-900">{k.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
            </Card>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                filter === f.id ? 'bg-primary-blue text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <Btn variant="ghost" onClick={() => setShowConfig(true)}>
          <Settings2 size={15} /> Recuperação automática
        </Btn>
      </div>

      {/* List */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
                <th className="py-3 px-4 font-semibold">Cliente</th>
                <th className="py-3 px-4 font-semibold">Itens</th>
                <th className="py-3 px-4 font-semibold">Abandonado</th>
                <th className="py-3 px-4 font-semibold text-right">Valor</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {list.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-3 px-4">
                    <button onClick={() => setSelected(c)} className="text-left">
                      <p className="font-semibold text-gray-800 hover:text-primary-blue">{c.customerName}</p>
                      <p className="text-[11px] text-gray-400">{c.customerPhone}</p>
                    </button>
                  </td>
                  <td className="py-3 px-4 text-gray-600">{c.items.length} item(ns)</td>
                  <td className="py-3 px-4">
                    <span className="inline-flex items-center gap-1 text-xs text-gray-500">
                      <Clock size={12} /> {timeAgo(c.abandonedAt)}
                    </span>
                    {c.remindersSent > 0 && (
                      <span className="ml-2 text-[10px] bg-blue-50 text-primary-blue px-1.5 py-0.5 rounded-full font-bold">
                        {c.remindersSent}x lembrete
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-gray-800">{brl(c.total)}</td>
                  <td className="py-3 px-4">{statusBadge(c.status)}</td>
                  <td className="py-3 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => handleWhatsApp(c)}
                        title="Recuperar via WhatsApp"
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#25D366] hover:bg-[#1ebd5d] text-white transition-colors"
                      >
                        <MessageCircle size={16} />
                      </button>
                      <button
                        onClick={() => handleEmail(c)}
                        title="Recuperar por e-mail"
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary-blue hover:bg-primary-container text-white transition-colors"
                      >
                        <Mail size={16} />
                      </button>
                      <button onClick={() => setSelected(c)} className="p-2 text-gray-400 hover:text-primary-blue rounded-lg hover:bg-gray-100" title="Detalhes">
                        <ShoppingCart size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">Nenhum carrinho neste filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Detail drawer */}
      {selected && (
        <CartDetail
          cart={selected}
          message={buildMessage(selected)}
          onClose={() => setSelected(null)}
          onWhatsApp={() => handleWhatsApp(selected)}
          onEmail={() => handleEmail(selected)}
          onStatus={(st) => { setCartStatus(selected.id, st); setSelected(null); }}
        />
      )}

      {/* In-admin email composer */}
      {emailCart && (
        <EmailComposer
          cart={emailCart}
          subject="Você esqueceu itens na sua sacola — Quéops Pirâmides"
          body={buildMessage(emailCart)}
          onClose={() => setEmailCart(null)}
          onSent={() => { markReminderSent(emailCart.id); setEmailCart(null); }}
        />
      )}

      {/* Recovery config modal */}
      {showConfig && (
        <RecoveryConfigModal
          recovery={recovery}
          coupons={state.coupons.map((c) => c.code)}
          onClose={() => setShowConfig(false)}
          onSave={(patch) => { updateRecovery(patch); setShowConfig(false); }}
        />
      )}

      <p className="text-[11px] text-gray-400">
        Demonstração com dados de exemplo. O envio automático no tempo configurado exige um backend
        com agendador — aqui o envio é manual (abre o WhatsApp com a mensagem já pronta).
      </p>
    </div>
  );
}

function CartDetail({ cart, message, onClose, onWhatsApp, onEmail, onStatus }: {
  cart: AbandonedCart;
  message: string;
  onClose: () => void;
  onWhatsApp: () => void;
  onEmail: () => void;
  onStatus: (s: AbandonedStatus) => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white w-full max-w-md h-full shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-gray-900">{cart.customerName}</h3>
            <p className="text-xs text-gray-400">{cart.customerPhone} · {cart.customerEmail}</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div className="flex items-center justify-between">
            {statusBadge(cart.status)}
            <span className="inline-flex items-center gap-1 text-xs text-gray-500"><Clock size={12} /> {timeAgo(cart.abandonedAt)}</span>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Itens da sacola</p>
            <div className="space-y-2">
              {cart.items.map((it) => (
                <div key={it.productId} className="flex justify-between text-sm bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-gray-700">{it.quantity}× {it.name}</span>
                  <span className="font-semibold text-gray-800">{brl(it.unitPrice * it.quantity)}</span>
                </div>
              ))}
              <div className="flex justify-between text-base font-extrabold text-gray-900 pt-2 border-t border-dashed border-gray-200">
                <span>Total</span><span className="text-primary-blue">{brl(cart.total)}</span>
              </div>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Mensagem de recuperação</p>
            <div className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-sm text-gray-700 leading-relaxed">
              {message}
            </div>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onWhatsApp}
              className="py-3 rounded-xl bg-[#25D366] hover:bg-[#1ebd5d] text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <MessageCircle size={16} /> WhatsApp
            </button>
            <button
              onClick={onEmail}
              className="py-3 rounded-xl bg-primary-blue hover:bg-primary-container text-white text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2"
            >
              <Mail size={16} /> E-mail
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onStatus('recovered')}
              className="py-2.5 rounded-xl border border-emerald-200 text-emerald-700 text-xs font-bold hover:bg-emerald-50 flex items-center justify-center gap-1.5"
            >
              <Check size={14} /> Recuperado
            </button>
            <button
              onClick={() => onStatus('discarded')}
              className="py-2.5 rounded-xl border border-gray-200 text-gray-500 text-xs font-bold hover:bg-gray-50 flex items-center justify-center gap-1.5"
            >
              <Trash2 size={14} /> Descartar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EmailComposer({ cart, subject, body, onClose, onSent }: {
  cart: AbandonedCart;
  subject: string;
  body: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const [subj, setSubj] = useState(subject);
  const [text, setText] = useState(body);
  const [phase, setPhase] = useState<'edit' | 'sending' | 'sent'>('edit');

  const send = () => {
    setPhase('sending');
    // Demo: simulate the backend send. In production this calls the email API.
    setTimeout(() => {
      setPhase('sent');
      setTimeout(onSent, 1400);
    }, 1300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={phase === 'sending' ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary-blue/10 text-primary-blue flex items-center justify-center">
              <Mail size={18} />
            </div>
            <h3 className="font-bold text-gray-800">Enviar e-mail de recuperação</h3>
          </div>
          {phase !== 'sending' && (
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"><X size={18} /></button>
          )}
        </div>

        {phase === 'sent' ? (
          <div className="p-10 text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-600 mb-4 ring-8 ring-emerald-50/50">
              <CheckCircle2 size={36} />
            </div>
            <p className="font-bold text-gray-900">E-mail enviado!</p>
            <p className="text-sm text-gray-500 mt-1">A mensagem foi enviada para {cart.customerEmail}.</p>
          </div>
        ) : (
          <>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Para</label>
                <input
                  value={cart.customerEmail}
                  disabled
                  className={`${inputCls} bg-gray-50 text-gray-500`}
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Assunto</label>
                <input value={subj} onChange={(e) => setSubj(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Mensagem</label>
                <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className={inputCls} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <Btn variant="ghost" onClick={onClose} disabled={phase === 'sending'}>Cancelar</Btn>
              <button
                onClick={send}
                disabled={phase === 'sending'}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary-blue hover:bg-primary-container text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-60"
              >
                {phase === 'sending' ? <><Loader2 size={15} className="animate-spin" /> Enviando...</> : <><Send size={15} /> Enviar e-mail</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RecoveryConfigModal({ recovery, coupons, onClose, onSave }: {
  recovery: import('../types').RecoveryConfig;
  coupons: string[];
  onClose: () => void;
  onSave: (patch: Partial<import('../types').RecoveryConfig>) => void;
}) {
  const [form, setForm] = useState(recovery);
  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-gray-800">Recuperação automática</h3>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-5">
          <label className="flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">Ativar recuperação automática</span>
            <input type="checkbox" checked={form.enabled} onChange={(e) => set({ enabled: e.target.checked })} className="accent-primary-blue w-5 h-5" />
          </label>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Enviar após (minutos)</label>
              <input type="number" min={5} value={form.delayMinutes} onChange={(e) => set({ delayMinutes: parseInt(e.target.value) || 0 })} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Cupom oferecido</label>
              <input list="coupon-codes" value={form.couponCode} onChange={(e) => set({ couponCode: e.target.value.toUpperCase() })} className={`${inputCls} font-mono uppercase`} />
              <datalist id="coupon-codes">
                {coupons.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Mensagem</label>
            <textarea value={form.message} onChange={(e) => set({ message: e.target.value })} rows={4} className={inputCls} />
            <p className="text-[11px] text-gray-400 mt-1">
              Variáveis: <code className="text-primary-blue">{'{nome}'}</code>, <code className="text-primary-blue">{'{valor}'}</code>, <code className="text-primary-blue">{'{cupom}'}</code>
            </p>
          </div>

          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-[11px] text-amber-700 leading-relaxed">
            O disparo automático no tempo definido requer um backend com agendador. Nesta demonstração,
            a configuração é salva e o envio é feito manualmente pelo botão WhatsApp de cada carrinho.
          </div>

          <div className="flex justify-end gap-2">
            <Btn variant="ghost" onClick={onClose}>Cancelar</Btn>
            <Btn onClick={() => onSave(form)}>Salvar</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
