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
import {
  Image as ImageIcon, Home, Loader2, Trash2, Upload, GripVertical, CornerDownRight, FolderPlus,
} from 'lucide-react';

import { useAdmin } from '../AdminContext';
import { uploadImagem } from '../store';
import { Btn, Card, ConfirmDialog, inputCls } from '../ui';
import { safeImageSrc } from '../../utils/safeUrl';

/** Uma categoria como a lista crua do painel a entrega. */
type CategoriaCrua = NonNullable<ReturnType<typeof useAdmin>['state']['allCategories']>[number];

/** 2 MB: o servidor aceita até 3, e a folga evita recusa por poucos bytes. */
const TAMANHO_MAXIMO = 2 * 1024 * 1024;

function LinhaDaCategoria({ categoria, grupos, membros, onApagar }: {
  categoria: CategoriaCrua;
  /** Categorias que podem receber outras dentro. */
  grupos: CategoriaCrua[];
  /** Quantas categorias estão dentro desta. */
  membros: number;
  onApagar: (c: CategoriaCrua) => void;
  key?: React.Key;
}) {
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
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-bold text-gray-800 truncate">{categoria.name}</p>
            {categoria.manual && (
              <span className="text-[10px] font-bold uppercase tracking-wider text-primary-blue bg-primary-blue/10 px-1.5 py-0.5 rounded flex-shrink-0">
                criada aqui
              </span>
            )}
            {/*
              Apagar só aparece para as criadas aqui. Categoria do ERP voltaria
              na próxima sincronização, e o botão teria prometido o que não se
              cumpre.
            */}
            {categoria.manual && (
              <button
                onClick={() => onApagar(categoria)}
                title="Apagar esta categoria geral"
                className="p-1 rounded text-gray-300 hover:text-brand-red flex-shrink-0"
              >
                <Trash2 size={13} />
              </button>
            )}
          </div>
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

        {/*
          O seletor de categoria geral é o coração desta tela.

          O ERP manda "Pirâmides de Cristal", "de Madeira" e "de Impressão 3D"
          soltas, no mesmo nível. Aqui a loja as pendura numa "Pirâmides" —
          e nenhum produto se move: cada um continua na categoria do ERP, e é
          a navegação que passa a somar os filhos.
        */}
        {membros === 0 && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <CornerDownRight size={13} className="text-gray-400 flex-shrink-0" />
            Dentro de
            <select
              value={categoria.groupId ?? ''}
              onChange={(e) => gravar({ groupId: e.target.value })}
              className="text-xs border border-gray-200 rounded-lg py-1.5 px-2 bg-white focus:outline-none focus:ring-2 focus:ring-primary-blue/20 max-w-[220px]"
            >
              <option value="">— nenhuma (fica no topo) —</option>
              {grupos
                .filter((g) => g.id !== categoria.id)
                .map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </label>
        )}

        <p className="text-[11px] text-gray-400">
          {membros > 0
            ? `Categoria geral · ${membros} categoria(s) dentro`
            : categoria.groupId
              ? `Dentro de “${grupos.find((g) => g.id === categoria.groupId)?.name ?? '?'}”`
              : 'No primeiro nível'}
          {' · '}
          {temFoto ? 'com foto' : 'sem foto — a home mostra um fundo liso'}
        </p>

        {erro !== '' && <p className="text-xs text-brand-red">{erro}</p>}
      </div>
    </div>
  );
}

export default function VitrineCategoriasAdmin() {
  const { state, createCategory, deleteCategory } = useAdmin();
  const [busca, setBusca] = useState('');
  const [novoNome, setNovoNome] = useState('');
  const [criando, setCriando] = useState(false);
  const [apagando, setApagando] = useState<CategoriaCrua | null>(null);
  const [erro, setErro] = useState('');

  /*
   * A lista CRUA, e não o `menu`.
   *
   * O menu já vem agrupado: as categorias penduradas dentro de outra não
   * aparecem no topo. Esta tela precisa de todas, senão a única forma de
   * desagrupar alguma seria mexendo no banco.
   */
  const todas = useMemo(
    () => (state.allCategories ?? []).filter((c) => !c.featured),
    [state.allCategories],
  );

  /** Quantas categorias estão dentro de cada uma. */
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of todas) {
      if (c.groupId) m.set(c.groupId, (m.get(c.groupId) ?? 0) + 1);
    }
    return m;
  }, [todas]);

  /*
   * Quem pode receber outras dentro: só quem está no primeiro nível.
   *
   * Um grupo dentro de um grupo seria um nível a mais que a vitrine não
   * desenha, e os filhos sumiriam do menu sem aviso.
   */
  const grupos = useMemo(() => todas.filter((c) => c.groupId === null), [todas]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (termo !== '') return todas.filter((c) => c.name.toLowerCase().includes(termo));
    /*
     * Sem busca, a lista sai na ORDEM DA ÁRVORE: cada categoria geral seguida
     * das que estão dentro dela. Uma lista alfabética separaria "Pirâmides" das
     * suas oito filhas, e conferir o agrupamento viraria caça ao tesouro.
     */
    const ordenada: CategoriaCrua[] = [];
    for (const c of todas.filter((x) => x.groupId === null)) {
      ordenada.push(c);
      ordenada.push(...todas.filter((x) => x.groupId === c.id));
    }
    // Órfãs (grupo apagado) entram no fim, para nada sumir da tela.
    for (const c of todas) if (!ordenada.includes(c)) ordenada.push(c);
    return ordenada;
  }, [todas, busca]);

  const naHome = todas.filter((c) => c.home).length;
  const semFoto = todas.filter((c) => c.home && c.image === '').length;

  const criar = async () => {
    const nome = novoNome.trim();
    if (nome === '') return;
    setCriando(true);
    setErro('');
    try {
      await createCategory(nome);
      setNovoNome('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível criar.');
    } finally {
      setCriando(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card className="p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="font-bold text-gray-800">Vitrine das categorias</h2>
            <p className="text-sm text-gray-500 mt-1 max-w-2xl leading-relaxed">
              A foto e a frase que aparecem na seção <strong>“Explore por categoria”</strong> da
              página inicial, e como as categorias se organizam no menu.
            </p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-2xl font-extrabold text-primary-blue">{naHome}</p>
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">na home</p>
          </div>
        </div>

        {/*
          Criar categoria geral.

          O ERP manda "Pirâmides de Cristal", "de Madeira" e "de Impressão 3D"
          soltas, todas no mesmo nível — não existe uma "Pirâmides" para o
          cliente clicar. Esta é a forma de a loja criar a sua, sem depender de
          o ERP passar a mandar a hierarquia.
        */}
        <div className="mt-5 p-4 bg-gray-50 rounded-xl border border-gray-150">
          <p className="text-xs font-bold text-gray-600 uppercase tracking-wider">
            Criar categoria geral
          </p>
          <p className="text-[11px] text-gray-500 mt-1 leading-relaxed max-w-2xl">
            Para juntar várias categorias do ERP sob um nome só — por exemplo, uma
            <strong> Pirâmides</strong> reunindo “Pirâmides de Cristal”, “de Madeira” e “de
            Impressão 3D”. Depois de criar, escolha em cada uma delas o campo
            <strong> Dentro de</strong>. Nenhum produto muda de lugar.
          </p>
          <div className="flex gap-2 mt-3 max-w-md">
            <input
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void criar(); }}
              placeholder="Nome da categoria geral — ex.: Pirâmides"
              maxLength={120}
              className={inputCls}
            />
            <Btn onClick={() => void criar()} disabled={criando || novoNome.trim() === ''}>
              <FolderPlus size={14} className="mr-1.5" />
              Criar
            </Btn>
          </div>
          {erro !== '' && <p className="text-xs text-brand-red mt-2">{erro}</p>}
        </div>

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
        {visiveis.map((c) => (
          <div key={c.id} className={c.groupId ? 'ml-6 sm:ml-10' : ''}>
            <LinhaDaCategoria
              categoria={c}
              grupos={grupos}
              membros={contagem.get(c.id) ?? 0}
              onApagar={setApagando}
            />
          </div>
        ))}
        {visiveis.length === 0 && (
          <Card className="p-10 text-center text-sm text-gray-400">
            Nenhuma categoria encontrada.
          </Card>
        )}
      </div>

      {apagando && (
        <ConfirmDialog
          title="Apagar categoria geral"
          message={
            `“${apagando.name}” será apagada.\n\n`
            + 'As categorias que estavam dentro dela voltam para o primeiro nível, e nenhum '
            + 'produto muda de lugar — agrupar nunca moveu produto, e desagrupar também não.'
          }
          confirmLabel="Apagar"
          onCancel={() => setApagando(null)}
          onConfirm={() => {
            void deleteCategory(apagando.id).catch((e: unknown) => {
              setErro(e instanceof Error ? e.message : 'Não foi possível apagar.');
            });
            setApagando(null);
          }}
        />
      )}
    </div>
  );
}
