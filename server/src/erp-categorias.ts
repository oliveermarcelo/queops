/**
 * Categorias do ERP — carga, amarração e tradução.
 *
 * O ERP identifica categoria por CÓDIGO; a loja, por SLUG. O pedido do
 * integrador foi "vamos usar códigos", e ele está certo sobre o problema: nome
 * de categoria como chave de integração quebra no dia em que alguém corrige um
 * acento. Mas trocar o slug pelo código NA LOJA resolveria isso destruindo
 * outra coisa — o slug está na URL pública (/?categoria=piramides) e no
 * sitemap já entregue ao Google, e viraria /?categoria=0012.
 *
 * Então os dois convivem: o código é a chave da integração, o slug segue sendo
 * a identidade da loja, e este módulo é a tradução entre eles.
 *
 * A amarração é MANUAL, por decisão do dono da loja. A tentação óbvia era
 * casar por nome ("Pirâmides" do ERP com `piramides` da loja) e seguir em
 * frente; o custo disso é um nome parecido amarrando errado sem ninguém ver, e
 * produto aparecendo na seção errada da vitrine. Um relatório de pendências
 * custa um clique; uma amarração errada custa a confiança no catálogo.
 */

import { q, transaction, type Q, type Row } from './db.ts';

/** Uma categoria como o ERP a envia. */
export interface CategoriaDoErp {
  code: string;
  name: string;
  parentCode?: string | null;
  active?: boolean;
}

export interface ResultadoDaCarga {
  recebidas: number;
  criadas: number;
  atualizadas: number;
  /** Códigos ainda sem destino na loja — produto com eles fica fora da vitrine. */
  pendentes: number;
  /** Problemas que não impedem a carga. */
  warnings: string[];
}

/** Normaliza o código: é chave, então não pode variar por espaço ou caixa. */
export function normalizarCodigo(bruto: unknown): string {
  return String(bruto ?? '').trim().slice(0, 60);
}

/**
 * Valida uma categoria do lote. Devolve o motivo da recusa, ou string vazia.
 *
 * Recusa por item, e não por lote: um código vazio no meio de 300 categorias
 * não pode derrubar as outras 299 — o ERP reenviaria tudo por causa de uma.
 */
export function problemaNaCategoria(c: unknown): string {
  if (c === null || typeof c !== 'object' || Array.isArray(c)) {
    return 'cada categoria precisa ser um objeto';
  }
  const obj = c as Record<string, unknown>;
  if (normalizarCodigo(obj.code) === '') return 'code é obrigatório';
  if (String(obj.name ?? '').trim() === '') return 'name é obrigatório';
  return '';
}

/**
 * Grava a carga de categorias do ERP.
 *
 * É upsert por código, e NUNCA toca em `category_id`/`subcategory_id`: a
 * amarração pertence ao painel. Sem essa regra, cada ciclo de sincronização
 * desfaria o trabalho manual do dono da loja — o mesmo problema que as travas
 * de campo do produto resolvem, na mesma integração.
 *
 * Também não apaga o que sumiu do lote. Uma carga truncada por timeout
 * apagaria categorias vivas, e com elas a amarração; marcar como inativa é
 * reversível, apagar não é.
 */
export async function carregarCategorias(
  lote: unknown[],
  exec: Q = q,
): Promise<ResultadoDaCarga> {
  const warnings: string[] = [];
  const validas: CategoriaDoErp[] = [];
  const vistos = new Set<string>();

  for (const [i, bruta] of lote.entries()) {
    const problema = problemaNaCategoria(bruta);
    if (problema !== '') {
      warnings.push(`categoria ${i}: ${problema}`);
      continue;
    }
    const obj = bruta as Record<string, unknown>;
    const code = normalizarCodigo(obj.code);

    // Código repetido no MESMO lote: o último venceria em silêncio. Avisar é
    // o que permite ao ERP descobrir uma duplicidade no cadastro dele.
    if (vistos.has(code)) {
      warnings.push(`code "${code}" veio mais de uma vez no lote; usei a última ocorrência`);
    }
    vistos.add(code);

    validas.push({
      code,
      name: String(obj.name).trim().slice(0, 160),
      parentCode: normalizarCodigo(obj.parentCode) || null,
      active: obj.active === undefined ? true : Boolean(obj.active),
    });
  }

  let criadas = 0;
  let atualizadas = 0;

  for (const c of validas) {
    const existe = await exec.one('SELECT code FROM erp_categories WHERE code = ?', [c.code]);
    if (existe === null) {
      await exec.run(
        'INSERT INTO erp_categories (code, name, parent_code, active) VALUES (?,?,?,?)',
        [c.code, c.name, c.parentCode, c.active ? 1 : 0],
      );
      criadas++;
    } else {
      await exec.run(
        'UPDATE erp_categories SET name = ?, parent_code = ?, active = ? WHERE code = ?',
        [c.name, c.parentCode, c.active ? 1 : 0, c.code],
      );
      atualizadas++;
    }
  }

  const pendentes = Number(
    (await exec.one(
      'SELECT COUNT(*) AS n FROM erp_categories WHERE category_id IS NULL AND active = 1',
    ))?.n ?? 0,
  );

  return { recebidas: lote.length, criadas, atualizadas, pendentes, warnings };
}

export interface Destino {
  category: string;
  subcategory: string | null;
}

/**
 * Traduz um código do ERP no destino da loja.
 *
 * Três respostas possíveis, e a diferença entre elas importa para quem chamou:
 *  - `null` com `conhecido: false` — código que o ERP nunca mandou na carga.
 *  - `null` com `conhecido: true`  — código conhecido, ainda não amarrado.
 *  - destino — amarrado.
 *
 * Quem grava produto trata os dois primeiros do mesmo jeito (aceita o produto
 * e o segura fora da vitrine), mas a MENSAGEM precisa ser diferente: um pede
 * "mande a carga de categorias"; o outro pede "amarre no painel".
 */
export async function traduzirCodigo(
  code: string,
  exec: Q = q,
): Promise<{ destino: Destino | null; conhecido: boolean; nome: string }> {
  const c = normalizarCodigo(code);
  if (c === '') return { destino: null, conhecido: false, nome: '' };

  const row = await exec.one(
    'SELECT name, category_id, subcategory_id FROM erp_categories WHERE code = ?',
    [c],
  );
  if (row === null) return { destino: null, conhecido: false, nome: '' };

  const categoria = row.category_id === null ? '' : String(row.category_id);
  if (categoria === '') return { destino: null, conhecido: true, nome: String(row.name) };

  return {
    destino: {
      category: categoria,
      subcategory: row.subcategory_id === null ? null : String(row.subcategory_id),
    },
    conhecido: true,
    nome: String(row.name),
  };
}

/** Código do ERP amarrado a esta categoria/subcategoria da loja, se houver. */
export async function codigoDaCategoria(
  category: string,
  subcategory: string | null,
  exec: Q = q,
): Promise<string> {
  if (category === '') return '';

  /*
   * A busca prefere a amarração mais específica.
   *
   * O ERP costuma ter um código por subcategoria; a loja pode ter amarrado
   * tanto o nível-mãe quanto o filho. Devolver o código da mãe para um produto
   * que está numa subcategoria amarrada faria o ERP receber de volta um código
   * diferente do que enviou — e concluir, com razão, que a loja mudou a
   * categoria do produto.
   */
  if (subcategory !== null && subcategory !== '') {
    const exato = await exec.one(
      'SELECT code FROM erp_categories WHERE category_id = ? AND subcategory_id = ? LIMIT 1',
      [category, subcategory],
    );
    if (exato !== null) return String(exato.code);
  }

  const soCategoria = await exec.one(
    'SELECT code FROM erp_categories WHERE category_id = ? AND subcategory_id IS NULL LIMIT 1',
    [category],
  );
  return soCategoria === null ? '' : String(soCategoria.code);
}

/*
 * Chave do mapa de códigos: categoria + subcategoria (vazia quando não há).
 *
 * O separador é um byte nulo porque slug não contém nenhum — assim
 * "a" + "b-c" nunca colide com "a-b" + "c". Escrito como escape, e não como o
 * caractere:
 *
 * Um byte nulo literal no arquivo faz o `grep` tratar o fonte como binário e
 * some do diff — o tipo de detalhe que custa meia hora na próxima vez que
 * alguém for entender por que a chave não casa.
 */
const SEPARADOR = '\u0000';

const chaveDoDestino = (categoria: string, sub: string | null | undefined): string =>
  `${categoria}${SEPARADOR}${sub ?? ''}`;

/**
 * Mapa destino-da-loja → código do ERP, para anexar o código na leitura.
 *
 * O código sai daqui, e não de uma coluna gravada no produto, de propósito. Um
 * código guardado junto do produto é o que o ERP mandou da última vez — e fica
 * errado no instante em que alguém move o produto de categoria pelo painel. A
 * loja responderia com o código da categoria antiga, e o ERP concluiria que
 * nada mudou. Derivar da amarração custa uma consulta por listagem e nunca
 * mente.
 */
export async function mapaDeCodigos(exec: Q = q): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const linhas = await exec.all(
    'SELECT code, category_id, subcategory_id FROM erp_categories WHERE category_id IS NOT NULL',
  );
  for (const l of linhas) {
    mapa.set(chaveDoDestino(String(l.category_id), l.subcategory_id as string | null), String(l.code));
  }
  return mapa;
}

/** Consulta o mapa: amarração da subcategoria primeiro, depois a da categoria. */
export function codigoNoMapa(
  mapa: Map<string, string> | undefined,
  categoria: unknown,
  sub: unknown,
): string | null {
  if (mapa === undefined) return null;
  const cat = String(categoria ?? '');
  if (cat === '') return null;

  const s = sub === null || sub === undefined ? '' : String(sub);
  if (s !== '') {
    const exato = mapa.get(chaveDoDestino(cat, s));
    if (exato !== undefined) return exato;
  }
  return mapa.get(chaveDoDestino(cat, '')) ?? null;
}

/** Linha de `erp_categories` no formato da API/painel. */
export function erpCategoriaParaApi(r: Row): Record<string, unknown> {
  return {
    code: String(r.code),
    name: String(r.name),
    parentCode: r.parent_code === null ? null : String(r.parent_code),
    active: Boolean(r.active),
    category: r.category_id === null ? null : String(r.category_id),
    subcategory: r.subcategory_id === null ? null : String(r.subcategory_id),
    linked: r.category_id !== null,
  };
}

/**
 * Amarra (ou desamarra) um código do ERP a uma categoria da loja.
 *
 * Devolve o motivo da recusa, ou string vazia. Confere que a categoria e a
 * subcategoria existem de verdade: amarrar a um slug inventado produziria
 * produto apontando para uma seção que a vitrine não tem — invisível na loja e
 * difícil de perceber, porque o painel mostraria a amarração como feita.
 */
export interface ResultadoDaAmarracao {
  /** Motivo da recusa, ou string vazia quando deu certo. */
  erro: string;
  /** Produtos que estavam esperando este código e entraram na vitrine agora. */
  liberados: number;
}

export async function amarrarCategoria(
  code: string,
  category: string | null,
  subcategory: string | null,
  exec: Q = q,
): Promise<ResultadoDaAmarracao> {
  const c = normalizarCodigo(code);
  const existe = await exec.one('SELECT code FROM erp_categories WHERE code = ?', [c]);
  if (existe === null) {
    return { erro: 'Este código não veio em nenhuma carga do ERP.', liberados: 0 };
  }

  // Desamarrar: volta a ser pendente.
  if (category === null || category === '') {
    await exec.run(
      'UPDATE erp_categories SET category_id = NULL, subcategory_id = NULL WHERE code = ?',
      [c],
    );
    return { erro: '', liberados: 0 };
  }

  const cat = await exec.one('SELECT id FROM categories WHERE id = ?', [category]);
  if (cat === null) return { erro: `A loja não tem a categoria "${category}".`, liberados: 0 };

  let sub: string | null = null;
  if (subcategory !== null && subcategory !== '') {
    const achada = await exec.one(
      'SELECT id FROM subcategories WHERE parent_id = ? AND id = ?',
      [category, subcategory],
    );
    if (achada === null) {
      return {
        erro: `A categoria "${category}" não tem a subcategoria "${subcategory}".`,
        liberados: 0,
      };
    }
    sub = subcategory;
  }

  await exec.run(
    'UPDATE erp_categories SET category_id = ?, subcategory_id = ? WHERE code = ?',
    [category, sub, c],
  );

  /*
   * Os produtos que estavam esperando este código entram na vitrine agora.
   *
   * Sem isto, a amarração valeria só para as PRÓXIMAS gravações, e quem já
   * tinha chegado dependeria de o ERP reenviar. O ERP do cliente guarda "essa
   * categoria eu já integrei" justamente para não repetir trabalho — então ele
   * não reenviaria, e os produtos ficariam invisíveis indefinidamente. Uma
   * dependência que só falha em silêncio e semanas depois é o tipo de coisa que
   * o código precisa resolver, não a documentação.
   *
   * `category = ''` no WHERE limita a quem está de fato esperando: produto que
   * alguém já posicionou no painel não é movido por uma amarração posterior.
   */
  const liberados = await exec.run(
    `UPDATE products
        SET category = ?, subcategory = ?, pending_category_code = ''
      WHERE pending_category_code = ? AND category = ''`,
    [category, sub, c],
  );

  return { erro: '', liberados };
}

/**
 * Slug a partir do nome: é ele que vai para a URL pública.
 *
 * Sem acento e sem maiúscula porque URL com "%C3%A2" é ilegível quando alguém
 * cola o link num WhatsApp, e porque a mesma categoria digitada com e sem
 * acento produziria dois endereços para a mesma página.
 */
export function slugificar(nome: string): string {
  return String(nome)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

/** Garante slug único dentro de um conjunto, sufixando quando repete. */
function slugUnico(base: string, usados: Set<string>): string {
  const inicial = base === '' ? 'categoria' : base;
  let slug = inicial;
  let n = 2;
  while (usados.has(slug)) {
    slug = `${inicial.slice(0, 96)}-${n}`;
    n++;
  }
  usados.add(slug);
  return slug;
}

export interface ResultadoDoEspelho {
  categorias: number;
  subcategorias: number;
  /** Códigos do ERP que passaram a apontar para uma categoria da loja. */
  amarrados: number;
  /** Produtos que ficaram sem categoria porque a antiga deixou de existir. */
  orfaos: number;
  /** Categorias da loja que existiam antes e foram apagadas. */
  apagadas: number;
  warnings: string[];
}

/**
 * Refaz a árvore da loja como cópia exata das categorias do ERP.
 *
 * É destrutivo por definição, e foi pedido assim: a loja deixa de ter uma
 * taxonomia própria e passa a espelhar a do ERP. O que isso apaga, e que não
 * volta sozinho:
 *
 *  - As categorias curadas da loja, com ícone, ordem e destaque escolhidos.
 *  - Os endereços públicos delas. `/?categoria=piramides` deixa de existir se o
 *    ERP não tiver uma categoria que gere esse mesmo slug; o que estava
 *    indexado no Google passa a levar a lugar nenhum.
 *  - A ligação dos produtos que estavam nas categorias antigas. Eles não são
 *    apagados, mas saem da vitrine até o ERP reenviá-los com `categoryCode`.
 *
 * Roda em transação: ou a árvore inteira é trocada, ou nada muda. Uma troca
 * pela metade deixaria a loja com metade do menu apontando para o vazio.
 */
export async function espelharArvoreDoErp(): Promise<ResultadoDoEspelho> {
  return transaction(async (tx) => {
    const warnings: string[] = [];

    const todas = await tx.all(
      'SELECT code, name, parent_code, active FROM erp_categories ORDER BY name ASC',
    );
    const ativas = todas.filter((c) => Boolean(c.active));
    const inativas = todas.length - ativas.length;
    if (inativas > 0) {
      warnings.push(
        `${inativas} categoria(s) inativa(s) no ERP não entraram na loja. Se alguma deveria `
        + 'aparecer, reative no ERP e espelhe de novo.',
      );
    }

    const porCodigo = new Map(ativas.map((c) => [String(c.code), c]));

    /*
     * A loja tem exatamente dois níveis: categoria e subcategoria. O ERP pode
     * ter mais. Um neto vira filho do avô — melhor perder um nível de detalhe
     * do que perder o produto, que é o que aconteceria se ele ficasse sem
     * destino.
     */
    const raizDe = (c: Row): { pai: Row | null; achatado: boolean } => {
      if (c.parent_code === null) return { pai: null, achatado: false };

      const paiDireto = porCodigo.get(String(c.parent_code));
      if (paiDireto === undefined) {
        warnings.push(
          `"${c.name}" aponta para o pai "${c.parent_code}", que não veio na carga (ou está `
          + 'inativo). Ela entrou como categoria de primeiro nível.',
        );
        return { pai: null, achatado: false };
      }
      if (paiDireto.parent_code === null || !porCodigo.has(String(paiDireto.parent_code))) {
        return { pai: paiDireto, achatado: false };
      }

      // Terceiro nível ou mais: sobe até a raiz.
      let raiz: Row = paiDireto;
      const visitados = new Set<string>([String(c.code), String(raiz.code)]);
      for (;;) {
        if (raiz.parent_code === null) break;
        const acima = porCodigo.get(String(raiz.parent_code));
        // Pai ausente, ou ciclo no cadastro do ERP: para em vez de girar para
        // sempre — um ciclo aqui travaria a subida do servidor.
        if (acima === undefined || visitados.has(String(acima.code))) break;
        visitados.add(String(acima.code));
        raiz = acima;
      }
      return { pai: raiz, achatado: true };
    };

    const mapaPai = new Map<string, Row | null>();
    for (const c of ativas) {
      const { pai, achatado } = raizDe(c);
      if (achatado && pai !== null) {
        warnings.push(
          `"${c.name}" estava no terceiro nível do ERP; a loja só tem dois, então ela virou `
          + `subcategoria de "${pai.name}".`,
        );
      }
      mapaPai.set(String(c.code), pai);
    }

    const raizes = ativas.filter((c) => mapaPai.get(String(c.code)) === null);

    /*
     * ------------------------------------------------- apaga o antigo ----
     *
     * Antes de apagar, guarda o que é DA LOJA e não do ERP: a foto da
     * categoria, a frase da vitrine e o "mostrar na home". O ERP não conhece
     * nada disso e nunca vai reenviar — sem esta cópia, cada espelhamento
     * apagaria em silêncio as fotos que alguém subiu à mão, e só se
     * descobriria olhando a home depois.
     *
     * A chave é o SLUG, que é derivado do nome: uma categoria que continua se
     * chamando "Pirâmides de Cobre" recebe a sua foto de volta. Se o ERP
     * renomear a categoria, o slug muda e a foto não volta — é o certo, porque
     * aí passou a ser outra categoria, e herdar a foto da antiga seria pior.
     */
    const vitrineAntiga = new Map<
      string,
      { image: string; blurb: string; home: number; group: string | null }
    >();
    const antes = await tx.all('SELECT id, image, blurb, home, group_id FROM categories');
    for (const c of antes) {
      vitrineAntiga.set(String(c.id), {
        image: String(c.image ?? ''),
        blurb: String(c.blurb ?? ''),
        home: Number(c.home) || 0,
        // O agrupamento é da loja, e o ERP não o reenvia: sem isto, cada
        // sincronização desmontaria o menu que alguém organizou à mão.
        group: c.group_id === null || c.group_id === undefined ? null : String(c.group_id),
      });
    }

    /*
     * As categorias GERAIS, criadas no painel, não são apagadas.
     *
     * O ERP não as conhece e nunca vai reenviá-las — elas existem justamente
     * porque ele manda "Pirâmides de Cristal", "de Madeira" e "de Impressão 3D"
     * soltas, sem uma "Pirâmides" acima. Apagá-las aqui destruiria, a cada
     * sincronização, a organização inteira do menu.
     */
    // `subcategories` tem FK com ON DELETE CASCADE: some junto.
    await tx.run('DELETE FROM categories WHERE manual = 0');

    /*
     * ------------------------------------------------- monta o novo ----
     *
     * Os slugs das categorias gerais entram JÁ OCUPADOS. Elas sobreviveram ao
     * DELETE, e uma categoria do ERP com o mesmo nome geraria o mesmo slug —
     * o INSERT falharia por chave duplicada e derrubaria o espelhamento
     * inteiro. Com o slug reservado, a do ERP ganha sufixo e as duas convivem.
     */
    const slugsRaiz = new Set<string>(
      (await tx.all('SELECT id FROM categories')).map((c) => String(c.id)),
    );
    const slugPorCodigo = new Map<string, { categoria: string; sub: string | null }>();

    let posicao = 0;
    for (const c of raizes) {
      const slug = slugUnico(slugificar(String(c.name)), slugsRaiz);
      const vitrine = vitrineAntiga.get(slug)
        ?? { image: '', blurb: '', home: 0, group: null };
      await tx.run(
        `INSERT INTO categories
           (id, name, description, icon, featured, position, image, blurb, home, group_id, manual)
         VALUES (?,?,?,?,0,?,?,?,?,?,0)`,
        [
          slug, String(c.name).slice(0, 120), '', '', posicao,
          vitrine.image, vitrine.blurb, vitrine.home, vitrine.group,
        ],
      );
      slugPorCodigo.set(String(c.code), { categoria: slug, sub: null });
      posicao++;
    }

    let subcategorias = 0;
    const slugsPorPai = new Map<string, Set<string>>();
    for (const c of ativas) {
      const pai = mapaPai.get(String(c.code));
      if (pai === null || pai === undefined) continue;

      const destinoPai = slugPorCodigo.get(String(pai.code));
      if (destinoPai === undefined) continue; // pai inativo: já avisado acima

      const usados = slugsPorPai.get(destinoPai.categoria) ?? new Set<string>();
      slugsPorPai.set(destinoPai.categoria, usados);
      const slug = slugUnico(slugificar(String(c.name)), usados);

      await tx.run(
        'INSERT INTO subcategories (parent_id, id, name, position) VALUES (?,?,?,?)',
        [destinoPai.categoria, slug, String(c.name).slice(0, 120), subcategorias],
      );
      slugPorCodigo.set(String(c.code), { categoria: destinoPai.categoria, sub: slug });
      subcategorias++;
    }

    // ------------------------------------------------- refaz a amarração ----
    // Toda amarração anterior é substituída: a árvore nova é a do ERP, então
    // cada código passa a apontar para a categoria que nasceu dele.
    await tx.run('UPDATE erp_categories SET category_id = NULL, subcategory_id = NULL');
    for (const [code, destino] of slugPorCodigo) {
      await tx.run(
        'UPDATE erp_categories SET category_id = ?, subcategory_id = ? WHERE code = ?',
        [destino.categoria, destino.sub, code],
      );
    }

    /*
     * Produto cuja categoria não existe mais sai da vitrine, explicitamente.
     *
     * Deixar o slug antigo gravado seria pior que apagá-lo: o produto
     * continuaria passando pelo filtro da vitrine (a coluna não está vazia) e
     * apareceria na home, mas sem pertencer a nenhuma seção do menu — visível
     * para quem rolasse a página, inacessível para quem procurasse. Zerar
     * coloca o produto na contagem de pendentes, que é onde ele deve estar.
     */
    const orfaos = await tx.run(
      `UPDATE products SET category = '', subcategory = NULL
        WHERE category <> ''
          AND category NOT IN (SELECT id FROM categories)`,
    );

    /*
     * O produto que estava esperando um código agora tem para onde ir. Sem
     * isto, quem chegou antes do espelhamento ficaria parado mesmo com a
     * categoria dele já existindo na loja.
     */
    let liberados = 0;
    for (const [code, destino] of slugPorCodigo) {
      liberados += await tx.run(
        `UPDATE products SET category = ?, subcategory = ?, pending_category_code = ''
          WHERE pending_category_code = ? AND category = ''`,
        [destino.categoria, destino.sub, code],
      );
    }
    if (liberados > 0) {
      warnings.push(`${liberados} produto(s) que estavam esperando entraram na vitrine.`);
    }

    return {
      categorias: raizes.length,
      subcategorias,
      amarrados: slugPorCodigo.size,
      orfaos,
      apagadas: antes.length,
      warnings,
    };
  });
}

/**
 * Quantos produtos estão parados por falta de amarração.
 *
 * É o número que justifica a tela existir: produto recebido com código não
 * amarrado fica sem categoria e, por isso, fora da vitrine. Sem esta contagem,
 * ele some sem avisar ninguém.
 */
export async function produtosSemCategoria(exec: Q = q): Promise<number> {
  const r = await exec.one("SELECT COUNT(*) AS n FROM products WHERE category = ''");
  return Number(r?.n ?? 0);
}

// ------------------------------------------- quais produtos, e por quê ----

/** Um produto que está fora da vitrine por não ter categoria. */
export interface ProdutoParado {
  id: string;
  sku: string;
  name: string;
  active: boolean;
  updatedAt: unknown;
}

/**
 * Por que um grupo de produtos está parado. A distinção é o ponto desta tela:
 * cada motivo se resolve num lugar diferente, e três deles NÃO se resolvem
 * amarrando uma categoria pendente — que era a única coisa que o aviso antigo
 * mandava fazer.
 */
export type MotivoDeParada = 'amarrado' | 'pendente' | 'orfao' | 'sem_codigo';

export interface GrupoParado {
  /** Código que os produtos estão esperando. Vazio em `sem_codigo`. */
  code: string;
  /** Nome da categoria no ERP, quando ele já mandou o cadastro dela. */
  name: string;
  motivo: MotivoDeParada;
  total: number;
  /** Amostra dos produtos — cortada em AMOSTRA_DE_PARADOS por grupo. */
  produtos: ProdutoParado[];
}

export interface ProdutosParados {
  total: number;
  grupos: GrupoParado[];
}

/**
 * Teto de produtos examinados, e de produtos mostrados por grupo.
 *
 * A tela existe para a pessoa reconhecer o que está parado e decidir — não
 * para ela rolar mil linhas. O que importa é o motivo e a contagem; a amostra
 * é só para dar nome aos bois. Com um catálogo de ~1.400 itens, o teto de
 * leitura nunca é atingido na prática, e existe para o dia em que uma carga
 * errada do ERP deixar tudo sem categoria de uma vez.
 */
const TETO_DE_LEITURA = 3000;
const AMOSTRA_DE_PARADOS = 50;

/**
 * Quais produtos estão fora da vitrine, agrupados pelo MOTIVO de cada um.
 *
 * O aviso do painel sabia dizer "51 produtos estão sem categoria" e mandava
 * amarrar a categoria correspondente logo abaixo. Isso só era verdade num dos
 * quatro casos possíveis — e no dia em que a loja tinha 41 categorias do ERP,
 * todas amarradas, e ainda assim 51 produtos parados, o aviso estava mandando
 * fazer algo que não existia para ser feito. Contar sem dizer qual é o motivo
 * transforma um problema resolvível num beco sem saída.
 *
 * Os quatro casos, e onde cada um se resolve:
 *
 *   amarrado    o código JÁ está amarrado e mesmo assim o produto ficou fora.
 *               Acontece quando alguém troca a categoria do produto para
 *               "— sem categoria —" no painel: a amarração só libera quem está
 *               esperando no instante do clique, então ninguém volta a olhar
 *               para esse produto. Um botão reaplica a categoria.
 *   pendente    o ERP mandou a categoria, falta amarrar aqui. É o caso que o
 *               aviso antigo descrevia, e se resolve na lista abaixo dele.
 *   orfao       o produto veio com um código que NUNCA chegou como categoria.
 *               A loja não consegue amarrar o que não conhece; é preciso
 *               registrar o código primeiro (ou pedir a carga ao ERP).
 *   sem_codigo  o produto veio sem código nenhum, ou nasceu no painel. Só se
 *               resolve escolhendo a categoria em Painel → Produtos.
 */
export async function detalheDeProdutosSemCategoria(exec: Q = q): Promise<ProdutosParados> {
  const linhas = await exec.all(
    `SELECT p.id, p.sku, p.name, p.active, p.updated_at, p.pending_category_code,
            e.code AS erp_code, e.name AS erp_name, e.category_id
       FROM products p
       LEFT JOIN erp_categories e ON e.code = p.pending_category_code
      WHERE p.category = ''
      ORDER BY p.pending_category_code ASC, p.name ASC
      LIMIT ${TETO_DE_LEITURA}`,
  );

  const porChave = new Map<string, GrupoParado>();

  for (const l of linhas) {
    const code = String(l.pending_category_code ?? '');
    const motivo: MotivoDeParada = code === ''
      ? 'sem_codigo'
      : l.erp_code === null || l.erp_code === undefined
        ? 'orfao'
        : l.category_id === null || l.category_id === undefined
          ? 'pendente'
          : 'amarrado';

    const chave = `${motivo}:${code}`;
    let grupo = porChave.get(chave);
    if (grupo === undefined) {
      grupo = { code, name: String(l.erp_name ?? ''), motivo, total: 0, produtos: [] };
      porChave.set(chave, grupo);
    }
    grupo.total++;
    if (grupo.produtos.length < AMOSTRA_DE_PARADOS) {
      grupo.produtos.push({
        id: String(l.id),
        sku: String(l.sku ?? ''),
        name: String(l.name ?? ''),
        active: Boolean(l.active),
        updatedAt: l.updated_at,
      });
    }
  }

  /*
   * A ordem é a do esforço: primeiro o que se resolve com um clique, por
   * último o que exige o ERP ou trabalho manual item a item. Quem abre a lista
   * deve ver primeiro o que consegue fazer agora.
   */
  const ordem: Record<MotivoDeParada, number> = {
    amarrado: 0, pendente: 1, orfao: 2, sem_codigo: 3,
  };
  const grupos = [...porChave.values()].sort(
    (a, b) => ordem[a.motivo] - ordem[b.motivo] || b.total - a.total,
  );

  return { total: await produtosSemCategoria(exec), grupos };
}

/**
 * Aplica, agora, a categoria de um código que já está amarrado.
 *
 * É a mesma atualização que a amarração faz — e existe separada porque a
 * amarração acontece UMA vez, e produto que ficou sem categoria depois dela
 * (porque alguém o editou no painel, ou porque uma carga do ERP o pegou no meio
 * do caminho) não é alcançado por nada. Sem este botão, o único jeito seria
 * desamarrar e amarrar de novo o código — que é uma manobra que ninguém
 * descobre sozinho, e que tira da vitrine todos os outros produtos no intervalo.
 */
export async function reaplicarCodigo(code: string, exec: Q = q): Promise<ResultadoDaAmarracao> {
  const c = normalizarCodigo(code);
  const { destino, conhecido } = await traduzirCodigo(c, exec);
  if (!conhecido) return { erro: 'Este código não veio em nenhuma carga do ERP.', liberados: 0 };
  if (destino === null) {
    return { erro: 'Este código ainda não está amarrado a uma categoria da loja.', liberados: 0 };
  }

  const liberados = await exec.run(
    `UPDATE products
        SET category = ?, subcategory = ?, pending_category_code = ''
      WHERE pending_category_code = ? AND category = ''`,
    [destino.category, destino.subcategory, c],
  );
  return { erro: '', liberados };
}

/**
 * Registra, à mão, um código que apareceu em produto mas nunca veio como
 * categoria.
 *
 * A regra da casa é que categoria é assunto do ERP, e ela continua valendo:
 * esta entrada é um PLACEHOLDER para destravar os produtos. O nome nasce sendo
 * o próprio código, e no instante em que o ERP mandar a categoria de verdade a
 * carga sobrescreve o nome — sem tocar na amarração, que é o que `carregarCategorias`
 * nunca mexe. Ou seja: o registro manual se corrige sozinho e não atrapalha o
 * dia em que o outro lado arrumar o cadastro dele.
 *
 * A alternativa era esperar o ERP. Em tese é o certo; na prática são 51
 * produtos invisíveis na loja enquanto o chamado anda do outro lado, e um
 * painel que só sabe dizer "peça para eles".
 */
export async function registrarCodigoOrfao(
  code: string,
  nome: string,
  exec: Q = q,
): Promise<{ erro: string; code: string; aguardando: number }> {
  const c = normalizarCodigo(code);
  if (c === '') return { erro: 'Informe o código.', code: '', aguardando: 0 };

  const jaExiste = await exec.one('SELECT code FROM erp_categories WHERE code = ?', [c]);
  if (jaExiste !== null) {
    return { erro: 'Este código já está na lista de categorias do ERP.', code: c, aguardando: 0 };
  }

  /*
   * Só registra código que ALGUM produto está mesmo esperando.
   *
   * Sem esta condição, a tela viraria um cadastro livre de categorias do ERP —
   * e aí sim a loja passaria a inventar códigos que o outro lado não conhece,
   * que é exatamente o que a amarração manual existe para evitar.
   */
  const esperando = Number(
    (await exec.one(
      "SELECT COUNT(*) AS n FROM products WHERE pending_category_code = ? AND category = ''",
      [c],
    ))?.n ?? 0,
  );
  if (esperando === 0) {
    return {
      erro: 'Nenhum produto está esperando este código. Códigos novos vêm do ERP.',
      code: c,
      aguardando: 0,
    };
  }

  await exec.run(
    'INSERT INTO erp_categories (code, name, parent_code, active) VALUES (?,?,NULL,1)',
    [c, String(nome ?? '').trim().slice(0, 160) || c],
  );

  return { erro: '', code: c, aguardando: esperando };
}
