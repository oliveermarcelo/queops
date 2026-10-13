/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Variações: o "produto pai" montado aqui, no painel.
 *
 * O ERP manda um produto por variação, cada um com código, preço e estoque
 * próprios — e é assim que tem de ser: é esse código que o faturamento e a
 * NF-e usam do outro lado. O que falta lá não é dado de produto, é o vínculo
 * entre eles e a apresentação agrupada. Título, foto, ordem dos seletores e
 * rótulo de cada opção são informação de vitrine, e é por isso que esta tela
 * existe deste lado.
 *
 * A regra que vale para tudo aqui: o grupo NÃO É COMPRÁVEL. Ele não tem preço,
 * estoque nem SKU, e nunca entra num pedido — quem vai para o carrinho é a
 * variação escolhida pelo comprador. Por isso esta tela não tem um só campo de
 * preço ou de saldo: esses números são do produto, e mexer neles é em Produtos.
 */

import React, { useMemo, useState } from 'react';
import {
  Layers, Plus, Trash2, Search, ChevronUp, ChevronDown, X, AlertTriangle, ImagePlus,
} from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { uploadImagem } from '../store';
import { ProductGroupAdmin } from '../types';
import { Product } from '../../types';
import { Card, Btn, ConfirmDialog, Field, inputCls } from '../ui';
import { safeImageSrc } from '../../utils/safeUrl';

const msgDoErro = (e: unknown) =>
  e instanceof Error ? e.message : 'Não foi possível salvar o grupo.';

interface EixoEmEdicao { name: string; options: string[] }
interface VariacaoEmEdicao { productId: string; values: Record<string, string> }

const grupoEmBranco = (): ProductGroupAdmin => ({
  id: '', code: '', name: '', description: '', longDescription: '', image: '',
  category: '', subcategory: null, categoryLabel: '', tag: null,
  highlight: false, active: true, position: 0, axes: [], variants: [],
});

export default function VariacoesAdmin() {
  const { state } = useAdmin();
  const [editando, setEditando] = useState<ProductGroupAdmin | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gray-900/5 text-gray-700 flex items-center justify-center">
            <Layers size={17} />
          </div>
          <div>
            <h2 className="font-bold text-gray-800">Variações</h2>
            <p className="text-xs text-gray-400">
              {state.productGroups.length} grupo(s) — uma página só, com seletor de tamanho ou cor
            </p>
          </div>
        </div>
        <Btn onClick={() => setEditando(grupoEmBranco())}><Plus size={16} /> Novo grupo</Btn>
      </div>

      <FilaDeConferencia />

      {state.productGroups.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500">Nenhum grupo de variações ainda.</p>
          <p className="text-xs text-gray-400 mt-2 max-w-xl mx-auto leading-relaxed">
            Um grupo junta produtos que já existem no catálogo numa página só. Serve para quando a
            mesma peça é vendida em tamanhos ou cores diferentes e o ERP manda cada uma como um
            produto — sem o grupo, elas viram três cards e o comprador lê como três produtos.
            Preço e estoque continuam sendo de cada variação; o grupo é só a apresentação.
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {state.productGroups.map((g) => (
            <LinhaDoGrupo key={g.id} g={g} onAbrir={() => setEditando(g)} />
          ))}
        </div>
      )}

      {editando && (
        <EditorDeGrupo grupo={editando} onFechar={() => setEditando(null)} />
      )}
    </div>
  );
}

function LinhaDoGrupo({ g, onAbrir }: { g: ProductGroupAdmin; onAbrir: () => void; key?: React.Key }) {
  const { state } = useAdmin();
  const semEstoque = g.variants.every((v) => {
    const p = state.products.find((x) => x.id === v.productId);
    return (p?.stock ?? 0) <= 0 || p?.active === false;
  });

  return (
    <Card className="p-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-12 h-12 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center overflow-hidden shrink-0">
          {g.image !== ''
            ? <img src={safeImageSrc(g.image)} alt="" className="max-w-full max-h-full object-contain" />
            : <span className="text-[9px] text-gray-300">s/ img</span>}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold text-gray-800 truncate">{g.name}</p>
            {!g.active && (
              <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                fora da vitrine
              </span>
            )}
            {g.variants.length === 0 && (
              <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                sem variação
              </span>
            )}
            {g.variants.length > 0 && semEstoque && (
              <span className="text-[10px] font-bold bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                tudo esgotado
              </span>
            )}
          </div>
          <p className="text-[11px] text-gray-400">
            {g.categoryLabel} · {g.axes.map((a) => a.name).join(' × ') || 'sem eixo'} ·{' '}
            {g.variants.length} variação(ões) · <span className="font-mono">{g.code}</span>
          </p>
        </div>
        <Btn variant="ghost" onClick={onAbrir}>Abrir</Btn>
      </div>
    </Card>
  );
}

/**
 * A fila de produtos retidos.
 *
 * Produto criado pelo ERP fica esperando aqui em vez de entrar direto na
 * vitrine. O motivo é o card duplicado: quando existe um grupo e o ERP cria a
 * variação nova, ela apareceria como card solto AO LADO do card do grupo — a
 * mesma peça em dois lugares, sem erro em lugar nenhum, até alguém reparar.
 *
 * São dois caminhos, e os dois estão aqui: publicar solto (o produto vira um
 * card normal) ou anexar a um grupo (o que acontece ao salvar o grupo com ele
 * dentro, logo abaixo).
 */
function FilaDeConferencia() {
  const { state, publishProducts } = useAdmin();
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState('');

  const retidos = useMemo(
    () => state.products.filter((p) => p.pendingReview === true),
    [state.products],
  );
  if (retidos.length === 0) return null;

  const publicar = async (ids: string[]) => {
    setErro('');
    setRodando(true);
    try {
      await publishProducts(ids);
    } catch (e) {
      setErro(msgDoErro(e));
    } finally {
      setRodando(false);
    }
  };

  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
      <div className="flex gap-3">
        <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
        <div className="flex-1 text-xs text-amber-900 leading-relaxed">
          <b>{retidos.length} produto(s) novos esperando conferência.</b>{' '}
          O ERP criou estes produtos e eles ainda <b>não aparecem na vitrine</b>. Publique solto, se
          for uma peça independente, ou abra o grupo a que ele pertence e adicione-o lá — salvar o
          grupo já libera a retenção.
          <div className="mt-2.5">
            <Btn disabled={rodando} onClick={() => void publicar(retidos.map((p) => p.id))}>
              {rodando ? 'Publicando…' : `Publicar todos os ${retidos.length} soltos`}
            </Btn>
          </div>
          {erro !== '' && <p className="mt-2 font-medium text-red-700">{erro}</p>}
        </div>
      </div>

      <ul className="mt-3 space-y-1 max-h-64 overflow-y-auto">
        {retidos.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-xs bg-white/70 rounded-lg px-3 py-1.5">
            <span className="font-mono text-[10px] text-gray-400 shrink-0">{p.sku || p.id}</span>
            <span className="text-gray-700 truncate flex-1">{p.name}</span>
            <button
              disabled={rodando}
              onClick={() => void publicar([p.id])}
              className="text-[11px] font-semibold text-primary-blue hover:underline disabled:opacity-40"
            >
              publicar solto
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------ editor ---- */

function EditorDeGrupo({ grupo, onFechar }: { grupo: ProductGroupAdmin; onFechar: () => void }) {
  const { state, saveProductGroup, deleteProductGroup } = useAdmin();
  const [g, setG] = useState(grupo);
  const [eixos, setEixos] = useState<EixoEmEdicao[]>(
    grupo.axes.length > 0
      ? grupo.axes.map((a) => ({ name: a.name, options: a.options.map((o) => o.value) }))
      : [{ name: 'Tamanho', options: [] }],
  );
  const [variacoes, setVariacoes] = useState<VariacaoEmEdicao[]>(
    grupo.variants.map((v) => ({ productId: v.productId, values: { ...v.values } })),
  );
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [apagando, setApagando] = useState(false);

  const set = (patch: Partial<ProductGroupAdmin>) => setG((x) => ({ ...x, ...patch }));

  const subcategorias = useMemo(
    () => state.menu.find((c) => c.id === g.category)?.subcategories ?? [],
    [state.menu, g.category],
  );

  const jaNoGrupo = useMemo(() => new Set(variacoes.map((v) => v.productId)), [variacoes]);

  /*
   * A busca procura em TODO o catálogo, inclusive no que está retido e no que
   * está fora da vitrine. Retido é exatamente o caso de uso — a variação nova
   * que o ERP acabou de criar e que precisa entrar no grupo. Só não aparece
   * quem já está em OUTRO grupo: isso o servidor recusa, e oferecer na busca
   * seria prometer o que a gravação vai negar.
   */
  const candidatos = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (termo === '') return [];
    const deOutroGrupo = new Set<string>();
    for (const outro of state.productGroups) {
      if (outro.id === g.id) continue;
      for (const v of outro.variants) deOutroGrupo.add(v.productId);
    }
    return state.products
      .filter((p) => !jaNoGrupo.has(p.id) && !deOutroGrupo.has(p.id))
      .filter((p) => p.name.toLowerCase().includes(termo) || p.sku.toLowerCase().includes(termo)
        || p.id.toLowerCase().includes(termo))
      .slice(0, 12);
  }, [busca, state.products, state.productGroups, jaNoGrupo, g.id]);

  const produtoDe = (id: string): Product | undefined => state.products.find((p) => p.id === id);

  const mover = <T,>(lista: T[], i: number, passo: number): T[] => {
    const j = i + passo;
    if (j < 0 || j >= lista.length) return lista;
    const copia = [...lista];
    [copia[i], copia[j]] = [copia[j], copia[i]];
    return copia;
  };

  const salvar = async () => {
    setErro('');
    setSalvando(true);
    try {
      await saveProductGroup(g.id, {
        name: g.name,
        description: g.description,
        longDescription: g.longDescription,
        image: g.image,
        category: g.category,
        subcategory: g.subcategory ?? '',
        tag: g.tag ?? '',
        highlight: g.highlight,
        active: g.active,
        axes: eixos.map((e) => ({ name: e.name, options: e.options })),
        variants: variacoes,
      });
      onFechar();
    } catch (e) {
      setErro(msgDoErro(e));
    } finally {
      setSalvando(false);
    }
  };

  const enviarFoto = async (file: File | undefined) => {
    if (!file) return;
    setErro('');
    try {
      const dataUrl = await new Promise<string>((ok, nok) => {
        const fr = new FileReader();
        fr.onload = () => ok(String(fr.result));
        fr.onerror = () => nok(new Error('Não consegui ler o arquivo.'));
        fr.readAsDataURL(file);
      });
      set({ image: (await uploadImagem(dataUrl)).url });
    } catch (e) {
      setErro(msgDoErro(e));
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-start justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl w-full max-w-4xl my-6 shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-800">
            {g.id === '' ? 'Novo grupo de variações' : g.name}
          </h3>
          <button onClick={onFechar} className="p-2 rounded-lg text-gray-400 hover:bg-gray-100">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* ---------- conteúdo de vitrine ---------- */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Nome do grupo">
              <input
                value={g.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="Pirâmide de cobre"
                className={inputCls}
              />
            </Field>
            <Field label="Categoria">
              <select
                value={g.category}
                onChange={(e) => set({ category: e.target.value, subcategory: null })}
                className={inputCls}
              >
                <option value="">— escolha —</option>
                {state.menu.filter((c) => !c.featured).map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </Field>
          </div>

          {subcategorias.length > 0 && (
            <Field label="Subcategoria">
              <select
                value={g.subcategory ?? ''}
                onChange={(e) => set({ subcategory: e.target.value || null })}
                className={inputCls}
              >
                <option value="">— nenhuma —</option>
                {subcategorias.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </Field>
          )}

          <Field label="Descrição">
            <textarea
              value={g.description}
              onChange={(e) => set({ description: e.target.value })}
              rows={3}
              className={inputCls}
            />
          </Field>

          {/*
            O texto e a foto são DO GRUPO, e substituem os da variação na
            página. É o ponto de agrupar: uma página, um texto. O nome que o
            ERP manda em cada variação ("Pirâmide de cobre 15cm") continua
            valendo no pedido e na nota — só deixa de ser o título da página.
          */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="w-20 h-20 rounded-xl bg-gray-50 border border-gray-200 flex items-center justify-center overflow-hidden">
              {g.image !== ''
                ? <img src={safeImageSrc(g.image)} alt="" className="max-w-full max-h-full object-contain" />
                : <ImagePlus size={20} className="text-gray-300" />}
            </div>
            <label className="text-xs font-semibold text-primary-blue cursor-pointer hover:underline">
              Enviar a foto do grupo
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void enviarFoto(e.target.files?.[0])}
              />
            </label>
            {g.image !== '' && (
              <button
                onClick={() => set({ image: '' })}
                className="text-xs text-gray-400 hover:text-brand-red"
              >
                remover
              </button>
            )}
            <label className="flex items-center gap-2 text-sm text-gray-700 ml-auto">
              <input
                type="checkbox"
                checked={g.active}
                onChange={(e) => set({ active: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300"
              />
              Na vitrine
            </label>
          </div>

          {/* ---------- eixos ---------- */}
          <div>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div>
                <h4 className="font-bold text-sm text-gray-800">Eixos de variação</h4>
                <p className="text-[11px] text-gray-400">
                  A ordem aqui é a ordem dos seletores na página.
                </p>
              </div>
              <Btn
                variant="ghost"
                onClick={() => setEixos((x) => [...x, { name: '', options: [] }])}
              >
                <Plus size={14} /> Eixo
              </Btn>
            </div>

            <div className="space-y-3">
              {eixos.map((e, i) => (
                <div key={i} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center gap-2 flex-wrap">
                    <input
                      value={e.name}
                      onChange={(ev) => setEixos((x) => x.map(
                        (y, j) => (j === i ? { ...y, name: ev.target.value } : y),
                      ))}
                      placeholder="Tamanho"
                      className={`${inputCls} w-auto min-w-[140px] flex-1`}
                    />
                    <button
                      onClick={() => setEixos((x) => mover(x, i, -1))}
                      className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"
                      title="Subir"
                    >
                      <ChevronUp size={15} />
                    </button>
                    <button
                      onClick={() => setEixos((x) => mover(x, i, 1))}
                      className="p-2 rounded-lg text-gray-400 hover:bg-gray-100"
                      title="Descer"
                    >
                      <ChevronDown size={15} />
                    </button>
                    <button
                      onClick={() => setEixos((x) => x.filter((_, j) => j !== i))}
                      className="p-2 rounded-lg text-gray-400 hover:text-brand-red hover:bg-gray-100"
                      title="Remover eixo"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>

                  <div className="mt-2">
                    <OpcoesDoEixo
                      opcoes={e.options}
                      onMudar={(opcoes) => setEixos((x) => x.map(
                        (y, j) => (j === i ? { ...y, options: opcoes } : y),
                      ))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ---------- variações ---------- */}
          <div>
            <h4 className="font-bold text-sm text-gray-800 mb-1">Variações</h4>
            <p className="text-[11px] text-gray-400 mb-2">
              Produtos que já existem no catálogo. Preço e estoque continuam sendo de cada um —
              aqui só se diz qual opção cada um representa.
            </p>

            <div className="relative mb-3">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={busca}
                onChange={(ev) => setBusca(ev.target.value)}
                placeholder="Buscar produto por nome ou SKU"
                className={`${inputCls} pl-9`}
              />
            </div>

            {candidatos.length > 0 && (
              <div className="mb-3 rounded-xl border border-gray-200 divide-y divide-gray-100 overflow-hidden">
                {candidatos.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => {
                      setVariacoes((x) => [...x, { productId: p.id, values: {} }]);
                      setBusca('');
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span className="font-mono text-[10px] text-gray-400">{p.sku || p.id}</span>
                    <span className="text-gray-700 truncate flex-1">{p.name}</span>
                    {p.pendingReview === true && (
                      <span className="text-[10px] font-bold bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full">
                        retido
                      </span>
                    )}
                    <Plus size={14} className="text-primary-blue" />
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-2">
              {variacoes.length === 0 && (
                <p className="text-xs text-gray-400 py-3 text-center">
                  Nenhuma variação ainda. Busque os produtos acima.
                </p>
              )}
              {variacoes.map((v, i) => {
                const p = produtoDe(v.productId);
                return (
                  <div key={v.productId} className="rounded-xl border border-gray-200 p-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-gray-400">
                        {p?.sku || v.productId}
                      </span>
                      <span className="text-sm text-gray-700 truncate flex-1 min-w-[120px]">
                        {p?.name ?? v.productId}
                      </span>
                      {/* Preço e estoque aparecem só para conferir — são do produto. */}
                      <span className="text-[11px] text-gray-400">
                        R$ {(p?.price ?? 0).toFixed(2)} · {p?.stock ?? 0} un.
                      </span>
                      <button
                        onClick={() => setVariacoes((x) => mover(x, i, -1))}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => setVariacoes((x) => mover(x, i, 1))}
                        className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button
                        onClick={() => setVariacoes((x) => x.filter((_, j) => j !== i))}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-brand-red hover:bg-gray-100"
                        title="Tirar do grupo"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="mt-2 flex gap-2 flex-wrap">
                      {eixos.map((e) => (
                        <select
                          key={e.name}
                          value={v.values[e.name] ?? ''}
                          onChange={(ev) => setVariacoes((x) => x.map((y, j) => (
                            j === i ? { ...y, values: { ...y.values, [e.name]: ev.target.value } } : y
                          )))}
                          className={`${inputCls} w-auto min-w-[130px]`}
                        >
                          <option value="">{e.name || 'eixo'}: —</option>
                          {e.options.map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {erro !== '' && (
            <p className="text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {erro}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-gray-100">
          {g.id !== '' ? (
            <Btn variant="danger" onClick={() => setApagando(true)}>Desfazer o grupo</Btn>
          ) : <span />}
          <div className="flex gap-2">
            <Btn variant="ghost" onClick={onFechar}>Cancelar</Btn>
            <Btn disabled={salvando} onClick={() => void salvar()}>
              {salvando ? 'Salvando…' : 'Salvar grupo'}
            </Btn>
          </div>
        </div>
      </div>

      {apagando && (
        <ConfirmDialog
          title="Desfazer este grupo?"
          message={
            `O grupo "${g.name}" deixa de existir e os ${variacoes.length} produto(s) dele voltam `
            + 'a aparecer na vitrine como cards separados, como eram antes.\n\n'
            + 'Nenhum produto é apagado: preço, estoque e pedidos não são tocados. Desagrupar é '
            + 'operação de apresentação.'
          }
          confirmLabel="Desfazer o grupo"
          danger
          onCancel={() => setApagando(false)}
          onConfirm={() => { void deleteProductGroup(g.id); onFechar(); }}
        />
      )}
    </div>
  );
}

/** As opções de um eixo, em pastilhas, na ordem em que aparecem no seletor. */
function OpcoesDoEixo({ opcoes, onMudar }: {
  opcoes: string[];
  onMudar: (opcoes: string[]) => void;
}) {
  const [nova, setNova] = useState('');

  const adicionar = () => {
    const valor = nova.trim();
    if (valor === '' || opcoes.some((o) => o.toLowerCase() === valor.toLowerCase())) {
      setNova('');
      return;
    }
    onMudar([...opcoes, valor]);
    setNova('');
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {opcoes.map((o, i) => (
        <span
          key={o}
          className="inline-flex items-center gap-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-full pl-3 pr-1 py-1"
        >
          {o}
          <button
            onClick={() => onMudar(opcoes.filter((_, j) => j !== i))}
            className="p-0.5 rounded-full hover:bg-gray-200"
          >
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        value={nova}
        onChange={(e) => setNova(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); adicionar(); } }}
        onBlur={adicionar}
        placeholder="nova opção + Enter"
        className="text-xs border border-dashed border-gray-300 rounded-full px-3 py-1.5 focus:outline-none focus:border-primary-blue min-w-[150px]"
      />
    </div>
  );
}
