/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Categorias do ERP → categorias da loja.
 *
 * O ERP identifica categoria por código; a loja, por slug — que está na URL
 * pública e no sitemap já entregue ao Google. Esta tela é a tradução entre os
 * dois, e ela é manual de propósito: casar por nome parece esperto até o dia em
 * que "Cristais" do ERP amarra na categoria errada e ninguém percebe, porque
 * não houve erro nenhum — só produto na prateleira errada.
 */

import React, { useMemo, useState } from 'react';
import { FolderTree, Link2, Link2Off, AlertTriangle, Search, Check } from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { ErpCategory } from '../types';
import { Card, Btn, inputCls } from '../ui';

const msgDoErro = (e: unknown) =>
  e instanceof Error ? e.message : 'Não foi possível salvar a amarração.';

/** Valor do <select>: "categoria" ou "categoria/subcategoria". */
const valorDoDestino = (c: ErpCategory) =>
  c.category === null ? '' : c.subcategory === null ? c.category : `${c.category}/${c.subcategory}`;

function LinhaDaCategoria({ c }: { c: ErpCategory; key?: React.Key }) {
  const { state, linkErpCategory } = useAdmin();
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const escolher = async (valor: string) => {
    setErro('');
    setSalvando(true);
    try {
      if (valor === '') {
        await linkErpCategory(c.code, null, null);
      } else {
        const [cat, sub] = valor.split('/');
        await linkErpCategory(c.code, cat, sub ?? null);
      }
      setSalvo(true);
      setTimeout(() => setSalvo(false), 2500);
    } catch (e) {
      setErro(msgDoErro(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className={`p-3 rounded-lg border ${c.linked ? 'border-gray-150' : 'border-amber-200 bg-amber-50/40'}`}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
          c.linked ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
        }`}>
          {c.linked ? <Link2 size={15} /> : <Link2Off size={15} />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-800">{c.name}</p>
            <code className="text-[11px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
              {c.code}
            </code>
            {!c.active && (
              <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                inativa no ERP
              </span>
            )}
          </div>
          {c.parentCode !== null && (
            <p className="text-[11px] text-gray-400 mt-0.5">
              filha de <code className="font-mono">{c.parentCode}</code> no ERP
            </p>
          )}
        </div>

        <select
          value={valorDoDestino(c)}
          disabled={salvando}
          onChange={(e) => escolher(e.target.value)}
          className={`${inputCls} sm:w-72 disabled:opacity-50`}
        >
          <option value="">— não amarrada (fica fora da vitrine) —</option>
          {state.menu.map((cat) => (
            <optgroup key={cat.id} label={cat.name}>
              <option value={cat.id}>{cat.name} (categoria toda)</option>
              {cat.subcategories.map((s) => (
                <option key={s.id} value={`${cat.id}/${s.id}`}>
                  &nbsp;&nbsp;↳ {s.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>

        {salvo && <Check size={16} className="text-emerald-600 shrink-0" />}
      </div>

      {erro !== '' && (
        <p className="mt-2 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {erro}
        </p>
      )}
    </div>
  );
}

export default function CategoriesAdmin() {
  const { state } = useAdmin();
  const [busca, setBusca] = useState('');
  const [soPendentes, setSoPendentes] = useState(false);

  const lista = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return state.erpCategories.filter((c) => {
      if (soPendentes && c.linked) return false;
      if (termo === '') return true;
      return c.name.toLowerCase().includes(termo) || c.code.toLowerCase().includes(termo);
    });
  }, [state.erpCategories, busca, soPendentes]);

  const pendentes = state.erpCategories.filter((c) => !c.linked && c.active).length;
  const semCategoria = state.productsWithoutCategory;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gray-900/5 text-gray-700 flex items-center justify-center">
          <FolderTree size={17} />
        </div>
        <div>
          <h2 className="font-bold text-gray-800">Categorias do ERP</h2>
          <p className="text-xs text-gray-400">
            {state.erpCategories.length} recebida(s) do ERP
            {pendentes > 0 && ` · ${pendentes} sem destino na loja`}
          </p>
        </div>
      </div>

      {state.erpCategories.length === 0 ? (
        <Card className="p-8 text-center">
          <p className="text-sm text-gray-500">
            O ERP ainda não enviou nenhuma categoria.
          </p>
          <p className="text-xs text-gray-400 mt-2 max-w-lg mx-auto leading-relaxed">
            Quando ele chamar <code className="text-primary-blue">PUT /api/v1/categories</code>, a
            lista aparece aqui para você dizer onde cada uma entra na loja. Nada é amarrado
            automaticamente: um nome parecido casaria errado sem dar erro, e o produto iria parar na
            seção errada da vitrine.
          </p>
        </Card>
      ) : (
        <>
          {/*
            Este número é a razão da tela existir. Produto recebido com código
            não amarrado entra sem categoria e some da vitrine — sem erro,
            sem log que o dono leia. Aqui ele fica visível.
          */}
          {semCategoria > 0 && (
            <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
              <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <b>{semCategoria} produto(s) estão sem categoria e não aparecem na vitrine.</b>{' '}
                Eles chegaram do ERP com um código que ainda não tem destino aqui. Amarre a
                categoria correspondente abaixo e eles entram na loja no mesmo instante — não é
                preciso o ERP reenviar.
              </div>
            </div>
          )}

          <Card className="p-5 space-y-4">
            <div className="flex gap-2 flex-wrap items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por nome ou código"
                  className={`${inputCls} pl-9`}
                />
              </div>
              <Btn
                variant={soPendentes ? 'primary' : 'ghost'}
                onClick={() => setSoPendentes((v) => !v)}
              >
                {soPendentes ? 'Mostrando pendentes' : 'Só as pendentes'}
              </Btn>
            </div>

            <div className="space-y-2">
              {lista.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-6">
                  {soPendentes
                    ? 'Nenhuma pendente: todas as categorias do ERP têm destino na loja.'
                    : 'Nada encontrado com esse termo.'}
                </p>
              )}
              {lista.map((c) => <LinhaDaCategoria key={c.code} c={c} />)}
            </div>
          </Card>

          <p className="text-[11px] text-gray-400 leading-relaxed">
            Amarrar mais de um código do ERP à mesma categoria da loja é permitido — ERPs costumam
            ter uma divisão mais fina que a vitrine. Ao devolver o produto na API, a loja usa o
            código amarrado ao nível mais específico.
          </p>
        </>
      )}
    </div>
  );
}
