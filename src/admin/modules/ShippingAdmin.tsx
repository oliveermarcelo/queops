/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Truck, Gift, MapPin, Hash, Plus, Trash2, Save, CheckCircle2, Calculator,
} from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { ShippingConfig, CepRange } from '../types';
import { brl, Card, Btn, inputCls } from '../ui';

const UFS = ['SP', 'RJ', 'MG', 'ES', 'PR', 'SC', 'RS', 'BA', 'PE', 'CE', 'GO', 'DF', 'AM', 'PA', 'MT', 'MS'];
const onlyDigits = (s: string) => s.replace(/\D/g, '');

/** Computes shipping for a given cart value, UF and CEP, following the rules. */
export function computeShipping(cfg: ShippingConfig, cartTotal: number, uf: string, cep: string): { price: number; reason: string } {
  const cleanCep = onlyDigits(cep);
  // 1) CEP ranges have top priority
  for (const r of cfg.cepRanges) {
    const from = onlyDigits(r.from), to = onlyDigits(r.to);
    if (cleanCep && from && to && cleanCep >= from && cleanCep <= to) {
      if (r.free) return { price: 0, reason: `Grátis · faixa de CEP ${r.label || `${r.from}–${r.to}`}` };
      return { price: r.price, reason: `Faixa de CEP ${r.label || `${r.from}–${r.to}`}` };
    }
  }
  // 2) Free shipping by state
  if (cfg.freeShipping.enabled && cfg.freeShipping.states.includes(uf)) {
    return { price: 0, reason: `Grátis para ${uf}` };
  }
  // 3) Free shipping by minimum order
  if (cfg.freeShipping.enabled && cfg.freeShipping.minOrder > 0 && cartTotal >= cfg.freeShipping.minOrder) {
    return { price: 0, reason: `Grátis acima de ${brl(cfg.freeShipping.minOrder)}` };
  }
  // 4) Per-state price
  if (cfg.perState[uf] != null) {
    return { price: cfg.perState[uf], reason: `Tabela ${uf}` };
  }
  // 5) Default flat rate
  return { price: cfg.defaultPrice, reason: 'Valor padrão' };
}

export default function ShippingAdmin() {
  const { state, updateShipping } = useAdmin();
  const [cfg, setCfg] = useState<ShippingConfig>(state.shipping);
  const [saved, setSaved] = useState(false);

  const patch = (p: Partial<ShippingConfig>) => { setCfg((c) => ({ ...c, ...p })); setSaved(false); };
  const setFree = (p: Partial<ShippingConfig['freeShipping']>) =>
    patch({ freeShipping: { ...cfg.freeShipping, ...p } });

  const save = () => { updateShipping(cfg); setSaved(true); setTimeout(() => setSaved(false), 2500); };

  const setStatePrice = (uf: string, val: string) => {
    const next = { ...cfg.perState };
    if (val === '') delete next[uf];
    else next[uf] = parseFloat(val) || 0;
    patch({ perState: next });
  };

  const addCepRange = () =>
    patch({ cepRanges: [...cfg.cepRanges, { id: `cr-${Date.now()}`, from: '', to: '', price: 0, label: '' }] });
  const updateCepRange = (id: string, p: Partial<CepRange>) =>
    patch({ cepRanges: cfg.cepRanges.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const removeCepRange = (id: string) =>
    patch({ cepRanges: cfg.cepRanges.filter((r) => r.id !== id) });

  const toggleFreeState = (uf: string) => {
    const has = cfg.freeShipping.states.includes(uf);
    setFree({ states: has ? cfg.freeShipping.states.filter((s) => s !== uf) : [...cfg.freeShipping.states, uf] });
  };

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 text-white p-6 sm:p-7">
        <Truck size={130} className="absolute -right-4 -bottom-6 text-white/15" />
        <div className="relative">
          <h1 className="text-2xl font-extrabold">Frete & Entrega</h1>
          <p className="text-sm text-white/80 mt-1 max-w-xl">
            Defina valores por estado e por faixa de CEP, e configure regras de frete grátis.
            A ordem de prioridade é: faixa de CEP → UF grátis → frete grátis por valor → tabela por UF → valor padrão.
          </p>
        </div>
      </div>

      {/* Free shipping */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Gift size={18} /></div>
            <h2 className="font-bold text-gray-800">Frete grátis</h2>
          </div>
          <label className="inline-flex items-center cursor-pointer">
            <input type="checkbox" checked={cfg.freeShipping.enabled} onChange={(e) => setFree({ enabled: e.target.checked })} className="sr-only peer" />
            <span className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-emerald-500 relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:shadow after:transition-transform peer-checked:after:translate-x-5" />
          </label>
        </div>

        {cfg.freeShipping.enabled && (
          <div className="space-y-5">
            <div className="max-w-xs">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Frete grátis acima de (R$)</label>
              <input type="number" step="0.01" min="0" value={cfg.freeShipping.minOrder}
                onChange={(e) => setFree({ minOrder: parseFloat(e.target.value) || 0 })} className={inputCls} />
              <p className="text-[11px] text-gray-400 mt-1">Deixe 0 para não dar grátis por valor.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-2">Frete grátis sempre nestes estados</label>
              <div className="flex flex-wrap gap-2">
                {UFS.map((uf) => {
                  const on = cfg.freeShipping.states.includes(uf);
                  return (
                    <button key={uf} onClick={() => toggleFreeState(uf)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${on ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
                      {uf}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Default + per-state table */}
      <Card className="p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="w-9 h-9 rounded-lg bg-primary-blue/10 text-primary-blue flex items-center justify-center"><MapPin size={18} /></div>
          <h2 className="font-bold text-gray-800">Valor por estado</h2>
        </div>

        <div className="max-w-xs mb-6">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Valor padrão (fallback)</label>
          <input type="number" step="0.01" min="0" value={cfg.defaultPrice}
            onChange={(e) => patch({ defaultPrice: parseFloat(e.target.value) || 0 })} className={inputCls} />
          <p className="text-[11px] text-gray-400 mt-1">Usado quando o estado não está na tabela abaixo.</p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {UFS.map((uf) => (
            <div key={uf}>
              <label className="block text-[11px] font-bold text-gray-500 mb-1">{uf}</label>
              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400">R$</span>
                <input
                  type="number" step="0.01" min="0"
                  value={cfg.perState[uf] ?? ''}
                  placeholder="padrão"
                  onChange={(e) => setStatePrice(uf, e.target.value)}
                  className="w-full text-sm border border-gray-200 rounded-lg py-2 pl-8 pr-2 focus:outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue"
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* CEP ranges */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-violet-50 text-violet-600 flex items-center justify-center"><Hash size={18} /></div>
            <h2 className="font-bold text-gray-800">Faixas de CEP</h2>
            <span className="text-xs text-gray-400">(prioridade sobre o estado)</span>
          </div>
          <Btn onClick={addCepRange}><Plus size={15} /> Nova faixa</Btn>
        </div>

        {cfg.cepRanges.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">Nenhuma faixa de CEP. O valor virá da tabela por estado.</p>
        ) : (
          <div className="space-y-3">
            {cfg.cepRanges.map((r) => (
              <div key={r.id} className="grid grid-cols-12 gap-2 items-end bg-gray-50/50 rounded-xl p-3">
                <div className="col-span-6 sm:col-span-3">
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Rótulo</label>
                  <input value={r.label ?? ''} onChange={(e) => updateCepRange(r.id, { label: e.target.value })} placeholder="Ex: Capital" className={`${inputCls} py-2 text-xs`} />
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">CEP inicial</label>
                  <input value={r.from} onChange={(e) => updateCepRange(r.id, { from: onlyDigits(e.target.value).slice(0, 8) })} placeholder="01000000" className={`${inputCls} py-2 text-xs font-mono`} />
                </div>
                <div className="col-span-6 sm:col-span-3">
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">CEP final</label>
                  <input value={r.to} onChange={(e) => updateCepRange(r.id, { to: onlyDigits(e.target.value).slice(0, 8) })} placeholder="05999999" className={`${inputCls} py-2 text-xs font-mono`} />
                </div>
                <div className="col-span-4 sm:col-span-2">
                  <label className="block text-[10px] font-bold text-gray-500 mb-1">Valor</label>
                  <input type="number" step="0.01" min="0" value={r.free ? 0 : r.price} disabled={r.free}
                    onChange={(e) => updateCepRange(r.id, { price: parseFloat(e.target.value) || 0 })}
                    className={`${inputCls} py-2 text-xs ${r.free ? 'bg-gray-100 text-gray-400' : ''}`} />
                </div>
                <div className="col-span-8 sm:col-span-1 flex items-center justify-between sm:justify-center gap-2 pb-0.5">
                  <label className="flex items-center gap-1.5 text-[11px] font-bold text-gray-600 cursor-pointer">
                    <input type="checkbox" checked={!!r.free} onChange={(e) => updateCepRange(r.id, { free: e.target.checked })} className="accent-emerald-500 w-4 h-4" />
                    Grátis
                  </label>
                  <button onClick={() => removeCepRange(r.id)} className="p-1.5 text-gray-400 hover:text-brand-red rounded-lg hover:bg-gray-100"><Trash2 size={15} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Simulator */}
      <ShippingSimulator cfg={cfg} />

      {/* Save bar */}
      <div className="flex items-center justify-end gap-3 sticky bottom-4">
        <div className="bg-white border border-gray-200 shadow-lg rounded-xl px-4 py-2.5 flex items-center gap-3">
          {saved && <span className="text-xs text-emerald-600 font-medium inline-flex items-center gap-1"><CheckCircle2 size={14} /> Salvo!</span>}
          <Btn onClick={save}><Save size={15} /> Salvar regras de frete</Btn>
        </div>
      </div>
    </div>
  );
}

function ShippingSimulator({ cfg }: { cfg: ShippingConfig }) {
  const [cep, setCep] = useState('');
  const [uf, setUf] = useState('SP');
  const [total, setTotal] = useState(150);
  const result = computeShipping(cfg, total, uf, cep);

  return (
    <Card className="p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <div className="w-9 h-9 rounded-lg bg-gray-900/5 text-gray-700 flex items-center justify-center"><Calculator size={18} /></div>
        <h2 className="font-bold text-gray-800">Simulador de frete</h2>
        <span className="text-xs text-gray-400">testa as regras (não salva nada)</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">CEP</label>
          <input value={cep} onChange={(e) => setCep(e.target.value)} placeholder="01001000" className={`${inputCls} font-mono`} />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">UF</label>
          <select value={uf} onChange={(e) => setUf(e.target.value)} className={inputCls}>
            {UFS.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Valor do carrinho (R$)</label>
          <input type="number" value={total} onChange={(e) => setTotal(parseFloat(e.target.value) || 0)} className={inputCls} />
        </div>
        <div className="bg-primary-blue/[0.04] border border-primary-blue/15 rounded-xl px-4 py-3 text-center">
          <p className="text-[11px] text-gray-500 uppercase tracking-wider">Frete</p>
          <p className={`text-xl font-extrabold ${result.price === 0 ? 'text-emerald-600' : 'text-primary-blue'}`}>
            {result.price === 0 ? 'Grátis' : brl(result.price)}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">{result.reason}</p>
        </div>
      </div>
    </Card>
  );
}
