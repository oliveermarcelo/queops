/**
 * Integração com a Envia (envia.com) — cotação, etiqueta e rastreio.
 *
 * É a terceira fonte de frete da loja, ao lado dos Correios e do Melhor Envio,
 * e a primeira que vai além de cotar: ela também EMITE a etiqueta e devolve o
 * rastreio. Por isso ela pede mais da loja do que as outras duas — endereço
 * completo de origem, não só o CEP.
 *
 * Três coisas que valem explicação antes de ler o código:
 *
 *   1. A COTAÇÃO NÃO FILTRA TRANSPORTADORA NA API. O endpoint aceita
 *      `shipment.carrier`, mas pedir uma transportadora por chamada
 *      transformaria um checkout em N requisições de rede. A loja pede TUDO
 *      numa chamada e filtra aqui pelo que a lojista marcou no painel — que é
 *      a mesma lista que o painel montou a partir de uma cotação de verdade.
 *
 *   2. O CARRINHO VIRA UMA CAIXA SÓ. A Envia cota `packages`, que são volumes
 *      físicos, e não produtos: quem decide como encaixotar é quem embala. A
 *      loja soma o peso, usa as dimensões mínimas de postagem e declara o
 *      valor do carrinho. Mandar um "pacote" por item cotaria cinco caixas
 *      para cinco pirâmides que vão juntas, e o frete sairia multiplicado.
 *
 *   3. O ID DO SERVIÇO CARREGA A TRANSPORTADORA: `correios|pac`. A Envia
 *      identifica o serviço por par (carrier, service) — "pac" sozinho não diz
 *      de quem é. Guardar os dois juntos é o que permite emitir a etiqueta
 *      depois, a partir do que o cliente escolheu no checkout.
 *
 * O ambiente de teste é separado e as chaves não se misturam: token de sandbox
 * não autentica em produção. Errar isso responde 401 com o texto
 * "Authentication error." e nada que explique o motivo — por isso a mensagem
 * daqui diz qual ambiente a loja está usando.
 */

import { httpCall } from './providers.ts';

export interface EnviaCreds {
  token: string;
  /** 'sandbox' usa api-test.envia.com; qualquer outra coisa é produção. */
  sandbox: string;
  /** Serviços marcados no painel, no formato `transportadora|servico`. */
  services: string;
  /** Remetente — a Envia exige endereço completo, não só o CEP. */
  originName: string;
  originPhone: string;
  originStreet: string;
  originNumber: string;
  originDistrict: string;
  originCity: string;
  originState: string;
  originCep: string;
}

export function credsFrom(f: Record<string, unknown>): EnviaCreds {
  const s = (k: string): string => {
    const v = f[k];
    return v === null || v === undefined || typeof v === 'object' ? '' : String(v).trim();
  };
  return {
    token: s('token'),
    sandbox: s('sandbox').toLowerCase(),
    services: s('services'),
    originName: s('originName'),
    originPhone: s('originPhone').replace(/\D/g, ''),
    originStreet: s('originStreet'),
    originNumber: s('originNumber'),
    originDistrict: s('originDistrict'),
    originCity: s('originCity'),
    originState: s('originState').toUpperCase().slice(0, 2),
    originCep: s('originCep').replace(/\D/g, ''),
  };
}

export function ehSandbox(c: EnviaCreds): boolean {
  return c.sandbox === 'sandbox' || c.sandbox === 'teste' || c.sandbox === 'test';
}

function base(c: EnviaCreds): string {
  return ehSandbox(c) ? 'https://api-test.envia.com' : 'https://api.envia.com';
}

/** Serviços marcados no painel, como lista de `transportadora|servico`. */
export function servicosSelecionados(c: EnviaCreds): string[] {
  return c.services
    .split(/[,;\n]+/)
    .map((x) => x.trim().toLowerCase())
    .filter((x) => x !== '');
}

/**
 * O que falta para a loja conseguir falar com a Envia. Vazio = está pronta.
 *
 * Devolve UMA mensagem com todos os campos faltando, e não o primeiro: quem
 * está configurando prefere preencher os cinco de uma vez a descobrir um por
 * requisição.
 */
export function problemaNasCredenciais(c: EnviaCreds): string {
  if (c.token === '') return 'Token da Envia não cadastrado.';

  const faltando: string[] = [];
  if (c.originName === '') faltando.push('nome do remetente');
  if (c.originPhone.length < 10) faltando.push('telefone do remetente');
  if (c.originStreet === '') faltando.push('rua de origem');
  if (c.originCity === '') faltando.push('cidade de origem');
  if (c.originState.length !== 2) faltando.push('UF de origem');
  if (c.originCep.length !== 8) faltando.push('CEP de origem');

  if (faltando.length === 0) return '';
  return `Falta preencher, em Painel → Integrações → Envia: ${faltando.join(', ')}. `
    + 'A Envia exige o endereço completo do remetente — diferente dos Correios e do Melhor '
    + 'Envio, que se contentam com o CEP — porque ela também emite a etiqueta.';
}

// ------------------------------------------------------------- medidas ----

/**
 * Dimensões e peso mínimos de postagem (cm / gramas).
 *
 * Os mesmos do Melhor Envio, e pelo mesmo motivo: a transportadora mede a
 * EMBALAGEM, não a peça. Cotar com a dimensão real de um adesivo faz a cotação
 * ser recusada — ou, pior, sair barata e a etiqueta sair cara.
 */
const MIN_COMPRIMENTO = 16;
const MIN_LARGURA = 11;
const MIN_ALTURA = 2;
const MIN_PESO_GRAMAS = 300;

export interface ItemParaCotar {
  id: string;
  pesoGramas: number;
  precoUnitario: number;
  quantidade: number;
}

export interface OpcaoFrete {
  /** `transportadora|servico` — o par que a Envia usa para identificar o serviço. */
  servico: string;
  /** "Correios · PAC" — o que o cliente lê. */
  nome: string;
  transportadora: string;
  /** Em reais. 0 quando houve erro. */
  preco: number;
  prazoDias: number;
  /** Vazio quando cotou. Preenchido, explica por que este serviço não serve. */
  erro: string;
}

function numero(v: unknown): number {
  const n = Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

/** Volume único do carrinho: peso somado, dimensões mínimas, valor declarado. */
function pacoteDo(itens: ItemParaCotar[]): Record<string, unknown> {
  const gramas = itens.reduce(
    (t, i) => t + Math.max(0, i.pesoGramas) * Math.max(1, Math.round(i.quantidade)),
    0,
  );
  const valor = itens.reduce(
    (t, i) => t + Math.max(0, i.precoUnitario) * Math.max(1, Math.round(i.quantidade)),
    0,
  );
  return {
    type: 'box',
    content: 'Artigos de decoracao',
    amount: 1,
    declaredValue: Number(valor.toFixed(2)),
    lengthUnit: 'CM',
    weightUnit: 'KG',
    weight: Math.max(MIN_PESO_GRAMAS, Math.round(gramas)) / 1000,
    dimensions: { length: MIN_COMPRIMENTO, width: MIN_LARGURA, height: MIN_ALTURA },
  };
}

/** Endereço do remetente, no formato que a Envia espera. */
function origem(c: EnviaCreds): Record<string, unknown> {
  return {
    name: c.originName,
    phone: c.originPhone,
    street: c.originStreet,
    number: c.originNumber || 'S/N',
    district: c.originDistrict,
    city: c.originCity,
    state: c.originState,
    country: 'BR',
    postalCode: c.originCep,
  };
}

export interface DestinoParaEtiqueta {
  name: string;
  phone: string;
  street: string;
  number: string;
  district: string;
  city: string;
  state: string;
  cep: string;
}

function destinoApi(d: DestinoParaEtiqueta): Record<string, unknown> {
  return {
    name: d.name || 'Cliente',
    phone: String(d.phone ?? '').replace(/\D/g, '') || '0000000000',
    street: d.street || 'Nao informado',
    number: d.number || 'S/N',
    district: d.district,
    city: d.city,
    state: String(d.state ?? '').toUpperCase().slice(0, 2),
    country: 'BR',
    postalCode: String(d.cep ?? '').replace(/\D/g, ''),
  };
}

// -------------------------------------------------------------- erros ----

/**
 * Extrai a mensagem de erro da resposta.
 *
 * A Envia responde em formatos diferentes conforme a camada que recusou: a
 * Shipping API devolve o texto cru "Authentication error." num 401, e os erros
 * de validação vêm em JSON com `message`, `error` ou `meta`. Cobrir um só troca
 * o motivo real por "falha ao cotar", que não diz o que corrigir.
 */
export function detalheDoErro(body: string): string {
  const limpo = String(body ?? '').trim();
  if (limpo === '') return '';
  try {
    const d = JSON.parse(limpo) as Record<string, unknown>;
    const e = d.error ?? d.message ?? d.meta ?? d.errors;
    if (typeof e === 'string' && e.trim() !== '') return e.trim().slice(0, 300);
    if (Array.isArray(e)) return e.map((x) => String((x as Record<string, unknown>)?.message ?? x)).join(' · ').slice(0, 300);
    if (e !== null && typeof e === 'object') {
      const o = e as Record<string, unknown>;
      const msg = o.message ?? o.description ?? '';
      if (String(msg).trim() !== '') return String(msg).trim().slice(0, 300);
      return JSON.stringify(e).slice(0, 300);
    }
    return limpo.slice(0, 300);
  } catch {
    return limpo.length <= 300 ? limpo : limpo.slice(0, 300);
  }
}

/** Mensagem de 401, dizendo o ambiente — é o engano mais comum. */
function recusaDeToken(c: EnviaCreds): string {
  const ambiente = ehSandbox(c) ? 'sandbox (api-test.envia.com)' : 'produção (api.envia.com)';
  return `Token recusado pela Envia em ${ambiente}. `
    + 'As chaves são por ambiente: uma gerada no painel de teste não funciona em produção, e '
    + 'vice-versa. Gere a chave em Developer → API Keys do painel correspondente.';
}

async function chamar(
  c: EnviaCreds,
  caminho: string,
  corpo: unknown,
  timeoutMs = 20_000,
): Promise<{ dados: unknown; erro: string }> {
  const r = await httpCall(
    'POST',
    `${base(c)}${caminho}`,
    { Authorization: 'Bearer ' + c.token, Accept: 'application/json' },
    corpo,
    timeoutMs,
  );

  if (!r.ok) {
    /*
     * O corpo cru vai para o log, sempre.
     *
     * A documentação pública da Envia não traz o schema de erro de todos os
     * endpoints, e o rastreio não traz nem o de sucesso. Guardar o corpo é o
     * que permite descobrir o formato na primeira chamada real, em vez de
     * adivinhar — e é barato: são no máximo 600 caracteres por falha.
     */
    console.error(
      `[queops] Envia recusou ${caminho} (HTTP ${r.status}):`,
      String(r.body ?? '').slice(0, 600),
    );
    if (r.status === 401 || r.status === 403) return { dados: null, erro: recusaDeToken(c) };
    const detalhe = detalheDoErro(r.body);
    return {
      dados: null,
      erro: detalhe !== '' ? detalhe : `Envia respondeu HTTP ${r.status}. ${r.error}`.trim(),
    };
  }

  try {
    return { dados: JSON.parse(r.body), erro: '' };
  } catch {
    return { dados: null, erro: 'Resposta inesperada da Envia (não era JSON).' };
  }
}

/** `{ meta, data: [...] }` → a lista. Fora desse formato, lista vazia. */
function listaDe(dados: unknown): Record<string, unknown>[] {
  const d = (dados ?? {}) as Record<string, unknown>;
  const lista = Array.isArray(d.data) ? d.data : Array.isArray(dados) ? dados : [];
  return lista.filter((x): x is Record<string, unknown> => x !== null && typeof x === 'object');
}

// ------------------------------------------------------------ cotação ----

/**
 * Resposta da cotação → opções da loja.
 *
 * Separado de `cotar` para poder ser testado sem rede: é aqui que um campo
 * renomeado pela API viraria frete R$ 0,00 em produção, e teste que depende de
 * internet não roda.
 */
export function mapearOpcoes(lista: Record<string, unknown>[]): OpcaoFrete[] {
  return lista.map((item) => {
    const transportadora = String(item.carrierDescription ?? item.carrier ?? '').trim();
    const servicoNome = String(item.serviceDescription ?? item.service ?? '').trim();
    const par = `${String(item.carrier ?? '').toLowerCase()}|${String(item.service ?? '').toLowerCase()}`;

    /*
     * `totalPrice` é o preço cheio — com taxas. `basePrice` sai sem elas, e
     * cobrar o base faria a loja pagar a diferença em toda venda, sem isso
     * aparecer em relatório nenhum.
     */
    const preco = numero(item.totalPrice ?? item.basePrice);

    /*
     * O prazo vem em dois formatos, e nenhum deles é um número.
     * `deliveryDate.dateDifference` é a quantidade de dias quando existe;
     * `deliveryEstimate` é texto ("2-4 días"), e dele se tira o MAIOR número —
     * prometer o prazo mínimo é prometer o melhor caso.
     */
    const entrega = (item.deliveryDate ?? {}) as Record<string, unknown>;
    let prazo = Math.round(numero(entrega.dateDifference));
    if (prazo <= 0) {
      const numeros = String(item.deliveryEstimate ?? '').match(/\d+/g) ?? [];
      prazo = numeros.length > 0 ? Math.max(...numeros.map(Number)) : 0;
    }

    return {
      servico: par,
      nome: transportadora === ''
        ? servicoNome
        : servicoNome === '' ? transportadora : `${transportadora} · ${servicoNome}`,
      transportadora,
      preco,
      prazoDias: prazo,
      erro: preco > 0 ? '' : 'sem preço na resposta',
    };
  });
}

/**
 * Cota o carrinho.
 *
 * `apenasServicos` vazio devolve TUDO que a conta consegue cotar — é assim que
 * o painel monta a lista para a lojista escolher. Com a lista preenchida, o
 * filtro acontece AQUI, e não na API: pedir uma transportadora por chamada
 * transformaria um checkout em N requisições de rede.
 *
 * Nunca lança: devolve `{ opcoes: [], erro }`. Frete é caminho de venda, e o
 * chamador precisa seguir com as regras do painel quando o provedor falha.
 */
export async function cotar(
  c: EnviaCreds,
  cepDestino: string,
  itens: ItemParaCotar[],
  apenasServicos: string[] = [],
  ufDestino = '',
  cidadeDestino = '',
): Promise<{ opcoes: OpcaoFrete[]; erro: string }> {
  const problema = problemaNasCredenciais(c);
  if (problema !== '') return { opcoes: [], erro: problema };

  const destino = String(cepDestino ?? '').replace(/\D/g, '');
  if (destino.length !== 8) return { opcoes: [], erro: 'CEP de destino inválido.' };
  if (itens.length === 0) return { opcoes: [], erro: 'Carrinho vazio.' };

  /*
   * A cotação acontece ANTES de existir endereço.
   *
   * O cliente informa só o CEP na sacola e na página do produto — rua, número
   * e cidade só aparecem no checkout. A Envia, porém, exige `city` e `state`
   * também para cotar. A UF sai do CEP (a loja já faz isso para o ICMS da
   * nota), e a cidade, quando não se sabe, vai com a UF: é o suficiente para a
   * transportadora calcular a rota, que ela faz pelo CEP.
   *
   * Se algum dia a Envia passar a recusar isso, a mensagem de erro vem com o
   * nome do campo e aparece inteira no painel — que é a razão de `detalheDoErro`
   * existir.
   */
  const uf = String(ufDestino ?? '').toUpperCase().slice(0, 2);
  const corpo = {
    origin: origem(c),
    destination: {
      name: 'Cliente',
      phone: c.originPhone,
      street: 'Nao informado',
      number: 'S/N',
      city: cidadeDestino || uf || 'Nao informado',
      state: uf,
      country: 'BR',
      postalCode: destino,
    },
    packages: [pacoteDo(itens)],
    shipment: { type: 1 },
    settings: { currency: 'BRL' },
  };

  const { dados, erro } = await chamar(c, '/ship/rate/', corpo);
  if (erro !== '') return { opcoes: [], erro };

  const todas = mapearOpcoes(listaDe(dados));
  if (apenasServicos.length === 0) return { opcoes: todas, erro: '' };

  const marcados = new Set(apenasServicos.map((x) => x.toLowerCase()));
  return { opcoes: todas.filter((o) => marcados.has(o.servico)), erro: '' };
}

/**
 * Cotação de amostra, para o painel listar as transportadoras disponíveis.
 *
 * Usa uma rota real (origem configurada → CEP da Avenida Paulista) e um volume
 * de 1 kg. Sai do MESMO endpoint que o checkout usa, então o que aparece no
 * painel é exatamente o que o cliente vai ver — um endpoint de catálogo
 * listaria serviço que, na prática, não cota para aquela rota.
 */
export async function amostraDeServicos(
  c: EnviaCreds,
): Promise<{ opcoes: OpcaoFrete[]; erro: string }> {
  return await cotar(
    c,
    '01310100',
    [{ id: 'amostra', pesoGramas: 1000, precoUnitario: 100, quantidade: 1 }],
    [],
    'SP',
    'Sao Paulo',
  );
}

// ------------------------------------------------------------ etiqueta ----

export interface EtiquetaGerada {
  /** Vazio quando deu certo. */
  erro: string;
  /** Código de rastreio da transportadora. */
  rastreio: string;
  /** URL do PDF da etiqueta, para imprimir. */
  etiquetaUrl: string;
  /** Página de rastreio da transportadora. */
  rastreioUrl: string;
  /** Id do envio na Envia — é por ele que se cancela. */
  envioId: string;
  /** O que a Envia cobrou, em reais. */
  preco: number;
}

const SEM_ETIQUETA: EtiquetaGerada = {
  erro: '', rastreio: '', etiquetaUrl: '', rastreioUrl: '', envioId: '', preco: 0,
};

/**
 * Emite a etiqueta de um pedido.
 *
 * Isto GASTA DINHEIRO: a Envia debita o frete do saldo da conta e devolve o
 * saldo restante. Por isso a rota que chama esta função exige confirmação e
 * recusa emitir duas vezes para o mesmo pedido — etiqueta duplicada é frete
 * pago duas vezes, e a segunda não dá para devolver sozinha.
 *
 * `servico` é o par `transportadora|servico` que o cliente escolheu no
 * checkout. Ele vem do pedido, e não de uma nova cotação: cotar de novo na
 * hora de emitir arriscaria pegar um preço diferente do que foi cobrado.
 */
export async function gerarEtiqueta(
  c: EnviaCreds,
  servico: string,
  destino: DestinoParaEtiqueta,
  itens: ItemParaCotar[],
): Promise<EtiquetaGerada> {
  const problema = problemaNasCredenciais(c);
  if (problema !== '') return { ...SEM_ETIQUETA, erro: problema };

  const [transportadora, codigo] = String(servico ?? '').toLowerCase().split('|');
  if (!transportadora || !codigo) {
    return {
      ...SEM_ETIQUETA,
      erro: 'Este pedido não tem um serviço da Envia escolhido. A etiqueta só sai para pedido '
        + 'cujo frete foi cotado pela Envia no checkout.',
    };
  }
  if (String(destino.cep ?? '').replace(/\D/g, '').length !== 8) {
    return { ...SEM_ETIQUETA, erro: 'O pedido está sem CEP de entrega.' };
  }
  if (String(destino.city ?? '').trim() === '' || String(destino.state ?? '').trim() === '') {
    return { ...SEM_ETIQUETA, erro: 'O pedido está sem cidade ou UF de entrega.' };
  }

  const corpo = {
    origin: origem(c),
    destination: destinoApi(destino),
    packages: [pacoteDo(itens)],
    shipment: { type: 1, carrier: transportadora, service: codigo },
    /*
     * PDF em 4x6 polegadas: é o formato das impressoras térmicas de etiqueta,
     * e também imprime em folha A4 sem ficar ilegível. Pedir "ZPL" geraria um
     * arquivo que só a térmica entende, e a loja não tem uma.
     */
    settings: { printFormat: 'PDF', printSize: 'STOCK_4X6', currency: 'BRL' },
  };

  const { dados, erro } = await chamar(c, '/ship/generate/', corpo, 40_000);
  if (erro !== '') return { ...SEM_ETIQUETA, erro };

  const primeira = listaDe(dados)[0];
  if (primeira === undefined) {
    return { ...SEM_ETIQUETA, erro: 'A Envia respondeu sem etiqueta. Nada foi cobrado.' };
  }

  const pacote = (Array.isArray(primeira.packages) ? primeira.packages[0] : null) as
    Record<string, unknown> | null;

  return {
    erro: '',
    rastreio: String(primeira.trackingNumber ?? pacote?.trackingNumber ?? ''),
    etiquetaUrl: String(primeira.label ?? ''),
    rastreioUrl: String(primeira.trackUrl ?? pacote?.trackUrl ?? ''),
    envioId: String(primeira.shipmentId ?? ''),
    preco: numero(primeira.totalPrice),
  };
}

/** Cancela um envio já emitido. A Envia estorna conforme as regras dela. */
export async function cancelarEnvio(
  c: EnviaCreds,
  envioId: string,
): Promise<{ ok: boolean; erro: string }> {
  if (String(envioId ?? '').trim() === '') {
    return { ok: false, erro: 'Este pedido não tem envio emitido na Envia.' };
  }
  const { erro } = await chamar(c, '/ship/cancel/', { shipmentId: [String(envioId).trim()] });
  return { ok: erro === '', erro };
}

// ---------------------------------------------------------- rastreio ----

export interface EventoRastreio {
  data: string;
  descricao: string;
  local: string;
}

/**
 * Rastreia um ou mais códigos.
 *
 * A documentação pública da Envia não publica o schema da resposta deste
 * endpoint — só diz que ela traz o status atual e o histórico. Em vez de
 * apostar num formato, a leitura abaixo procura a lista de eventos nos nomes
 * mais prováveis e aceita variações de cada campo. O corpo cru vai para o log
 * em caso de falha, e na primeira chamada real o formato aparece.
 */
export async function rastrear(
  c: EnviaCreds,
  codigo: string,
): Promise<{ eventos: EventoRastreio[]; erro: string }> {
  if (c.token === '') return { eventos: [], erro: 'Token da Envia não cadastrado.' };
  const limpo = String(codigo ?? '').trim();
  if (limpo === '') return { eventos: [], erro: 'Pedido sem código de rastreio.' };

  const { dados, erro } = await chamar(c, '/ship/generaltrack/', { trackingNumbers: [limpo] });
  if (erro !== '') return { eventos: [], erro };

  const primeira = listaDe(dados)[0];
  if (primeira === undefined) {
    return { eventos: [], erro: 'A Envia não encontrou este código de rastreio.' };
  }

  const brutos = [primeira.history, primeira.events, primeira.statusHistory, primeira.tracking]
    .find((x) => Array.isArray(x) && x.length > 0) as Record<string, unknown>[] | undefined;

  if (brutos === undefined) {
    /*
     * Sem histórico, o status atual sozinho já é informação: "Postado" é
     * melhor do que uma tela vazia que parece defeito.
     */
    const status = String(
      (primeira.status as Record<string, unknown>)?.description
      ?? primeira.statusDescription ?? primeira.status ?? '',
    ).trim();
    return status === ''
      ? { eventos: [], erro: 'A Envia ainda não tem movimentação para este código.' }
      : { eventos: [{ data: '', descricao: status, local: '' }], erro: '' };
  }

  const eventos = brutos.map((e) => ({
    data: String(e.date ?? e.datetime ?? e.updatedAt ?? ''),
    descricao: String(e.description ?? e.status ?? e.statusDescription ?? '').trim(),
    local: String(e.location ?? e.city ?? e.place ?? '').trim(),
  })).filter((e) => e.descricao !== '');

  return { eventos, erro: '' };
}
