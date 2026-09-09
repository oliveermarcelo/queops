/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useRef, useState } from 'react';
import {
  Plus, Search, Pencil, Trash2, X, ImagePlus, EyeOff, RotateCcw,
  ChevronLeft, ChevronRight, Star,
} from 'lucide-react';
import { MenuCategory, Product } from '../../types';
import { useAdmin } from '../AdminContext';
import { uploadImagem } from '../store';
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
  const [apagando, setApagando] = useState<Product | null>(null);
  /*
   * Quem está em pedido que ainda vale não pode ser apagado — a tela precisa
   * saber antes de oferecer o botão, para não prometer o que a rota vai
   * recusar. Pedido cancelado não conta, então cancelar libera.
   */
  const presos = useMemo(
    () => new Set(state.productsWithActiveOrders),
    [state.productsWithActiveOrders],
  );
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
                <tr
                  key={p.id}
                  className={`border-b border-gray-50 hover:bg-gray-50/50 ${
                    p.active === false ? 'bg-gray-50/60' : ''
                  }`}
                >
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
                        <div className="flex items-center gap-2">
                          <p className={`font-semibold truncate max-w-[260px] ${
                            p.active === false ? 'text-gray-400' : 'text-gray-800'
                          }`}>
                            {p.name}
                          </p>
                          {/*
                            Sem este selo, "excluir" parecia não fazer nada: o
                            produto saía da vitrine e continuava na lista, igual
                            aos outros.
                          */}
                          {p.active === false && (
                            <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                              fora da vitrine
                            </span>
                          )}
                        </div>
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
                      {p.active === false ? (
                        <button
                          onClick={() => void upsertProduct({ ...p, active: true })}
                          className="p-2 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-gray-100"
                          title="Colocar de volta na vitrine"
                        >
                          <RotateCcw size={15} />
                        </button>
                      ) : (
                        <button
                          onClick={() => setConfirming(p)}
                          className="p-2 text-gray-400 hover:text-brand-red rounded-lg hover:bg-gray-100"
                          title="Tirar da vitrine"
                        >
                          <EyeOff size={15} />
                        </button>
                      )}
                      {/*
                        Apagar de vez só aparece para quem já está fora da
                        vitrine: é o segundo passo de uma decisão, não uma
                        alternativa ao primeiro clique.
                      */}
                      {p.active === false && (
                        <button
                          onClick={() => setApagando(p)}
                          className="p-2 text-gray-400 hover:text-brand-red rounded-lg hover:bg-gray-100"
                          title={presos.has(p.id)
                            ? 'Não dá para apagar: o produto está em pedidos que ainda valem'
                            : 'Apagar em definitivo'}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
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
          title="Tirar da vitrine"
          message={
            `“${confirming.name}” deixa de aparecer na loja, mas continua nesta lista, marcado `
            + 'como "fora da vitrine" — dá para colocar de volta a qualquer momento.\n\n'
            + 'Os pedidos já feitos continuam mostrando o item normalmente.'
          }
          confirmLabel="Tirar da vitrine"
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            void deleteProduct(confirming.id);
            setConfirming(null);
          }}
        />
      )}

      {apagando && (
        <ConfirmDialog
          title={presos.has(apagando.id) ? 'Ainda não dá para apagar' : 'Apagar em definitivo'}
          /*
           * A recusa diz o que fazer para sair dela.
           *
           * O texto anterior era um beco sem saída: afirmava que o produto "só
           * pode ficar fora da vitrine", sem dizer que cancelar os pedidos
           * resolve — e a razão que dava era falsa, porque o pedido guarda
           * cópia própria do item e não fica sem nada.
           */
          message={
            presos.has(apagando.id)
              ? `“${apagando.name}” está em pedidos que ainda valem, e sair dos relatórios no meio `
                + 'de uma venda em andamento atrapalha.\n\n'
                + 'Cancele esses pedidos em Pedidos (ou apague os de teste) e volte aqui — aí o '
                + 'botão libera. Os pedidos continuam mostrando o item de qualquer forma: eles '
                + 'guardam o nome e o preço do dia da compra.'
              : `“${apagando.name}” será apagado do banco e não volta. Nenhum pedido que ainda vale `
                + 'depende dele.'
          }
          confirmLabel={presos.has(apagando.id) ? 'Entendi' : 'Apagar'}
          danger={!presos.has(apagando.id)}
          onCancel={() => setApagando(null)}
          onConfirm={() => {
            if (!presos.has(apagando.id)) void deleteProduct(apagando.id, true);
            setApagando(null);
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

  const subcategorias = useMemo(
    () => menu.find((c) => c.id === p.category)?.subcategories ?? [],
    [menu, p.category],
  );

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

          {/*
            Todas as categorias aparecem.
            O filtro anterior mostrava só as que TÊM subcategoria — era um jeito
            de esconder "Destaques" e "Novidades", que são vitrines e não
            categorias de catálogo. O efeito colateral apareceu quando a árvore
            passou a vir do ERP: a maioria das categorias de lá não tem filhas,
            e sumiram todas do seletor. Agora o filtro é pelo que essas duas
            realmente são — entradas de vitrine, marcadas com `featured`.
          */}
          <div className="grid grid-cols-2 gap-4">
            <Field label="Categoria">
              <select
                value={p.category}
                onChange={(e) => {
                  const cat = menu.find((c) => c.id === e.target.value);
                  set({
                    category: e.target.value,
                    categoryLabel: cat?.name ?? e.target.value,
                    // Trocar de categoria invalida a subcategoria: a antiga não
                    // pertence à nova, e deixá-la gravada colocaria o produto
                    // numa seção que não existe.
                    subcategory: undefined,
                  });
                }}
                className={inputCls}
              >
                <option value="">— sem categoria (fica fora da vitrine) —</option>
                {menu.filter((c) => !c.featured).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
            <Field label="Subcategoria">
              <select
                value={p.subcategory ?? ''}
                onChange={(e) => set({ subcategory: e.target.value || undefined })}
                className={inputCls}
                disabled={subcategorias.length === 0}
              >
                <option value="">
                  {subcategorias.length === 0 ? '— esta categoria não tem —' : '— nenhuma —'}
                </option>
                {subcategorias.map((sub) => (
                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                ))}
              </select>
            </Field>
          </div>

          {/*
            Produto sem categoria não aparece na vitrine. Sem este aviso, salvar
            um cadastro novo sem escolher categoria produz um produto invisível
            e silencioso — o mesmo tipo de falha que o ERP já provocava.
          */}
          {(p.category ?? '') === '' && (
            <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 -mt-2">
              Sem categoria, este produto <b>não aparece na vitrine</b> — nem no menu, nem na
              listagem. Escolha uma acima para ele entrar na loja.
            </p>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="SKU">
              <input value={p.sku} onChange={(e) => set({ sku: e.target.value })} className={inputCls} />
            </Field>
            <Field label="Tag (aparece como selo na vitrine)">
              <input value={p.tag ?? ''} placeholder="DESTAQUE, NOVIDADE, OFERTA"
                onChange={(e) => set({ tag: e.target.value || undefined })} className={inputCls} />
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

          <EditorDeFotos
            cover={p.image}
            images={p.images ?? []}
            onChange={(cover, images) => set({ image: cover, images })}
          />

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

          <Field label="Descrição curta (aparece na listagem)">
            <textarea value={p.description} onChange={(e) => set({ description: e.target.value })} rows={2} className={inputCls} />
          </Field>

          {/*
            A página do produto já mostrava este texto quando ele existia — só
            que não havia como escrevê-lo pelo painel, então ele só entrava pelo
            ERP.
          */}
          <Field label="Descrição completa (aparece na página do produto)">
            <textarea value={p.longDescription ?? ''} rows={5} className={inputCls}
              placeholder="Materiais, medidas, modo de uso, história da peça…"
              onChange={(e) => set({ longDescription: e.target.value || undefined })} />
          </Field>

          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={p.highlight === true}
              onChange={(e) => set({ highlight: e.target.checked || undefined })}
              className="w-4 h-4 accent-primary-blue"
            />
            <span className="text-sm text-gray-700">
              Destacar na home
              <span className="text-gray-400"> — entra nos trilhos de destaque da vitrine</span>
            </span>
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

/**
 * Fotos do produto: capa e galeria, numa lista só.
 *
 * A primeira foto É a capa. Modelar como "capa + galeria" em dois controles
 * separados obrigaria quem cadastra a entender a diferença e a mover arquivo
 * de um lado para o outro; uma lista ordenada onde a primeira posição tem um
 * nome resolve igual e explica sozinha.
 */
function EditorDeFotos({ cover, images, onChange }: {
  cover: string;
  images: string[];
  onChange: (cover: string, images: string[]) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState('');
  const [enviando, setEnviando] = useState(0);
  const [url, setUrl] = useState('');

  // A capa é a posição 0. Vazia não entra: uma lista com buraco no meio
  // desalinharia as ações de mover.
  const fotos = [cover, ...images].filter((f) => f !== '');
  const aplicar = (lista: string[]) => onChange(lista[0] ?? '', lista.slice(1));

  const MAX = 12;

  const enviarArquivos = async (arquivos: FileList | File[] | null | undefined) => {
    if (!arquivos) return;
    const lista = Array.from(arquivos);
    if (lista.length === 0) return;

    setErro('');
    const aceitas: string[] = [];

    for (const file of lista) {
      if (fotos.length + aceitas.length >= MAX) {
        setErro(`Máximo de ${MAX} fotos por produto.`);
        break;
      }
      if (!file.type.startsWith('image/')) { setErro('Selecione arquivos de imagem.'); continue; }
      if (file.size > 2 * 1024 * 1024) {
        setErro(`"${file.name}" tem mais de 2 MB. Reduza a imagem antes de enviar.`);
        continue;
      }

      setEnviando((n) => n + 1);
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
          reader.readAsDataURL(file);
        });
        /*
         * O servidor devolve uma URL curta. É ela que vai para o produto — a
         * data URL fica só neste envio e nunca chega ao banco.
         */
        const { url: salva } = await uploadImagem(dataUrl);
        aceitas.push(salva);
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Falha ao enviar a imagem.');
      } finally {
        setEnviando((n) => n - 1);
      }
    }

    if (aceitas.length > 0) aplicar([...fotos, ...aceitas]);
  };

  const adicionarUrl = () => {
    const v = url.trim();
    if (v === '') return;
    if (!safeImageSrc(v)) { setErro('URL de imagem inválida (use http ou https).'); return; }
    if (fotos.length >= MAX) { setErro(`Máximo de ${MAX} fotos por produto.`); return; }
    setErro('');
    aplicar([...fotos, v]);
    setUrl('');
  };

  const mover = (de: number, para: number) => {
    if (para < 0 || para >= fotos.length) return;
    const lista = [...fotos];
    const [f] = lista.splice(de, 1);
    lista.splice(para, 0, f);
    aplicar(lista);
  };

  return (
    <Field label="Fotos do produto">
      <div className="space-y-3">
        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void enviarArquivos(e.dataTransfer.files); }}
          className="grid grid-cols-4 sm:grid-cols-6 gap-2"
        >
          {fotos.map((foto, i) => (
            <div
              key={`${foto}-${i}`}
              className={`relative group aspect-square rounded-xl border overflow-hidden bg-gray-50 ${
                i === 0 ? 'border-primary-blue ring-2 ring-primary-blue/20' : 'border-gray-200'
              }`}
            >
              <img
                src={safeImageSrc(foto)}
                alt=""
                className="w-full h-full object-contain"
                referrerPolicy="no-referrer"
              />
              {i === 0 && (
                <span className="absolute top-1 left-1 text-[9px] font-bold bg-primary-blue text-white px-1.5 py-0.5 rounded">
                  CAPA
                </span>
              )}
              <div className="absolute inset-x-0 bottom-0 flex justify-center gap-0.5 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity py-1">
                <button type="button" title="Mover para a esquerda" onClick={() => mover(i, i - 1)}
                  className="text-white/80 hover:text-white px-1 disabled:opacity-30" disabled={i === 0}>
                  <ChevronLeft size={13} />
                </button>
                <button type="button" title="Usar como capa" onClick={() => mover(i, 0)}
                  className="text-white/80 hover:text-white px-1 disabled:opacity-30" disabled={i === 0}>
                  <Star size={13} />
                </button>
                <button type="button" title="Remover"
                  onClick={() => aplicar(fotos.filter((_, j) => j !== i))}
                  className="text-white/80 hover:text-brand-red px-1">
                  <Trash2 size={13} />
                </button>
                <button type="button" title="Mover para a direita" onClick={() => mover(i, i + 1)}
                  className="text-white/80 hover:text-white px-1 disabled:opacity-30"
                  disabled={i === fotos.length - 1}>
                  <ChevronRight size={13} />
                </button>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="aspect-square rounded-xl border-2 border-dashed border-gray-200 hover:border-primary-blue bg-gray-50 flex flex-col items-center justify-center gap-1 text-gray-300 hover:text-primary-blue transition-colors"
            title="Clique, ou arraste arquivos aqui"
          >
            <ImagePlus size={20} />
            <span className="text-[9px] font-bold">ADICIONAR</span>
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => { void enviarArquivos(e.target.files); e.target.value = ''; }}
        />

        <div className="flex gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionarUrl(); } }}
            placeholder="ou cole uma URL: https://..."
            className={`${inputCls} text-xs`}
          />
          <Btn variant="ghost" onClick={adicionarUrl}>Adicionar</Btn>
        </div>

        {enviando > 0 && (
          <p className="text-[11px] text-primary-blue font-medium">
            Enviando {enviando} imagem(ns)…
          </p>
        )}
        {erro !== '' && <p className="text-[11px] text-brand-red font-medium">{erro}</p>}
        <p className="text-[11px] text-gray-400">
          A primeira foto é a capa — é ela que aparece na listagem e no carrinho. PNG, JPG ou WEBP,
          até 2 MB cada, no máximo {MAX}.
        </p>
      </div>
    </Field>
  );
}

