/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Plus, Trash2, X, Ticket } from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { Coupon } from '../types';
import { brl, Card, Btn, ConfirmDialog, Field, inputCls } from '../ui';

const blank = (): Coupon => ({ id: '', code: '', type: 'percent', value: 10, active: true });

export default function CouponsAdmin() {
  const { state, upsertCoupon, deleteCoupon } = useAdmin();
  const [confirming, setConfirming] = useState<Coupon | null>(null);
  const [editing, setEditing] = useState<Coupon | null>(null);

  const save = (c: Coupon) => {
    upsertCoupon({ ...c, id: c.id || `coupon-${Date.now()}`, code: c.code.toUpperCase() });
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Btn onClick={() => setEditing(blank())}><Plus size={16} /> Novo cupom</Btn>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {state.coupons.map((c) => (
          <Card key={c.id} className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-lg bg-brand-red/10 text-brand-red flex items-center justify-center">
                  <Ticket size={18} />
                </div>
                <div>
                  <p className="font-mono font-extrabold text-gray-900">{c.code}</p>
                  <p className="text-xs text-gray-500">
                    {c.type === 'percent' ? `${c.value}% de desconto` : `${brl(c.value)} de desconto`}
                  </p>
                </div>
              </div>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${c.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
                {c.active ? 'Ativo' : 'Inativo'}
              </span>
            </div>
            {c.minOrder ? <p className="text-[11px] text-gray-400 mt-3">Pedido mínimo: {brl(c.minOrder)}</p> : null}
            <div className="flex gap-2 mt-4 pt-3 border-t border-gray-100">
              <Btn variant="ghost" className="flex-1" onClick={() => setEditing(c)}>Editar</Btn>
              <button
                onClick={() => setConfirming(c)}
                className="px-3 py-2 rounded-lg border border-gray-200 text-gray-400 hover:text-brand-red hover:border-brand-red transition-colors"
              >
                <Trash2 size={15} />
              </button>
            </div>
          </Card>
        ))}
        {state.coupons.length === 0 && (
          <p className="text-gray-400 text-sm col-span-full text-center py-8">Nenhum cupom cadastrado.</p>
        )}
      </div>

      {editing && <CouponEditor initial={editing} onCancel={() => setEditing(null)} onSave={save} />}

      {confirming && (
        <ConfirmDialog
          title="Excluir cupom"
          message={`O cupom ${confirming.code} deixa de valer imediatamente no checkout.`}
          confirmLabel="Excluir"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            void deleteCoupon(confirming.id);
            setConfirming(null);
          }}
        />
      )}
    </div>
  );
}

function CouponEditor({ initial, onCancel, onSave }: { initial: Coupon; onCancel: () => void; onSave: (c: Coupon) => void }) {
  const [c, setC] = useState<Coupon>(initial);
  const set = (patch: Partial<Coupon>) => setC((cur) => ({ ...cur, ...patch }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">{initial.id ? 'Editar cupom' : 'Novo cupom'}</h3>
          <button onClick={onCancel} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); onSave(c); }} className="p-6 space-y-4">
          <Field label="Código">
            <input required value={c.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} placeholder="BEMVINDO10" className={`${inputCls} font-mono uppercase`} />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Tipo">
              <select value={c.type} onChange={(e) => set({ type: e.target.value as Coupon['type'] })} className={inputCls}>
                <option value="percent">Percentual (%)</option>
                <option value="fixed">Valor fixo (R$)</option>
              </select>
            </Field>
            <Field label={c.type === 'percent' ? 'Desconto (%)' : 'Desconto (R$)'}>
              <input type="number" step="0.01" min="0" required value={c.value} onChange={(e) => set({ value: parseFloat(e.target.value) || 0 })} className={inputCls} />
            </Field>
          </div>
          <Field label="Pedido mínimo (R$, opcional)">
            <input type="number" step="0.01" min="0" value={c.minOrder ?? ''} onChange={(e) => set({ minOrder: e.target.value ? parseFloat(e.target.value) : undefined })} className={inputCls} />
          </Field>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={c.active} onChange={(e) => set({ active: e.target.checked })} className="accent-primary-blue w-4 h-4" />
            Cupom ativo
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
            <Btn type="submit">Salvar</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}
