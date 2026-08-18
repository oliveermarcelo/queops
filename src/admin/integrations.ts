/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Catálogo de provedores de integração — APENAS metadados.
 *
 * Aqui ficam nome, descrição e quais campos cada provedor pede. O teste de
 * conexão e o envio de mensagens moveram-se para o servidor
 * (`server/src/providers.ts`): antes o navegador chamava Z-API, Stripe e ERP
 * diretamente, o que exigia ter o token no JavaScript e ainda esbarrava em
 * CORS. Agora o painel só pede "teste a Z-API" e o servidor usa a credencial
 * cifrada guardada no banco.
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
    description: 'Cartão e Pix pagos dentro da loja, sem redirecionar o cliente.',
    docsUrl: 'https://www.mercadopago.com.br/developers/pt/docs',
    fields: [
      {
        key: 'publicKey',
        label: 'Public Key',
        placeholder: 'APP_USR-… (ou TEST-… para testar)',
        help: 'Vai para o navegador do cliente: é ela que permite digitar o cartão sem que os números passem pela loja.',
      },
      {
        key: 'accessToken',
        label: 'Access Token',
        type: 'password',
        placeholder: 'APP_USR-… (ou TEST-… para testar)',
        help: 'Secreto. Fica cifrado no banco e nunca chega ao navegador. Se ele já apareceu em e-mail, conversa ou print, renove em Suas integrações → Renovar antes de usar.',
      },
      {
        key: 'webhookSecret',
        label: 'Chave secreta do webhook',
        type: 'password',
        help: 'Copie em Suas integrações → Webhooks → Configurar notificações. Sem ela a confirmação automática do Pix é recusada: é o que distingue um aviso do Mercado Pago de um aviso de qualquer pessoa na internet.',
      },
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
    description: 'Cálculo de frete e rastreamento PAC/Sedex (API CWS, exige contrato).',
    docsUrl: 'https://cws.correios.com.br/ajuda',
    fields: [
      { key: 'user', label: 'Usuário (Meu Correios)' },
      {
        key: 'accessCode',
        // Não é a senha do portal: gera-se em Meu Correios → Gerenciar acesso
        // à API. Confundir as duas é o erro mais comum ao configurar isto.
        label: 'Código de acesso à API (não é a senha do site)',
        type: 'password',
        placeholder: 'Gere em Meu Correios → Gerenciar acesso à API',
      },
      { key: 'postingCard', label: 'Cartão de postagem', placeholder: 'Somente números' },
      {
        key: 'contract',
        label: 'Código do contrato',
        placeholder: 'Opcional — só se usar códigos de contrato (03xxx)',
        help: 'Se preencher aqui, preencha também a DR: os Correios exigem os dois juntos.',
      },
      {
        key: 'dr',
        label: 'Código da DR (regional)',
        placeholder: 'Obrigatório quando o contrato é informado',
        help: 'Vem no seu contrato dos Correios, junto do número. Sem ele, a cotação por contrato é recusada.',
      },
      {
        key: 'services',
        label: 'Serviços a cotar',
        placeholder: '04510,04014 (PAC e Sedex de balcão)',
        help: 'Códigos 04510 (PAC) e 04014 (Sedex) cotam sem contrato. Os de contrato — 03298 e 03220 — exigem contrato + DR preenchidos acima.',
      },
      { key: 'originCep', label: 'CEP de origem', placeholder: 'De onde as encomendas saem' },
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
      { key: 'instance', label: 'Nome da instância', placeholder: 'queops-piramides' },
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
  const found = PROVIDERS.find((p) => p.id === id);
  if (!found) {
    throw new Error(`Provedor desconhecido: ${id}`);
  }
  return found;
}

/** Campos tratados como segredo: nunca voltam preenchidos do servidor. */
export const SECRET_FIELD_KEYS = new Set([
  'accessToken', 'secretKey', 'apiKey', 'apiToken', 'token', 'clientToken',
  'password', 'encryptionKey',
]);

export interface TestResult {
  ok: boolean;
  message: string;
}
