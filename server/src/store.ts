/**
 * Configurações da loja e conversão entre linhas do banco e o formato que o
 * front-end consome (mesmos nomes de campo dos tipos TypeScript da vitrine).
 */

import { decryptPayload } from './crypto.ts';
import { placeholders, q, type Q, type Row } from './db.ts';
import { iso } from './http.ts';

export interface StoreSettings {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  pixDiscountPct: number;
  payments: { card: boolean; pix: boolean; boleto: boolean };
  [k: string]: unknown;
}

export interface CepRange {
  id?: string;
  from?: string;
  to?: string;
  price?: number;
  free?: boolean;
  label?: string;
}

export interface ShippingConfig {
  defaultPrice: number;
  perState: Record<string, number>;
  cepRanges: CepRange[];
  freeShipping: { enabled?: boolean; minOrder?: number; states?: string[] };
  [k: string]: unknown;
}

export interface RecoveryConfig {
  enabled: boolean;
  delayMinutes: number;
  message: string;
  couponCode: string;
  [k: string]: unknown;
}

export const DEFAULT_SETTINGS: StoreSettings = {
  name: 'Quéops Pirâmides',
  email: 'contato@queopspiramides.com.br',
  phone: '(11) 0000-0000',
  whatsapp: '5511000000000',
  pixDiscountPct: 5.0,
  payments: { card: true, pix: true, boleto: true },
};

export const DEFAULT_SHIPPING: ShippingConfig = {
  defaultPrice: 24.9,
  perState: {
    SP: 14.9, RJ: 19.9, MG: 19.9, ES: 22.9,
    PR: 24.9, SC: 24.9, RS: 27.9, DF: 22.9,
  },
  cepRanges: [
    { id: 'cr1', from: '01000000', to: '05999999', price: 9.9, label: 'Capital SP' },
  ],
  // `states` lista UFs com frete grátis INCONDICIONAL (qualquer valor). Fica
  // vazio por padrão: com 'SP' aqui, o mínimo de R$ 199 e a faixa de CEP da
  // capital nunca seriam aplicados — todo pedido paulista sairia com frete 0.
  freeShipping: { enabled: true, minOrder: 199.0, states: [] },
};

export const DEFAULT_RECOVERY: RecoveryConfig = {
  enabled: true,
  delayMinutes: 60,
  message:
    'Olá {nome}! 👋 Você esqueceu alguns itens na sua sacola da Quéops Pirâmides '
    + '(total {valor}). Use o cupom {cupom} e finalize com desconto: ',
  couponCode: 'VOLTA10',
};

export const INTEGRATION_IDS = [
  'uno', 'erp', 'zapi', 'evolution', 'chatwoot', 'chatvolt',
  'mercadopago', 'pagseguro', 'stripe', 'pagarme',
  'correios', 'melhorenvio', 'frenet',
] as const;

/** Quais campos de cada integração são segredo e nunca voltam para o navegador. */
/*
 * Campos tratados como segredo: nunca voltam ao navegador, e um valor vazio
 * vindo do painel significa "não mexi neste campo" em vez de "apague".
 *
 * Esquecer de listar um campo novo aqui tem dois efeitos, os dois ruins: o
 * segredo trafega em claro para o navegador, e o próximo save o apaga — porque
 * o input de senha manda '' e nada preserva o valor anterior.
 */
export const INTEGRATION_SECRET_FIELDS = [
  'accessToken', 'secretKey', 'apiKey', 'apiToken', 'token', 'clientToken',
  'password', 'encryptionKey', 'webhookSecret', 'accessCode',
];

// ------------------------------------------------------------- merge ----

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

/**
 * Mescla configuração salva sobre o default.
 *
 * NÃO é um merge recursivo cego: aquele nunca remove chaves nem encurta listas.
 * Na prática, apagar uma faixa de CEP ou um preço por UF no painel não tinha
 * efeito — a regra excluída voltava do default e continuava sendo cobrada.
 * Aqui, listas (cepRanges) e mapas gerenciados pelo painel (perState) são
 * substituídos por inteiro; só objetos de configuração recebem merge por
 * chave, para que campos novos de um deploy futuro apareçam com o padrão.
 */
export function configMerge<T extends Record<string, any>>(def: T, saved: Record<string, unknown>): T {
  const out: Record<string, unknown> = { ...def };
  for (const [key, value] of Object.entries(saved ?? {})) {
    if (isPlainObject(value) && isPlainObject(def[key])) {
      // Mapas livres (UF => preço) são substituídos; objetos fixos, mesclados.
      out[key] = key === 'perState' ? value : configMerge(def[key], value);
      continue;
    }
    out[key] = value;
  }
  return out as T;
}

export async function configGet<T extends Record<string, any>>(
  key: string,
  def: T,
  exec: Q = q,
): Promise<T> {
  const row = await exec.one('SELECT config_val FROM store_config WHERE config_key = ?', [key]);
  if (row === null) return def;
  try {
    const decoded = JSON.parse(String(row.config_val));
    if (!isPlainObject(decoded)) return def;
    return configMerge(def, decoded);
  } catch {
    return def;
  }
}

export async function configSet(key: string, value: unknown, exec: Q = q): Promise<void> {
  await exec.run(
    `INSERT INTO store_config (config_key, config_val) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE config_val = VALUES(config_val)`,
    [key, JSON.stringify(value)],
  );
}

export const getSettings = (exec: Q = q) => configGet('settings', DEFAULT_SETTINGS, exec);
export const getShipping = (exec: Q = q) => configGet('shipping', DEFAULT_SHIPPING, exec);
export const getRecovery = (exec: Q = q) => configGet('recovery', DEFAULT_RECOVERY, exec);

/**
 * Subconjunto das configurações exposto publicamente na loja.
 *
 * Os dois campos de frete são DERIVADOS da configuração de frete, não de
 * valores próprios: antes existiam "frete grátis acima de" e "frete padrão"
 * também em Configurações, ignorados pelo motor de preços — a gaveta do
 * carrinho anunciava um valor e o checkout cobrava outro.
 */
export async function publicSettings(exec: Q = q): Promise<Record<string, unknown>> {
  const s = await getSettings(exec);
  const sh = await getShipping(exec);
  const free = sh.freeShipping ?? {};

  return {
    name: s.name,
    email: s.email,
    phone: s.phone,
    whatsapp: s.whatsapp,
    pixDiscountPct: Number(s.pixDiscountPct) || 0,
    payments: s.payments,
    // 0 = não há frete grátis por valor.
    freeShippingFrom: free.enabled ? Number(free.minOrder ?? 0) || 0 : 0,
    // Estimativa exibida antes de o cliente informar o CEP.
    shippingFrom: Number(sh.defaultPrice ?? 0) || 0,
  };
}

// ------------------------------------------------------------ Produtos ----

/** Converte uma linha de `products` no objeto Product do front-end. */
export function productRowToApi(r: Row): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id: r.id,
    sku: r.sku,
    name: r.name,
    category: r.category,
    categoryLabel: r.category_label,
    description: String(r.description ?? ''),
    price: Number(r.price) || 0,
    /*
     * Estoque é número, e pode ter fração.
     *
     * JSON não distingue inteiro de decimal — `7` e `7.0` são o mesmo número
     * para qualquer parser. O que muda é o que a loja aceita GUARDAR: até aqui
     * ela recusava fração, e o saldo 7,5 do ERP virava 7 ou virava erro. Agora
     * o valor atravessa inteiro nos dois sentidos.
     */
    stock: Number(r.stock) || 0,
    image: r.image,
    /*
     * `weight` é o peso em QUILOS, como número.
     *
     * Era texto livre ("0,2kg", "Base 15cm · cobre"), servindo ao mesmo tempo
     * de rótulo na vitrine e de peso para o frete — dois trabalhos
     * incompatíveis no mesmo campo. Ninguém consegue ler "0,2kg" como número, e
     * o frete tinha que adivinhar o valor no meio da frase.
     *
     * A unidade é quilo porque é a unidade dos Correios, do Melhor Envio e do
     * ERP. O rótulo continua existindo, com nome próprio: `weightLabel`.
     */
    weight: Number(r.weight_kg) || 0,
    weightLabel: String(r.weight ?? ''),
    active: Boolean(r.active),
  };
  if (r.subcategory) out.subcategory = r.subcategory;
  if (r.long_description) out.longDescription = r.long_description;
  if (r.old_price !== null && r.old_price !== undefined) out.oldPrice = Number(r.old_price);
  if (r.tag) out.tag = r.tag;
  if (r.ingredients) out.ingredients = r.ingredients;
  if (r.highlight) out.highlight = true;
  /*
   * Campos travados contra o ERP (ver erp-produtos.ts). Só aparece quando há
   * algum: um array vazio em cada um dos 1.400 produtos seria ruído em toda
   * resposta da vitrine.
   *
   * Serve ao ERP também — ele consulta antes de enviar e descobre, sem
   * tentativa e erro, que aquele preço não vai ser aceito.
   */
  const travados = String(r.locked_fields ?? '').split(',').filter((x) => x !== '');
  if (travados.length > 0) out.lockedFields = travados;
  return out;
}

export async function fetchProducts(onlyActive = true, exec: Q = q): Promise<Record<string, unknown>[]> {
  const sql = `SELECT * FROM products${onlyActive ? ' WHERE active = 1' : ''} ORDER BY position ASC, name ASC`;
  return (await exec.all(sql)).map(productRowToApi);
}

// ------------------------------------------------------------- Pedidos ----

export function orderRowToApi(r: Row, items: Row[]): Record<string, unknown> {
  return {
    id: r.id,
    createdAt: iso(r.created_at),
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone,
    /*
     * CPF do comprador — liberado a pedido do dono da loja, para o ERP emitir
     * NF-e ao consumidor.
     *
     * É dado pessoal, e isso tem consequência prática: a chave da API v1 passa a
     * dar acesso a CPF de cliente. Quem tiver a chave tem os CPFs. Portanto ela
     * pertence ao cofre do ERP, não a um arquivo de configuração compartilhado,
     * e o corpo destas respostas não deve ir para log.
     */
    customerCpf: String(r.customer_cpf ?? ''),
    items: items.map((i) => ({
      productId: i.product_id,
      name: i.name,
      quantity: Number(i.quantity) || 0,
      unitPrice: Number(i.unit_price) || 0,
    })),
    subtotal: Number(r.subtotal) || 0,
    shipping: Number(r.shipping_cost) || 0,
    discount: Number(r.discount) || 0,
    total: Number(r.total) || 0,
    couponCode: r.coupon_code,
    status: r.status,
    payment: r.payment,
    channel: r.channel,
    /*
     * ENDEREÇO E TRANSPORTADORA — sem estes campos o ERP não emite nota nem
     * etiqueta, e a integração para no primeiro pedido.
     *
     * O nome é `shippingAddress`, e não `shipping`: `shipping` já existe nesta
     * resposta como o VALOR do frete, e trocar o tipo de um campo publicado
     * quebraria quem já consome a API. Campo novo custa uma linha na
     * documentação; campo que muda de número para objeto custa uma integração
     * parada.
     */
    shippingAddress: {
      cep: String(r.ship_cep ?? ''),
      street: String(r.ship_street ?? ''),
      number: String(r.ship_number ?? ''),
      complement: String(r.ship_complement ?? ''),
      neighborhood: String(r.ship_neighborhood ?? ''),
      city: String(r.ship_city ?? ''),
      state: String(r.ship_state ?? ''),
    },
    /** "Jadlog · .Package — até 5 dias úteis": o que o cliente escolheu pagar. */
    shippingService: String(r.shipping_service ?? ''),
    /** Previsão de entrega calculada na compra (AAAA-MM-DD), ou null. */
    deliveryEta: r.delivery_eta ? String(r.delivery_eta).slice(0, 10) : null,
    trackingCode: String(r.tracking_code ?? ''),
    trackingStatus: String(r.tracking_status ?? ''),
  };
}

/** Carrega pedidos com seus itens em duas consultas (evita N+1). */
export async function fetchOrders(limit = 500, exec: Q = q): Promise<Record<string, unknown>[]> {
  const cap = Math.max(1, Math.min(Math.trunc(limit) || 500, 2000));
  const orders = await exec.all(`SELECT * FROM orders ORDER BY created_at DESC LIMIT ${cap}`);
  if (orders.length === 0) return [];

  const ids = orders.map((o) => o.id);
  const rows = await exec.all(
    `SELECT * FROM order_items WHERE order_id IN (${placeholders(ids.length)}) ORDER BY id ASC`,
    ids,
  );
  const byOrder = new Map<string, Row[]>();
  for (const row of rows) {
    const key = String(row.order_id);
    const list = byOrder.get(key);
    if (list) list.push(row);
    else byOrder.set(key, [row]);
  }
  return orders.map((o) => orderRowToApi(o, byOrder.get(String(o.id)) ?? []));
}

// -------------------------------------------------------- Integrações ----

/**
 * Devolve a integração para o painel COM os segredos removidos.
 * O admin vê quais campos já estão preenchidos, mas nunca recebe o valor.
 */
export function integrationToApi(row: Row): Record<string, unknown> {
  const fields = decryptPayload(row.fields_enc);
  const safe: Record<string, string> = {};
  const configured: string[] = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === '' || v === null || v === undefined) continue;
    configured.push(k);
    safe[k] = INTEGRATION_SECRET_FIELDS.includes(k) ? '' : String(v);
  }
  return {
    id: row.id,
    enabled: Boolean(row.enabled),
    fields: safe,
    configured,
    lastStatus: row.last_status || 'unknown',
    lastCheckedAt: iso(row.last_checked_at),
  };
}

export async function fetchIntegrations(exec: Q = q): Promise<Record<string, unknown>> {
  const rows = await exec.all('SELECT * FROM integrations');
  const byId: Record<string, unknown> = {};
  for (const r of rows) byId[String(r.id)] = integrationToApi(r);
  for (const id of INTEGRATION_IDS) {
    byId[id] ??= {
      id, enabled: false, fields: {}, configured: [],
      lastStatus: 'unknown', lastCheckedAt: null,
    };
  }
  return byId;
}

/** Credenciais em claro — uso exclusivo do servidor. */
export async function integrationSecrets(id: string, exec: Q = q): Promise<Record<string, unknown>> {
  const row = await exec.one('SELECT fields_enc FROM integrations WHERE id = ?', [id]);
  return row ? decryptPayload(row.fields_enc) : {};
}
