/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Integration adapter layer.
 *
 * Each provider declares the credential fields it needs and a `testConnection`
 * routine. Calls are real HTTP requests where the public API is well known
 * (Z-API, Evolution, Chatwoot, Chatvolt). The ERP adapter is generic (base URL
 * + token) since each ERP differs — wire the concrete endpoints when chosen.
 *
 * NOTE: calling these from the browser is fine for setup/testing, but in
 * production the secrets and webhooks should live behind a backend. This file
 * is intentionally the single place to swap browser fetch → server proxy.
 */

import { IntegrationId } from './types';

export interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  type?: 'text' | 'password' | 'url';
  help?: string;
}

export type ProviderCategory = 'payment' | 'logistics' | 'erp' | 'whatsapp' | 'chat';

export interface ProviderMeta {
  id: IntegrationId;
  name: string;
  category: ProviderCategory;
  description: string;
  docsUrl?: string;
  native?: boolean; // first-party / recommended integration
  fields: FieldDef[];
}

export const PROVIDERS: ProviderMeta[] = [
  // ---- Payment gateways ----
  {
    id: 'mercadopago',
    name: 'Mercado Pago',
    category: 'payment',
    description: 'Cartão, Pix e boleto com o checkout do Mercado Pago.',
    docsUrl: 'https://www.mercadopago.com.br/developers',
    fields: [
      { key: 'publicKey', label: 'Public Key' },
      { key: 'accessToken', label: 'Access Token', type: 'password' },
    ],
  },
  {
    id: 'pagseguro',
    name: 'PagBank / PagSeguro',
    category: 'payment',
    description: 'Receba por cartão, Pix e boleto via PagBank.',
    docsUrl: 'https://dev.pagbank.uol.com.br',
    fields: [
      { key: 'email', label: 'E-mail da conta' },
      { key: 'token', label: 'Token', type: 'password' },
    ],
  },
  {
    id: 'stripe',
    name: 'Stripe',
    category: 'payment',
    description: 'Pagamentos com cartão internacional e assinaturas.',
    docsUrl: 'https://stripe.com/docs',
    fields: [
      { key: 'publishableKey', label: 'Publishable Key' },
      { key: 'secretKey', label: 'Secret Key', type: 'password' },
    ],
  },
  {
    id: 'pagarme',
    name: 'Pagar.me',
    category: 'payment',
    description: 'Gateway completo para cartão, Pix e boleto.',
    docsUrl: 'https://docs.pagar.me',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
      { key: 'encryptionKey', label: 'Encryption Key', type: 'password' },
    ],
  },

  // ---- Logistics / shipping ----
  {
    id: 'correios',
    name: 'Correios',
    category: 'logistics',
    description: 'Cálculo de frete e rastreamento PAC/Sedex.',
    docsUrl: 'https://www.correios.com.br/atendimento/developers',
    fields: [
      { key: 'user', label: 'Usuário (contrato)' },
      { key: 'password', label: 'Senha / Token', type: 'password' },
      { key: 'contract', label: 'Código do contrato', placeholder: 'Opcional' },
    ],
  },
  {
    id: 'melhorenvio',
    name: 'Melhor Envio',
    category: 'logistics',
    description: 'Compare e contrate fretes de várias transportadoras.',
    docsUrl: 'https://docs.melhorenvio.com.br',
    fields: [
      { key: 'token', label: 'Token de acesso', type: 'password' },
      { key: 'sandbox', label: 'Ambiente (production/sandbox)', placeholder: 'production' },
    ],
  },
  {
    id: 'frenet',
    name: 'Frenet',
    category: 'logistics',
    description: 'Cotação de frete em tempo real com múltiplas transportadoras.',
    docsUrl: 'https://painel.frenet.com.br',
    fields: [
      { key: 'token', label: 'Token Frenet', type: 'password' },
    ],
  },

  {
    id: 'uno',
    name: 'UNO ERP',
    category: 'erp',
    native: true,
    description: 'Integração nativa com o UNO ERP — sincroniza produtos, estoque, preços e pedidos automaticamente.',
    fields: [
      { key: 'token', label: 'Token de integração UNO', type: 'password', help: 'Gerado no painel do UNO ERP.' },
      { key: 'company', label: 'Código da empresa/filial', placeholder: '001' },
    ],
  },
  {
    id: 'erp',
    name: 'Outro ERP',
    category: 'erp',
    description: 'Conecte qualquer outro ERP via API REST (URL base + token).',
    fields: [
      { key: 'baseUrl', label: 'URL base da API', type: 'url', placeholder: 'https://erp.suaempresa.com/api' },
      { key: 'token', label: 'Token de acesso', type: 'password' },
      { key: 'company', label: 'Código da empresa/filial', placeholder: '001' },
    ],
  },
  {
    id: 'zapi',
    name: 'Z-API (WhatsApp)',
    category: 'whatsapp',
    description: 'Envie e receba mensagens de WhatsApp pela Z-API.',
    docsUrl: 'https://developer.z-api.io',
    fields: [
      { key: 'instanceId', label: 'Instance ID' },
      { key: 'token', label: 'Token', type: 'password' },
      { key: 'clientToken', label: 'Client-Token (Segurança)', type: 'password', help: 'Header Client-Token da conta.' },
    ],
  },
  {
    id: 'evolution',
    name: 'Evolution API (WhatsApp)',
    category: 'whatsapp',
    description: 'WhatsApp via Evolution API (self-hosted ou em nuvem).',
    docsUrl: 'https://doc.evolution-api.com',
    fields: [
      { key: 'baseUrl', label: 'URL base', type: 'url', placeholder: 'https://evolution.suaempresa.com' },
      { key: 'instance', label: 'Nome da instância', placeholder: 'km-alimentos' },
      { key: 'apiKey', label: 'API Key', type: 'password' },
    ],
  },
  {
    id: 'chatwoot',
    name: 'Chatwoot',
    category: 'chat',
    description: 'Central de atendimento omnichannel.',
    docsUrl: 'https://www.chatwoot.com/developers/api',
    fields: [
      { key: 'baseUrl', label: 'URL do Chatwoot', type: 'url', placeholder: 'https://app.chatwoot.com' },
      { key: 'accountId', label: 'Account ID', placeholder: '1' },
      { key: 'apiToken', label: 'API Access Token', type: 'password' },
    ],
  },
  {
    id: 'chatvolt',
    name: 'Chatvolt',
    category: 'chat',
    description: 'Chatbot com IA (agentes) integrado ao atendimento.',
    docsUrl: 'https://docs.chatvolt.ai',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password' },
      { key: 'agentId', label: 'Agent ID' },
    ],
  },
];

export function getProvider(id: IntegrationId): ProviderMeta {
  return PROVIDERS.find((p) => p.id === id)!;
}

export interface TestResult {
  ok: boolean;
  message: string;
}

/**
 * Attempt a lightweight connectivity check per provider.
 * Falls back to a clear message when required fields are missing.
 */
export async function testConnection(
  id: IntegrationId,
  fields: Record<string, string>
): Promise<TestResult> {
  const required = getProvider(id).fields.map((f) => f.key);
  const missing = required.filter((k) => !fields[k]?.trim());
  if (missing.length) {
    return { ok: false, message: `Preencha: ${missing.join(', ')}` };
  }

  try {
    switch (id) {
      case 'zapi': {
        const url = `https://api.z-api.io/instances/${fields.instanceId}/token/${fields.token}/status`;
        const res = await fetch(url, {
          headers: fields.clientToken ? { 'Client-Token': fields.clientToken } : {},
        });
        return { ok: res.ok, message: res.ok ? 'Conexão Z-API OK.' : `Falha (HTTP ${res.status}).` };
      }
      case 'evolution': {
        const url = `${trimSlash(fields.baseUrl)}/instance/connectionState/${encodeURIComponent(fields.instance)}`;
        const res = await fetch(url, { headers: { apikey: fields.apiKey } });
        return { ok: res.ok, message: res.ok ? 'Conexão Evolution OK.' : `Falha (HTTP ${res.status}).` };
      }
      case 'chatwoot': {
        const url = `${trimSlash(fields.baseUrl)}/api/v1/accounts/${fields.accountId}/conversations`;
        const res = await fetch(url, { headers: { api_access_token: fields.apiToken } });
        return { ok: res.ok, message: res.ok ? 'Conexão Chatwoot OK.' : `Falha (HTTP ${res.status}).` };
      }
      case 'chatvolt': {
        const res = await fetch('https://api.chatvolt.ai/agents', {
          headers: { Authorization: `Bearer ${fields.apiKey}` },
        });
        return { ok: res.ok, message: res.ok ? 'Conexão Chatvolt OK.' : `Falha (HTTP ${res.status}).` };
      }
      case 'uno': {
        // Native UNO ERP endpoint (placeholder host — wire the real one in prod).
        const res = await fetch('https://api.unoerp.com/v1/ping', {
          headers: { Authorization: `Bearer ${fields.token}` },
        });
        return { ok: res.ok, message: res.ok ? 'UNO ERP conectado.' : `Falha (HTTP ${res.status}).` };
      }
      case 'erp': {
        const res = await fetch(`${trimSlash(fields.baseUrl)}/health`, {
          headers: { Authorization: `Bearer ${fields.token}` },
        });
        return { ok: res.ok, message: res.ok ? 'ERP respondeu OK.' : `Falha (HTTP ${res.status}).` };
      }
      // Payment gateways & logistics: validating from the browser is blocked by
      // CORS. We accept the saved credentials and confirm the real handshake
      // happens server-side (where the secret keys must live anyway).
      case 'mercadopago':
      case 'pagseguro':
      case 'stripe':
      case 'pagarme':
        return { ok: true, message: 'Credenciais salvas. A validação ocorre no servidor ao processar um pagamento.' };
      case 'correios':
      case 'melhorenvio':
      case 'frenet':
        return { ok: true, message: 'Credenciais salvas. A cotação de frete é validada no servidor.' };
      default:
        return { ok: false, message: 'Provedor desconhecido.' };
    }
  } catch (e) {
    // CORS or network errors are expected when testing 3rd-party APIs from the
    // browser without a proxy — report honestly instead of pretending success.
    return {
      ok: false,
      message:
        'Não foi possível validar pelo navegador (provável CORS/rede). As credenciais foram salvas; valide pelo backend/proxy em produção.',
    };
  }
}

/** Send a WhatsApp text message through the configured provider. */
export async function sendWhatsApp(
  id: 'zapi' | 'evolution',
  fields: Record<string, string>,
  phone: string,
  message: string
): Promise<TestResult> {
  try {
    if (id === 'zapi') {
      const url = `https://api.z-api.io/instances/${fields.instanceId}/token/${fields.token}/send-text`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(fields.clientToken ? { 'Client-Token': fields.clientToken } : {}),
        },
        body: JSON.stringify({ phone, message }),
      });
      return { ok: res.ok, message: res.ok ? 'Mensagem enviada.' : `Falha (HTTP ${res.status}).` };
    }
    // evolution
    const url = `${trimSlash(fields.baseUrl)}/message/sendText/${encodeURIComponent(fields.instance)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: fields.apiKey },
      body: JSON.stringify({ number: phone, text: message }),
    });
    return { ok: res.ok, message: res.ok ? 'Mensagem enviada.' : `Falha (HTTP ${res.status}).` };
  } catch {
    return { ok: false, message: 'Falha de rede/CORS ao enviar pelo navegador.' };
  }
}

function trimSlash(s: string) {
  return s.replace(/\/+$/, '');
}
