/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Save, RotateCcw, CheckCircle2 } from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { Card, Btn, Field, inputCls } from '../ui';

export default function SettingsAdmin() {
  const { state, updateSettings, reset } = useAdmin();
  const [form, setForm] = useState(state.settings);
  const [saved, setSaved] = useState(false);

  const set = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); setSaved(false); };

  const handleSave = () => {
    updateSettings(form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <Card className="p-6 space-y-4">
        <h2 className="font-bold text-gray-800">Dados da loja</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Nome da loja">
            <input value={form.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
          </Field>
          <Field label="E-mail de contato">
            <input value={form.email} onChange={(e) => set({ email: e.target.value })} className={inputCls} />
          </Field>
          <Field label="Telefone">
            <input value={form.phone} onChange={(e) => set({ phone: e.target.value })} className={inputCls} />
          </Field>
          <Field label="WhatsApp (com DDI/DDD)">
            <input value={form.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} placeholder="5511999999999" className={inputCls} />
          </Field>
        </div>
      </Card>

      <Card className="p-6 space-y-4">
        <h2 className="font-bold text-gray-800">Frete & Pagamento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Frete grátis acima de (R$)">
            <input type="number" step="0.01" value={form.freeShippingThreshold}
              onChange={(e) => set({ freeShippingThreshold: parseFloat(e.target.value) || 0 })} className={inputCls} />
          </Field>
          <Field label="Frete padrão (R$)">
            <input type="number" step="0.01" value={form.flatShipping}
              onChange={(e) => set({ flatShipping: parseFloat(e.target.value) || 0 })} className={inputCls} />
          </Field>
          <Field label="Desconto no Pix (%)">
            <input type="number" step="1" value={form.pixDiscountPct}
              onChange={(e) => set({ pixDiscountPct: parseFloat(e.target.value) || 0 })} className={inputCls} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-4 pt-1">
          {(['card', 'pix', 'boleto'] as const).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.payments[m]}
                onChange={(e) => set({ payments: { ...form.payments, [m]: e.target.checked } })}
                className="accent-primary-blue w-4 h-4"
              />
              {m === 'card' ? 'Cartão de crédito' : m === 'pix' ? 'Pix' : 'Boleto'}
            </label>
          ))}
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Btn variant="ghost" onClick={() => { if (confirm('Restaurar dados de demonstração? Isso recria pedidos/cupons de exemplo.')) reset(); }}>
          <RotateCcw size={15} /> Restaurar demo
        </Btn>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-emerald-600 font-medium inline-flex items-center gap-1"><CheckCircle2 size={14} /> Salvo!</span>}
          <Btn onClick={handleSave}><Save size={15} /> Salvar alterações</Btn>
        </div>
      </div>
    </div>
  );
}
