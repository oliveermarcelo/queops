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
    | 'correios';
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

export interface Quote {
  items: QuoteItem[];
  subtotal: number;
  shipping: number;
  shippingLabel: string;
  shippingReason?: string;
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

/**
 * Peso do carrinho em GRAMAS.
 *
 * `products.weight` é VARCHAR livre: vem "1,2 kg", "800g", "0.5" ou vazio,
 * conforme quem cadastrou. Interpretamos o que der e caímos num padrão quando
 * não dá — frete que falha por peso ausente é pior do que frete aproximado.
 */
function pesoDoCarrinho(
  items: QuoteItem[],
  found: Map<string, Record<string, unknown>>,
): number {
  const PADRAO_G = 500;
  let total = 0;
  for (const item of items) {
    const bruto = String(found.get(item.productId)?.weight ?? '').trim().toLowerCase();
    total += pesoEmGramas(bruto, PADRAO_G) * item.quantity;
  }
  return Math.max(300, Math.round(total));
}

/**
 * Preço dos Correios para este carrinho, ou `null` para manter o das regras.
 *
 * Devolve `null` — em vez de lançar — em todo caminho que não produz preço
 * confiável: integração desligada, frete já gratuito, credencial incompleta,
 * API fora do ar. Frete é caminho de venda: na dúvida, o valor configurado no
 * painel prevalece e a loja continua vendendo.
 */
async function cotarNosCorreios(
  ship: ShippingResult,
  cep: string,
  pesoGramas: number,
  exec: Q,
): Promise<{ cost: number; label: string } | null> {
  /*
   * Cada saída registra o motivo no log.
   *
   * São cinco caminhos que devolvem null, e do lado de fora todos parecem
   * iguais: o frete sai pelo valor fixo, sem pista nenhuma. Ficar em silêncio
   * aqui transforma "por que Acre e Bahia custam o mesmo?" numa investigação.
   */
  const pulou = (motivo: string): null => {
    console.warn(`[queops] frete: Correios não consultados — ${motivo}`);
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
    const melhor = cotacoes.find((c) => c.erro === '' && c.preco > 0);
    if (!melhor) {
      const erros = cotacoes.map((c) => `${c.nome}: ${c.erro || 'sem preço'}`).join(' · ');
      return pulou(`nenhum serviço cotou (${erros})`);
    }

    const prazo = melhor.prazoDias > 0 ? ` — até ${melhor.prazoDias} dias úteis` : '';
    return { cost: round2(melhor.preco), label: `${melhor.nome}${prazo}` };
  } catch (e) {
    // Correios instáveis não podem derrubar o checkout.
    return pulou(e instanceof Error ? e.message : String(e));
  }
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
export async function quoteCart(
  rawItems: unknown,
  ufIn: string,
  cep: string,
  couponCode: string,
  payment: string,
  exec: Q = q,
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
   * Cotação nos Correios, quando a integração está ligada.
   *
   * As regras do painel têm precedência: se alguma delas deu frete grátis
   * (`free_*`), o grátis vale e nem consultamos a API — cotar aqui só
   * substituiria uma promoção configurada por um preço cheio.
   *
   * Nos demais casos o preço da API entra no lugar do valor fixo. Se a
   * cotação falhar (API fora do ar, CEP fora de área, credencial vencida), o
   * valor calculado pelas regras permanece: a loja continua vendendo.
   */
  const pesoTotal = pesoDoCarrinho(items, found);
  const cotado = await cotarNosCorreios(ship, cep, pesoTotal, exec);
  if (cotado !== null) {
    ship.cost = cotado.cost;
    ship.label = cotado.label;
    ship.reason = 'correios';
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
