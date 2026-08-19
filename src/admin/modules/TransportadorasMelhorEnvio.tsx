/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Escolha das transportadoras do Melhor Envio.
 *
 * A lista NÃO vem de um catálogo: vem de uma cotação de amostra (500 g para São
 * Paulo), que é a mesma chamada que o checkout faz. Então o que aparece aqui é o
 * que o cliente vai ver — e o que falhar aparece com o motivo, em vez de sumir.
 * "A Loggi não aparece" é uma pergunta pior do que "Loggi: não atende este CEP".
 *
 * O que fica marcado é o que o cliente pode escolher no checkout. Nada marcado
 * significa nenhuma opção do Melhor Envio na loja — e a tela diz isso, porque
 * "salvei e não mudou nada" é o pior desfecho possível aqui.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Truck } from 'lucide-react';

import { api } from '../../api/client';

interface Opcao {
  servico: string;
  nome: string;
  transportadora: string;
  preco: number;
  prazoDias: number;
  erro: string;
}

interface Resposta {
  opcoes: Opcao[];
  selecionados: string[];
  erro: string;
}

interface Props {
  /** Ids marcados, como o campo `services` guarda ("1,2,18"). */
  valor: string;
  onChange: (novo: string) => void;
  /**
   * Muda a cada salvar/testar no cartão, para buscar a lista de novo.
   *
   * A cotação depende do CEP de origem já estar SALVO no servidor. Buscando só
   * ao abrir, a seção ficava presa no aviso "preencha o CEP de origem" mesmo
   * depois de o CEP ter sido salvo.
   */
  recarregar?: number;
  /** A loja tem contrato próprio dos Correios ligado? Muda o aviso da lista. */
  correiosProprio?: boolean;
}

/** O serviço é Correios revendido pelo Melhor Envio? */
function ehCorreios(o: Opcao): boolean {
  return /correios/i.test(o.transportadora) || /correios/i.test(o.nome);
}

const brl = (n: number): string => n.toFixed(2).replace('.', ',');

export default function TransportadorasMelhorEnvio({
  valor, onChange, recarregar = 0, correiosProprio = false,
}: Props) {
  const [opcoes, setOpcoes] = useState<Opcao[] | null>(null);
  const [erro, setErro] = useState('');
  const [carregando, setCarregando] = useState(false);

  const marcados = new Set(
    valor.split(/[,;\s]+/).map((x) => x.trim()).filter((x) => x !== ''),
  );

  const buscar = useCallback(async () => {
    setCarregando(true);
    setErro('');
    try {
      const r = await api.get<Resposta>('/admin/melhorenvio/servicos');
      setOpcoes(r.opcoes);
      setErro(r.erro);
      /*
       * Na primeira carga, se nada estiver marcado no painel, o servidor devolve
       * o que já estava salvo — respeitamos essa lista em vez de inventar uma
       * seleção. Marcar tudo por conta própria colocaria transportadora na loja
       * sem ninguém pedir.
       */
      if (valor.trim() === '' && r.selecionados.length > 0) {
        onChange(r.selecionados.join(','));
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível consultar o Melhor Envio.');
      setOpcoes([]);
    } finally {
      setCarregando(false);
    }
  }, [valor, onChange]);

  // Ao abrir a seção e a cada salvar/testar no cartão.
  useEffect(() => {
    void buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarregar]);

  const alternar = (servico: string): void => {
    const novo = new Set(marcados);
    if (novo.has(servico)) novo.delete(servico);
    else novo.add(servico);
    onChange([...novo].join(','));
  };

  const cotaram = (opcoes ?? []).filter((o) => o.erro === '');
  const falharam = (opcoes ?? []).filter((o) => o.erro !== '');

  return (
    <div className="pt-4 mt-4 border-t border-gray-100">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h4 className="text-xs font-bold text-gray-700 flex items-center gap-1.5 m-0">
          <Truck size={14} className="text-primary-blue" aria-hidden="true" />
          Transportadoras disponíveis para o cliente
        </h4>
        <button
          type="button"
          onClick={() => void buscar()}
          disabled={carregando}
          className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary-blue hover:underline disabled:opacity-50"
        >
          {carregando
            ? <Loader2 size={12} className="animate-spin" aria-hidden="true" />
            : <RefreshCw size={12} aria-hidden="true" />}
          Atualizar lista
        </button>
      </div>
      <p className="text-[11px] text-gray-400 mt-0 mb-3">
        Cotação de amostra: 500 g para São Paulo. Marque o que o cliente pode escolher no checkout.
      </p>

      {carregando && opcoes === null && (
        <p className="text-xs text-gray-400 flex items-center gap-2 m-0 py-2">
          <Loader2 size={13} className="animate-spin" aria-hidden="true" />
          Consultando a sua conta no Melhor Envio…
        </p>
      )}

      {erro !== '' && (
        <p role="alert" className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 flex items-start gap-1.5 m-0 mb-3">
          <AlertCircle size={13} className="mt-px flex-shrink-0" aria-hidden="true" />
          <span>{erro}</span>
        </p>
      )}

      {cotaram.length > 0 && (
        <ul className="list-none p-0 m-0 space-y-1.5">
          {cotaram.map((o) => (
            <li key={o.servico}>
              <label className="flex items-center gap-2.5 text-xs cursor-pointer rounded-lg px-2 py-2 hover:bg-gray-50">
                <input
                  type="checkbox"
                  checked={marcados.has(o.servico)}
                  onChange={() => alternar(o.servico)}
                  className="w-4 h-4 accent-[#3a5634]"
                />
                <span className="flex-1 min-w-0">
                  <span className="font-semibold text-gray-800">{o.nome}</span>
                  {correiosProprio && ehCorreios(o) && (
                    <span className="block text-[10px] text-amber-700">
                      já cotado pelo seu contrato dos Correios — ali costuma sair mais barato
                    </span>
                  )}
                </span>
                <span className="text-gray-500">
                  R$ {brl(o.preco)}
                  {o.prazoDias > 0 ? ` · ${o.prazoDias} dia${o.prazoDias > 1 ? 's' : ''}` : ''}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {cotaram.length > 0 && marcados.size === 0 && (
        <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2 m-0 mt-3">
          Nenhuma marcada: o Melhor Envio não vai aparecer no checkout. Marque ao menos uma e
          clique em <strong>Salvar</strong>.
        </p>
      )}

      {falharam.length > 0 && (
        <details className="mt-3">
          <summary className="text-[11px] text-gray-400 cursor-pointer">
            {falharam.length} serviço(s) não cotaram nesta amostra — ver motivos
          </summary>
          <ul className="list-none p-0 mt-2 space-y-1">
            {falharam.map((o) => (
              <li key={o.servico} className="text-[11px] text-gray-500">
                <span className="font-semibold">{o.nome}:</span> {o.erro}
              </li>
            ))}
          </ul>
        </details>
      )}

      {!carregando && erro === '' && cotaram.length === 0 && opcoes !== null && (
        <p className="text-xs text-gray-400 m-0">
          Nenhuma transportadora cotou. Confira no Melhor Envio se há transportadoras habilitadas
          no seu plano.
        </p>
      )}
    </div>
  );
}
