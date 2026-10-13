/**
 * Variações: o "produto pai" montado no painel.
 *
 * O problema que isto resolve: o produto da loja é plano — um produto, um
 * código, um preço, um estoque. Quem vende com grade acaba com N produtos
 * soltos na vitrine, e o comprador lê "Pirâmide 15cm", "Pirâmide 20cm" e
 * "Pirâmide 25cm" como três coisas diferentes, em três cards.
 *
 * A decisão de desenho, acordada com o time do ERP: o agrupamento NÃO existe
 * do lado de lá e não vai existir. No ERP cada variação já é um produto
 * completo e independente, e é ele que tem saldo, preço, movimentação, item de
 * pedido e item de nota fiscal — isso é estrutural, o faturamento opera sobre
 * esse código. O que falta não é dado de produto: é o vínculo entre eles e a
 * apresentação agrupada. Título de marketing, galeria, slug, ordem dos
 * seletores, rótulo de cada opção — nada disso existe nem deveria existir num
 * cadastro de ERP.
 *
 * Daí a regra que atravessa este arquivo inteiro: **o grupo morre na vitrine**.
 * Ele não é comprável, não tem estoque, não tem preço, não tem SKU, não entra
 * no carrinho e não vira item de pedido. O pedido que sai da loja carrega o
 * código da VARIAÇÃO escolhida e é indistinguível de um pedido de produtos
 * soltos — é isso que mantém estoque, imposto, NF-e e separação funcionando
 * sem uma linha nova do outro lado.
 *
 * O modo de falha que essa regra evita é silencioso e caro: se um item de
 * pedido apontasse para o grupo e o código do grupo por acaso existisse como
 * produto no ERP, o pedido importaria o produto ERRADO, baixaria o estoque
 * errado e emitiria nota fiscal errada, sem alerta nenhum.
 */

import { placeholders, q, transaction, type Q, type Row } from './db.ts';
import { slugificar } from './erp-categorias.ts';

/** Um eixo de variação ("Cor", "Tamanho") com as opções dele, em ordem. */
export interface EixoDoGrupo {
  name: string;
  position: number;
  options: { value: string; position: number }[];
}

/** Uma variação: o produto do catálogo mais o valor de cada eixo. */
export interface VariacaoDoGrupo {
  productId: string;
  position: number;
  /** { "Tamanho": "15cm", "Cor": "Cobre" } */
  values: Record<string, string>;
}

const LIMITE_DE_EIXOS = 4;
const LIMITE_DE_OPCOES = 60;
const LIMITE_DE_VARIACOES = 400;

// ------------------------------------------------------------ leitura ----

/**
 * Carrega os grupos com eixos, opções e variações, em cinco consultas.
 *
 * Cinco, e não uma por grupo: a vitrine chama isto em todo carregamento da
 * home, e uma consulta por grupo transformaria vinte grupos em sessenta idas
 * ao banco. É o mesmo cuidado que `fetchOrders` tem com os itens do pedido.
 */
export async function carregarGrupos(
  opcoes: { apenasAtivos?: boolean; exec?: Q } = {},
): Promise<Record<string, unknown>[]> {
  const { apenasAtivos = false, exec = q } = opcoes;

  const where = apenasAtivos ? ' WHERE active = 1' : '';
  const grupos = await exec.all(
    `SELECT * FROM product_groups${where} ORDER BY position ASC, name ASC`,
  );
  if (grupos.length === 0) return [];

  const ids = grupos.map((g) => String(g.id));
  const eixos = await exec.all(
    `SELECT * FROM product_group_axes WHERE group_id IN (${placeholders(ids.length)})
      ORDER BY position ASC, id ASC`,
    ids,
  );
  const eixoIds = eixos.map((e) => String(e.id));
  const opcoesDeEixo = eixoIds.length === 0 ? [] : await exec.all(
    `SELECT * FROM product_group_options WHERE axis_id IN (${placeholders(eixoIds.length)})
      ORDER BY position ASC, id ASC`,
    eixoIds,
  );
  const produtos = await exec.all(
    `SELECT id, group_id, group_position FROM products
      WHERE group_id IN (${placeholders(ids.length)})
      ORDER BY group_position ASC, id ASC`,
    ids,
  );
  const valores = produtos.length === 0 ? [] : await exec.all(
    `SELECT * FROM product_group_values WHERE product_id IN (${placeholders(produtos.length)})`,
    produtos.map((p) => String(p.id)),
  );

  const nomeDoEixo = new Map(eixos.map((e) => [String(e.id), String(e.name)]));
  const valorDaOpcao = new Map(opcoesDeEixo.map((o) => [String(o.id), String(o.value)]));

  const opcoesPorEixo = new Map<string, { value: string; position: number }[]>();
  for (const o of opcoesDeEixo) {
    const chave = String(o.axis_id);
    const item = { value: String(o.value), position: Number(o.position) || 0 };
    const lista = opcoesPorEixo.get(chave);
    if (lista) lista.push(item);
    else opcoesPorEixo.set(chave, [item]);
  }

  const eixosPorGrupo = new Map<string, EixoDoGrupo[]>();
  for (const e of eixos) {
    const chave = String(e.group_id);
    const item: EixoDoGrupo = {
      name: String(e.name),
      position: Number(e.position) || 0,
      options: opcoesPorEixo.get(String(e.id)) ?? [],
    };
    const lista = eixosPorGrupo.get(chave);
    if (lista) lista.push(item);
    else eixosPorGrupo.set(chave, [item]);
  }

  const valoresPorProduto = new Map<string, Record<string, string>>();
  for (const v of valores) {
    const chave = String(v.product_id);
    const mapa = valoresPorProduto.get(chave) ?? {};
    mapa[nomeDoEixo.get(String(v.axis_id)) ?? ''] = valorDaOpcao.get(String(v.option_id)) ?? '';
    valoresPorProduto.set(chave, mapa);
  }

  const variacoesPorGrupo = new Map<string, VariacaoDoGrupo[]>();
  for (const p of produtos) {
    const chave = String(p.group_id);
    const item: VariacaoDoGrupo = {
      productId: String(p.id),
      position: Number(p.group_position) || 0,
      values: valoresPorProduto.get(String(p.id)) ?? {},
    };
    const lista = variacoesPorGrupo.get(chave);
    if (lista) lista.push(item);
    else variacoesPorGrupo.set(chave, [item]);
  }

  return grupos.map((g) => grupoParaApi(
    g,
    eixosPorGrupo.get(String(g.id)) ?? [],
    variacoesPorGrupo.get(String(g.id)) ?? [],
  ));
}

export function grupoParaApi(
  g: Row,
  axes: EixoDoGrupo[],
  variants: VariacaoDoGrupo[],
): Record<string, unknown> {
  return {
    id: String(g.id),
    /** Código estável para diagnóstico na API do ERP. NÃO é SKU e não compra. */
    code: String(g.code),
    name: String(g.name),
    description: String(g.description ?? ''),
    longDescription: String(g.long_description ?? ''),
    image: String(g.image ?? ''),
    category: String(g.category ?? ''),
    subcategory: g.subcategory === null || g.subcategory === undefined
      ? null
      : String(g.subcategory),
    categoryLabel: String(g.category_label ?? ''),
    tag: g.tag === null || g.tag === undefined ? null : String(g.tag),
    highlight: Boolean(g.highlight),
    active: Boolean(g.active),
    position: Number(g.position) || 0,
    axes,
    /*
     * A variação carrega só o id e os valores dos eixos.
     *
     * Preço, estoque, SKU, peso e foto NÃO entram aqui: eles são do produto, e
     * o produto já vai inteiro no mesmo catálogo. Repetir faria a vitrine ter
     * duas fontes para o mesmo número — e no dia em que uma delas ficasse para
     * trás, o preço do seletor discordaria do preço do carrinho.
     */
    variants,
  };
}

/**
 * Agrupamento de um produto, para a API v1 — somente leitura.
 *
 * O ERP pediu isto para diagnóstico: hoje, se a vitrine está estranha, não há
 * como ver pela API se um produto está agrupado. Escrita continua sendo só
 * pelo painel; se o ERP mandar estes campos, eles são ignorados.
 */
export async function agrupamentoDeProdutos(
  ids: string[],
  exec: Q = q,
): Promise<Map<string, Record<string, unknown>>> {
  const mapa = new Map<string, Record<string, unknown>>();
  if (ids.length === 0) return mapa;

  const linhas = await exec.all(
    `SELECT v.product_id, g.code, g.name AS group_name,
            a.name AS axis_name, a.position AS axis_position, o.value
       FROM product_group_values v
       JOIN product_group_axes a ON a.id = v.axis_id
       JOIN product_group_options o ON o.id = v.option_id
       JOIN products p ON p.id = v.product_id
       JOIN product_groups g ON g.id = p.group_id
      WHERE v.product_id IN (${placeholders(ids.length)})
      ORDER BY a.position ASC, a.id ASC`,
    ids,
  );

  for (const l of linhas) {
    const chave = String(l.product_id);
    const atual = mapa.get(chave) ?? {
      groupCode: String(l.code),
      groupName: String(l.group_name),
      options: [] as Record<string, unknown>[],
    };
    (atual.options as Record<string, unknown>[]).push({
      name: String(l.axis_name),
      value: String(l.value),
      position: Number(l.axis_position) || 0,
    });
    mapa.set(chave, atual);
  }
  return mapa;
}

// --------------------------------------------------------- validação ----

/*
 * O retorno segue o padrão do projeto: `erro` vazio significa que deu certo
 * (como em `lerDataUrl` e `amarrarCategoria`). União discriminada por booleano
 * não serve — o tsconfig da raiz compila sem `strict`, e sem `strictNullChecks`
 * o TypeScript não estreita união por booleano.
 */
export interface ResultadoDoGrupo {
  /** Vazio quando deu certo. */
  erro: string;
  id: string;
}

interface EixoPedido { name: string; options: string[] }
interface VariacaoPedida { productId: string; values: Record<string, string> }

/** Normaliza e confere os eixos pedidos. Devolve o problema, ou vazio. */
function problemaNosEixos(eixos: EixoPedido[]): string {
  if (eixos.length === 0) {
    return 'O grupo precisa de pelo menos um eixo de variação (ex.: "Tamanho").';
  }
  if (eixos.length > LIMITE_DE_EIXOS) {
    return `Máximo de ${LIMITE_DE_EIXOS} eixos por grupo.`;
  }
  const nomes = new Set<string>();
  for (const e of eixos) {
    const nome = String(e.name ?? '').trim();
    if (nome === '') return 'Todo eixo precisa de um nome.';
    if (nomes.has(nome.toLowerCase())) return `O eixo "${nome}" aparece duas vezes.`;
    nomes.add(nome.toLowerCase());

    const opcoes = (e.options ?? []).map((o) => String(o ?? '').trim()).filter((o) => o !== '');
    if (opcoes.length === 0) return `O eixo "${nome}" precisa de pelo menos uma opção.`;
    if (opcoes.length > LIMITE_DE_OPCOES) {
      return `O eixo "${nome}" passou de ${LIMITE_DE_OPCOES} opções.`;
    }
    const vistas = new Set<string>();
    for (const o of opcoes) {
      if (vistas.has(o.toLowerCase())) return `A opção "${o}" aparece duas vezes em "${nome}".`;
      vistas.add(o.toLowerCase());
    }
  }
  return '';
}

/**
 * Confere as variações contra os eixos e contra o catálogo.
 *
 * As três validações que o contrato chama de obrigatórias estão aqui, e cada
 * uma evita um estrago diferente:
 *
 *  - produto em dois grupos → o mesmo SKU apareceria em duas páginas, e
 *    desagrupar de um lado quebraria o outro. (O banco também impede: o
 *    vínculo é uma COLUNA do produto, não uma tabela de ligação.)
 *  - combinação repetida → dois "Tamanho = 15cm" no mesmo seletor, e a vitrine
 *    escolheria um dos dois sem critério nenhum.
 *  - variação sem valor num eixo → o seletor teria uma posição vazia, e a
 *    pré-seleção cairia num produto que o comprador não consegue reproduzir.
 */
async function problemaNasVariacoes(
  grupoId: string,
  eixos: EixoPedido[],
  variacoes: VariacaoPedida[],
  exec: Q,
): Promise<string> {
  if (variacoes.length > LIMITE_DE_VARIACOES) {
    return `Máximo de ${LIMITE_DE_VARIACOES} variações por grupo.`;
  }
  if (variacoes.length === 0) return '';

  const ids = variacoes.map((v) => String(v.productId ?? '').trim());
  if (ids.some((id) => id === '')) return 'Toda variação precisa apontar para um produto.';
  if (new Set(ids).size !== ids.length) {
    return 'O mesmo produto foi adicionado duas vezes ao grupo.';
  }

  const existentes = await exec.all(
    `SELECT id, name, group_id FROM products WHERE id IN (${placeholders(ids.length)})`,
    ids,
  );
  const porId = new Map(existentes.map((p) => [String(p.id), p]));
  for (const id of ids) {
    const p = porId.get(id);
    /*
     * Produto que a loja não tem não entra. É também a resposta para "e se o
     * lojista adicionar um SKU que o ERP nunca enviou": ele não existe no
     * catálogo, então não existe para ser adicionado.
     */
    if (p === undefined) return `O produto "${id}" não existe no catálogo da loja.`;
    const outro = p.group_id === null || p.group_id === undefined ? '' : String(p.group_id);
    if (outro !== '' && outro !== grupoId) {
      return `O produto "${String(p.name)}" já pertence ao grupo "${outro}". `
        + 'Um produto só pode estar em um grupo.';
    }
  }

  const opcoesPorEixo = new Map(
    eixos.map((e) => [
      String(e.name).trim(),
      new Set((e.options ?? []).map((o) => String(o).trim())),
    ]),
  );

  const combinacoes = new Set<string>();
  for (const v of variacoes) {
    const partes: string[] = [];
    for (const e of eixos) {
      const nome = String(e.name).trim();
      const valor = String(v.values?.[nome] ?? '').trim();
      if (valor === '') {
        const p = porId.get(String(v.productId));
        return `"${String(p?.name ?? v.productId)}" está sem valor no eixo "${nome}".`;
      }
      if (!opcoesPorEixo.get(nome)?.has(valor)) {
        return `"${valor}" não é uma opção do eixo "${nome}".`;
      }
      partes.push(`${nome}=${valor}`);
    }
    const combinacao = partes.join('|');
    if (combinacoes.has(combinacao)) {
      return `Duas variações com a mesma combinação (${partes.join(', ')}).`;
    }
    combinacoes.add(combinacao);
  }

  return '';
}

// --------------------------------------------------------- gravação ----

/** Slug livre a partir do nome, sem colidir com produto nem com outro grupo. */
async function slugLivre(nome: string, exceto: string, exec: Q): Promise<string> {
  const base = slugificar(nome).slice(0, 36) || 'grupo';
  for (let i = 0; i < 200; i++) {
    const tentativa = i === 0 ? base : `${base}-${i + 1}`;
    /*
     * Confere contra PRODUTO também, e não só contra grupo.
     *
     * Os dois dividem o mesmo endereço público (/?produto=…): um grupo com o
     * slug de um produto existente sequestraria a página dele, e o defeito
     * apareceria como "o produto sumiu da loja".
     */
    const ocupado = await exec.one(
      `SELECT 1 AS ok FROM product_groups WHERE id = ? AND id <> ?
        UNION SELECT 1 FROM products WHERE id = ? LIMIT 1`,
      [tentativa, exceto, tentativa],
    );
    if (ocupado === null) return tentativa;
  }
  return `${base}-${Date.now()}`;
}

export interface GrupoPedido {
  name: string;
  description: string;
  longDescription: string;
  image: string;
  category: string;
  subcategory: string;
  tag: string;
  highlight: boolean;
  active: boolean;
  axes: EixoPedido[];
  variants: VariacaoPedida[];
}

/**
 * Grava o grupo inteiro de uma vez — conteúdo, eixos, opções e variações.
 *
 * Uma gravação só, e não uma rota por pedacinho. Eixo, opção e variação são
 * interdependentes: uma opção que some precisa levar junto as variações que a
 * usavam, e uma variação só é válida contra os eixos que existem NAQUELE
 * momento. Salvando em pedaços, cada passo intermediário seria um grupo
 * inválido no banco — e bastaria a lojista fechar a aba no meio para a vitrine
 * ficar com um seletor quebrado.
 */
export async function gravarGrupo(
  idPedido: string,
  pedido: GrupoPedido,
): Promise<ResultadoDoGrupo> {
  const nome = String(pedido.name ?? '').trim().slice(0, 255);
  if (nome === '') return { erro: 'O grupo precisa de um nome.', id: '' };

  const eixos = (pedido.axes ?? []).map((e) => ({
    name: String(e.name ?? '').trim().slice(0, 60),
    options: (e.options ?? []).map((o) => String(o ?? '').trim().slice(0, 80)).filter((o) => o !== ''),
  }));
  const problemaEixo = problemaNosEixos(eixos);
  if (problemaEixo !== '') return { erro: problemaEixo, id: '' };

  return await transaction(async (tx) => {
    const atual = idPedido === ''
      ? null
      : await tx.one('SELECT * FROM product_groups WHERE id = ?', [idPedido]);
    if (idPedido !== '' && atual === null) {
      return { erro: 'Grupo não encontrado.', id: '' };
    }

    const categoria = String(pedido.category ?? '').trim().slice(0, 100);
    if (categoria === '') {
      return { erro: 'Escolha a categoria em que o grupo aparece na vitrine.', id: '' };
    }
    const cat = await tx.one('SELECT id, name FROM categories WHERE id = ?', [categoria]);
    if (cat === null) return { erro: `A loja não tem a categoria "${categoria}".`, id: '' };

    const subPedida = String(pedido.subcategory ?? '').trim().slice(0, 100);
    let sub: Row | null = null;
    if (subPedida !== '') {
      sub = await tx.one('SELECT id, name FROM subcategories WHERE parent_id = ? AND id = ?', [
        categoria, subPedida,
      ]);
      if (sub === null) {
        return { erro: `A categoria "${String(cat.name)}" não tem essa subcategoria.`, id: '' };
      }
    }

    const id = atual === null ? await slugLivre(nome, '', tx) : String(atual.id);
    const variacoes = (pedido.variants ?? []).map((v) => ({
      productId: String(v.productId ?? '').trim(),
      values: v.values ?? {},
    }));
    const problemaVariacao = await problemaNasVariacoes(id, eixos, variacoes, tx);
    if (problemaVariacao !== '') return { erro: problemaVariacao, id: '' };

    const campos = [
      nome,
      String(pedido.description ?? '').slice(0, 2000),
      String(pedido.longDescription ?? '').slice(0, 20000),
      String(pedido.image ?? '').slice(0, 500),
      categoria,
      sub === null ? null : String(sub.id),
      String(sub?.name ?? cat.name).slice(0, 120),
      String(pedido.tag ?? '').trim().slice(0, 40) || null,
      pedido.highlight ? 1 : 0,
      pedido.active === false ? 0 : 1,
    ];

    if (atual === null) {
      await tx.run(
        `INSERT INTO product_groups
           (id, code, name, description, long_description, image, category, subcategory,
            category_label, tag, highlight, active)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
        [id, `GRP-${id.toUpperCase().slice(0, 55)}`, ...campos],
      );
    } else {
      await tx.run(
        `UPDATE product_groups
            SET name = ?, description = ?, long_description = ?, image = ?, category = ?,
                subcategory = ?, category_label = ?, tag = ?, highlight = ?, active = ?
          WHERE id = ?`,
        [...campos, id],
      );
    }

    /*
     * Eixos e opções são REFEITOS a cada gravação.
     *
     * Reconciliar item a item (achar o que mudou de nome, o que saiu, o que
     * entrou) daria o mesmo resultado com dez vezes mais código e um punhado de
     * casos de borda. Como as variações são regravadas logo abaixo a partir do
     * que veio no corpo, não há estado para preservar entre os dois — o corpo
     * é a verdade inteira do grupo.
     */
    await tx.run('DELETE FROM product_group_axes WHERE group_id = ?', [id]);

    const idDaOpcao = new Map<string, number>();
    for (const [i, e] of eixos.entries()) {
      await tx.run(
        'INSERT INTO product_group_axes (group_id, name, position) VALUES (?,?,?)',
        [id, e.name, i],
      );
      const axisId = tx.lastId();
      for (const [j, valor] of e.options.entries()) {
        await tx.run(
          'INSERT INTO product_group_options (axis_id, value, position) VALUES (?,?,?)',
          [axisId, valor, j],
        );
        idDaOpcao.set(`${e.name}|${valor}`, tx.lastId());
      }
      idDaOpcao.set(`eixo:${e.name}`, axisId);
    }

    /*
     * Solta quem estava no grupo e não está mais.
     *
     * Produto desagrupado volta a ser card solto na vitrine, com o nome e a
     * descrição que o ERP manda — ou seja, volta a se comportar exatamente
     * como antes de ter sido agrupado. Desagrupar é operação de apresentação:
     * não altera estoque, nem preço, nem pedido já feito.
     */
    await tx.run(
      "UPDATE products SET group_id = NULL, group_position = 0 WHERE group_id = ?",
      [id],
    );

    for (const [i, v] of variacoes.entries()) {
      await tx.run(
        'UPDATE products SET group_id = ?, group_position = ?, pending_group = 0 WHERE id = ?',
        [id, i, v.productId],
      );
      await tx.run('DELETE FROM product_group_values WHERE product_id = ?', [v.productId]);
      for (const e of eixos) {
        await tx.run(
          'INSERT INTO product_group_values (product_id, axis_id, option_id) VALUES (?,?,?)',
          [
            v.productId,
            idDaOpcao.get(`eixo:${e.name}`),
            idDaOpcao.get(`${e.name}|${String(v.values[e.name]).trim()}`),
          ],
        );
      }
    }

    return { erro: '', id };
  });
}

/**
 * Apaga um grupo e devolve os produtos dele à vitrine.
 *
 * Os produtos NÃO são apagados, e nem poderiam ser: eles são do ERP, têm
 * estoque e podem estar em pedidos. O grupo era só a casca.
 */
export async function apagarGrupo(id: string): Promise<number> {
  return await transaction(async (tx) => {
    const soltos = await tx.run(
      'UPDATE products SET group_id = NULL, group_position = 0 WHERE group_id = ?',
      [id],
    );
    /*
     * `products.group_id` não tem chave estrangeira para cá — a tabela de
     * produtos é declarada antes no schema.sql, e uma FK para frente quebraria
     * a instalação do zero. Por isso a soltura acima é explícita, e precisa
     * acontecer ANTES do DELETE: depois dele, não haveria mais como saber
     * quais produtos pertenciam a este grupo.
     */
    await tx.run('DELETE FROM product_groups WHERE id = ?', [id]);
    return soltos;
  });
}
