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
import {
  FolderTree, Link2, Link2Off, AlertTriangle, Search, Check, RefreshCw,
} from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { ErpCategory, GrupoParado, MotivoDeParada, ProdutosParados } from '../types';
import { Card, Btn, ConfirmDialog, inputCls } from '../ui';

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
  const [liberados, setLiberados] = useState(0);

  const escolher = async (valor: string) => {
    setErro('');
    setLiberados(0);
    setSalvando(true);
    try {
      const n = valor === ''
        ? await linkErpCategory(c.code, null, null)
        : await linkErpCategory(c.code, valor.split('/')[0], valor.split('/')[1] ?? null);

      setSalvo(true);
      setLiberados(n);
      // O aviso de produtos liberados fica mais tempo que o tique: é
      // informação, não confirmação.
      setTimeout(() => setSalvo(false), 2500);
      if (n > 0) setTimeout(() => setLiberados(0), 8000);
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

      {liberados > 0 && (
        <p className="mt-2 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          <b>{liberados} produto(s) entraram na vitrine agora.</b> Estavam esperando por esta
          categoria desde que o ERP os enviou.
        </p>
      )}
    </div>
  );
}

/**
 * Substituir a árvore da loja pela do ERP.
 *
 * A ação apaga categorias e tira produtos da vitrine, então o diálogo diz o
 * número real de cada coisa antes de perguntar. "Tem certeza?" sozinho não
 * informa nada — quem clica precisa ver o tamanho do estrago possível.
 */
function EspelharDoErp() {
  const { state, espelharCategoriasDoErp } = useAdmin();
  const [confirmando, setConfirmando] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState<{
    categorias: number; subcategorias: number; orfaos: number; warnings: string[];
  } | null>(null);

  const ativas = state.erpCategories.filter((c) => c.active).length;
  const naVitrine = state.products.filter((p) => p.active !== false).length;

  const rodar = async () => {
    setConfirmando(false);
    setRodando(true);
    setErro('');
    try {
      setFeito(await espelharCategoriasDoErp());
    } catch (e) {
      setErro(msgDoErro(e));
    } finally {
      setRodando(false);
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5">
          <RefreshCw size={18} className="text-primary-blue mt-0.5 shrink-0" />
          <div>
            <h3 className="font-bold text-gray-800">Espelhar as categorias do ERP</h3>
            <p className="text-xs text-gray-400 leading-relaxed max-w-2xl mt-0.5">
              Apaga as categorias da loja e refaz a árvore igual à do ERP, já amarrando cada
              código. Depois disso a loja deixa de ter categorias próprias — quem manda no menu
              passa a ser o ERP.
            </p>
          </div>
        </div>
        <Btn variant="danger" onClick={() => setConfirmando(true)} disabled={rodando || ativas === 0}>
          {rodando ? 'Substituindo…' : 'Substituir pela árvore do ERP'}
        </Btn>
      </div>

      {erro !== '' && (
        <p className="mt-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {erro}
        </p>
      )}

      {feito !== null && (
        <div className="mt-3 text-xs text-emerald-900 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 leading-relaxed">
          <b>
            Pronto: {feito.categorias} categoria(s) e {feito.subcategorias} subcategoria(s),
            iguais às do ERP.
          </b>
          {feito.orfaos > 0 && (
            <>
              {' '}
              <b>{feito.orfaos} produto(s) saíram da vitrine</b> porque a categoria antiga deixou
              de existir. Eles voltam quando o ERP reenviá-los com o <code>categoryCode</code> —
              nada foi apagado.
            </>
          )}
          {feito.warnings.length > 0 && (
            <ul className="mt-2 list-disc pl-4 space-y-0.5 text-emerald-800">
              {feito.warnings.map((w) => <li key={w}>{w}</li>)}
            </ul>
          )}
        </div>
      )}

      {confirmando && (
        <ConfirmDialog
          title="Substituir todas as categorias da loja?"
          message={
            `As ${state.menu.length} categoria(s) atuais da loja serão apagadas e recriadas a `
            + `partir das ${ativas} categoria(s) ativas do ERP.\n\n`
            + `Os ${naVitrine} produto(s) que estão na vitrine hoje saem dela até o ERP reenviar `
            + 'cada um com o código da categoria. Nenhum produto é apagado.\n\n'
            + 'Os endereços das categorias antigas (/?categoria=…) deixam de existir, inclusive os '
            + 'que já estão indexados no Google.'
          }
          confirmLabel="Substituir"
          onCancel={() => setConfirmando(false)}
          onConfirm={rodar}
        />
      )}
    </Card>
  );
}

/** Como cada motivo se apresenta e o que ele promete. */
const MOTIVO: Record<MotivoDeParada, { rotulo: string; cor: string }> = {
  amarrado: { rotulo: 'já amarrado — ficaram para trás', cor: 'bg-emerald-100 text-emerald-800' },
  pendente: { rotulo: 'falta amarrar aqui', cor: 'bg-amber-100 text-amber-800' },
  orfao: { rotulo: 'o ERP nunca mandou esta categoria', cor: 'bg-red-100 text-red-800' },
  sem_codigo: { rotulo: 'vieram sem código', cor: 'bg-gray-200 text-gray-700' },
};

/**
 * Um grupo de produtos parados, com a ação que resolve AQUELE caso.
 *
 * O botão muda com o motivo porque o caminho muda com o motivo — e era isso
 * que faltava. O aviso antigo tinha um texto só, "amarre a categoria
 * correspondente abaixo", que valia para um dos quatro casos. Nos outros três
 * ele mandava fazer algo que não existia para ser feito, e a pessoa ficava
 * olhando uma lista onde não havia nada pendente.
 */
function GrupoDeParados({ g, onProcurar, onVerProdutos, onMudou }: {
  g: GrupoParado;
  onProcurar: (code: string) => void;
  onVerProdutos: () => void;
  onMudou: () => void;
  key?: React.Key;
}) {
  const { reaplicarCodigoDoErp, registrarCodigoDoErp } = useAdmin();
  const [abertos, setAbertos] = useState(false);
  const [rodando, setRodando] = useState(false);
  const [erro, setErro] = useState('');
  const [feito, setFeito] = useState('');

  const agir = async (fn: () => Promise<string>) => {
    setErro('');
    setFeito('');
    setRodando(true);
    try {
      setFeito(await fn());
      onMudou();
    } catch (e) {
      setErro(msgDoErro(e));
    } finally {
      setRodando(false);
    }
  };

  const m = MOTIVO[g.motivo];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-sm text-gray-800">
              {g.code === '' ? 'Sem código de categoria' : `Código ${g.code}`}
            </span>
            {g.name !== '' && g.name !== g.code && (
              <span className="text-sm text-gray-500">· {g.name}</span>
            )}
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${m.cor}`}>
              {m.rotulo}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-1.5 leading-relaxed max-w-2xl">
            {g.motivo === 'amarrado' && (
              <>
                Este código já aponta para uma categoria da loja, e mesmo assim estes{' '}
                <b>{g.total} produto(s)</b> ficaram de fora. A amarração só liberou quem estava
                esperando no instante do clique — quem perdeu a categoria depois (porque alguém a
                trocou para "— sem categoria —" no painel, por exemplo) não é alcançado por ela.
              </>
            )}
            {g.motivo === 'pendente' && (
              <>
                O ERP mandou esta categoria, mas ela ainda não tem destino na loja.{' '}
                <b>{g.total} produto(s)</b> entram na vitrine no instante em que você amarrar.
              </>
            )}
            {g.motivo === 'orfao' && (
              <>
                O ERP mandou <b>{g.total} produto(s)</b> com este código, mas nunca mandou a
                categoria dele. A loja não consegue amarrar um código que não conhece. Peça ao ERP
                a carga desta categoria — ou registre o código aqui e escolha você mesma a
                categoria da loja; quando o cadastro de verdade chegar, o nome se corrige sozinho e
                a amarração continua valendo.
              </>
            )}
            {g.motivo === 'sem_codigo' && (
              <>
                Estes <b>{g.total} produto(s)</b> não trazem código de categoria nenhum — ou
                nasceram aqui no painel. Nenhuma amarração resolve: é escolher a categoria de cada
                um em Produtos.
              </>
            )}
          </p>
        </div>

        <div className="shrink-0">
          {g.motivo === 'amarrado' && (
            <Btn
              disabled={rodando}
              onClick={() => agir(async () => {
                const n = await reaplicarCodigoDoErp(g.code);
                return `${n} produto(s) entraram na vitrine.`;
              })}
            >
              {rodando ? 'Aplicando…' : 'Colocar na vitrine agora'}
            </Btn>
          )}
          {g.motivo === 'pendente' && (
            <Btn variant="ghost" onClick={() => onProcurar(g.code)}>Ir para a amarração</Btn>
          )}
          {g.motivo === 'orfao' && (
            <Btn
              disabled={rodando}
              onClick={() => agir(async () => {
                const n = await registrarCodigoDoErp(g.code, g.code);
                return `Código registrado. Agora ele aparece na lista abaixo: escolha a categoria `
                  + `da loja e ${n} produto(s) entram na vitrine.`;
              })}
            >
              {rodando ? 'Registrando…' : 'Registrar este código'}
            </Btn>
          )}
          {g.motivo === 'sem_codigo' && (
            <Btn variant="ghost" onClick={onVerProdutos}>Abrir em Produtos</Btn>
          )}
        </div>
      </div>

      {erro !== '' && (
        <p className="mt-3 text-xs font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {erro}
        </p>
      )}
      {feito !== '' && (
        <p className="mt-3 text-xs font-medium text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
          {feito}
        </p>
      )}

      <button
        onClick={() => setAbertos((v) => !v)}
        className="mt-3 text-[11px] font-semibold text-primary-blue hover:underline"
      >
        {abertos ? 'Esconder os produtos' : `Ver os produtos (${g.total})`}
      </button>

      {abertos && (
        <ul className="mt-2 space-y-1 max-h-72 overflow-y-auto pr-1">
          {g.produtos.map((p) => (
            <li key={p.id} className="flex items-baseline gap-2 text-xs">
              <span className="font-mono text-[10px] text-gray-400 shrink-0">
                {p.sku !== '' ? p.sku : p.id}
              </span>
              <span className="text-gray-700 truncate">{p.name}</span>
              {!p.active && (
                <span className="text-[10px] text-gray-400 shrink-0">(inativo)</span>
              )}
            </li>
          ))}
          {g.total > g.produtos.length && (
            <li className="text-[11px] text-gray-400 pt-1">
              … e mais {g.total - g.produtos.length}. A lista mostra uma amostra; a ação acima vale
              para todos.
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/**
 * O aviso dos produtos fora da vitrine.
 *
 * O número sozinho era um beco sem saída: ele dizia quantos, mandava amarrar a
 * categoria correspondente abaixo, e não dizia QUAIS nem o que fazer quando
 * não havia nada pendente para amarrar — que foi exatamente o que aconteceu
 * numa loja com 41 categorias do ERP, todas amarradas, e 51 produtos parados.
 *
 * A lista é carregada só quando se pede. A contagem é um número e já vem no
 * estado do painel; a lista pode ter milhares de linhas no dia de uma carga
 * errada, e ninguém deveria pagar por isso ao abrir o painel para outra coisa.
 */
function AvisoDeProdutosParados({ total, onProcurar, onVerProdutos }: {
  total: number;
  onProcurar: (code: string) => void;
  onVerProdutos: () => void;
}) {
  const { fetchProdutosParados } = useAdmin();
  const [dados, setDados] = useState<ProdutosParados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');

  const carregar = async () => {
    setCarregando(true);
    setErro('');
    try {
      setDados(await fetchProdutosParados());
    } catch (e) {
      setErro(msgDoErro(e));
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 overflow-hidden">
      <div className="flex gap-3 p-4">
        <AlertTriangle size={18} className="text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed flex-1">
          <b>{total} produto(s) estão sem categoria e não aparecem na vitrine.</b>{' '}
          Eles chegaram do ERP sem um destino aqui. O motivo não é o mesmo para todos — e cada
          motivo se resolve num lugar diferente.
          <div className="mt-2.5">
            <Btn variant="ghost" onClick={() => void carregar()} disabled={carregando}>
              {carregando
                ? 'Carregando…'
                : dados === null ? 'Ver quais produtos' : 'Atualizar a lista'}
            </Btn>
          </div>
          {erro !== '' && <p className="mt-2 font-medium text-red-700">{erro}</p>}
        </div>
      </div>

      {dados !== null && (
        <div className="border-t border-amber-200 bg-white/70 p-4 space-y-3">
          {dados.grupos.length === 0 ? (
            <p className="text-xs text-gray-500">
              Nenhum produto parado agora. Se o número acima ainda mostra algum, atualize a lista.
            </p>
          ) : (
            dados.grupos.map((g) => (
              <GrupoDeParados
                key={`${g.motivo}:${g.code}`}
                g={g}
                onProcurar={onProcurar}
                onVerProdutos={onVerProdutos}
                onMudou={() => void carregar()}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface CategoriesAdminProps {
  /** Leva para Produtos já com o filtro "sem categoria" ligado. */
  verProdutosSemCategoria: () => void;
}

export default function CategoriesAdmin({ verProdutosSemCategoria }: CategoriesAdminProps) {
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
          <EspelharDoErp />

          {/*
            Este número é a razão da tela existir. Produto recebido com código
            não amarrado entra sem categoria e some da vitrine — sem erro,
            sem log que o dono leia. Aqui ele fica visível.
          */}
          {semCategoria > 0 && (
            <AvisoDeProdutosParados
              total={semCategoria}
              onProcurar={(code) => {
                /*
                 * O código vai para a busca da lista abaixo, em vez de só
                 * dizer "procure ali". Com 41 categorias na tela, "procure o
                 * código 0317" é mais um passo para errar.
                 */
                setSoPendentes(false);
                setBusca(code);
                document.getElementById('lista-de-codigos')?.scrollIntoView({
                  behavior: 'smooth', block: 'start',
                });
              }}
              onVerProdutos={verProdutosSemCategoria}
            />
          )}

          <Card className="p-5 space-y-4" id="lista-de-codigos">
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
