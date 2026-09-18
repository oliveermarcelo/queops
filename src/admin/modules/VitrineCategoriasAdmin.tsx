/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A vitrine das categorias: foto, frase e quais aparecem na home.
 *
 * Esta tela nasceu de um defeito que ninguém tinha visto: a seção "Explore por
 * categoria" da home eram SEIS CARTÕES CRAVADOS no código — id, nome, frase e
 * foto fixos. Enquanto a loja tinha exatamente aquelas seis categorias,
 * funcionava. Quando ela passou a espelhar a árvore do ERP, os ids deixaram de
 * existir: os cartões continuavam bonitos e levavam a uma lista vazia.
 *
 * Nome e hierarquia continuam vindo do ERP. O que se edita aqui é só o que a
 * loja tem a dizer sobre a própria vitrine.
 */

import React, { useMemo, useState } from 'react';
import { Image as ImageIcon, Home, Loader2, Trash2, Upload, GripVertical } from 'lucide-react';

import { useAdmin } from '../AdminContext';
import { MenuCategory } from '../../types';
import { uploadImagem } from '../store';
import { Card, inputCls } from '../ui';
import { safeImageSrc } from '../../utils/safeUrl';

/** 2 MB: o servidor aceita até 3, e a folga evita recusa por poucos bytes. */
const TAMANHO_MAXIMO = 2 * 1024 * 1024;

function LinhaDaCategoria({ categoria }: { categoria: MenuCategory; key?: React.Key }) {
  const { updateCategoryShowcase } = useAdmin();
  const [frase, setFrase] = useState(categoria.blurb ?? '');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState('');

  const gravar = (patch: Parameters<typeof updateCategoryShowcase>[1]) => {
    setErro('');
    void updateCategoryShowcase(categoria.id, patch).catch((e: unknown) => {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar.');
    });
  };

  const escolherFoto = async (arquivo: File | undefined) => {
    if (arquivo === undefined) return;
    if (arquivo.size > TAMANHO_MAXIMO) {
      setErro(`A imagem tem ${Math.round(arquivo.size / 1024)} KB; o máximo é 2 MB.`);
      return;
    }
    setEnviando(true);
    setErro('');
    try {
      /*
       * A foto sobe primeiro e vira URL; só a URL entra na categoria.
       *
       * É o mesmo caminho do produto, e pelo mesmo motivo: a imagem embutida
       * no corpo era cortada pelo tamanho da coluna e salvava quebrada, com
       * 200 na resposta e sem erro em lugar nenhum.
       */
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const leitor = new FileReader();
        leitor.onload = () => resolve(String(leitor.result));
        leitor.onerror = () => reject(new Error('Não consegui ler o arquivo.'));
        leitor.readAsDataURL(arquivo);
      });
      const { url } = await uploadImagem(dataUrl);
      await updateCategoryShowcase(categoria.id, { image: url });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar a imagem.');
    } finally {
      setEnviando(false);
    }
  };

  const temFoto = (categoria.image ?? '') !== '';

  return (
    <div className="flex gap-4 p-4 bg-white rounded-2xl border border-gray-100 items-start">
      <GripVertical size={16} className="text-gray-300 mt-8 flex-shrink-0" aria-hidden="true" />

      {/* Foto */}
      <div className="flex-shrink-0">
        <div className="w-28 h-28 rounded-xl bg-gray-50 border border-gray-150 overflow-hidden flex items-center justify-center relative">
          {enviando ? (
            <Loader2 size={20} className="animate-spin text-gray-400" />
          ) : temFoto ? (
            <>
              {/*
                O ícone fica ATRÁS da foto. Se o arquivo não carregar — apagado
                do disco depois de cadastrado —, a miniatura some e sobra o
                ícone, em vez do retângulo quebrado que faria parecer defeito
                da tela.
              */}
              <ImageIcon size={22} className="text-gray-300 absolute" />
              <img
                src={safeImageSrc(categoria.image ?? '')}
                alt={categoria.name}
                className="w-full h-full object-cover relative"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </>
          ) : (
            <ImageIcon size={22} className="text-gray-300" />
          )}
        </div>
        <div className="flex gap-1.5 mt-2">
          <label className="flex-1 cursor-pointer text-[11px] font-semibold text-center py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50">
            <Upload size={11} className="inline mr-1" />
            {temFoto ? 'Trocar' : 'Enviar'}
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,image/avif"
              className="hidden"
              onChange={(e) => void escolherFoto(e.target.files?.[0])}
            />
          </label>
          {temFoto && (
            <button
              onClick={() => gravar({ image: '' })}
              title="Tirar a foto"
              className="px-2 py-1.5 rounded-lg border border-gray-200 text-gray-400 hover:text-brand-red hover:bg-gray-50"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Nome, frase e destaque */}
      <div className="flex-1 min-w-0 space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-bold text-gray-800 truncate">{categoria.name}</p>
          {/*
            "Mostrar na home" é por categoria, e não uma lista fixa de seis:
            com dezenas de categorias vindas do ERP, quem escolhe quais merecem
            a home é quem conhece a loja.
          */}
          <label className="flex items-center gap-2 text-xs font-semibold text-gray-600 flex-shrink-0 cursor-pointer">
            <input
              type="checkbox"
              checked={categoria.home ?? false}
              onChange={(e) => gravar({ home: e.target.checked })}
              className="accent-primary-blue w-4 h-4"
            />
            <Home size={13} className={categoria.home ? 'text-primary-blue' : 'text-gray-300'} />
            Mostrar na home
          </label>
        </div>

        <input
          value={frase}
          onChange={(e) => setFrase(e.target.value)}
          onBlur={() => { if (frase !== (categoria.blurb ?? '')) gravar({ blurb: frase }); }}
          maxLength={160}
          placeholder="Frase curta — ex.: Cobre, cristal e veludo azul"
          className={inputCls}
        />

        <p className="text-[11px] text-gray-400">
          {categoria.subcategories.length > 0
            ? `${categoria.subcategories.length} subcategoria(s)`
            : 'Sem subcategorias'}
          {' · '}
          {temFoto ? 'com foto' : 'sem foto — a home mostra um fundo liso'}
        </p>

        {erro !== '' && <p className="text-xs text-brand-red">{erro}</p>}
      </div>
    </div>
  );
}

export default function VitrineCategoriasAdmin() {
  const { state } = useAdmin();
  const [busca, setBusca] = useState('');

  const categorias = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return state.menu
      .filter((c) => !c.featured)
      .filter((c) => termo === '' || c.name.toLowerCase().includes(termo));
  }, [state.menu, busca]);

  const naHome = state.menu.filter((c) => c.home).length;
  const semFoto = state.menu.filter((c) => c.home && (c.image ?? '') === '').length;

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-bold text-gray-800">Vitrine das categorias</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl leading-relaxed">
              A foto e a frase que aparecem na seção <strong>“Explore por categoria”</strong> da
              página inicial. Marque quais categorias devem aparecer lá — as demais continuam
              existindo normalmente no menu e na busca.
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-extrabold text-primary-blue">{naHome}</p>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">na home</p>
          </div>
        </div>

        {/*
          Um aviso só quando ele é verdade: categoria escolhida para a home e
          sem foto aparece com um fundo liso, o que parece defeito para quem
          visita. Dizer isso aqui evita a descoberta pela home.
        */}
        {semFoto > 0 && (
          <p className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
            {semFoto === 1
              ? '1 categoria está marcada para a home e ainda não tem foto.'
              : `${semFoto} categorias estão marcadas para a home e ainda não têm foto.`}
            {' '}Sem foto, o cartão aparece com um fundo liso.
          </p>
        )}

        {naHome === 0 && (
          <p className="mt-4 text-xs text-gray-500 bg-gray-50 border border-gray-150 rounded-lg px-3 py-2">
            Nenhuma categoria marcada: a seção “Explore por categoria” não aparece na home.
          </p>
        )}

        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar categoria"
          className={`${inputCls} mt-4 max-w-sm`}
        />
      </Card>

      <div className="space-y-3">
        {categorias.map((c) => <LinhaDaCategoria key={c.id} categoria={c} />)}
        {categorias.length === 0 && (
          <Card className="p-10 text-center text-sm text-gray-400">
            Nenhuma categoria encontrada.
          </Card>
        )}
      </div>
    </div>
  );
}
