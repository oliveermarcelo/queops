/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Database, MessageCircle, Bot, Headphones, Plug,
  CheckCircle2, XCircle, Send, ExternalLink, Loader2,
  Sparkles, Zap, CreditCard, Truck, Code2,
} from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { IntegrationId } from '../types';
import { PROVIDERS, ProviderMeta, ProviderCategory, SECRET_FIELD_KEYS } from '../integrations';
import { sendWhatsAppTest } from '../store';
import ApiSection from './ApiSection';

const PROVIDER_ICON: Record<IntegrationId, React.ComponentType<{ size?: number }>> = {
  uno: Database,
  erp: Database,
  zapi: MessageCircle,
  evolution: MessageCircle,
  chatwoot: Headphones,
  chatvolt: Bot,
  mercadopago: CreditCard,
  pagseguro: CreditCard,
  stripe: CreditCard,
  pagarme: CreditCard,
  correios: Truck,
  melhorenvio: Truck,
  frenet: Truck,
};

// Accent color per category (tailwind-friendly fragments)
const CAT_META: Record<ProviderCategory, { title: string; icon: React.ComponentType<{ size?: number; className?: string }>; grad: string; chip: string }> = {
  payment: { title: 'Pagamentos', icon: CreditCard, grad: 'from-emerald-500 to-teal-600', chip: 'bg-emerald-50 text-emerald-600' },
  logistics: { title: 'Logística & Frete', icon: Truck, grad: 'from-amber-500 to-orange-600', chip: 'bg-amber-50 text-amber-600' },
  erp: { title: 'ERP & Gestão', icon: Database, grad: 'from-primary-blue to-primary-container', chip: 'bg-primary-blue/10 text-primary-blue' },
  whatsapp: { title: 'WhatsApp', icon: MessageCircle, grad: 'from-emerald-500 to-green-600', chip: 'bg-emerald-50 text-emerald-600' },
  chat: { title: 'Atendimento & Chatbot', icon: Headphones, grad: 'from-violet-500 to-purple-600', chip: 'bg-violet-50 text-violet-600' },
};

type TabId = ProviderCategory | 'api';
const TABS: { id: TabId; label: string; icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'payment', label: 'Pagamentos', icon: CreditCard },
  { id: 'logistics', label: 'Logística', icon: Truck },
  { id: 'erp', label: 'ERP', icon: Database },
  { id: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { id: 'chat', label: 'Atendimento', icon: Headphones },
  { id: 'api', label: 'API & Dev', icon: Code2 },
];

export default function IntegrationsAdmin() {
  const { state } = useAdmin();
  const [tab, setTab] = useState<TabId>('payment');

  const enabledCount = Object.values(state.integrations).filter((i) => i.enabled).length;
  const connectedCount = Object.values(state.integrations).filter((i) => i.lastStatus === 'connected').length;

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1b2b18] via-primary-blue to-primary-container text-white p-6 sm:p-8">
        <Plug size={150} className="absolute -right-6 -bottom-8 text-white/10" />
        <div className="absolute -top-10 -left-10 w-40 h-40 rounded-full bg-brand-gold/15 blur-3xl" />
        <div className="relative">
          <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">Conexões</span>
          <h1 className="text-2xl sm:text-3xl font-extrabold mt-1">Integrações</h1>
          <p className="text-sm text-white/70 max-w-xl mt-2">
            Conecte pagamentos, frete, ERP, WhatsApp e atendimento. A camada de integração
            já está pronta — basta inserir as credenciais e ativar.
          </p>
          <div className="flex gap-3 mt-5">
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/10">
              <p className="text-2xl font-extrabold leading-none">{enabledCount}</p>
              <p className="text-[11px] text-white/60 mt-1">ativas</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/10">
              <p className="text-2xl font-extrabold leading-none text-emerald-300">{connectedCount}</p>
              <p className="text-[11px] text-white/60 mt-1">conectadas</p>
            </div>
            <div className="bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2.5 border border-white/10">
              <p className="text-2xl font-extrabold leading-none">{PROVIDERS.length}</p>
              <p className="text-[11px] text-white/60 mt-1">disponíveis</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          const count = t.id === 'api' ? null : PROVIDERS.filter((p) => p.category === t.id).length;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-colors ${
                active ? 'bg-primary-blue text-white shadow-sm' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              <Icon size={16} />
              {t.label}
              {count != null && (
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${active ? 'bg-white/20' : 'bg-gray-100 text-gray-500'}`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'api' ? (
        <ApiSection />
      ) : (
        <div>
          <div className="flex items-center gap-2.5 mb-4">
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${CAT_META[tab].chip}`}>
              {React.createElement(CAT_META[tab].icon, { size: 17 })}
            </div>
            <h2 className="font-bold text-gray-800">{CAT_META[tab].title}</h2>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {PROVIDERS.filter((p) => p.category === tab).map((p) => (
              <IntegrationCard key={p.id} provider={p} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function IntegrationCard({ provider }: { provider: ProviderMeta; key?: React.Key }) {
  const { state, updateIntegration, testIntegration } = useAdmin();
  const cfg = state.integrations[provider.id];
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [open, setOpen] = useState(false);
  const Icon = PROVIDER_ICON[provider.id];
  const meta = CAT_META[provider.category];

  // Rascunho local: os campos só vão para o servidor ao clicar em "Salvar".
  // Digitar não pode disparar uma gravação por tecla.
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);

  const configured = cfg?.configured ?? [];
  const fieldValue = (key: string) => draft[key] ?? cfg?.fields?.[key] ?? '';

  const setField = (key: string, value: string) => {
    setDraft((d) => ({ ...d, [key]: value }));
    setDirty(true);
  };

  const handleSave = async () => {
    setBusy(true);
    setResult(null);
    try {
      await updateIntegration(provider.id, { fields: draft, enabled: cfg?.enabled ?? false });
      setDraft({});
      setDirty(false);
      setResult({ ok: true, message: 'Credenciais salvas no servidor (cifradas).' });
    } finally {
      setBusy(false);
    }
  };

  /*
   * Salva antes de testar, quando há edição pendente.
   *
   * O teste roda no servidor contra a credencial CIFRADA no banco — o que está
   * na tela não viaja junto. Sem salvar primeiro, quem digitou e clicou em
   * "Testar conexão" recebia "falta preencher" com o campo visivelmente
   * preenchido, e concluía que o provedor tinha recusado a credencial.
   */
  const handleTest = async () => {
    setBusy(true);
    setResult(null);
    try {
      if (dirty) {
        await updateIntegration(provider.id, { fields: draft, enabled: cfg?.enabled ?? false });
        setDraft({});
        setDirty(false);
      }
      setResult(await testIntegration(provider.id));
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Falha no teste.' });
    } finally {
      setBusy(false);
    }
  };

  const handleSendTest = async () => {
    if (!testPhone.trim()) {
      setResult({ ok: false, message: 'Informe um número (com DDI/DDD).' });
      return;
    }
    setBusy(true);
    try {
      setResult(await sendWhatsAppTest(testPhone));
    } catch (err) {
      setResult({ ok: false, message: err instanceof Error ? err.message : 'Falha ao enviar.' });
    } finally {
      setBusy(false);
    }
  };

  const isWhatsApp = provider.category === 'whatsapp';
  const status = cfg?.lastStatus ?? 'unknown';

  return (
    <div className={`group bg-white rounded-2xl border shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden ${
      provider.native ? 'border-brand-gold/40 ring-1 ring-brand-gold/20' : 'border-gray-150'
    }`}>
      {/* Top accent strip */}
      <div className={`h-1.5 bg-gradient-to-r ${meta.grad}`} />

      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 bg-gradient-to-br ${meta.grad} text-white shadow-sm`}>
              <Icon size={22} />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-extrabold text-gray-900 truncate">{provider.name}</h3>
                {provider.native && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider bg-brand-gold/15 text-brand-gold px-2 py-0.5 rounded-full">
                    <Sparkles size={10} /> Nativo
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 leading-snug mt-0.5">{provider.description}</p>
            </div>
          </div>

          {/* Toggle */}
          <label className="inline-flex items-center cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              checked={cfg?.enabled ?? false}
              onChange={(e) => void updateIntegration(provider.id, { enabled: e.target.checked, fields: {} })}
              aria-label={`Ativar ${provider.name}`}
              className="sr-only peer"
            />
            <span className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-emerald-500 relative transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-5 after:h-5 after:bg-white after:rounded-full after:shadow after:transition-transform peer-checked:after:translate-x-5" />
          </label>
        </div>

        {/* Status row */}
        <div className="flex items-center justify-between mt-4">
          <StatusPill status={status} enabled={cfg?.enabled ?? false} />
          <button
            onClick={() => setOpen((o) => !o)}
            className="text-xs font-bold text-primary-blue hover:underline"
          >
            {open ? 'Ocultar configurações' : 'Configurar'}
          </button>
        </div>

        {/* Collapsible config */}
        {open && (
          <div className="mt-4 pt-4 border-t border-gray-100 space-y-3 animate-fade-in">
            {provider.fields.map((f) => {
              const isSecret = SECRET_FIELD_KEYS.has(f.key);
              const alreadySet = configured.includes(f.key);
              const inputId = `${provider.id}-${f.key}`;
              return (
                <div key={f.key}>
                  <label htmlFor={inputId} className="block text-xs font-semibold text-gray-600 mb-1.5">
                    {f.label}
                    {isSecret && alreadySet && (
                      <span className="ml-2 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                        configurado
                      </span>
                    )}
                  </label>
                  <input
                    id={inputId}
                    type={f.type === 'password' ? 'password' : 'text'}
                    value={fieldValue(f.key)}
                    onChange={(e) => setField(f.key, e.target.value)}
                    placeholder={
                      isSecret && alreadySet ? 'Deixe em branco para manter o valor atual' : f.placeholder
                    }
                    autoComplete="off"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue transition"
                  />
                  {f.help && <span className="text-[11px] text-gray-400 mt-1 block">{f.help}</span>}
                </div>
              );
            })}

            <p className="text-[11px] text-gray-400 leading-relaxed">
              As credenciais ficam cifradas no banco e nunca voltam para o navegador — por isso os
              campos de senha aparecem vazios mesmo depois de salvos.
            </p>

            {isWhatsApp && (
              <div className="flex gap-2 pt-1">
                <input
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="Nº teste (5511999999999)"
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue"
                />
                <button
                  onClick={handleSendTest}
                  disabled={busy}
                  className="inline-flex items-center gap-1.5 px-4 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold disabled:opacity-50"
                >
                  <Send size={14} /> Enviar
                </button>
              </div>
            )}

            {result && (
              <div className={`flex items-start gap-2 text-xs font-medium rounded-lg p-3 ${result.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>
                {result.ok ? <CheckCircle2 size={15} className="mt-px flex-shrink-0" /> : <XCircle size={15} className="mt-px flex-shrink-0" />}
                <span>{result.message}</span>
              </div>
            )}

            <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
              {provider.docsUrl ? (
                <a href={provider.docsUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-gray-400 hover:text-primary-blue inline-flex items-center gap-1">
                  Documentação <ExternalLink size={12} aria-hidden="true" />
                </a>
              ) : <span />}
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  disabled={busy || !dirty}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  Salvar
                </button>
                <button
                  onClick={handleTest}
                  disabled={busy}
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary-blue hover:bg-primary-container text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50"
                >
                  {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : <Zap size={14} aria-hidden="true" />}
                  Testar conexão
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status, enabled }: { status: string; enabled: boolean }) {
  if (!enabled) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400">
        <span className="w-2 h-2 rounded-full bg-gray-300" /> Desativada
      </span>
    );
  }
  const map: Record<string, { dot: string; text: string; label: string; pulse?: boolean }> = {
    connected: { dot: 'bg-emerald-500', text: 'text-emerald-600', label: 'Conectada', pulse: true },
    error: { dot: 'bg-red-500', text: 'text-red-600', label: 'Erro de conexão' },
    unknown: { dot: 'bg-amber-400', text: 'text-amber-600', label: 'Aguardando teste' },
  };
  const s = map[status] ?? map.unknown;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${s.text}`}>
      <span className="relative flex w-2 h-2">
        {s.pulse && <span className={`absolute inline-flex w-full h-full rounded-full ${s.dot} opacity-60 animate-ping`} />}
        <span className={`relative inline-flex w-2 h-2 rounded-full ${s.dot}`} />
      </span>
      {s.label}
    </span>
  );
}
