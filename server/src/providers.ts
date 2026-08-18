/**
 * Adaptadores das integrações — LADO SERVIDOR.
 *
 * Antes, o navegador chamava Z-API, Chatwoot e afins direto, o que exigia ter
 * o token no JavaScript. Agora o painel pede ao servidor ("teste a Z-API") e
 * é o Node que usa a credencial cifrada guardada no banco. O segredo nunca
 * chega ao cliente, e some o problema de CORS de quebra.
 */

import { isIP } from 'node:net';
import { promises as dns } from 'node:dns';

import { q, type Q } from './db.ts';
import { integrationSecrets } from './store.ts';

type Fields = Record<string, unknown>;

const str = (f: Fields, k: string): string => {
  const v = f[k];
  return v === null || v === undefined || typeof v === 'object' ? '' : String(v);
};

/** Catálogo de provedores e os campos que cada um exige. */
export const PROVIDERS_META: Record<string, { fields: string[] }> = {
  mercadopago: { fields: ['publicKey', 'accessToken'] },  // webhookSecret é opcional no teste de conexão
  pagseguro: { fields: ['email', 'token'] },
  stripe: { fields: ['publishableKey', 'secretKey'] },
  pagarme: { fields: ['apiKey', 'encryptionKey'] },
  correios: { fields: ['user', 'password'] },
  melhorenvio: { fields: ['token'] },
  frenet: { fields: ['token'] },
  uno: { fields: ['token', 'company'] },
  erp: { fields: ['baseUrl', 'token'] },
  zapi: { fields: ['instanceId', 'token'] },
  evolution: { fields: ['baseUrl', 'instance', 'apiKey'] },
  chatwoot: { fields: ['baseUrl', 'accountId', 'apiToken'] },
  chatvolt: { fields: ['apiKey', 'agentId'] },
};

// ----------------------------------------------------------------- SSRF ----

/** O IP cai em faixa privada, de loopback ou reservada? */
function isPrivateIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) return isPrivateIpv6(ip.toLowerCase());
  return true; // não é IP reconhecível: trata como suspeito
}

function isPrivateIpv4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return (
    a === 0 ||                              // 0.0.0.0/8
    a === 10 ||                             // 10.0.0.0/8
    a === 127 ||                            // loopback
    (a === 100 && b >= 64 && b <= 127) ||   // 100.64.0.0/10 (CGNAT)
    (a === 169 && b === 254) ||             // link-local (metadados de nuvem)
    (a === 172 && b >= 16 && b <= 31) ||    // 172.16.0.0/12
    (a === 192 && b === 0) ||               // 192.0.0.0/24 e 192.0.2.0/24
    (a === 192 && b === 168) ||             // 192.168.0.0/16
    (a === 198 && (b === 18 || b === 19)) || // benchmark
    (a === 198 && b === 51) ||              // documentação
    (a === 203 && b === 0) ||               // documentação
    a >= 224                                // multicast e reservados
  );
}

function isPrivateIpv6(ip: string): boolean {
  if (ip === '::' || ip === '::1') return true;
  // IPv4 mapeado (::ffff:10.0.0.1) herda a checagem do IPv4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return isPrivateIpv4(mapped[1]);
  const head = parseInt(ip.split(':')[0] || '0', 16);
  if (Number.isNaN(head)) return true;
  if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 — unique local
  if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 — link-local
  if ((head & 0xff00) === 0xff00) return true; // ff00::/8 — multicast
  return false;
}

/**
 * O endereço aponta para a própria infraestrutura?
 *
 * URLs de ERP e de webhook são digitadas no painel. Sem esta checagem, elas
 * viram uma janela para a rede interna: `http://127.0.0.1:9200`,
 * `http://10.0.0.5/admin` ou `http://169.254.169.254/latest/meta-data/`
 * (credenciais da instância em nuvem) seriam requisitadas pelo servidor, e as
 * mensagens de erro já revelariam quais portas respondem.
 */
export async function isInternalHost(hostRaw: string): Promise<boolean> {
  const host = String(hostRaw ?? '').replace(/^\[|\]$/g, '').toLowerCase();
  if (host === '' || host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host.endsWith('.internal') || host.endsWith('.local')) return true;

  if (isIP(host)) return isPrivateIp(host);

  // Resolve o nome: um domínio público pode apontar para um IP privado.
  const ips: string[] = [];
  const [v4, v6] = await Promise.all([
    dns.resolve4(host).catch(() => [] as string[]),
    dns.resolve6(host).catch(() => [] as string[]),
  ]);
  ips.push(...v4, ...v6);

  if (ips.length === 0) return true; // não resolveu: não vale arriscar
  return ips.some(isPrivateIp);
}

export interface HttpCallResult {
  ok: boolean;
  status: number;
  body: string;
  error: string;
}

/**
 * Requisição HTTP simples.
 *
 * Só http(s) e só para hosts públicos — ver `isInternalHost`. Sem a checagem de
 * esquema, um valor como `file:///etc/passwd` viraria leitura de arquivo local;
 * sem a de host, o painel viraria um scanner da rede interna. `redirect:
 * 'manual'` fecha a variante em que um host público responde 302 para
 * 169.254.169.254.
 */
export async function httpCall(
  method: string,
  url: string,
  headers: Record<string, string> = {},
  json: unknown = null,
  timeoutMs = 12_000,
): Promise<HttpCallResult> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, status: 0, body: '', error: 'URL inválida (use http ou https).' };
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { ok: false, status: 0, body: '', error: 'URL inválida (use http ou https).' };
  }
  if (await isInternalHost(parsed.hostname)) {
    return { ok: false, status: 0, body: '', error: 'Endereço interno ou reservado não é permitido.' };
  }

  const h: Record<string, string> = { ...headers };
  if (json !== null) h['Content-Type'] = 'application/json';

  try {
    const res = await fetch(parsed, {
      method,
      headers: h,
      body: json === null ? undefined : JSON.stringify(json),
      redirect: 'manual', // evita redirect para host interno
      signal: AbortSignal.timeout(timeoutMs),
    });
    // Limita a leitura: um provedor mal-comportado não derruba o servidor com
    // uma resposta de 500 MB.
    const body = (await res.text()).slice(0, 20_000);
    return { ok: res.status >= 200 && res.status < 300, status: res.status, body, error: '' };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, body: '', error: msg };
  }
}

function trimSlash(s: string): string {
  return s.replace(/\/+$/, '');
}

export interface ProviderResult {
  ok: boolean;
  message: string;
}

/** Testa a conexão de um provedor usando as credenciais salvas. */
export async function providerTest(id: string, f: Fields): Promise<ProviderResult> {
  const meta = PROVIDERS_META[id];
  if (!meta) return { ok: false, message: 'Provedor desconhecido.' };

  const missing = meta.fields.filter((k) => str(f, k).trim() === '');
  if (missing.length) return { ok: false, message: 'Preencha: ' + missing.join(', ') };

  const enc = encodeURIComponent;
  let r: HttpCallResult;

  switch (id) {
    case 'zapi':
      r = await httpCall(
        'GET',
        `https://api.z-api.io/instances/${enc(str(f, 'instanceId'))}/token/${enc(str(f, 'token'))}/status`,
        str(f, 'clientToken') ? { 'Client-Token': str(f, 'clientToken') } : {},
      );
      return { ok: r.ok, message: r.ok ? 'Conexão Z-API OK.' : `Falha (HTTP ${r.status}). ${r.error}` };

    case 'evolution':
      r = await httpCall(
        'GET',
        `${trimSlash(str(f, 'baseUrl'))}/instance/connectionState/${enc(str(f, 'instance'))}`,
        { apikey: str(f, 'apiKey') },
      );
      return { ok: r.ok, message: r.ok ? 'Conexão Evolution OK.' : `Falha (HTTP ${r.status}). ${r.error}` };

    case 'chatwoot':
      r = await httpCall(
        'GET',
        `${trimSlash(str(f, 'baseUrl'))}/api/v1/accounts/${enc(str(f, 'accountId'))}/conversations`,
        { api_access_token: str(f, 'apiToken') },
      );
      return { ok: r.ok, message: r.ok ? 'Conexão Chatwoot OK.' : `Falha (HTTP ${r.status}). ${r.error}` };

    case 'chatvolt':
      r = await httpCall('GET', 'https://api.chatvolt.ai/agents', {
        Authorization: 'Bearer ' + str(f, 'apiKey'),
      });
      return { ok: r.ok, message: r.ok ? 'Conexão Chatvolt OK.' : `Falha (HTTP ${r.status}). ${r.error}` };

    case 'mercadopago':
      r = await httpCall('GET', 'https://api.mercadopago.com/users/me', {
        Authorization: 'Bearer ' + str(f, 'accessToken'),
      });
      return {
        ok: r.ok,
        message: r.ok ? 'Mercado Pago conectado.' : `Falha (HTTP ${r.status}). Confira o Access Token.`,
      };

    case 'stripe':
      r = await httpCall('GET', 'https://api.stripe.com/v1/account', {
        Authorization: 'Bearer ' + str(f, 'secretKey'),
      });
      return {
        ok: r.ok,
        message: r.ok ? 'Stripe conectado.' : `Falha (HTTP ${r.status}). Confira a Secret Key.`,
      };

    case 'pagarme':
      r = await httpCall('GET', 'https://api.pagar.me/core/v5/balance', {
        Authorization: 'Basic ' + Buffer.from(str(f, 'apiKey') + ':').toString('base64'),
      });
      return {
        ok: r.ok,
        message: r.ok ? 'Pagar.me conectado.' : `Falha (HTTP ${r.status}). Confira a API Key.`,
      };

    case 'melhorenvio': {
      const base = str(f, 'sandbox') === 'sandbox'
        ? 'https://sandbox.melhorenvio.com.br'
        : 'https://melhorenvio.com.br';
      r = await httpCall('GET', base + '/api/v2/me', {
        Authorization: 'Bearer ' + str(f, 'token'),
        Accept: 'application/json',
      });
      return { ok: r.ok, message: r.ok ? 'Melhor Envio conectado.' : `Falha (HTTP ${r.status}).` };
    }

    case 'uno':
      r = await httpCall('GET', 'https://api.unoerp.com/v1/ping', {
        Authorization: 'Bearer ' + str(f, 'token'),
      });
      return { ok: r.ok, message: r.ok ? 'UNO ERP conectado.' : `Falha (HTTP ${r.status}). ${r.error}` };

    case 'erp':
      r = await httpCall('GET', trimSlash(str(f, 'baseUrl')) + '/health', {
        Authorization: 'Bearer ' + str(f, 'token'),
      });
      return { ok: r.ok, message: r.ok ? 'ERP respondeu OK.' : `Falha (HTTP ${r.status}). ${r.error}` };

    default:
      // Provedores sem endpoint público de verificação barato.
      return { ok: true, message: 'Credenciais salvas com segurança no servidor.' };
  }
}

/** Envia uma mensagem de WhatsApp pelo provedor configurado e habilitado. */
export async function providerSendWhatsapp(
  phone: string,
  message: string,
  exec: Q = q,
): Promise<ProviderResult> {
  for (const id of ['zapi', 'evolution']) {
    const row = await exec.one('SELECT enabled FROM integrations WHERE id = ?', [id]);
    if (!row || !row.enabled) continue;

    const f = await integrationSecrets(id, exec);
    const enc = encodeURIComponent;
    const r = id === 'zapi'
      ? await httpCall(
          'POST',
          `https://api.z-api.io/instances/${enc(str(f, 'instanceId'))}/token/${enc(str(f, 'token'))}/send-text`,
          str(f, 'clientToken') ? { 'Client-Token': str(f, 'clientToken') } : {},
          { phone, message },
        )
      : await httpCall(
          'POST',
          `${trimSlash(str(f, 'baseUrl'))}/message/sendText/${enc(str(f, 'instance'))}`,
          { apikey: str(f, 'apiKey') },
          { number: phone, text: message },
        );
    return { ok: r.ok, message: r.ok ? 'Mensagem enviada.' : `Falha (HTTP ${r.status}).` };
  }
  return { ok: false, message: 'Nenhum provedor de WhatsApp está ativo em Integrações.' };
}

/**
 * Dispara os webhooks cadastrados para um evento.
 *
 * Melhor esforço e sem bloquear a resposta: um endpoint de cliente que demore
 * 5 segundos não pode atrasar a confirmação do pedido para quem comprou.
 */
export function fireWebhooks(event: string, payload: unknown): void {
  void (async () => {
    try {
      const hooks = await q.all('SELECT url FROM webhooks WHERE event = ? AND active = 1', [event]);
      await Promise.all(
        hooks.map((h) => httpCall('POST', String(h.url), { 'X-Queops-Event': event }, payload, 5_000)),
      );
    } catch (e) {
      console.error('[queops] falha ao disparar webhooks de', event, e);
    }
  })();
}
