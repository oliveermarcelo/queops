/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  KeyRound, Plus, Copy, Check, Trash2, Webhook as WebhookIcon, Code2,
  Zap, X, Activity, AlertTriangle,
} from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { fmtDate, Card, Btn, ConfirmDialog, inputCls } from '../ui';

// A API pública mora no mesmo domínio da loja.
const API_BASE = `${typeof window === 'undefined' ? '' : window.location.origin}/api/v1`;

/** Data com hora — em "último uso", saber o dia sem a hora não ajuda a depurar. */
const fmtDataHora = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    })
    : '—';

/**
 * Endpoints que o teste percorre.
 *
 * São os três de leitura que o ERP consome. Só GET: um teste de conexão que
 * escreve no catálogo ou muda um pedido é uma armadilha esperando o dia em que
 * alguém clicar "testar" na loja em produção.
 */
const TESTE_ENDPOINTS = [
  { path: '/products', chave: 'products', rotulo: 'produtos' },
  { path: '/orders', chave: 'orders', rotulo: 'pedidos' },
  { path: '/customers', chave: 'customers', rotulo: 'clientes' },
] as const;

interface ResultadoDoTeste {
  path: string;
  rotulo: string;
  status: number;
  quantos: number | null;
  ms: number;
  erro: string;
}

const ENDPOINTS = [
  { method: 'GET', path: '/products', desc: 'Lista produtos do catálogo' },
  { method: 'GET', path: '/products/:id', desc: 'Detalhe de um produto' },
  { method: 'PATCH', path: '/products/:id/stock', desc: 'Atualiza o estoque (ERP)' },
  { method: 'GET', path: '/orders', desc: 'Lista pedidos (?status= &since=)' },
  { method: 'GET', path: '/orders/:id', desc: 'Detalhe de um pedido' },
  { method: 'PATCH', path: '/orders/:id', desc: 'Atualiza status do pedido' },
  { method: 'GET', path: '/customers', desc: 'Lista clientes' },
];

const EVENTS = ['order.created', 'order.status_changed', 'cart.abandoned', 'customer.created'];

const NOCODE = [
  { name: 'Zapier', url: 'https://zapier.com' },
  { name: 'Make', url: 'https://make.com' },
  { name: 'n8n', url: 'https://n8n.io' },
];

const methodColor: Record<string, string> = {
  GET: 'bg-emerald-100 text-emerald-700',
  POST: 'bg-blue-100 text-blue-700',
  PATCH: 'bg-amber-100 text-amber-700',
  DELETE: 'bg-red-100 text-red-700',
};

function Copyable({ value, className = '' }: { value: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
      className={`inline-flex items-center gap-1.5 text-gray-400 hover:text-primary-blue transition-colors ${className}`}
      title="Copiar"
    >
      {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
    </button>
  );
}

/**
 * Testa uma chave de API fazendo a chamada de verdade.
 *
 * A chamada sai DO NAVEGADOR, e não do servidor, de propósito: assim ela
 * percorre o mesmo caminho público que o UNO percorre — domínio, proxy da
 * Hostinger, HTTPS. Um teste feito pelo servidor contra si mesmo pularia
 * justamente a parte que costuma quebrar, e daria verde com o caminho externo
 * bloqueado.
 *
 * A chave precisa ser colada porque o servidor não a tem: guarda só o hash.
 * Isso é a mesma razão pela qual ela não pode ser exibida de novo depois de
 * criada — e o hash é o que impede que um banco vazado entregue chaves
 * utilizáveis. O texto colado aqui não é salvo em lugar nenhum.
 */
function TesteDaChave({ nome, prefixo }: { nome: string; prefixo: string }) {
  const [token, setToken] = useState('');
  const [rodando, setRodando] = useState(false);
  const [resultados, setResultados] = useState<ResultadoDoTeste[] | null>(null);
  const [aviso, setAviso] = useState('');

  const testar = async () => {
    const chave = token.trim();
    setAviso('');
    setResultados(null);

    if (chave === '') {
      setAviso('Cole a chave que você cadastrou no UNO.');
      return;
    }

    /*
     * Confere o começo da chave antes de testar.
     *
     * Sem esta checagem, colar OUTRA chave válida faria o teste passar e a
     * pessoa concluiria que a chave desta linha funciona — o resultado certo
     * para a pergunta errada. É o tipo de acerto que esconde o problema.
     */
    if (chave.slice(0, 16) !== prefixo) {
      setAviso(
        `Essa chave não é a "${nome}": o começo dela deveria ser ${prefixo}. `
        + 'Confira se não colou outra chave.',
      );
      return;
    }

    setRodando(true);
    const saida: ResultadoDoTeste[] = [];
    for (const e of TESTE_ENDPOINTS) {
      const t0 = performance.now();
      try {
        const res = await fetch(`/api/v1${e.path}`, {
          headers: { Authorization: `Bearer ${chave}`, Accept: 'application/json' },
        });
        const ms = Math.round(performance.now() - t0);
        let quantos: number | null = null;
        let erro = '';
        try {
          const corpo = await res.json();
          const lista = corpo?.[e.chave];
          if (Array.isArray(lista)) quantos = lista.length;
          if (corpo?.error?.message) erro = String(corpo.error.message);
        } catch {
          erro = 'a resposta não era JSON';
        }
        saida.push({ path: e.path, rotulo: e.rotulo, status: res.status, quantos, ms, erro });
      } catch (err) {
        saida.push({
          path: e.path,
          rotulo: e.rotulo,
          status: 0,
          quantos: null,
          ms: Math.round(performance.now() - t0),
          erro: err instanceof Error ? err.message : 'a requisição não completou',
        });
      }
    }
    setResultados(saida);
    setRodando(false);
  };

  const todosOk = resultados !== null && resultados.every((r) => r.status === 200);
  const algum401 = resultados?.some((r) => r.status === 401) ?? false;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          autoFocus
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Cole aqui a chave que está cadastrada no UNO"
          className={`${inputCls} font-mono`}
          onKeyDown={(e) => e.key === 'Enter' && !rodando && testar()}
        />
        <Btn onClick={testar} disabled={rodando}>
          {rodando ? 'Testando…' : 'Testar agora'}
        </Btn>
      </div>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        A chave precisa ser colada porque o servidor guarda só o hash dela — é isso que impede que um
        banco vazado entregue chaves utilizáveis. O que você digita aqui não é salvo, e a chamada sai
        deste navegador pelo mesmo endereço público que o UNO usa.
      </p>

      {aviso !== '' && (
        <div className="flex gap-2 items-start text-xs font-medium rounded-lg border border-amber-200 bg-amber-50 text-amber-800 px-3 py-2">
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{aviso}</span>
        </div>
      )}

      {resultados !== null && (
        <div className="space-y-1.5">
          {resultados.map((r) => (
            <div key={r.path} className="flex items-center gap-2 text-xs">
              <span className={`w-12 text-center font-extrabold px-1.5 py-0.5 rounded ${
                r.status === 200 ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
              }`}>
                {r.status === 0 ? '—' : r.status}
              </span>
              <code className="font-mono text-gray-600 w-24">{r.path}</code>
              <span className="text-gray-500 flex-1">
                {r.status === 200
                  ? `${r.quantos ?? 0} ${r.rotulo} · ${r.ms} ms`
                  : (r.erro || 'sem detalhe') + ` · ${r.ms} ms`}
              </span>
            </div>
          ))}

          <p className={`text-xs font-bold pt-1 ${todosOk ? 'text-emerald-700' : 'text-red-700'}`}>
            {todosOk
              ? 'A chave funciona nos três endpoints. Se o ERP ainda não recebe dados, o problema '
                + 'está do lado dele, não na conexão.'
              : algum401
                ? 'A chave foi recusada (401). Ela pode ter sido revogada, ou o ERP está enviando '
                  + 'outra. Gere uma nova e cadastre no ERP.'
                : 'Algum endpoint não respondeu 200. O detalhe de cada linha diz o que voltou.'}
          </p>

          {todosOk && (
            <p className="text-[11px] text-gray-400 leading-relaxed">
              O selo da chave continua como estava de propósito: teste feito pelo painel não conta
              como uso. Assim <b>&quot;nunca usada&quot; continua respondendo só sobre o ERP</b> — que
              é a pergunta que importa quando o outro lado diz que já integrou.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ApiSection() {
  const { state, createApiKey, revokeApiKey, deleteApiKey, addWebhook, removeWebhook } = useAdmin();
  const [newKeyName, setNewKeyName] = useState('');
  const [creating, setCreating] = useState(false);
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const [testando, setTestando] = useState<string | null>(null);

  const [whUrl, setWhUrl] = useState('');
  const [whEvent, setWhEvent] = useState(EVENTS[0]);
  const [confirming, setConfirming] = useState<
    { kind: 'revoke' | 'delete'; id: string; name: string } | null
  >(null);

  const handleCreate = async () => {
    // O token completo só existe neste instante: o servidor guarda apenas o
    // hash, então não há como exibi-lo de novo depois.
    setFreshToken(await createApiKey(newKeyName.trim()));
    setNewKeyName('');
    setCreating(false);
  };

  const handleAddWebhook = async () => {
    if (!whUrl.trim()) return;
    await addWebhook({ url: whUrl.trim(), event: whEvent, active: true });
    setWhUrl('');
  };

  return (
    <div className="space-y-6">
      {/* Section header */}
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gray-900/5 text-gray-700 flex items-center justify-center">
          <Code2 size={17} />
        </div>
        <div>
          <h2 className="font-bold text-gray-800">API & Desenvolvedores</h2>
          <p className="text-xs text-gray-400">Exponha sua loja para outras ferramentas (Zapier, Make, n8n, Bling…)</p>
        </div>
      </div>

      {/* API base */}
      <Card className="p-5">
        <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">URL base da API</p>
        <div className="flex items-center justify-between bg-gray-900 rounded-lg px-4 py-3">
          <code className="text-sm text-emerald-300 font-mono">{API_BASE}</code>
          <Copyable value={API_BASE} className="text-gray-400 hover:text-white" />
        </div>
        <p className="text-[11px] text-gray-400 mt-2">
          Autenticação via header <code className="text-primary-blue">Authorization: Bearer SUA_API_KEY</code>
        </p>
      </Card>

      {/* API Keys */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <KeyRound size={18} className="text-primary-blue" />
            <h3 className="font-bold text-gray-800">Chaves de API</h3>
          </div>
          <Btn onClick={() => setCreating(true)}><Plus size={15} /> Gerar nova chave</Btn>
        </div>

        {/* Fresh token alert */}
        {freshToken && (
          <div className="mb-4 p-4 rounded-xl bg-emerald-50 border border-emerald-200">
            <p className="text-xs font-bold text-emerald-800 mb-2">
            Chave criada! Copie agora — o servidor guarda só o hash, então ela não pode ser exibida
            de novo.
          </p>
            <div className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-emerald-200">
              <code className="text-sm font-mono text-gray-800 truncate">{freshToken}</code>
              <Copyable value={freshToken} />
            </div>
          </div>
        )}

        {/* Create form */}
        {creating && (
          <div className="mb-4 flex gap-2">
            <input
              autoFocus
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="Nome da chave (ex: Integração Bling)"
              className={inputCls}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
            <Btn onClick={handleCreate}>Criar</Btn>
            <Btn variant="ghost" onClick={() => setCreating(false)}>Cancelar</Btn>
          </div>
        )}

        <div className="space-y-2">
          {state.apiKeys.map((k) => {
            const jaUsada = Boolean(k.lastUsedAt);
            return (
              <div key={k.id} className={`p-3 rounded-lg border ${k.revoked ? 'border-gray-150 bg-gray-50/50' : 'border-gray-150'}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex-1 min-w-0 ${k.revoked ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-gray-800">{k.name}</p>
                      {k.revoked && <span className="text-[10px] font-bold bg-red-100 text-red-600 px-2 py-0.5 rounded-full">Revogada</span>}
                      {/*
                        "Nunca usada" é o diagnóstico mais útil desta tela: se o
                        ERP jura que integrou e a chave nunca foi usada, nenhuma
                        requisição chegou — o problema está antes da loja
                        (endereço errado, chave errada, firewall), e não aqui.
                      */}
                      {!k.revoked && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          jaUsada ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {jaUsada ? 'em uso' : 'nunca usada'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <code className="text-xs font-mono text-gray-500">{k.token}</code>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      Criada em {fmtDate(k.createdAt)}
                      {' · '}
                      {jaUsada
                        ? `último uso em ${fmtDataHora(k.lastUsedAt)}`
                        : 'nenhuma requisição externa recebida com ela ainda'}
                    </p>
                  </div>

                  {!k.revoked && (
                    <button
                      onClick={() => setTestando(testando === k.id ? null : k.id)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-lg border transition-colors ${
                        testando === k.id
                          ? 'border-primary-blue text-primary-blue bg-primary-blue/5'
                          : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                      title="Fazer uma chamada real na API com esta chave"
                    >
                      <Activity size={14} /> Testar
                    </button>
                  )}

                  {k.revoked ? (
                    <button
                      onClick={() => setConfirming({ kind: 'delete', id: k.id, name: k.name })}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-brand-red border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                      title="Excluir"
                    >
                      <Trash2 size={14} /> Excluir
                    </button>
                  ) : (
                    <button
                      onClick={() => setConfirming({ kind: 'revoke', id: k.id, name: k.name })}
                      className="p-2 text-gray-400 hover:text-brand-red rounded-lg hover:bg-gray-100"
                      title="Revogar"
                    >
                      <Trash2 size={15} />
                    </button>
                  )}
                </div>

                {testando === k.id && (
                  <TesteDaChave nome={k.name} prefixo={k.token.slice(0, 16)} />
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {confirming && (
        <ConfirmDialog
          title={confirming.kind === 'revoke' ? 'Revogar chave' : 'Excluir chave'}
          message={
            confirming.kind === 'revoke'
              ? `Integrações que usam "${confirming.name}" param de funcionar imediatamente.`
              : `A chave "${confirming.name}" será apagada em definitivo.`
          }
          confirmLabel={confirming.kind === 'revoke' ? 'Revogar' : 'Excluir'}
          onCancel={() => setConfirming(null)}
          onConfirm={() => {
            if (confirming.kind === 'revoke') void revokeApiKey(confirming.id);
            else void deleteApiKey(confirming.id);
            setConfirming(null);
          }}
        />
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Endpoints */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <Code2 size={18} className="text-primary-blue" />
            <h3 className="font-bold text-gray-800">Endpoints REST</h3>
          </div>
          <div className="space-y-1.5">
            {ENDPOINTS.map((e) => (
              <div key={e.method + e.path} className="flex items-center gap-3 py-1.5">
                <span className={`text-[10px] font-extrabold px-2 py-1 rounded w-14 text-center ${methodColor[e.method]}`}>{e.method}</span>
                <code className="text-xs font-mono text-gray-700 flex-1">{e.path}</code>
                <span className="text-[11px] text-gray-400 hidden sm:block">{e.desc}</span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-gray-400 mt-3 pt-3 border-t border-gray-100">
            Base: <code className="text-primary-blue">{API_BASE}</code>
          </p>
        </Card>

        {/* Webhooks */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <WebhookIcon size={18} className="text-primary-blue" />
            <h3 className="font-bold text-gray-800">Webhooks de saída</h3>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <input
              value={whUrl}
              onChange={(e) => setWhUrl(e.target.value)}
              placeholder="https://hooks.suaferramenta.com/..."
              className={`${inputCls} flex-1`}
            />
            <select value={whEvent} onChange={(e) => setWhEvent(e.target.value)} className={`${inputCls} sm:w-44`}>
              {EVENTS.map((ev) => <option key={ev} value={ev}>{ev}</option>)}
            </select>
            <Btn onClick={handleAddWebhook}><Plus size={15} /></Btn>
          </div>

          <div className="space-y-2">
            {state.webhooks.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">Nenhum webhook cadastrado. Dispare eventos para ferramentas externas.</p>
            )}
            {state.webhooks.map((w) => (
              <div key={w.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-gray-150">
                <span className="text-[10px] font-bold bg-primary-blue/10 text-primary-blue px-2 py-0.5 rounded-full whitespace-nowrap">{w.event}</span>
                <code className="text-xs text-gray-600 font-mono flex-1 truncate">{w.url}</code>
                <button onClick={() => removeWebhook(w.id)} className="p-1.5 text-gray-400 hover:text-brand-red rounded-lg hover:bg-gray-100">
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* No-code shortcuts */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Zap size={18} className="text-brand-gold" />
          <h3 className="font-bold text-gray-800">Conecte sem código</h3>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {NOCODE.map((n) => (
            <a
              key={n.name}
              href={n.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between p-4 rounded-xl border border-gray-150 hover:border-primary-blue hover:bg-primary-blue/[0.03] transition-all group"
            >
              <span className="font-bold text-gray-800">{n.name}</span>
              <Zap size={16} className="text-gray-300 group-hover:text-primary-blue" />
            </a>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-3">
          Use a URL base e uma API Key acima para conectar nessas plataformas (e em ferramentas como Bling) via requisições HTTP.
        </p>
      </Card>
    </div>
  );
}
