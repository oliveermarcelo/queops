/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import { Plus, Search, Pencil, Trash2, X, ImagePlus, Upload } from 'lucide-react';
import { MenuCategory, Product } from '../../types';
import { useAdmin } from '../AdminContext';
import { brl, Card, Btn, ConfirmDialog, Field, inputCls } from '../ui';
import { safeImageSrc } from '../../utils/safeUrl';

const blank = (): Product => ({
  id: '',
  name: '',
  category: 'piramides',
  categoryLabel: 'Pirâmides',
  description: '',
  price: 0,
  stock: 0,
  image: '',
  weight: 0,
  weightLabel: '',
  sku: '',
});

export default function ProductsAdmin() {
  const { state, upsertProduct, deleteProduct } = useAdmin();
  const [confirming, setConfirming] = useState<Product | null>(null);
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Product | null>(null);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return state.products.filter(
      (p) => p.name.toLowerCase().includes(q) || p.categoryLabel.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q)
    );
  }, [state.products, query]);

  const save = (p: Product) => {
    const toSave: Product = {
      ...p,
      id: p.id || p.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || `prod-${Date.now()}`,
    };
    upsertProduct(toSave);
    setEditing(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nome, categoria ou SKU"
            className={`${inputCls} pl-9`}
          />
        </div>
        <Btn onClick={() => setEditing(blank())}><Plus size={16} /> Novo produto</Btn>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
                <th className="py-3 px-4 font-semibold">Produto</th>
                <th className="py-3 px-4 font-semibold">Categoria</th>
                <th className="py-3 px-4 font-semibold text-center">Estoque</th>
                <th className="py-3 px-4 font-semibold text-right">Preço</th>
                <th className="py-3 px-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden flex-shrink-0">
                        {p.image
                          // lazy: a listagem tem dezenas de miniaturas remotas; carregar
                          // apenas as visíveis faz a tabela aparecer preenchida de imediato.
                          ? <img src={safeImageSrc(p.image)} alt="" loading="lazy" decoding="async" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
                          : <span className="text-[9px] text-gray-300">s/ img</span>}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-800 truncate max-w-[260px]">{p.name}</p>
                        <p className="text-[11px] text-gray-400 font-mono">{p.sku || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-gray-600">{p.categoryLabel}</td>
                  <td className="py-2.5 px-4 text-center">
                    {(() => {
                      const s = p.stock ?? 0;
                      const cls = s === 0 ? 'bg-red-100 text-red-600' : s <= 5 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700';
                      return <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${cls}`}>{s} un.</span>;
                    })()}
                  </td>
                  <td className="py-2.5 px-4 text-right font-semibold">{brl(p.price)}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setEditing(p)} className="p-2 text-gray-400 hover:text-primary-blue rounded-lg hover:bg-gray-100" title="Editar">
                        <Pencil size={15} />
                      </button>
                      <button
                        onClick={() => setConfirming(p)}
                        className="p-2 text-gray-400 hover:text-brand-red rounded-lg hover:bg-gray-100" title="Excluir"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={5} className="py-10 text-center text-gray-400 text-sm">Nenhum produto encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {editing && (
        <ProductEditor
          initial={editing}
          menu={state.menu}
          onCancel={() => setEditing(null)}
          onSave={save}
        />
      )}

      {confirming && (
        <ConfirmDialog
          title="Excluir produto"
          message={`“${confirming.name}” sai da vitrine. Os pedidos já feitos continuam mostrando o item normalmente.`}
          confirmLabel="Excluir"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            void deleteProduct(confirming.id);
            setConfirming(null);
          }}
        />
      )}
    </div>
  );
}

function ProductEditor({ initial, menu, onCancel, onSave }: {
  initial: Product; menu: MenuCategory[]; onCancel: () => void; onSave: (p: Product) => void;
}) {
  const [p, setP] = useState<Product>(initial);
  const set = (patch: Partial<Product>) => setP((cur) => ({ ...cur, ...patch }));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-bold text-gray-800">{initial.id ? 'Editar produto' : 'Novo produto'}</h3>
          <button onClick={onCancel} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"><X size={18} /></button>
        </div>
        <form
          onSubmit={(e) => { e.preventDefault(); onSave(p); }}
          className="p-6 space-y-4"
        >
          <Field label="Nome">
            <input required value={p.name} onChange={(e) => set({ name: e.target.value })} className={inputCls} />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Categoria">
              <select
                value={p.category}
                onChange={(e) => {
                  const cat = menu.find((c) => c.id === e.target.value);
                  set({ category: e.target.value, categoryLabel: cat?.name ?? e.target.value });
                }}
                className={inputCls}
              >
                {/* 'Destaques' é uma vitrine, não uma categoria de catálogo: fica de fora. */}
                {menu.filter((c) => c.subcategories.length > 0).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="SKU">
              <input value={p.sku} onChange={(e) => set({ sku: e.target.value })} className={inputCls} />
            </Field>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Field label="Preço (R$)">
              <input type="number" step="0.01" min="0" required value={p.price}
                onChange={(e) => set({ price: parseFloat(e.target.value) || 0 })} className={inputCls} />
            </Field>
            <Field label="Preço antigo">
              <input type="number" step="0.01" min="0" value={p.oldPrice ?? ''}
                onChange={(e) => set({ oldPrice: e.target.value ? parseFloat(e.target.value) : undefined })} className={inputCls} />
            </Field>
            {/*
              Estoque aceita fração porque o ERP manda o saldo assim. Arredondar
              aqui faria a loja e o ERP discordarem em silêncio.
            */}
            <Field label="Estoque">
              <input type="number" step="0.001" min="0" value={p.stock ?? 0}
                onChange={(e) => set({ stock: parseFloat(e.target.value) || 0 })} className={inputCls} />
            </Field>
          </div>

          <ImageUploader value={p.image} onChange={(img) => set({ image: img })} />

          <div className="grid grid-cols-2 gap-4">
            {/*
              Peso e medida eram um campo só, de texto — e o frete tentava
              achar o peso no meio da frase. Peso vazio não dá erro: a cotação
              cai num padrão de 500 g por item, o que é silencioso e caro. Por
              isso o aviso abaixo do campo, e não só no manual.
            */}
            <Field label="Peso da peça (kg) — usado no frete">
              <input type="number" step="0.001" min="0" value={p.weight ?? 0}
                onChange={(e) => set({ weight: parseFloat(e.target.value) || 0 })} className={inputCls} />
            </Field>
            <Field label="Medida/formato (aparece na vitrine)">
              <input value={p.weightLabel ?? ''} placeholder="Base 15cm · cobre"
                onChange={(e) => set({ weightLabel: e.target.value })} className={inputCls} />
            </Field>
          </div>

          {(p.weight ?? 0) <= 0 && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 -mt-2">
              Sem peso, o frete deste produto é cotado com <b>500 g</b> por unidade — o valor sai
              errado sem dar nenhum erro, e a diferença sai do seu bolso.
            </p>
          )}

          <Field label="Descrição">
            <textarea value={p.description} onChange={(e) => set({ description: e.target.value })} rows={3} className={inputCls} />
          </Field>

          <div className="flex justify-end gap-2 pt-2">
            <Btn variant="ghost" onClick={onCancel}>Cancelar</Btn>
            <Btn type="submit">Salvar</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

function ImageUploader({ value, onChange }: { value: string; onChange: (img: string) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');

  const handleFile = (file?: File) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { setError('Selecione um arquivo de imagem.'); return; }
    if (file.size > 2 * 1024 * 1024) { setError('Imagem muito grande (máx. 2MB).'); return; }
    setError('');
    const reader = new FileReader();
    reader.onload = () => onChange(reader.result as string); // dataURL
    reader.readAsDataURL(file);
  };

  return (
    <Field label="Imagem do produto">
      <div className="flex items-start gap-4">
        {/* Preview / dropzone */}
        <div
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files?.[0]); }}
          className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 hover:border-primary-blue bg-gray-50 flex items-center justify-center overflow-hidden cursor-pointer flex-shrink-0 transition-colors group"
          title="Clique ou arraste uma imagem"
        >
          {value ? (
            <img src={safeImageSrc(value)} alt="" className="max-w-full max-h-full object-contain" referrerPolicy="no-referrer" />
          ) : (
            <ImagePlus size={26} className="text-gray-300 group-hover:text-primary-blue" />
          )}
        </div>

        <div className="flex-1 space-y-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => handleFile(e.target.files?.[0] ?? undefined)}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary-blue/5 text-primary-blue text-xs font-bold hover:bg-primary-blue/10 transition-colors"
          >
            <Upload size={14} /> Enviar imagem
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange('')}
              className="ml-2 text-xs font-bold text-gray-400 hover:text-brand-red"
            >
              Remover
            </button>
          )}
          <input
            value={value.startsWith('data:') ? '' : value}
            onChange={(e) => {
              const v = e.target.value.trim();
              // Reject unsafe schemes (javascript:, data:text/html, etc.) before
              // they can be saved to state/localStorage and later rendered.
              if (v && !safeImageSrc(v)) {
                setError('URL de imagem inválida ou não permitida (use http(s)).');
                return;
              }
              setError('');
              onChange(v);
            }}
            placeholder="ou cole uma URL: https://..."
            className={`${inputCls} text-xs`}
          />
          {error && <p className="text-[11px] text-brand-red font-medium">{error}</p>}
          <p className="text-[11px] text-gray-400">PNG, JPG ou WEBP · até 2MB</p>
        </div>
      </div>
    </Field>
  );
}
