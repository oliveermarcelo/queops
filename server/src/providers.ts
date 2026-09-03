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

/**
 * Rótulos legíveis das credenciais.
 *
 * Sem isto a mensagem de campo faltando sai com o nome da chave — "Preencha:
 * accessCode" — que não corresponde a nada que a pessoa vê na tela.
 */
const FIELD_LABELS: Record<string, string> = {
  accessCode: 'Código de acesso à API',
  accessToken: 'Access Token',
  accountId: 'Account ID',
  agentId: 'Agent ID',
  apiKey: 'API Key',
  apiToken: 'API Token',
  baseUrl: 'URL base',
  company: 'Empresa',
  email: 'E-mail',
  encryptionKey: 'Encryption Key',
  instance: 'Instância',
  instanceId: 'Instance ID',
  postingCard: 'Cartão de postagem',
  publicKey: 'Public Key',
  publishableKey: 'Publishable Key',
  secretKey: 'Secret Key',
  token: 'Token',
  user: 'Usuário',
};

/** Catálogo de provedores e os campos que cada um exige. */
export const PROVIDERS_META: Record<string, { fields: string[] }> = {
  mercadopago: { fields: ['publicKey', 'accessToken'] },  // webhookSecret é opcional no teste de conexão
  pagseguro: { fields: ['email', 'token'] },
  stripe: { fields: ['publishableKey', 'secretKey'] },
  pagarme: { fields: ['apiKey', 'encryptionKey'] },
  correios: { fields: ['user', 'accessCode', 'postingCard'] },
  melhorenvio: { fields: ['token'] },
  frenet: { fields: ['token'] },
  // Sem campo obrigatório: o teste do UNO não usa credencial nenhuma da loja —
  // ele lê o uso das chaves de API, que é o caminho por onde o UNO entra.
  uno: { fields: [] },
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

  /*
   * O teste usa as credenciais SALVAS, não o que está na tela — o segredo
   * nunca trafega de volta ao navegador. Quem digitou e clicou direto em
   * "Testar conexão" vê este aviso; dizer para salvar antes evita a leitura
   * errada de que a credencial foi recusada pelo provedor.
   */
  const missing = meta.fields.filter((k) => str(f, k).trim() === '');
  if (missing.length) {
    const nomes = missing.map((k) => FIELD_LABELS[k] ?? k).join(', ');
    return { ok: false, message: `Salve antes de testar. Falta preencher: ${nomes}.` };
  }

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
      /*
       * O teste COTA, como no dos Correios.
       *
       * Validar o token só prova que ele é válido — e "Conectada" com token
       * válido e nenhuma transportadora cotando foi exatamente o que fez a
       * integração parecer pronta enquanto não fazia nada. Aqui a mesma chamada
       * do checkout é feita, e o que ela devolver é o que a lojista vê.
       */
      const { credsFrom: meCreds, amostraDeServicos } = await import('./melhorenvio.ts');
      const creds = meCreds(f as Record<string, unknown>);

      if (creds.originCep.length !== 8) {
        return {
          ok: false,
          message: 'Falta o CEP de origem — sem ele o Melhor Envio não cota nada. '
            + 'Preencha "CEP de origem" e salve.',
        };
      }

      const { opcoes, erro } = await amostraDeServicos(creds);
      if (erro !== '') return { ok: false, message: erro };

      const cotaram = opcoes.filter((o) => o.erro === '' && o.preco > 0);
      if (cotaram.length === 0) {
        const motivos = opcoes
          .map((o) => `${o.nome}: ${o.erro || 'sem preço'}`)
          .join(' · ')
          .slice(0, 400);
        return {
          ok: false,
          message: motivos === ''
            ? 'A conta não devolveu nenhuma transportadora. Confira em Melhor Envio se há '
              + 'transportadoras habilitadas no seu plano.'
            : `Nenhuma transportadora cotou — ${motivos}`,
        };
      }

      const amostra = cotaram
        .slice(0, 4)
        .map((o) => `${o.nome} R$ ${o.preco.toFixed(2).replace('.', ',')}`)
        .join(' · ');
      const selecionados = creds.services.trim() === '' ? 0 : creds.services.split(',').length;
      return {
        ok: true,
        message: `${cotaram.length} transportadora(s) cotando: ${amostra}`
          + `${cotaram.length > 4 ? '…' : ''} (500 g para São Paulo).`
          + (selecionados === 0
            ? ' Escolha abaixo quais o cliente pode ver.'
            : ` ${selecionados} liberada(s) para o cliente.`),
      };
    }

    /*
     * UNO ERP — o teste olha para dentro, porque é para dentro que a
     * integração aponta.
     *
     * Este case chamava `https://api.unoerp.com/v1/ping`: um endereço fixo no
     * código que ninguém verificou existir, com um token que nenhuma linha da
     * loja lê. Era um "Testar conexão" respondendo sobre uma conexão que não
     * existe. Botão que sempre falha ensina a ignorar o resultado — e aí ele
     * deixa de servir justamente no dia em que algo quebra de verdade.
     *
     * A integração real é o UNO CHAMANDO a loja, com uma chave `qp_live_` no
     * header Authorization. Então a evidência honesta que a loja tem é o
     * registro de uso dessas chaves. "Nenhuma requisição chegou" é uma
     * resposta útil, não uma falha do teste.
     */
    case 'uno': {
      const chaves = await q.all(
        `SELECT name, last_used_at FROM api_keys
          WHERE revoked = 0
          ORDER BY last_used_at IS NULL, last_used_at DESC`,
      );

      if (chaves.length === 0) {
        return {
          ok: false,
          message:
            'Nenhuma chave de API ativa. O UNO acessa a loja com uma chave: gere uma em '
            + 'Chaves de API, aqui embaixo, e cadastre no UNO.',
        };
      }

      const usada = chaves.find((k) => k.last_used_at !== null);
      if (!usada) {
        return {
          ok: false,
          message:
            `${chaves.length} chave(s) ativa(s), mas nenhuma foi usada ainda — nenhuma requisição `
            + 'do UNO chegou à loja. Se o UNO já está configurado, o problema está antes da loja: '
            + 'endereço, chave ou bloqueio de rede. Use o botão "Testar" da chave, aqui embaixo, '
            + 'para confirmar que ela responde.',
        };
      }

      /*
       * A data é reformatada como texto, sem passar por `new Date`.
       *
       * A conexão do MySQL usa `dateStrings` com fuso -03:00, então
       * `last_used_at` já chega como a hora de São Paulo: "2026-09-02 20:50:31".
       * Construir um Date com isso faria o Node interpretar a string no fuso
       * DELE — hoje UTC, onde os dígitos por coincidência não mudam. Num
       * servidor com outro fuso a hora exibida sairia deslocada, e o erro seria
       * daquele tipo que só aparece depois de mudar de hospedagem.
       */
      const cru = String(usada.last_used_at);
      const [dia, hora] = cru.split(' ');
      const [a, m, d] = (dia ?? '').split('-');
      const quando = a && hora ? `${d}/${m}/${a} às ${hora.slice(0, 5)}` : cru;
      return {
        ok: true,
        message:
          `O UNO está chamando a loja: a chave "${usada.name}" foi usada por último em ${quando}. `
          + 'Este card não guarda credencial nenhuma — quem dá acesso ao UNO é a chave de API.',
      };
    }

    case 'erp':
      r = await httpCall('GET', trimSlash(str(f, 'baseUrl')) + '/health', {
        Authorization: 'Bearer ' + str(f, 'token'),
      });
      return { ok: r.ok, message: r.ok ? 'ERP respondeu OK.' : `Falha (HTTP ${r.status}). ${r.error}` };

    case 'correios': {
      /*
       * O teste COTA, não só autentica.
       *
       * Autenticar prova que usuário e código de acesso estão certos — e mais
       * nada. Cartão de postagem errado, serviço fora do contrato ou CEP de
       * origem em branco passam pela autenticação e só falham na hora de cotar.
       * O painel dizia "Conectada", o checkout caía no valor fixo da tabela em
       * silêncio, e o motivo ficava num log de servidor que ninguém lê.
       *
       * Agora o teste faz o mesmo caminho do checkout: pede preço para uma
       * encomenda de 500 g. Se não sair preço, a integração é reportada como
       * NÃO conectada — porque, para quem vende, é isso que ela é.
       */
      const { credsFrom, autenticar, cotarTodos } = await import('./correios.ts');
      const creds = credsFrom(f as Record<string, unknown>);

      const { erro } = await autenticar(creds);
      if (erro) return { ok: false, message: erro };

      if ((creds.originCep ?? '').length !== 8) {
        return {
          ok: false,
          message: 'Usuário e código de acesso conferem, mas falta o CEP de origem — sem ele '
            + 'nenhuma cotação sai, e o frete continua saindo pela tabela fixa. Preencha '
            + '"CEP de origem" e salve.',
        };
      }

      // Av. Paulista: destino real, para o teste exercitar o caminho inteiro.
      const cotacoes = await cotarTodos(creds, '01310100', 500);
      const boas = cotacoes.filter((c) => c.erro === '' && c.preco > 0);

      if (boas.length === 0) {
        const detalhe = cotacoes
          .map((c) => `${c.nome}: ${c.erro || 'sem preço'}`)
          .join(' · ')
          .slice(0, 400);
        return {
          ok: false,
          message: `Autenticou, mas nenhum serviço cotou — ${detalhe}`,
        };
      }

      /*
       * O CÓDIGO aparece junto do nome, e não é detalhe.
       *
       * "PAC" pode ser 03298 (contrato) ou 04510 (balcão), e a diferença de
       * preço entre os dois passa de 30%. Sem o código na tela, dois testes com
       * valores diferentes parecem instabilidade dos Correios — quando são
       * tabelas diferentes.
       */
      const amostra = boas
        .map((c) => `${c.nome} (${c.servico}) R$ ${c.preco.toFixed(2).replace('.', ',')}`)
        .join(' · ');
      const parciais = cotacoes.length - boas.length;
      return {
        ok: true,
        message: `Correios cotando: ${amostra} (500 g para São Paulo).`
          + (parciais > 0 ? ` ${parciais} serviço(s) não cotaram.` : ''),
      };
    }

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
