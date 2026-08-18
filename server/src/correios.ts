/**
 * Integração com a API CWS dos Correios.
 *
 * Cobre autenticação (token), cotação de preço e prazo, e rastreamento.
 *
 * Por que CWS e não o calculador antigo: o endpoint público
 * `ws.correios.com.br/calculador` foi descontinuado. Hoje tudo passa pela CWS,
 * que exige contrato — usuário, código de acesso (que NÃO é a senha do portal,
 * gera-se em Meu Correios → Gerenciar acesso à API) e cartão de postagem.
 *
 * O token vale 24h; guardamos em memória para não autenticar a cada cotação.
 * Como o processo pode reiniciar a qualquer momento, o cache é só uma
 * otimização — nunca uma dependência.
 */

import { httpCall, type HttpCallResult } from './providers.ts';

const BASE = 'https://api.correios.com.br';

/** Códigos mais comuns. O painel aceita sobrescrever em "Serviços a cotar". */
export const SERVICO_PAC = '03298';
export const SERVICO_SEDEX = '03220';

/** Nome legível a partir do código, para o cliente não ver "03298". */
const NOMES: Record<string, string> = {
  '03298': 'PAC',
  '03220': 'Sedex',
  '03158': 'Sedex 10',
  '03204': 'Sedex Hoje',
  '04510': 'PAC',
  '04014': 'Sedex',
};

export function nomeDoServico(codigo: string): string {
  return NOMES[codigo] ?? `Correios ${codigo}`;
}

export interface CorreiosCreds {
  user: string;
  accessCode: string;
  postingCard: string;
  contract?: string;
  services?: string;
  originCep?: string;
}

/** Lê as credenciais salvas, normalizando o que o painel devolve. */
export function credsFrom(f: Record<string, unknown>): CorreiosCreds {
  const s = (k: string) => String(f[k] ?? '').trim();
  return {
    user: s('user'),
    accessCode: s('accessCode'),
    postingCard: s('postingCard').replace(/\D/g, ''),
    contract: s('contract'),
    services: s('services'),
    originCep: s('originCep').replace(/\D/g, ''),
  };
}

/** Serviços a cotar: o que estiver no painel, ou PAC + Sedex. */
export function servicesOf(c: CorreiosCreds): string[] {
  const lista = (c.services ?? '')
    .split(/[,;\s]+/)
    .map((x) => x.replace(/\D/g, ''))
    .filter((x) => x.length > 0);
  return lista.length > 0 ? lista : [SERVICO_PAC, SERVICO_SEDEX];
}

// ------------------------------------------------------------------ token ----

interface TokenCache {
  token: string;
  expiraEm: number; // epoch ms
}

/** Um token por cartão de postagem: contas diferentes não se misturam. */
const cache = new Map<string, TokenCache>();

/**
 * Autentica e devolve o token da CWS.
 *
 * Renova 5 minutos antes de expirar, para uma cotação não morrer no meio por
 * causa de um token que venceu entre a checagem e a chamada.
 */
export async function autenticar(c: CorreiosCreds): Promise<{ token: string; erro: string }> {
  const chave = `${c.user}:${c.postingCard}`;
  const agora = Date.now();
  const salvo = cache.get(chave);
  if (salvo && salvo.expiraEm - 5 * 60_000 > agora) {
    return { token: salvo.token, erro: '' };
  }

  const basic = Buffer.from(`${c.user}:${c.accessCode}`).toString('base64');
  const r = await httpCall(
    'POST',
    `${BASE}/token/v1/autentica/cartaopostagem`,
    { Authorization: 'Basic ' + basic },
    { numero: c.postingCard },
  );

  if (!r.ok) return { token: '', erro: explicar(r) };

  let dados: { token?: string; expiraEm?: string };
  try {
    dados = JSON.parse(r.body) as typeof dados;
  } catch {
    return { token: '', erro: 'Resposta inesperada dos Correios ao autenticar.' };
  }
  if (!dados.token) return { token: '', erro: 'Os Correios não devolveram token.' };

  const expira = dados.expiraEm ? Date.parse(dados.expiraEm) : NaN;
  cache.set(chave, {
    token: dados.token,
    expiraEm: Number.isFinite(expira) ? expira : agora + 12 * 3600_000,
  });
  return { token: dados.token, erro: '' };
}

/** Descarta o token guardado — usado quando a API responde 401. */
export function esquecerToken(c: CorreiosCreds): void {
  cache.delete(`${c.user}:${c.postingCard}`);
}

/**
 * Traduz a falha para algo acionável.
 *
 * As mensagens da CWS são técnicas ("Bad Request" sem corpo), e o mais comum é
 * confundir código de acesso com a senha do portal. Dizer isso no painel evita
 * o suporte.
 */
function explicar(r: HttpCallResult, onde: 'auth' | 'cotacao' | 'rastreio' = 'auth'): string {
  if (r.status === 401 || r.status === 403) {
    return 'Usuário ou código de acesso recusado. Lembre: o código de acesso à API '
      + 'não é a senha do site — gere em Meu Correios → Gerenciar acesso à API.';
  }
  if (r.status === 400) {
    /*
     * 400 quer dizer coisas diferentes conforme o endpoint, e o motivo real
     * costuma vir no corpo. Repassá-lo evita mandar quem configura conferir o
     * cartão de postagem quando o problema é outro — o serviço não pertencer
     * ao contrato, por exemplo.
     */
    const detalhe = detalheDoErro(r.body);
    if (detalhe !== '') return detalhe;
    if (onde === 'cotacao') {
      return 'Cotação recusada. Confira se os códigos em "Serviços a cotar" pertencem '
        + 'ao seu contrato e se o cartão de postagem está correto.';
    }
    return 'Requisição recusada. Confira o número do cartão de postagem.';
  }
  if (r.status === 0) return `Não foi possível falar com os Correios: ${r.error}`;
  return `Correios responderam HTTP ${r.status}.`;
}

/** Extrai a mensagem que a CWS manda no corpo do erro, quando manda. */
function detalheDoErro(body: string): string {
  try {
    const d = JSON.parse(body) as Record<string, unknown>;
    const msg = d.msgs ?? d.msg ?? d.message ?? d.txErro ?? d.error;
    if (Array.isArray(msg)) return msg.map(String).join(' · ').slice(0, 300);
    if (typeof msg === 'string' && msg.trim() !== '') return msg.slice(0, 300);
  } catch {
    // Corpo não-JSON: nada a aproveitar.
  }
  return '';
}

// ----------------------------------------------------------------- preço -----

export interface CotacaoItem {
  servico: string;
  nome: string;
  preco: number; // em reais
  prazoDias: number;
  erro: string;
}

/** Converte "12,90" (formato da CWS) para 12.9. */
function moeda(v: unknown): number {
  const n = Number(String(v ?? '').replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Cota preço e prazo para um serviço.
 *
 * Peso em gramas e dimensões em centímetros. Os Correios recusam pacotes fora
 * dos limites, então aplicamos os mínimos oficiais (16x11x2 cm) — sem isso um
 * item pequeno faz a cotação inteira falhar.
 */
export async function cotar(
  c: CorreiosCreds,
  servico: string,
  cepDestino: string,
  pesoGramas: number,
  dim: { comprimento?: number; altura?: number; largura?: number } = {},
): Promise<CotacaoItem> {
  const vazio: CotacaoItem = { servico, nome: nomeDoServico(servico), preco: 0, prazoDias: 0, erro: '' };

  const { token, erro } = await autenticar(c);
  if (erro) return { ...vazio, erro };

  const origem = (c.originCep ?? '').replace(/\D/g, '');
  const destino = String(cepDestino ?? '').replace(/\D/g, '');
  if (origem.length !== 8) return { ...vazio, erro: 'CEP de origem não configurado no painel.' };
  if (destino.length !== 8) return { ...vazio, erro: 'CEP de destino inválido.' };

  const corpo = {
    idLote: '1',
    parametrosProduto: [{
      coProduto: servico,
      nuRequisicao: '1',
      cepOrigem: origem,
      cepDestino: destino,
      psObjeto: String(Math.max(300, Math.round(pesoGramas))),
      tpObjeto: '2', // pacote
      comprimento: String(Math.max(16, dim.comprimento ?? 16)),
      altura: String(Math.max(2, dim.altura ?? 5)),
      largura: String(Math.max(11, dim.largura ?? 11)),
      servicosAdicionais: [''],
    }],
  };

  const auth = { Authorization: 'Bearer ' + token };
  const [preco, prazo] = await Promise.all([
    httpCall('POST', `${BASE}/preco/v1/nacional`, auth, corpo),
    httpCall('POST', `${BASE}/prazo/v1/nacional`, auth, corpo),
  ]);

  if (preco.status === 401) {
    esquecerToken(c);
    return { ...vazio, erro: 'Token expirado; tente de novo.' };
  }
  if (!preco.ok) return { ...vazio, erro: explicar(preco, 'cotacao') };

  try {
    const p = JSON.parse(preco.body) as Array<Record<string, unknown>>;
    const item = Array.isArray(p) ? p[0] : null;
    if (!item) return { ...vazio, erro: 'Correios não devolveram preço.' };
    if (item.txErro) return { ...vazio, erro: String(item.txErro) };

    let dias = 0;
    if (prazo.ok) {
      const q = JSON.parse(prazo.body) as Array<Record<string, unknown>>;
      dias = Number(q?.[0]?.prazoEntrega ?? 0) || 0;
    }

    return {
      servico,
      nome: nomeDoServico(servico),
      preco: moeda(item.pcFinal ?? item.pcBase),
      prazoDias: dias,
      erro: '',
    };
  } catch {
    return { ...vazio, erro: 'Resposta inesperada dos Correios ao cotar.' };
  }
}

/** Cota todos os serviços configurados, do mais barato para o mais caro. */
export async function cotarTodos(
  c: CorreiosCreds,
  cepDestino: string,
  pesoGramas: number,
  dim?: { comprimento?: number; altura?: number; largura?: number },
): Promise<CotacaoItem[]> {
  const servicos = servicesOf(c);
  const todas = await Promise.all(servicos.map((s) => cotar(c, s, cepDestino, pesoGramas, dim)));
  const boas = todas.filter((x) => x.erro === '' && x.preco > 0);
  return boas.length > 0 ? boas.sort((a, b) => a.preco - b.preco) : todas;
}

// ----------------------------------------------------------- rastreamento ----

export interface EventoRastreio {
  data: string;
  descricao: string;
  local: string;
}

/** Rastreia um objeto. Devolve os eventos do mais recente para o mais antigo. */
export async function rastrear(
  c: CorreiosCreds,
  codigo: string,
): Promise<{ eventos: EventoRastreio[]; erro: string }> {
  const { token, erro } = await autenticar(c);
  if (erro) return { eventos: [], erro };

  const limpo = String(codigo ?? '').trim().toUpperCase().replace(/\s/g, '');
  if (!/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(limpo)) {
    return { eventos: [], erro: 'Código de rastreio inválido (formato AA123456789BR).' };
  }

  const r = await httpCall(
    'GET',
    `${BASE}/srorastro/v1/objetos/${limpo}?resultado=T`,
    { Authorization: 'Bearer ' + token },
  );
  if (r.status === 401) {
    esquecerToken(c);
    return { eventos: [], erro: 'Token expirado; tente de novo.' };
  }
  if (!r.ok) return { eventos: [], erro: explicar(r, 'rastreio') };

  try {
    const dados = JSON.parse(r.body) as { objetos?: Array<Record<string, unknown>> };
    const obj = dados.objetos?.[0];
    if (!obj) return { eventos: [], erro: 'Objeto não encontrado.' };
    if (obj.mensagem) return { eventos: [], erro: String(obj.mensagem) };

    const brutos = (obj.eventos ?? []) as Array<Record<string, unknown>>;
    const eventos = brutos.map((e) => {
      const u = (e.unidade ?? {}) as Record<string, unknown>;
      const end = (u.endereco ?? {}) as Record<string, unknown>;
      const cidade = String(end.cidade ?? '');
      const uf = String(end.uf ?? '');
      return {
        data: String(e.dtHrCriado ?? ''),
        descricao: String(e.descricao ?? ''),
        local: cidade && uf ? `${cidade}/${uf}` : String(u.tipo ?? ''),
      };
    });
    return { eventos, erro: '' };
  } catch {
    return { eventos: [], erro: 'Resposta inesperada dos Correios ao rastrear.' };
  }
}
