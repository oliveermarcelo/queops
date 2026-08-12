/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { Card, Btn, Field, inputCls } from '../ui';

export default function SettingsAdmin() {
  const { state, updateSettings, error, loading } = useAdmin();
  const [form, setForm] = useState(state.settings);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // A primeira carga chega depois da montagem: sincroniza o formulário.
  useEffect(() => {
    if (!loading) setForm(state.settings);
  }, [loading, state.settings]);

  const set = (patch: Partial<typeof form>) => { setForm((f) => ({ ...f, ...patch })); setSaved(false); };

  const handleSave = async () => {
    setBusy(true);
    await updateSettings(form);
    setBusy(false);
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
        <h2 className="font-bold text-gray-800">Pagamento</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Field label="Desconto no Pix (%)">
            <input type="number" step="1" min="0" max="100" value={form.pixDiscountPct}
              onChange={(e) => set({ pixDiscountPct: parseFloat(e.target.value) || 0 })} className={inputCls} />
          </Field>
        </div>
        <p className="text-[11px] text-gray-400">
          Valores de frete ficam em <strong>Frete &amp; Entrega</strong>. Antes havia campos de frete
          também aqui, e eles não eram usados pelo checkout — duas telas diziam preços diferentes.
        </p>
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider pt-2">
          Formas de pagamento aceitas
        </p>
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

      <div className="flex items-center justify-between gap-4">
        <p className="text-[11px] text-gray-400 max-w-sm">
          Estes valores valem para a loja inteira: o checkout usa o desconto do Pix e o mínimo de
          frete grátis daqui. As regras por estado e faixa de CEP ficam em “Frete &amp; Entrega”.
        </p>
        <div className="flex items-center gap-3">
          {error && (
            <span role="alert" className="text-xs text-brand-red font-medium inline-flex items-center gap-1">
              <AlertCircle size={14} /> {error}
            </span>
          )}
          {saved && !error && (
            <span className="text-xs text-emerald-600 font-medium inline-flex items-center gap-1">
              <CheckCircle2 size={14} /> Salvo!
            </span>
          )}
          <Btn onClick={handleSave} disabled={busy}><Save size={15} /> {busy ? 'Salvando…' : 'Salvar alterações'}</Btn>
        </div>
      </div>
    </div>
  );
}
