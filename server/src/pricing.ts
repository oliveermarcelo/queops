/**
 * Motor de preços — FONTE ÚNICA DA VERDADE para frete, cupom e desconto Pix.
 *
 * Regra de ouro: o navegador nunca informa preço. Ele manda apenas
 * `[{productId, quantity}]`; o valor unitário vem sempre do banco. Assim, um
 * cliente que adultere o JavaScript não consegue comprar por R$ 0,01.
 *
 * A mesma função alimenta a prévia do checkout (`POST /checkout/quote`) e a
 * criação do pedido (`POST /orders`), então o que o cliente vê é exatamente o
 * que é cobrado.
 */

import { placeholders, q, type Q } from './db.ts';
import { brl, round2 } from './http.ts';
import { getSettings, getShipping, type ShippingConfig } from './store.ts';

/** Normaliza um CEP para 8 dígitos ou devolve '' se não for válido. */
export function normalizeCep(cep: string): string {
  const d = String(cep ?? '').replace(/\D/g, '');
  return d.length === 8 ? d : '';
}

/** Faixas oficiais dos Correios: primeiros 5 dígitos → UF. */
const CEP_RANGES: [number, number, string][] = [
  [1000, 19999, 'SP'], [20000, 28999, 'RJ'], [29000, 29999, 'ES'],
  [30000, 39999, 'MG'], [40000, 48999, 'BA'], [49000, 49999, 'SE'],
  [50000, 56999, 'PE'], [57000, 57999, 'AL'], [58000, 58999, 'PB'],
  [59000, 59999, 'RN'], [60000, 63999, 'CE'], [64000, 64999, 'PI'],
  [65000, 65999, 'MA'], [66000, 68899, 'PA'], [68900, 68999, 'AP'],
  [69000, 69299, 'AM'], [69300, 69399, 'RR'], [69400, 69899, 'AM'],
  [69900, 69999, 'AC'], [70000, 72799, 'DF'], [72800, 72999, 'GO'],
  [73000, 73699, 'DF'], [73700, 76799, 'GO'], [76800, 76999, 'RO'],
  [77000, 77999, 'TO'], [78000, 78899, 'MT'], [79000, 79999, 'MS'],
  [80000, 87999, 'PR'], [88000, 89999, 'SC'], [90000, 99999, 'RS'],
];

/**
 * UF a partir do CEP.
 *
 * Permite estimar o frete na página do produto (onde só temos o CEP) e
 * preencher a UF sozinho no checkout, sem depender de serviço externo.
 */
export function ufFromCep(cep: string): string {
  const norm = normalizeCep(cep);
  if (norm === '') return '';
  const n = Number(norm.slice(0, 5));
  for (const [from, to, uf] of CEP_RANGES) {
    if (n >= from && n <= to) return uf;
  }
  return '';
}

/** Prazo estimado de entrega em dias úteis, por região. */
export function deliveryDaysFor(uf: string): number {
  switch (uf) {
    case 'SP':
      return 3;
    case 'RJ': case 'MG': case 'ES': case 'PR': case 'SC':
      return 4;
    case 'RS': case 'GO': case 'DF': case 'MS': case 'BA':
      return 6;
    case '':
      return 7;
    default:
      return 8;
  }
}

export interface ShippingResult {
  cost: number;
  reason:
    | 'free_state'
    | 'free_cep_range'
    | 'free_min_order'
    | 'cep_range'
    | 'per_state'
    | 'default'
    | 'correios'
    | 'melhorenvio';
  label: string;
}

/**
 * Calcula o frete. Ordem de precedência — a MESMA usada pelo simulador do
 * painel (src/admin/modules/ShippingAdmin.tsx), para o que é simulado bater
 * com o que é cobrado:
 *
 *   1. UF marcada como "sempre grátis"
 *   2. faixa de CEP marcada como grátis
 *   3. faixa de CEP com preço  (zerada se o subtotal atingir o mínimo)
 *   4. frete grátis por valor mínimo
 *   5. preço por UF
 *   6. preço padrão
 */
export function calculateShipping(
  shipping: ShippingConfig,
  subtotal: number,
  ufRaw: string,
  cepRaw: string,
): ShippingResult {
  const uf = String(ufRaw ?? '').toUpperCase().slice(0, 2);
  const cep = normalizeCep(cepRaw);

  const free = shipping.freeShipping ?? {};
  const enabled = Boolean(free.enabled);
  // minOrder 0 (ou ausente) = regra desligada. O painel diz "deixe 0 para não
  // dar grátis por valor"; tratar 0 como mínimo faria TODO pedido sair franqueado.
  const minOrder = Number(free.minOrder ?? 0) || 0;

  // UF com frete grátis incondicional vem antes de qualquer faixa de CEP.
  if (enabled && uf !== '' && (free.states ?? []).includes(uf)) {
    return { cost: 0, reason: 'free_state', label: `Frete grátis para ${uf}` };
  }

  if (cep !== '') {
    for (const range of shipping.cepRanges ?? []) {
      const from = normalizeCep(String(range?.from ?? ''));
      const to = normalizeCep(String(range?.to ?? ''));
      if (from === '' || to === '') continue;
      // Comparação numérica: '01000000' < '05999999' funciona como inteiro.
      if (Number(cep) >= Number(from) && Number(cep) <= Number(to)) {
        if (range.free) {
          return { cost: 0, reason: 'free_cep_range', label: String(range.label ?? 'Frete grátis') };
        }
        if (enabled && minOrder > 0 && subtotal >= minOrder) {
          return { cost: 0, reason: 'free_min_order', label: 'Frete grátis' };
        }
        return {
          cost: round2(Number(range.price ?? 0) || 0),
          reason: 'cep_range',
          label: String(range.label ?? 'Entrega'),
        };
      }
    }
  }

  // Frete grátis por valor mínimo: vale para faixa de CEP, UF e padrão, por
  // isso é avaliado depois das regras "sempre grátis" e antes do preço final.
  if (enabled && minOrder > 0 && subtotal > 0 && subtotal >= minOrder) {
    return { cost: 0, reason: 'free_min_order', label: 'Frete grátis' };
  }

  const perState = shipping.perState ?? {};
  if (uf !== '' && Object.prototype.hasOwnProperty.call(perState, uf)) {
    return { cost: round2(Number(perState[uf]) || 0), reason: 'per_state', label: `Entrega para ${uf}` };
  }

  return {
    cost: round2(Number(shipping.defaultPrice ?? 0) || 0),
    reason: 'default',
    label: 'Entrega padrão',
  };
}

// --------------------------------------------------------------- cupons ----

export interface CouponRow {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  active: number;
  min_order: number | null;
  expires_at: string | null;
  uses: number;
  max_uses: number | null;
}

/** Valida um cupom e devolve [linha, erro]. Erro null = cupom válido. */
export async function resolveCoupon(
  code: string,
  subtotal: number,
  exec: Q = q,
  today = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10),
): Promise<[CouponRow | null, string | null]> {
  const upper = String(code ?? '').trim().toUpperCase();
  if (upper === '') return [null, null];

  const row = (await exec.one('SELECT * FROM coupons WHERE code = ?', [upper])) as CouponRow | null;
  if (row === null) return [null, 'Cupom não encontrado.'];
  if (!row.active) return [null, 'Este cupom não está mais ativo.'];
  if (row.expires_at !== null && String(row.expires_at).slice(0, 10) < today) {
    return [null, 'Este cupom expirou.'];
  }
  if (row.max_uses !== null && Number(row.uses) >= Number(row.max_uses)) {
    return [null, 'Este cupom atingiu o limite de usos.'];
  }
  if (row.min_order !== null && subtotal < Number(row.min_order)) {
    return [null, `Este cupom vale a partir de R$ ${brl(Number(row.min_order))}.`];
  }
  return [row, null];
}

// -------------------------------------------------------------- cotação ----

export interface QuoteItem {
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  image: string;
}

/**
 * Uma opção de entrega que o cliente pode escolher.
 *
 * `id` é o que volta do navegador na hora de fechar o pedido — e o servidor
 * cota de novo por ele, em vez de aceitar o preço que vier junto.
 */
export interface OpcaoDeFrete {
  /** 'correios:03220' · 'melhorenvio:2' — provedor e serviço. */
  id: string;
  /** "Jadlog · .Package" — o que o cliente lê. */
  label: string;
  /** "Jadlog", "Correios" — para agrupar/exibir. */
  carrier: string;
  price: number;
  days: number;
  source: 'correios' | 'melhorenvio';
}

export interface Quote {
  items: QuoteItem[];
  subtotal: number;
  shipping: number;
  shippingLabel: string;
  shippingReason?: string;
  /** Motivo de os Correios/Melhor Envio não terem cotado. Só chega ao painel. */
  shippingNote?: string;
  /** Opções de entrega cotadas. Vazio = o frete saiu das regras do painel. */
  shippingOptions?: OpcaoDeFrete[];
  /** Qual das opções está valendo neste total. */
  shippingChoice?: string;
  couponCode: string | null;
  couponDiscount: number;
  couponError: string | null;
  pixDiscount: number;
  pixDiscountPct?: number;
  discount: number;
  total: number;
  uf: string;
  deliveryDays: number;
  issues: string[];
}

export interface RawItem {
  productId?: unknown;
  id?: unknown;
  quantity?: unknown;
}

/** Peso de UM produto em gramas, com a origem do número. */
export function pesoDoProduto(
  linha: Record<string, unknown> | undefined,
  padraoG = 500,
): { gramas: number; origem: 'weight_kg' | 'rotulo' | 'padrao' } {
  const kg = Number(linha?.weight_kg ?? 0);
  if (Number.isFinite(kg) && kg > 0) {
    return { gramas: Math.round(kg * 1000), origem: 'weight_kg' };
  }

  /*
   * Sem peso numérico, tenta o rótulo — mas SÓ com unidade de massa escrita.
   *
   * É compatibilidade com o que existia antes de `weight_kg`: quem cadastrou
   * "800g" naquele campo continua com o frete certo. A exigência da unidade é
   * o que torna a reserva segura, e o teste que a motivou é real: o rótulo
   * "Base 15cm · cobre" fazia `pesoEmGramas` achar o 15, não achar unidade
   * nenhuma, e concluir 15 kg — trinta vezes o peso da peça, num campo que
   * nunca falou de peso. Um número solto num campo de MEDIDA é medida; só "kg"
   * ou "g" escrito ali autoriza lê-lo como peso.
   */
  const rotulo = String(linha?.weight ?? '').trim().toLowerCase();
  if (/\d\s*(kg|g|gramas?|quilos?)\b/.test(rotulo)) {
    const g = pesoEmGramas(rotulo, -1);
    if (g > 0) return { gramas: g, origem: 'rotulo' };
  }

  return { gramas: padraoG, origem: 'padrao' };
}

/**
 * Peso do carrinho em GRAMAS.
 *
 * O padrão de 500 g existe porque frete que FALHA por peso ausente é pior que
 * frete aproximado — a venda para. Mas ele não é inofensivo: enquanto os
 * produtos não tiverem `weight_kg` preenchido, toda cotação sai com 500 g por
 * item, independentemente do que a peça pesa. Uma pirâmide de cobre de 3 kg
 * cotada como 500 g é prejuízo a cada venda, e silencioso — ninguém abre
 * chamado porque o frete saiu barato.
 *
 * Por isso o log: quando um item cai no padrão, fica registrado qual foi.
 */
function pesoDoCarrinho(
  items: QuoteItem[],
  found: Map<string, Record<string, unknown>>,
): number {
  const PADRAO_G = 500;
  let total = 0;
  const semPeso: string[] = [];
  for (const item of items) {
    const { gramas, origem } = pesoDoProduto(found.get(item.productId), PADRAO_G);
    if (origem === 'padrao') semPeso.push(String(item.productId));
    total += gramas * item.quantity;
  }
  if (semPeso.length > 0) {
    console.warn(
      '[queops] frete cotado com peso padrão (500 g/item) para: ' + semPeso.join(', ')
      + ' — preencha o peso em Painel → Produtos, ou pelo ERP.',
    );
  }
  return Math.max(300, Math.round(total));
}

/**
 * Opções dos Correios para este carrinho, ou `null` para manter o das regras.
 *
 * Devolve `null` — em vez de lançar — em todo caminho que não produz preço
 * confiável: integração desligada, frete já gratuito, credencial incompleta,
 * API fora do ar. Frete é caminho de venda: na dúvida, o valor configurado no
 * painel prevalece e a loja continua vendendo.
 */
async function opcoesDosCorreios(
  ship: ShippingResult,
  cep: string,
  pesoGramas: number,
  exec: Q,
  diagnostico: { motivo: string },
): Promise<OpcaoDeFrete[] | null> {
  /*
   * Cada saída registra o motivo — no log E no objeto de diagnóstico.
   *
   * São cinco caminhos que devolvem null, e do lado de fora todos parecem
   * iguais: o frete sai pelo valor fixo, sem pista nenhuma. Ficar em silêncio
   * aqui transforma "por que Acre e Bahia custam o mesmo?" numa investigação.
   *
   * O log sozinho não resolvia: quem cuida da loja não tem SSH, e a diferença
   * entre "os Correios estão fora do ar" e "falta o CEP de origem" é a
   * diferença entre esperar e resolver. Por isso o motivo volta na cotação —
   * mas só para quem está logado no painel (ver a rota /checkout/quote).
   */
  const pulou = (motivo: string): null => {
    console.warn(`[queops] frete: Correios não consultados — ${motivo}`);
    diagnostico.motivo = motivo;
    return null;
  };

  /*
   * Frete grátis por regra do painel não vira cotação: cotar aqui só trocaria
   * uma promoção configurada por preço cheio. Não registramos no log porque é
   * o comportamento pedido, não uma falha.
   */
  if (ship.reason.startsWith('free_')) return null;
  if (normalizeCep(cep) === '') return pulou('CEP de destino inválido');

  try {
    const row = await exec.one(
      "SELECT enabled FROM integrations WHERE id = 'correios' AND enabled = 1",
    );
    if (!row) return pulou('integração desligada em Painel → Integrações');

    const { integrationSecrets } = await import('./store.ts');
    const { credsFrom, cotarTodos } = await import('./correios.ts');
    const creds = credsFrom(await integrationSecrets('correios', exec));
    if (creds.user === '' || creds.accessCode === '') {
      return pulou('usuário ou código de acesso não cadastrados');
    }
    if ((creds.originCep ?? '').length !== 8) {
      return pulou('CEP de origem não configurado no painel');
    }

    const cotacoes = await cotarTodos(creds, cep, pesoGramas);
    const boas = cotacoes.filter((c) => c.erro === '' && c.preco > 0);
    if (boas.length === 0) {
      const erros = cotacoes.map((c) => `${c.nome}: ${c.erro || 'sem preço'}`).join(' · ');
      return pulou(`nenhum serviço cotou (${erros})`);
    }

    return boas.map((c) => ({
      id: `correios:${c.servico}`,
      label: c.nome,
      carrier: 'Correios',
      price: round2(c.preco),
      days: c.prazoDias,
      source: 'correios' as const,
    }));
  } catch (e) {
    // Correios instáveis não podem derrubar o checkout.
    return pulou(e instanceof Error ? e.message : String(e));
  }
}

/**
 * Opções do Melhor Envio (Jadlog, Azul, Loggi, LATAM…).
 *
 * Só entram os serviços que a lojista marcou no painel: a conta oferece mais do
 * que ela quer vender, e transportadora que ela não usa aparecendo no checkout é
 * pedido que ela não consegue despachar. Nada marcado = nada aqui, e o painel
 * avisa isso na tela de integrações.
 */
async function opcoesDoMelhorEnvio(
  ship: ShippingResult,
  cep: string,
  itens: QuoteItem[],
  produtos: Map<string, Record<string, unknown>>,
  exec: Q,
  diagnostico: { motivo: string },
): Promise<OpcaoDeFrete[] | null> {
  const pulou = (motivo: string): null => {
    console.warn(`[queops] frete: Melhor Envio não consultado — ${motivo}`);
    // Não sobrescreve um motivo dos Correios já registrado: os dois somam.
    diagnostico.motivo = diagnostico.motivo === ''
      ? `Melhor Envio: ${motivo}`
      : `${diagnostico.motivo} · Melhor Envio: ${motivo}`;
    return null;
  };

  if (ship.reason.startsWith('free_')) return null;
  if (normalizeCep(cep) === '') return null; // já reportado pelos Correios

  try {
    const row = await exec.one(
      "SELECT enabled FROM integrations WHERE id = 'melhorenvio' AND enabled = 1",
    );
    if (!row) return null; // desligado é escolha, não falha: nem vale log.

    const { integrationSecrets } = await import('./store.ts');
    const { credsFrom, cotar, servicosSelecionados } = await import('./melhorenvio.ts');
    const creds = credsFrom(await integrationSecrets('melhorenvio', exec));
    if (creds.token === '') return pulou('token não cadastrado');
    if (creds.originCep.length !== 8) return pulou('CEP de origem não configurado');

    const selecionados = servicosSelecionados(creds);
    if (selecionados.length === 0) {
      return pulou('nenhuma transportadora marcada em Painel → Integrações');
    }

    const paraCotar = itens.map((i) => ({
      id: i.productId,
      // Mesma regra do peso do carrinho: número primeiro, rótulo depois,
      // padrão por último. Antes daqui saía direto do texto.
      pesoGramas: pesoDoProduto(produtos.get(i.productId)).gramas,
      precoUnitario: i.unitPrice,
      quantidade: i.quantity,
    }));

    const { opcoes, erro } = await cotar(creds, cep, paraCotar, selecionados);
    if (erro !== '') return pulou(erro);

    const boas = opcoes.filter((o) => o.erro === '' && o.preco > 0);
    if (boas.length === 0) {
      const motivos = opcoes.map((o) => `${o.nome}: ${o.erro || 'sem preço'}`).join(' · ');
      return pulou(motivos === '' ? 'nenhuma transportadora cotou' : `nenhuma cotou (${motivos})`);
    }

    return boas.map((o) => ({
      id: `melhorenvio:${o.servico}`,
      label: o.nome,
      carrier: o.transportadora === '' ? 'Melhor Envio' : o.transportadora,
      price: round2(o.preco),
      days: o.prazoDias,
      source: 'melhorenvio' as const,
    }));
  } catch (e) {
    return pulou(e instanceof Error ? e.message : String(e));
  }
}

/** Junta o que as transportadoras cotaram, da mais barata para a mais cara. */
async function cotarTransportadoras(
  ship: ShippingResult,
  cep: string,
  pesoGramas: number,
  itens: QuoteItem[],
  produtos: Map<string, Record<string, unknown>>,
  exec: Q,
  diagnostico: { motivo: string },
): Promise<OpcaoDeFrete[]> {
  /*
   * Os dois provedores em paralelo: são chamadas de rede independentes, e
   * esperar uma para começar a outra dobraria o tempo do checkout sem motivo.
   */
  const [correios, melhorEnvio] = await Promise.all([
    opcoesDosCorreios(ship, cep, pesoGramas, exec, diagnostico),
    opcoesDoMelhorEnvio(ship, cep, itens, produtos, exec, diagnostico),
  ]);

  const todas = [...(correios ?? []), ...(melhorEnvio ?? [])];
  return todas.sort((a, b) => a.price - b.price);
}

/** "1,2 kg" → 1200 · "800 g" → 800 · "0.5" → 500 (assume kg) · "" → padrão. */
export function pesoEmGramas(texto: string, padrao = 500): number {
  const m = texto.match(/([\d.,]+)\s*(kg|g|gramas?|quilos?)?/i);
  if (!m) return padrao;
  /*
   * "1.234" é mil e duzentos; "1.5" é um e meio. O ponto só é separador de
   * milhar quando vem seguido de exatamente três dígitos — sem essa distinção,
   * "1.5 kg" virava 15 kg e o frete saía dez vezes maior.
   */
  const bruto = m[1].replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
  const n = Number(bruto);
  if (!Number.isFinite(n) || n <= 0) return padrao;
  const unidade = (m[2] ?? '').toLowerCase();
  // Sem unidade: número pequeno quase sempre é kg ("0,5"), grande é grama.
  if (unidade === '' ) return n < 100 ? Math.round(n * 1000) : Math.round(n);
  if (unidade.startsWith('k') || unidade.startsWith('q')) return Math.round(n * 1000);
  return Math.round(n);
}

/**
 * Cotação completa do carrinho.
 *
 * `exec` permite rodar dentro da transação do pedido, para que o preço lido
 * seja o mesmo que a baixa de estoque enxerga.
 */
export interface OpcoesCotacao {
  /** Id da opção de frete que o cliente escolheu (`shippingOptions[].id`). */
  escolha?: string;
  /**
   * Frete já resolvido, para NÃO consultar transportadora de novo.
   *
   * É como o `POST /orders` mantém rede fora da transação: o valor é cotado
   * antes de abrir a transação e entra aqui já pronto. Continua sendo um número
   * calculado pelo servidor — nunca o que o navegador mandou.
   */
  freteFixado?: { cost: number; label: string; reason: ShippingResult['reason']; option: string };
}

export async function quoteCart(
  rawItems: unknown,
  ufIn: string,
  cep: string,
  couponCode: string,
  payment: string,
  exec: Q = q,
  opcoes: OpcoesCotacao = {},
): Promise<Quote> {
  // Sem UF informada (ex.: simulador da página do produto), deduz pelo CEP.
  let uf = String(ufIn ?? '').trim().toUpperCase();
  if (uf === '') uf = ufFromCep(cep);

  // ---- 1. Resolve os itens contra o banco (preço e estoque reais) ----------
  const wanted = new Map<string, number>();
  for (const item of Array.isArray(rawItems) ? rawItems : []) {
    if (item === null || typeof item !== 'object') continue;
    const raw = item as RawItem;
    const id = String(raw.productId ?? raw.id ?? '');
    const qty = Math.trunc(Number(raw.quantity ?? 0)) || 0;
    if (id === '' || qty < 1) continue;
    // Teto por item evita pedidos absurdos por engano ou abuso.
    wanted.set(id, Math.min((wanted.get(id) ?? 0) + qty, 999));
  }

  if (wanted.size === 0) {
    return {
      items: [], subtotal: 0, shipping: 0, shippingLabel: '',
      couponDiscount: 0, couponCode: null, couponError: null,
      pixDiscount: 0, discount: 0, total: 0, uf,
      deliveryDays: deliveryDaysFor(uf), issues: ['Sacola vazia.'],
    };
  }

  const ids = [...wanted.keys()];
  const rows = await exec.all(
    `SELECT * FROM products WHERE id IN (${placeholders(ids.length)}) AND active = 1`,
    ids,
  );
  const found = new Map(rows.map((r) => [String(r.id), r]));

  const items: QuoteItem[] = [];
  const issues: string[] = [];
  let subtotal = 0;

  for (const [id, qtyWanted] of wanted) {
    const p = found.get(id);
    if (!p) {
      issues.push('Um item da sacola não está mais disponível e foi removido.');
      continue;
    }
    const stock = Number(p.stock) || 0;
    if (stock <= 0) {
      issues.push(`“${p.name}” está sem estoque e foi removido da sacola.`);
      continue;
    }
    let qty = qtyWanted;
    if (qty > stock) {
      issues.push(`“${p.name}”: só temos ${stock} em estoque, ajustamos a quantidade.`);
      qty = stock;
    }
    const unit = Number(p.price) || 0;
    subtotal += unit * qty;
    items.push({
      productId: String(p.id),
      name: String(p.name),
      quantity: qty,
      unitPrice: unit,
      lineTotal: round2(unit * qty),
      image: String(p.image ?? ''),
    });
  }

  subtotal = round2(subtotal);

  // ---- 2. Frete -----------------------------------------------------------
  const ship = calculateShipping(await getShipping(exec), subtotal, uf, cep);

  /*
   * Cotação nas transportadoras (Correios e Melhor Envio), quando ligadas.
   *
   * As regras do painel têm precedência: se alguma delas deu frete grátis
   * (`free_*`), o grátis vale e nem consultamos as APIs — cotar aqui só
   * substituiria uma promoção configurada por um preço cheio.
   *
   * Cotou: as opções vão para a tela e o cliente escolhe. A escolhida define o
   * total; sem escolha, vale a mais barata. Não cotou (API fora do ar, CEP fora
   * de área, credencial vencida): o valor das regras permanece e a loja continua
   * vendendo.
   *
   * `freteFixado` é o caminho de quem já cotou e não quer cotar de novo — ver
   * `OpcoesCotacao`. É assim que a criação do pedido mantém chamada de rede
   * fora da transação do banco.
   */
  const diagnosticoFrete = { motivo: '' };
  let shippingOptions: OpcaoDeFrete[] = [];
  let shippingChoice = '';

  if (opcoes.freteFixado !== undefined) {
    ship.cost = round2(opcoes.freteFixado.cost);
    ship.label = opcoes.freteFixado.label;
    ship.reason = opcoes.freteFixado.reason;
    shippingChoice = opcoes.freteFixado.option;
  } else {
    const pesoTotal = pesoDoCarrinho(items, found);
    shippingOptions = await cotarTransportadoras(
      ship, cep, pesoTotal, items, found, exec, diagnosticoFrete,
    );
    if (shippingOptions.length > 0) {
      const pedida = shippingOptions.find((o) => o.id === (opcoes.escolha ?? ''));
      const usada = pedida ?? shippingOptions[0]; // já vem da mais barata
      ship.cost = usada.price;
      ship.label = usada.days > 0
        ? `${usada.label} — até ${usada.days} ${usada.days === 1 ? 'dia útil' : 'dias úteis'}`
        : usada.label;
      ship.reason = usada.source;
      shippingChoice = usada.id;
    }
  }

  // ---- 3. Cupom -----------------------------------------------------------
  const [coupon, couponError] = await resolveCoupon(couponCode, subtotal, exec);
  let couponDiscount = 0;
  if (coupon !== null) {
    couponDiscount = coupon.type === 'percent'
      ? subtotal * (Number(coupon.value) / 100)
      : Number(coupon.value);
    // Nunca desconta mais do que o valor dos produtos.
    couponDiscount = round2(Math.min(couponDiscount, subtotal));
  }

  // ---- 4. Desconto Pix (sobre o subtotal já com cupom) --------------------
  const settings = await getSettings(exec);
  const pixPct = Number(settings.pixDiscountPct ?? 0) || 0;
  const pixDiscount = payment === 'pix' && pixPct > 0
    ? round2(Math.max(0, subtotal - couponDiscount) * (pixPct / 100))
    : 0;

  const discount = round2(couponDiscount + pixDiscount);
  const total = round2(Math.max(0, subtotal - discount) + ship.cost);

  return {
    items,
    subtotal,
    shipping: ship.cost,
    shippingLabel: ship.label,
    shippingReason: ship.reason,
    shippingOptions,
    shippingChoice,
    /*
     * Por que os Correios não entraram nesta cotação. Vazio quando entraram
     * (ou quando o frete grátis do painel tinha precedência, que é regra e não
     * falha). A rota só entrega este campo para administradores.
     */
    shippingNote: diagnosticoFrete.motivo,
    couponCode: coupon?.code ?? null,
    couponDiscount,
    couponError,
    pixDiscount,
    pixDiscountPct: pixPct,
    discount,
    total,
    uf,
    deliveryDays: deliveryDaysFor(uf),
    issues,
  };
}
