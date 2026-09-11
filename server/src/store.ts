/**
 * Configurações da loja e conversão entre linhas do banco e o formato que o
 * front-end consome (mesmos nomes de campo dos tipos TypeScript da vitrine).
 */

import { decryptPayload } from './crypto.ts';
import { placeholders, q, type Q, type Row } from './db.ts';
import { codigoNoMapa, mapaDeCodigos } from './erp-categorias.ts';
import { iso, round2 } from './http.ts';

export interface StoreSettings {
  name: string;
  email: string;
  phone: string;
  whatsapp: string;
  pixDiscountPct: number;
  /**
   * Valor mínimo em PRODUTOS para o desconto do Pix valer. 0 = sempre vale.
   *
   * "Em produtos" é a definição inteira: não entram frete nem cupom. É a
   * mesma base do frete grátis, e é a única que não muda debaixo do cliente —
   * se o mínimo olhasse o valor já com cupom, aplicar um cupom faria o
   * desconto do Pix desaparecer, e ninguém liga uma coisa à outra. A tela
   * precisa dizer isso com todas as letras, senão o cliente soma o frete e
   * acha que já atingiu.
   */
  pixMinOrder: number;
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
  // 0 mantém o comportamento de antes: desconto em qualquer valor.
  pixMinOrder: 0,
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
    // 0 = o desconto do Pix vale em qualquer valor.
    pixMinOrder: Number(s.pixMinOrder ?? 0) || 0,
    payments: s.payments,
    // 0 = não há frete grátis por valor.
    freeShippingFrom: free.enabled ? Number(free.minOrder ?? 0) || 0 : 0,
    // Estimativa exibida antes de o cliente informar o CEP.
    shippingFrom: Number(sh.defaultPrice ?? 0) || 0,
  };
}

// ------------------------------------------------------------ Produtos ----

/**
 * Converte uma linha de `products` no objeto Product do front-end.
 *
 * `codigos` é o mapa destino-da-loja → código do ERP (ver erp-categorias.ts).
 * Vem de fora porque a conversão é síncrona e roda por produto: buscar o
 * código de cada um daria uma consulta por item numa listagem de 1.400.
 * Ausente, a resposta simplesmente não traz `categoryCode` — é o caso da
 * vitrine, que não tem o que fazer com ele.
 *
 * `galeria` chega pelo mesmo motivo: as fotos extras moram em outra tabela, e
 * buscá-las produto a produto daria uma consulta por item.
 */
export function productRowToApi(
  r: Row,
  codigos?: Map<string, string>,
  galeria?: string[],
): Record<string, unknown> {
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

  /*
   * Código da categoria no ERP, quando a amarração existe.
   *
   * `null` explícito, e não campo ausente, quando a categoria do produto não
   * está amarrada a nenhum código: para o ERP, "não sei traduzir" e "esqueci de
   * mandar o campo" precisam ser distinguíveis.
   */
  if (codigos !== undefined) {
    out.categoryCode = codigoNoMapa(codigos, r.category, r.subcategory);
  }

  /*
   * Fotos extras, sem a capa.
   *
   * A capa continua em `image`, sozinha, porque é o que a vitrine, o carrinho
   * e o e-mail de pedido usam. Repeti-la aqui obrigaria cada um desses lugares
   * a saber que o primeiro item da lista é especial — e alguém acabaria
   * mostrando a mesma foto duas vezes.
   *
   * Só aparece quando existe: array vazio em cada um dos 1.400 produtos é
   * ruído em toda resposta da loja.
   */
  if (galeria !== undefined && galeria.length > 0) out.images = galeria;
  return out;
}

/**
 * Fotos extras de vários produtos de uma vez.
 *
 * Uma consulta para o catálogo inteiro, não uma por produto: a listagem tem
 * centenas de itens, e uma consulta por item transformaria a abertura da
 * vitrine em centenas de idas ao banco.
 */
export async function galeriasDe(
  ids: string[],
  exec: Q = q,
): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>();
  if (ids.length === 0) return mapa;

  const linhas = await exec.all(
    `SELECT product_id, url FROM product_images
      WHERE product_id IN (${placeholders(ids.length)})
      ORDER BY position ASC, id ASC`,
    ids,
  );
  for (const l of linhas) {
    const chave = String(l.product_id);
    const lista = mapa.get(chave);
    if (lista) lista.push(String(l.url));
    else mapa.set(chave, [String(l.url)]);
  }
  return mapa;
}

export interface OpcoesDeCatalogo {
  /** Só os ativos. A vitrine e o ERP querem; o painel, não. */
  onlyActive?: boolean;
  /**
   * Esconder produto sem categoria.
   *
   * Vale só para a VITRINE, e é o que torna verdadeira a promessa feita ao ERP:
   * produto que chega com um código de categoria ainda não amarrado "fica fora
   * da vitrine até alguém amarrar". Sem este filtro ele sumia dos menus (não
   * pertence a seção nenhuma) mas continuava listado e comprável na home — o
   * pior dos dois mundos, porque some para quem procura e aparece para quem
   * não deveria.
   *
   * O painel e a API do ERP continuam vendo esses produtos: quem precisa
   * resolver a pendência precisa enxergá-la.
   */
  exigirCategoria?: boolean;
  /** Anexar `categoryCode` a cada produto. Só a API do ERP usa. */
  comCodigos?: boolean;
  exec?: Q;
}

export async function fetchProducts(
  opcoes: OpcoesDeCatalogo = {},
): Promise<Record<string, unknown>[]> {
  const { onlyActive = true, exigirCategoria = false, comCodigos = false, exec = q } = opcoes;

  const filtros: string[] = [];
  if (onlyActive) filtros.push('active = 1');
  if (exigirCategoria) filtros.push("category <> ''");
  const where = filtros.length > 0 ? ` WHERE ${filtros.join(' AND ')}` : '';

  // Uma consulta para o catálogo inteiro, não uma por produto.
  const codigos = comCodigos ? await mapaDeCodigos(exec) : undefined;
  const linhas = await exec.all(`SELECT * FROM products${where} ORDER BY position ASC, name ASC`);
  const galerias = await galeriasDe(linhas.map((r) => String(r.id)), exec);
  return linhas.map((r) => productRowToApi(r, codigos, galerias.get(String(r.id))));
}

// ------------------------------------------------------------- Pedidos ----

/**
 * Campo de texto: o conteúdo, ou `null` quando não há nada.
 *
 * A API devolvia `""` para documento, rastreio e afins. Isso obriga quem
 * consome a testar string vazia em todo ponto de leitura, quando a pergunta
 * real é "existe?". `null` responde essa pergunta uma vez só.
 */
const vazioOuNulo = (v: unknown): string | null => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s;
};

/**
 * Página de rastreio dos Correios para um código, ou null.
 *
 * Montada aqui porque o pedido guarda só o código, e quem recebe o pedido —
 * o ERP, e a lojista pela conta do cliente — precisa do endereço para abrir.
 * Só para o padrão dos Correios (AA123456789BR): inventar a URL de outra
 * transportadora a partir de um código que não é dela mandaria a pessoa para
 * uma página de erro.
 */
const urlDeRastreio = (codigo: unknown): string | null => {
  const c = String(codigo ?? '').trim().toUpperCase();
  return /^[A-Z]{2}\d{9}[A-Z]{2}$/.test(c)
    ? `https://rastreamento.correios.com.br/app/index.php?objetos=${c}`
    : null;
};

/**
 * Documento do comprador em dígitos, com o tipo.
 *
 * 11 dígitos é CPF, 14 é CNPJ. Qualquer outra coisa — inclusive o campo em
 * branco — sai como null nos dois campos: um documento com contagem errada de
 * dígitos não é um documento, e mandá-lo assim faria a NF-e ser rejeitada mais
 * adiante, longe de onde o erro nasceu.
 */
export function documentoDoCliente(bruto: unknown): {
  customerDocument: string | null;
  customerDocumentType: string | null;
} {
  const digitos = String(bruto ?? '').replace(/\D/g, '');
  if (digitos.length === 11) return { customerDocument: digitos, customerDocumentType: 'cpf' };
  if (digitos.length === 14) return { customerDocument: digitos, customerDocumentType: 'cnpj' };
  return { customerDocument: null, customerDocumentType: null };
}

/**
 * Os dois eixos que o `status` sozinho não consegue carregar.
 *
 * `status` é uma esteira linear: pending → paid → shipped → delivered. Quando
 * o pedido avança para "shipped", a informação "foi pago" DESAPARECE do campo,
 * e não há como reconstruí-la — o ERP precisa checar o pagamento antes de
 * qualquer coisa. Os eixos são gravados em colunas próprias, mas quando elas
 * ainda não foram preenchidas (pedido anterior a esta mudança) são deduzidos
 * do que existe, para nenhum pedido antigo sair sem os campos novos.
 */
export function eixosDoPedido(r: Row): { paymentStatus: string; fulfillmentStatus: string } {
  const status = String(r.status ?? 'pending');
  const pago = r.paid_at !== null && r.paid_at !== undefined;

  const gravadoPagamento = String(r.payment_status ?? '');
  const paymentStatus = gravadoPagamento !== '' && gravadoPagamento !== 'pending'
    ? gravadoPagamento
    : pago || ['paid', 'shipped', 'delivered'].includes(status)
      ? 'paid'
      : 'pending';

  const gravadoEntrega = String(r.fulfillment_status ?? '');
  const fulfillmentStatus = gravadoEntrega !== '' && gravadoEntrega !== 'unpacked'
    ? gravadoEntrega
    : status === 'delivered'
      ? 'delivered'
      : status === 'shipped'
        ? 'shipped'
        : 'unpacked';

  return { paymentStatus, fulfillmentStatus };
}

/**
 * O UPDATE que muda o status de um pedido, com os efeitos colaterais certos.
 *
 * Mudar `status` sozinho perde informação. Cada passagem tem uma data que só
 * pode ser gravada quando ela acontece — depois não há como reconstruí-la —, e
 * os dois eixos (pagamento e entrega) precisam acompanhar, senão um pedido
 * "shipped" deixa de dizer que foi pago.
 *
 * `COALESCE` em todas as datas: marcar "enviado" duas vezes não pode reescrever
 * a data do primeiro envio. E `updated_at` é tocado sempre, porque é por ele
 * que a varredura do ERP encontra o pedido que mudou.
 *
 * Existe aqui, e não dentro de cada rota, porque são TRÊS lugares que mudam
 * status — painel, ERP pela API v1 e o retorno do gateway — e um deles
 * esquecer de gravar a data é um pedido que o ERP nunca mais vê.
 */
export function transicaoDeStatus(
  status: string,
  motivo: string,
  quem: 'customer' | 'store' | 'gateway' | 'erp',
): { sql: string; params: unknown[] } {
  const campos = ['status = ?', 'updated_at = NOW()'];
  const params: unknown[] = [status];

  if (status === 'paid') {
    campos.push("payment_status = 'paid'", 'paid_at = COALESCE(paid_at, NOW())');
  }
  if (status === 'shipped') {
    campos.push("fulfillment_status = 'shipped'", 'shipped_at = COALESCE(shipped_at, NOW())');
  }
  if (status === 'delivered') {
    campos.push(
      "fulfillment_status = 'delivered'",
      'delivered_at = COALESCE(delivered_at, NOW())',
    );
  }
  if (status === 'canceled') {
    campos.push('canceled_at = COALESCE(canceled_at, NOW())');
    /*
     * O motivo só é gravado se vier preenchido, e não sobrescreve um que já
     * exista: um cancelamento por recusa do gateway já escreveu a causa real,
     * e alguém confirmando o cancelamento no painel depois não deve apagá-la.
     */
    if (motivo.trim() !== '') {
      campos.push('cancel_reason = ?', 'canceled_by = ?');
      params.push(motivo.trim().slice(0, 200), quem);
    } else {
      campos.push("canceled_by = CASE WHEN canceled_by = '' THEN ? ELSE canceled_by END");
      params.push(quem);
    }
  }

  return { sql: campos.join(', '), params };
}

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
    /*
     * O documento sem máscara, e o tipo dele.
     *
     * `customerCpf` sai como o comprador digitou — com pontos e traço — e
     * continua existindo porque já é consumido. Mas número formatado não é
     * número: o ERP precisava limpar a string antes de faturar, e uma máscara
     * diferente (ou nenhuma) quebrava a limpeza. `customerDocument` é só
     * dígito, e `customerDocumentType` diz o que aqueles dígitos são — 11 e
     * 14 dígitos vão para lugares diferentes na NF-e.
     */
    ...documentoDoCliente(r.customer_cpf),
    /** Id do cliente na loja — a amarração pedido → cliente. Null se convidado. */
    customerId: r.customer_id === null || r.customer_id === undefined
      ? null
      : String(r.customer_id),
    /** Observação escrita pelo comprador ("entregar após as 18h"). */
    customerNote: vazioOuNulo(r.customer_note),
    items: items.map((i) => {
      const quantidade = Number(i.quantity) || 0;
      const unitario = Number(i.unit_price) || 0;
      const descontoItem = Number(i.discount) || 0;
      return {
        productId: i.product_id,
        /*
         * SKU explícito. Hoje é igual ao productId porque todo produto nasce
         * no ERP, mas isso é convenção e não contrato: o ERP casa produto por
         * SKU, e no dia em que um produto nascer no painel da loja o id deixa
         * de ser um código de produto.
         */
        sku: String(i.sku ?? '') || String(i.product_id ?? ''),
        name: i.name,
        quantity: quantidade,
        unitPrice: unitario,
        discount: descontoItem,
        /*
         * Total da linha já gravado.
         *
         * Serve para o ERP conferir o arredondamento contra o subtotal. Os
         * pedidos antigos não têm a coluna preenchida; nesses, recalcula, que
         * é o mesmo número — o valor gravado só passa a divergir se algum dia
         * existir desconto por item, e é justamente aí que ele importa.
         */
        totalPrice: Number(i.total_price) > 0
          ? Number(i.total_price)
          : round2(quantidade * unitario - descontoItem),
      };
    }),
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
      /*
       * Quem recebe, e em que telefone. Vazio cai para o comprador: é o caso
       * normal, e repetir o dado é melhor do que o ERP ter de adivinhar de
       * onde tirar o destinatário numa entrega para terceiro.
       */
      recipientName: vazioOuNulo(r.ship_recipient) ?? String(r.customer_name ?? ''),
      phone: vazioOuNulo(r.ship_phone) ?? vazioOuNulo(r.customer_phone),
      /** O país que o ERP hoje precisa chutar como "BRASIL". */
      country: String(r.ship_country ?? 'BR') || 'BR',
      /*
       * Código IBGE do município: null porque a loja NÃO o coleta.
       *
       * O campo existe no contrato para o ERP não precisar mudar quando ele
       * passar a vir. Mandar um código deduzido por nome + UF seria pior do
       * que não mandar: o ERP já resolve o município assim, e um palpite
       * nosso apenas moveria o erro de homônimo para dentro da NF-e.
       */
      cityIbgeCode: null,
    },
    /*
     * Endereço de cobrança: null quando é o mesmo da entrega.
     *
     * A loja é B2C e não coleta endereço de cobrança separado — o cartão é
     * processado pelo Mercado Pago, que guarda o dele. Null diz exatamente
     * isso, e o ERP pode clonar o de entrega com segurança; um objeto
     * repetido faria o ERP marcar indEnderecoUnico = "0" e montar três
     * endereços iguais para um pedido que tem um só.
     */
    billingAddress: null,
    /**
     * "Jadlog · .Package — até 5 dias úteis": o que o cliente escolheu pagar.
     *
     * Mantido porque é o texto que a lojista lê. Para o ERP, use os campos
     * separados abaixo: casar transportadora por esta string nunca funciona,
     * e o pedido acaba sempre na transportadora padrão do sistema.
     */
    shippingService: String(r.shipping_service ?? ''),
    /** Transportadora, limpa: "Correios", "Jadlog". É por aqui que o ERP casa. */
    shippingCarrier: vazioOuNulo(r.shipping_carrier),
    /** Código do serviço: "PAC", "SEDEX", ".Package". */
    shippingServiceCode: vazioOuNulo(r.shipping_service_code),
    shippingServiceName: vazioOuNulo(r.shipping_service_name),
    shippingMinDays: Number(r.shipping_min_days) || 0,
    shippingMaxDays: Number(r.shipping_max_days) || 0,
    /*
     * Custo do frete PARA A LOJA, separado do que foi cobrado do cliente.
     *
     * Hoje os dois são iguais e é isso que sai. Null significa "a loja não
     * apurou", e não "zero": se algum dia a loja subsidiar frete — frete
     * grátis acima de um valor já é um subsídio —, a margem do pedido no ERP
     * sairia errada sem este campo.
     */
    shippingCostOwner: r.shipping_cost_owner === null || r.shipping_cost_owner === undefined
      ? Number(r.shipping_cost) || 0
      : Number(r.shipping_cost_owner),
    /** Previsão de entrega calculada na compra (AAAA-MM-DD), ou null. */
    deliveryEta: r.delivery_eta ? String(r.delivery_eta).slice(0, 10) : null,
    /*
     * Rastreio: `null` quando não existe, e não `""`.
     *
     * Mudança de contrato anunciada ao integrador: antes vinha string vazia, o
     * que obriga quem lê a testar "está em branco?" em vez de "existe?".
     */
    trackingCode: vazioOuNulo(r.tracking_code),
    trackingStatus: vazioOuNulo(r.tracking_status),
    trackingUrl: vazioOuNulo(r.tracking_url) ?? urlDeRastreio(r.tracking_code),
    /*
     * Quando o dinheiro entrou, ou null.
     *
     * É o fato que separa "pedido que pode sumir" de "registro de pagamento".
     * `status` não serve para isso: é editável na tela, então um pedido pago
     * marcado como cancelado continuaria parecendo descartável. Vai também na
     * API v1 — o ERP precisa da data do pagamento para a nota.
     */
    paidAt: r.paid_at ? iso(r.paid_at) : null,
    /*
     * As demais datas de transição, e a de atualização.
     *
     * Sem `updatedAt`, a varredura periódica do ERP — que o manual descreve
     * como o recurso obrigatório para quando o webhook falha — só enxergava
     * pedido NOVO, porque o filtro comparava com a data de CRIAÇÃO. Um pedido
     * feito ontem e pago hoje, cujo aviso se perdeu, ficava parado sem ninguém
     * notar. É o pior defeito possível numa integração de pedido, e ele estava
     * lá.
     */
    updatedAt: iso(r.updated_at ?? r.created_at),
    shippedAt: r.shipped_at ? iso(r.shipped_at) : null,
    deliveredAt: r.delivered_at ? iso(r.delivered_at) : null,
    canceledAt: r.canceled_at ? iso(r.canceled_at) : null,
    /*
     * Os dois eixos, ao lado do `status` de sempre.
     *
     * `status` continua sendo a esteira que a lojista vê e edita. Estes dizem
     * o que ela não consegue dizer: um pedido "shipped" não informa mais se
     * foi pago, e "canceled" não distingue pagamento recusado de desistência
     * — coisas que geram lançamentos diferentes no ERP.
     */
    ...eixosDoPedido(r),
    cancelReason: vazioOuNulo(r.cancel_reason),
    canceledBy: vazioOuNulo(r.canceled_by),
    /*
     * Detalhe do pagamento.
     *
     * Antes saía só `payment: "pix"`. Faltava tudo o que a conciliação
     * financeira precisa: quanto entrou de fato, em quantas parcelas, por
     * qual adquirente e com que id — sem o id não há como cruzar o pedido com
     * o extrato do gateway.
     */
    paymentDetails: {
      method: String(r.payment ?? ''),
      brand: vazioOuNulo(r.payment_brand),
      installments: Number(r.payment_installments) || (String(r.payment) === 'pix' ? 1 : 0),
      /*
       * Quanto o gateway confirmou. Null enquanto não houve confirmação —
       * "0,00 pago" e "ainda não pagou" são coisas diferentes, e a segunda
       * não pode virar a primeira.
       */
      paidAmount: r.paid_amount === null || r.paid_amount === undefined
        ? (r.paid_at ? Number(r.total) || 0 : null)
        : Number(r.paid_amount),
      gateway: vazioOuNulo(r.payment_provider),
      transactionId: vazioOuNulo(r.payment_ref),
      paidAt: r.paid_at ? iso(r.paid_at) : null,
      /** Motivo da recusa, em português, quando houve. */
      detail: vazioOuNulo(r.payment_detail),
    },
    /*
     * Desconto repartido pela origem.
     *
     * `discount` continua sendo o total. Cupom e desconto de meio de pagamento
     * viram lançamentos diferentes no ERP, e a partir de um número só não há
     * como separá-los.
     */
    discountCoupon: Number(r.discount_coupon) || 0,
    discountPayment: Number(r.discount_payment) || 0,
    /** Moeda do pedido. Fixa hoje; existe para o dia em que não for. */
    currency: String(r.currency ?? 'BRL') || 'BRL',
    /*
     * Existe cobrança gerada que ainda pode ser paga.
     *
     * O painel usa para não oferecer a exclusão de um pedido cujo Pix ainda
     * pode cair: sem o pedido, o webhook chegaria sem saber a que se referir e
     * o dinheiro entraria sem pedido nenhum. Só o booleano sai daqui — a
     * referência da cobrança no provedor não tem por que circular.
     */
    hasOpenCharge: String(r.payment_ref ?? '') !== '' && !r.paid_at,
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
