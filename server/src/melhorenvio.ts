/**
 * Integração com o Melhor Envio — cotação de frete de várias transportadoras.
 *
 * O Melhor Envio revende Jadlog, Azul Cargo, LATAM, Loggi, Correios e outras. A
 * loja usa ele para COTAR; contratar a etiqueta continua sendo feito no painel
 * do Melhor Envio.
 *
 * Duas decisões que valem explicação:
 *
 *   1. A LISTA DE TRANSPORTADORAS VEM DE UMA COTAÇÃO DE VERDADE, não de um
 *      endpoint de catálogo. `cotar` sem filtro de serviço devolve tudo que a
 *      conta consegue usar — inclusive o que falhou, com o motivo. É a mesma
 *      chamada que o checkout faz, então o que aparece no painel é exatamente o
 *      que o cliente vai ver. Catálogo pode listar serviço que, na prática, não
 *      cota para aquela rota.
 *
 *   2. O PREÇO USADO É O `custom_price`. É ele que reflete o que a lojista
 *      configurou no Melhor Envio (desconto do plano, markup). Usar o `price`
 *      cru cobraria um valor diferente do que ela vê no painel dela.
 */

import { httpCall } from './providers.ts';

/**
 * Identificação exigida pelo Melhor Envio em toda requisição.
 *
 * A API rejeita chamada sem `User-Agent` com contato — é o canal deles para
 * avisar quem está integrando quando algo muda ou quando um cliente abusa do
 * limite. Sem isso, a resposta é 401/403 e a mensagem não diz o porquê.
 */
const USER_AGENT = 'Queops Piramides (contato@queopspiramides.com.br)';

export interface MelhorEnvioCreds {
  token: string;
  /** 'sandbox' usa o ambiente de teste; qualquer outra coisa é produção. */
  sandbox: string;
  /** CEP de onde as encomendas saem. Sem ele não há cotação. */
  originCep: string;
  /** Ids dos serviços habilitados no painel. Vazio = todos os que cotarem. */
  services: string;
}

export function credsFrom(f: Record<string, unknown>): MelhorEnvioCreds {
  const s = (k: string): string => {
    const v = f[k];
    return v === null || v === undefined || typeof v === 'object' ? '' : String(v).trim();
  };
  return {
    token: s('token'),
    sandbox: s('sandbox').toLowerCase(),
    originCep: s('originCep').replace(/\D/g, ''),
    services: s('services'),
  };
}

function base(c: MelhorEnvioCreds): string {
  return c.sandbox === 'sandbox'
    ? 'https://sandbox.melhorenvio.com.br'
    : 'https://melhorenvio.com.br';
}

/** Ids dos serviços marcados no painel, como lista. Vazio = sem filtro. */
export function servicosSelecionados(c: MelhorEnvioCreds): string[] {
  return c.services
    .split(/[,;\s]+/)
    .map((x) => x.replace(/\D/g, ''))
    .filter((x) => x !== '');
}

export interface ItemParaCotar {
  id: string;
  /** Peso unitário em gramas. */
  pesoGramas: number;
  /** Preço unitário em reais — vira o valor segurado. */
  precoUnitario: number;
  quantidade: number;
}

export interface OpcaoFrete {
  /** Id do serviço no Melhor Envio (é o que o painel guarda como selecionado). */
  servico: string;
  /** "Jadlog · .Package" — transportadora e modalidade. */
  nome: string;
  transportadora: string;
  /** Em reais. 0 quando houve erro. */
  preco: number;
  prazoDias: number;
  /** Vazio quando cotou. Preenchido, explica por que este serviço não serve. */
  erro: string;
}

/**
 * Dimensões mínimas aceitas pelas transportadoras (cm).
 *
 * Um adesivo de 6 cm não é postável do jeito que é: vai dentro de embalagem, e
 * é a embalagem que a transportadora mede. Cotar com a dimensão real do produto
 * faz a cotação ser recusada — ou, pior, sair barata e a etiqueta sair caro.
 */
const MIN_COMPRIMENTO = 16;
const MIN_LARGURA = 11;
const MIN_ALTURA = 2;

/** Peso mínimo cobrado. Abaixo disso as transportadoras arredondam de todo jeito. */
const MIN_PESO_GRAMAS = 300;

function numero(v: unknown): number {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Extrai a mensagem de erro do corpo da resposta.
 *
 * O Melhor Envio usa formatos diferentes conforme a camada que recusou: `error`
 * (texto), `message` (validação), `errors` (mapa campo → lista). Cobrir um só
 * troca o motivo real por "falha ao cotar" — o mesmo erro que custou uma rodada
 * inteira de investigação nos Correios.
 */
export function detalheDoErro(body: string): string {
  const limpo = String(body ?? '').trim();
  if (limpo === '') return '';
  try {
    const d = JSON.parse(limpo) as Record<string, unknown>;
    /*
     * `errors` vem ANTES de `message`, de propósito.
     *
     * Numa validação recusada o Melhor Envio manda os dois: `message` com o
     * genérico "The given data was invalid." e `errors` com o campo que causou
     * ("products.0.id: deve ter no máximo 30 caracteres"). Preferindo `message`,
     * a única informação útil era descartada — e sobrava uma mensagem que não
     * diz o que corrigir.
     */
    const e = d.errors ?? d.error ?? d.message ?? d.msg;
    if (typeof e === 'string' && e.trim() !== '') return e.trim().slice(0, 300);
    if (Array.isArray(e)) return e.map(String).join(' · ').slice(0, 300);
    if (e !== null && typeof e === 'object') {
      // { "products.0.weight": ["campo obrigatório"], ... }
      const partes: string[] = [];
      for (const [campo, msgs] of Object.entries(e as Record<string, unknown>)) {
        const texto = Array.isArray(msgs) ? msgs.map(String).join(', ') : String(msgs);
        partes.push(`${campo}: ${texto}`);
      }
      if (partes.length > 0) return partes.join(' · ').slice(0, 300);
    }
    return limpo.slice(0, 300);
  } catch {
    return limpo.length <= 300 ? limpo : '';
  }
}

/**
 * Cota o carrinho.
 *
 * `apenasServicos` vazio devolve TUDO que a conta consegue cotar — é assim que o
 * painel monta a lista de transportadoras para a lojista escolher. Com a lista
 * preenchida, cota só o que ela marcou.
 *
 * Nunca lança: devolve `{ opcoes: [], erro }`. Frete é caminho de venda, e o
 * chamador precisa poder seguir com as regras do painel quando o provedor falha.
 */
export async function cotar(
  c: MelhorEnvioCreds,
  cepDestino: string,
  itens: ItemParaCotar[],
  apenasServicos: string[] = [],
): Promise<{ opcoes: OpcaoFrete[]; erro: string }> {
  const destino = String(cepDestino ?? '').replace(/\D/g, '');
  if (c.token === '') return { opcoes: [], erro: 'Token do Melhor Envio não cadastrado.' };
  if (c.originCep.length !== 8) return { opcoes: [], erro: 'CEP de origem não configurado no painel.' };
  if (destino.length !== 8) return { opcoes: [], erro: 'CEP de destino inválido.' };
  if (itens.length === 0) return { opcoes: [], erro: 'Carrinho vazio.' };

  const corpo: Record<string, unknown> = {
    from: { postal_code: c.originCep },
    to: { postal_code: destino },
    products: itens.map((i, indice) => ({
      /*
       * Id curto e sequencial, não o nosso slug.
       *
       * O Melhor Envio só devolve este campo de volta — ele não significa nada
       * para eles. Mandar o slug do produto
       * ("adesivo-grafico-radiestesia-9-circulos-g-6-5cm-1040", 51 caracteres)
       * arriscava o limite de tamanho do campo e derrubava a cotação inteira com
       * "The given data was invalid.", que não diz qual campo é.
       */
      id: String(indice + 1),
      width: MIN_LARGURA,
      height: MIN_ALTURA,
      length: MIN_COMPRIMENTO,
      // A API espera QUILOS; o resto do sistema trabalha em gramas.
      weight: Math.max(MIN_PESO_GRAMAS, Math.round(i.pesoGramas)) / 1000,
      insurance_value: Number(i.precoUnitario.toFixed(2)),
      quantity: Math.max(1, Math.round(i.quantidade)),
    })),
    options: { receipt: false, own_hand: false },
  };
  if (apenasServicos.length > 0) corpo.services = apenasServicos.join(',');

  const r = await httpCall(
    'POST',
    `${base(c)}/api/v2/me/shipment/calculate`,
    {
      Authorization: 'Bearer ' + c.token,
      Accept: 'application/json',
      'User-Agent': USER_AGENT,
    },
    corpo,
  );

  if (!r.ok) {
    // O corpo cru vai para o log: a mensagem curta nem sempre basta.
    console.error(
      `[queops] Melhor Envio recusou a cotação (HTTP ${r.status}):`,
      String(r.body ?? '').slice(0, 600),
    );
    if (r.status === 401 || r.status === 403) {
      return {
        opcoes: [],
        erro: 'Token recusado pelo Melhor Envio. Gere um novo em Melhor Envio → '
          + 'Configurações → Tokens e confira se o ambiente (production/sandbox) confere.',
      };
    }
    const detalhe = detalheDoErro(r.body);
    return {
      opcoes: [],
      erro: detalhe !== '' ? detalhe : `Melhor Envio respondeu HTTP ${r.status}. ${r.error}`.trim(),
    };
  }

  let lista: unknown;
  try {
    lista = JSON.parse(r.body);
  } catch {
    return { opcoes: [], erro: 'Resposta inesperada do Melhor Envio.' };
  }
  if (!Array.isArray(lista)) {
    return { opcoes: [], erro: detalheDoErro(r.body) || 'Resposta inesperada do Melhor Envio.' };
  }

  return { opcoes: mapearOpcoes(lista), erro: '' };
}

/**
 * Resposta da API → opções da loja.
 *
 * Separado de `cotar` para poder ser testado sem rede: é aqui que um campo
 * renomeado pela API viraria frete R$ 0,00 em produção, e teste que depende de
 * internet não roda.
 */
export function mapearOpcoes(lista: unknown[]): OpcaoFrete[] {
  return lista.map((bruto) => {
    const item = (bruto ?? {}) as Record<string, unknown>;
    const empresa = (item.company ?? {}) as Record<string, unknown>;
    const transportadora = String(empresa.name ?? '').trim();
    const modalidade = String(item.name ?? '').trim();
    /*
     * `custom_price` é o preço com o que a lojista configurou no Melhor Envio
     * (desconto do plano, markup). É o valor que ela vê no painel dela, e
     * portanto o que a loja deve cobrar.
     */
    const preco = numero(item.custom_price ?? item.price);
    const erroItem = typeof item.error === 'string' ? item.error.trim() : '';

    return {
      servico: String(item.id ?? ''),
      nome: transportadora === '' ? modalidade : `${transportadora} · ${modalidade}`,
      transportadora,
      preco: erroItem === '' ? preco : 0,
      prazoDias: Math.round(numero(item.delivery_time)),
      erro: erroItem !== '' ? erroItem : preco > 0 ? '' : 'sem preço',
    };
  });
}

/**
 * Cotação de amostra para o painel: 500 g para a Av. Paulista.
 *
 * Serve para a lojista ver quais transportadoras a conta dela oferece — com
 * preço de exemplo e, quando o serviço não cota, o motivo. É a mesma chamada do
 * checkout, então "aparece aqui" significa "vai aparecer para o cliente".
 */
export async function amostraDeServicos(
  c: MelhorEnvioCreds,
): Promise<{ opcoes: OpcaoFrete[]; erro: string }> {
  return cotar(c, '01310100', [{ id: 'amostra', pesoGramas: 500, precoUnitario: 100, quantidade: 1 }]);
}
