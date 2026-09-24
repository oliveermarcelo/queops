/**
 * API pública v1 — para ERP, automações (n8n, Make, Zapier) e integrações
 * próprias. Autentica por chave gerada no painel, em
 * `Authorization: Bearer qp_live_...`, e não usa cookie nem CSRF: é
 * comunicação servidor-a-servidor, então não há requisição forjada pelo
 * navegador a barrar.
 *
 * Escopo deliberadamente pequeno: ler catálogo, pedidos e clientes, e mudar o
 * status de um pedido. Criar pedido continua sendo caminho do checkout, que
 * recalcula preço e baixa estoque em transação.
 */

import { Router } from 'express';

import { currentAdmin, currentApiKey, currentCustomerId, requireApiKey } from '../auth.ts';
import { placeholders, q, type Row } from '../db.ts';
import { fail } from '../errors.ts';
import {
  amarrarCategoria, carregarCategorias, erpCategoriaParaApi, mapaDeCodigos, normalizarCodigo,
  produtosSemCategoria, traduzirCodigo,
} from '../erp-categorias.ts';
import { gravarProdutoDoErp } from '../erp-produtos.ts';
import { body, bodyFloat, bodyInt, bodyStr, iso, jsonOk, mysqlDateTime, queryStr } from '../http.ts';
import { lerMultipart } from '../multipart.ts';
import {
  apagarArquivoDaNota, chaveDeNfeValida, COLUNAS_DA_NOTA, guardarArquivoDaNota, invoiceRowToApi,
  lerArquivoDaNota, novoToken, problemaNoPdf, problemaNoXml, TETO_CORPO, TETO_PDF, TETO_XML,
  tokenValido,
} from '../notas.ts';
import { fireWebhooks } from '../providers.ts';
import {
  fetchProducts, invoicesPorPedido, orderRowToApi, productRowToApi, transicaoDeStatus,
} from '../store.ts';
import { h } from './helpers.ts';

export const v1Routes = Router();

const STATUS_PEDIDO = ['pending', 'paid', 'shipped', 'delivered', 'canceled'];

/**
 * Teto do lote de categorias.
 *
 * Mais alto que o de produtos (200) porque categoria é linha pequena e o ERP
 * manda a lista inteira a cada ciclo — partir isso em páginas obrigaria a loja
 * a saber quando o lote terminou para poder marcar ausências, complicação que
 * não se paga num cadastro dessa ordem de grandeza.
 */
const LOTE_CATEGORIAS = 2000;

// ------------------------------------------------------- categorias ----

/**
 * PUT /api/v1/categories — o ERP manda a lista inteira de categorias dele.
 *
 * Idempotente e absoluto: manda tudo a cada ciclo, como o estoque. Não apaga o
 * que sumiu do lote — uma carga truncada por timeout apagaria categorias vivas
 * e, com elas, a amarração feita à mão. `active: false` é o jeito de aposentar
 * uma categoria, e é reversível.
 */
v1Routes.put('/categories', h(async (req, res) => {
  await requireApiKey(req);
  const b = body(req);
  const lote = Array.isArray(b.categories) ? b.categories : null;
  if (lote === null) {
    fail('Envie "categories" como uma lista.', 422, 'invalid_batch');
  }
  if (lote.length > LOTE_CATEGORIAS) {
    fail(`Lote grande demais (máximo de ${LOTE_CATEGORIAS}).`, 422, 'batch_too_large');
  }

  const r = await carregarCategorias(lote);
  jsonOk(res, {
    ok: true,
    ...r,
    /*
     * O ERP precisa saber que gravar a categoria não é o mesmo que a loja
     * poder usá-la. Enquanto houver pendente, produto com aquele código entra
     * sem categoria e fica fora da vitrine — e isso é decisão do dono da loja,
     * não falha da integração.
     */
    message: r.pendentes === 0
      ? 'Todas as categorias ativas estão amarradas a uma categoria da loja.'
      : `${r.pendentes} categoria(s) ainda sem destino na loja. Produto enviado com esses `
        + 'códigos é aceito, mas fica fora da vitrine até alguém amarrá-los em '
        + 'Painel → Categorias.',
  });
}));

/**
 * GET /api/v1/categories — o que a loja tem, e como isso se liga ao ERP.
 *
 * Devolve as duas listas de propósito: a árvore da loja (com o código do ERP
 * amarrado a cada nó, quando existe) e a lista bruta do ERP com o estado da
 * amarração. Só a primeira não bastaria — o ERP não teria como descobrir que
 * um código que ele mandou está pendente.
 */
v1Routes.get('/categories', h(async (req, res) => {
  await requireApiKey(req);

  const erp = await q.all('SELECT * FROM erp_categories ORDER BY name ASC');
  const porCategoria = new Map<string, Row[]>();
  for (const e of erp) {
    if (e.category_id === null) continue;
    const chave = String(e.category_id);
    const lista = porCategoria.get(chave);
    if (lista) lista.push(e);
    else porCategoria.set(chave, [e]);
  }

  const subs = new Map<string, Row[]>();
  for (const s of await q.all('SELECT * FROM subcategories ORDER BY position ASC, name ASC')) {
    const chave = String(s.parent_id);
    const lista = subs.get(chave);
    if (lista) lista.push(s);
    else subs.set(chave, [s]);
  }

  const categorias = (await q.all('SELECT * FROM categories ORDER BY position ASC, name ASC'))
    .map((c) => {
      const id = String(c.id);
      const amarradas = porCategoria.get(id) ?? [];
      return {
        id,
        name: String(c.name),
        // Código amarrado ao nível-mãe (sem subcategoria), quando houver.
        erpCode: amarradas.find((e) => e.subcategory_id === null)?.code ?? null,
        subcategories: (subs.get(id) ?? []).map((s) => ({
          id: String(s.id),
          name: String(s.name),
          erpCode: amarradas.find((e) => String(e.subcategory_id) === String(s.id))?.code ?? null,
        })),
      };
    });

  jsonOk(res, {
    categories: categorias,
    erpCategories: erp.map(erpCategoriaParaApi),
    pending: erp.filter((e) => e.category_id === null && Boolean(e.active)).length,
    productsWithoutCategory: await produtosSemCategoria(),
  });
}));

/**
 * PUT /api/v1/categories/{code} — uma categoria só.
 *
 * Existe para o fluxo síncrono: antes de mandar um produto, o ERP manda a
 * categoria dele e só então o produto, garantindo a ordem. Faz o mesmo que a
 * carga em lote, para um item.
 *
 * A resposta traz `linked` porque 200 aqui NÃO significa que o produto vai
 * aparecer na loja. Um ERP que guarda "já integrei essa categoria" para não
 * repetir precisa guardar `linked`, e não o 200 — senão ele marca como
 * resolvido algo que ainda depende de uma decisão humana do outro lado.
 */
v1Routes.put('/categories/:code', h(async (req, res) => {
  await requireApiKey(req);
  const code = String(req.params.code ?? '');
  const b = body(req);

  const r = await carregarCategorias([{
    code,
    name: b.name,
    parentCode: b.parentCode,
    active: b.active,
  }]);

  // Item único: o problema dele é o problema da requisição, e vira 422.
  if (r.criadas + r.atualizadas === 0) {
    fail(
      r.warnings[0] ?? 'Categoria inválida. Informe "name".',
      422,
      'invalid_category',
    );
  }

  const { destino, nome } = await traduzirCodigo(code);
  jsonOk(res, {
    ok: true,
    code: normalizarCodigo(code),
    name: nome,
    created: r.criadas === 1,
    linked: destino !== null,
    category: destino?.category ?? null,
    subcategory: destino?.subcategory ?? null,
    message: destino !== null
      ? 'Categoria amarrada. Produto enviado com este código já entra na vitrine.'
      : 'Categoria registrada, mas ainda SEM destino na loja. O produto é aceito e fica fora da '
        + 'vitrine até alguém amarrar em Painel → Categorias do ERP — e entra sozinho quando isso '
        + 'acontecer, sem precisar reenviar.',
  });
}));

/**
 * GET /api/v1/categories/{code} — o estado de um código só.
 *
 * Consulta barata para o ERP conferir antes de confiar no cache dele: se
 * guardou "já integrei" quando `linked` era falso, é aqui que ele descobre que
 * a amarração saiu, sem varrer a lista inteira.
 */
v1Routes.get('/categories/:code', h(async (req, res) => {
  await requireApiKey(req);
  const code = normalizarCodigo(String(req.params.code ?? ''));
  const row = await q.one('SELECT * FROM erp_categories WHERE code = ?', [code]);
  if (row === null) fail('Categoria não encontrada.', 404, 'not_found');

  const esperando = await q.one(
    'SELECT COUNT(*) AS n FROM products WHERE pending_category_code = ?',
    [code],
  );
  jsonOk(res, {
    ...erpCategoriaParaApi(row),
    /** Produtos parados esperando a amarração deste código. */
    productsWaiting: Number(esperando?.n ?? 0),
  });
}));

/**
 * PUT /api/v1/categories/{code}/link — amarra pela API.
 *
 * A amarração é decisão do dono da loja e acontece no painel; esta rota existe
 * para o caso em que ele já tem a correspondência pronta em planilha e não
 * quer clicar cinquenta vezes. Não é a rota que o ciclo de sincronização deve
 * chamar: se o ERP amarrasse sozinho, a decisão manual perderia o sentido.
 */
v1Routes.put('/categories/:code/link', h(async (req, res) => {
  await requireApiKey(req);
  const b = body(req);
  const categoria = b.category === null ? null : bodyStr(b, 'category', '', 100);
  const sub = b.subcategory === null || b.subcategory === undefined
    ? null
    : bodyStr(b, 'subcategory', '', 100);

  const { erro, liberados } = await amarrarCategoria(String(req.params.code ?? ''), categoria, sub);
  if (erro !== '') fail(erro, 422, 'invalid_link');
  jsonOk(res, { ok: true, released: liberados });
}));

// GET /api/v1/products
v1Routes.get('/products', h(async (req, res) => {
  await requireApiKey(req);
  /*
   * Só a API do ERP recebe `categoryCode` — a vitrine não tem o que fazer com
   * ele, e seria uma consulta a mais em cada carregamento da loja.
   *
   * E aqui os produtos sem categoria APARECEM, ao contrário da vitrine: são
   * justamente os que o ERP precisa reenviar depois da amarração.
   */
  jsonOk(res, { products: await fetchProducts({ comCodigos: true }) });
}));

// GET /api/v1/products/:id
v1Routes.get('/products/:id', h(async (req, res) => {
  await requireApiKey(req);
  const row = await q.one('SELECT * FROM products WHERE id = ?', [req.params.id]);
  if (row === null) fail('Produto não encontrado.', 404, 'not_found');
  jsonOk(res, { product: productRowToApi(row, await mapaDeCodigos()) });
}));

/**
 * PUT /api/v1/products/:id — o ERP grava o produto (cria ou atualiza).
 *
 * Aceita o MESMO formato que a leitura devolve, o que permite ao ERP ler um
 * item, mudar um campo e devolver o objeto. Só os campos presentes no corpo são
 * tocados: `{"price": 10}` muda o preço e não zera o resto.
 *
 * Responde 200 mesmo quando algum campo é recusado por estar travado no painel
 * — `applied` e `ignored` dizem o que aconteceu. Ver o comentário em
 * `erp-produtos.ts`: recusar a requisição inteira faria o ERP repetir para
 * sempre, e responder 200 mudo faria ele acreditar que aplicou.
 */
v1Routes.put('/products/:id', h(async (req, res) => {
  await requireApiKey(req);
  const resultado = await gravarProdutoDoErp(String(req.params.id ?? ''), body(req));
  if (!resultado.ok) {
    fail(
      resultado.error?.message ?? 'Não foi possível gravar o produto.',
      422,
      resultado.error?.code ?? 'invalid_product',
    );
  }
  jsonOk(res, resultado, resultado.criado ? 201 : 200);
}));

/**
 * POST /api/v1/products/batch — vários produtos numa chamada.
 *
 * Com mais de mil itens no catálogo, uma requisição por produto transforma um
 * ciclo de sincronização em milhares de chamadas. Aqui vão até 200 por vez.
 *
 * Um item inválido NÃO derruba o lote: cada produto tem o seu resultado. Abortar
 * tudo por causa de um faria o ERP reenviar as gravações que já tinham dado
 * certo — e a repetição esconderia qual era o item ruim.
 */
v1Routes.post('/products/batch', h(async (req, res) => {
  await requireApiKey(req);
  const b = body(req);
  const lista = Array.isArray(b.products) ? b.products : null;
  if (lista === null) fail('Envie {"products": [...]}.', 422, 'invalid_batch');
  if (lista.length === 0) fail('A lista está vazia.', 422, 'invalid_batch');
  if (lista.length > LOTE_MAXIMO) {
    fail(`Máximo de ${LOTE_MAXIMO} produtos por chamada.`, 422, 'batch_too_large');
  }

  const resultados = [];
  for (const bruto of lista) {
    if (bruto === null || typeof bruto !== 'object' || Array.isArray(bruto)) {
      resultados.push({
        id: '', ok: false, criado: false, applied: [], ignored: [], warnings: [],
        error: { code: 'invalid_product', message: 'Cada item precisa ser um objeto.' },
      });
      continue;
    }
    const dto = bruto as Record<string, unknown>;
    resultados.push(await gravarProdutoDoErp(String(dto.id ?? ''), dto));
  }

  jsonOk(res, {
    total: resultados.length,
    gravados: resultados.filter((r) => r.ok).length,
    falhas: resultados.filter((r) => !r.ok).length,
    results: resultados,
  });
}));

/**
 * Teto por chamada em lote: alto o bastante para um catálogo inteiro em poucas
 * chamadas, baixo o bastante para a requisição não estourar tempo nem memória.
 */
const LOTE_MAXIMO = 200;

/**
 * PATCH /api/v1/products/:id/stock — o ERP sincroniza o estoque.
 *
 * Atalho para o caminho de gravação acima, mantido porque já está em uso: o
 * valor é absoluto (saldo, não variação), o que torna a chamada idempotente.
 * Passa pela MESMA regra de travas — estoque ajustado à mão no painel não é
 * sobrescrito, e a resposta diz quando isso aconteceu.
 */
v1Routes.patch('/products/:id/stock', h(async (req, res) => {
  await requireApiKey(req);
  const id = String(req.params.id ?? '');
  /*
   * Saldo pode ter fração — o ERP trabalha assim.
   *
   * Era lido com `bodyInt`, que trunca: mandar 7,5 gravava 7 e a resposta
   * confirmava "stock: 7" sem apontar nada de errado. Os dois sistemas
   * passavam a discordar do saldo, cada um convicto, e a diferença só
   * apareceria num inventário meses depois.
   */
  const stock = bodyFloat(body(req), 'stock', -1);
  if (!Number.isFinite(stock) || stock < 0) {
    fail('Informe "stock" como um número não negativo (aceita decimais).', 422, 'invalid_stock');
  }

  // Este endpoint não cria produto: id desconhecido é 404, como sempre foi.
  if ((await q.one('SELECT id FROM products WHERE id = ?', [id])) === null) {
    fail('Produto não encontrado.', 404, 'not_found');
  }

  const r = await gravarProdutoDoErp(id, { stock });

  /*
   * A resposta devolve o saldo GRAVADO, lido do banco — não o que veio no
   * corpo. Ecoar o valor enviado seria confirmar uma gravação que pode não ter
   * acontecido: com o estoque travado no painel, o pedido é ignorado de
   * propósito (vem em `ignored`), e a resposta antiga dizia "stock: 7" com o
   * banco em 12.
   */
  const depois = await q.one('SELECT stock FROM products WHERE id = ?', [id]);
  jsonOk(res, {
    ok: true,
    id,
    stock: Number(depois?.stock ?? 0),
    applied: r.applied,
    ignored: r.ignored,
    warnings: r.warnings,
  });
}));

// GET /api/v1/orders?status=&since=
v1Routes.get('/orders', h(async (req, res) => {
  await requireApiKey(req);

  const where: string[] = [];
  const params: unknown[] = [];

  const status = queryStr(req, 'status', '', 20);
  if (STATUS_PEDIDO.includes(status)) {
    where.push('status = ?');
    params.push(status);
  }

  /*
   * Dois filtros de data, e a diferença entre eles é o que salva pedido pago.
   *
   *   ?since=          compara com a CRIAÇÃO — "o que entrou depois de X";
   *   ?updatedSince=   compara com a ATUALIZAÇÃO — "o que MUDOU depois de X".
   *
   * A varredura periódica que existe para cobrir webhook perdido precisa do
   * segundo. Com o primeiro, um pedido criado ontem e pago hoje nunca
   * reaparece: a criação continua sendo ontem, e a varredura de hoje não o
   * enxerga. O pedido pago fica parado e ninguém percebe — que é o pior
   * defeito possível numa integração de pedido.
   *
   * `since` continua existindo e com o mesmo significado, porque já está
   * documentado e em uso. Quem faz varredura de segurança deve usar
   * `updatedSince`; quem faz carga inicial, `since`.
   */
  // Convertido para a hora de São Paulo, que é o fuso da sessão MySQL.
  const emHoraLocal = mysqlDateTime;

  const since = queryStr(req, 'since', '', 40);
  if (since !== '') {
    const quando = emHoraLocal(since);
    if (quando !== null) {
      where.push('created_at >= ?');
      params.push(quando);
    }
  }

  const updatedSince = queryStr(req, 'updatedSince', '', 40);
  if (updatedSince !== '') {
    const quando = emHoraLocal(updatedSince);
    if (quando !== null) {
      where.push('updated_at >= ?');
      params.push(quando);
    }
  }

  /*
   * Ordenado pela atualização quando é isso que se está buscando: uma
   * varredura que pagina precisa que a ordem case com o filtro, senão o
   * pedido que acabou de mudar pode cair fora dos 200 primeiros por ser
   * antigo — justamente o pedido que a varredura existe para encontrar.
   */
  const ordem = updatedSince !== '' ? 'updated_at DESC' : 'created_at DESC';
  const orders = await q.all(
    `SELECT * FROM orders${where.length ? ' WHERE ' + where.join(' AND ') : ''}
      ORDER BY ${ordem} LIMIT 200`,
    params,
  );

  const items = new Map<string, Row[]>();
  if (orders.length) {
    const ids = orders.map((o) => o.id);
    for (const i of await q.all(
      `SELECT * FROM order_items WHERE order_id IN (${placeholders(ids.length)}) ORDER BY id ASC`,
      ids,
    )) {
      const key = String(i.order_id);
      const list = items.get(key);
      if (list) list.push(i);
      else items.set(key, [i]);
    }
  }

  const notas = await invoicesPorPedido(orders.map((o) => o.id));
  jsonOk(res, {
    orders: orders.map((o) => orderRowToApi(
      o,
      items.get(String(o.id)) ?? [],
      notas.get(String(o.id)) ?? [],
    )),
  });
}));

// GET /api/v1/orders/:id
v1Routes.get('/orders/:id', h(async (req, res) => {
  await requireApiKey(req);
  const o = await q.one('SELECT * FROM orders WHERE id = ?', [req.params.id]);
  if (o === null) fail('Pedido não encontrado.', 404, 'not_found');
  const items = await q.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC', [req.params.id]);
  const notas = await q.all(
    `SELECT ${COLUNAS_DA_NOTA} FROM order_invoices WHERE order_id = ?
      ORDER BY issued_at ASC, nfe_key ASC`,
    [req.params.id],
  );
  jsonOk(res, { order: orderRowToApi(o, items, notas) });
}));

// PATCH /api/v1/orders/:id — muda o status (ERP confirmando faturamento/envio)
v1Routes.patch('/orders/:id', h(async (req, res) => {
  await requireApiKey(req);
  const status = bodyStr(body(req), 'status', '', 20);
  if (!STATUS_PEDIDO.includes(status)) fail('Status inválido.', 422, 'invalid_status');

  /*
   * Quem mudou é "erp": quem chega por aqui está usando a chave de API.
   *
   * A mesma função do painel grava as datas de transição, para o pedido que o
   * ERP marcou como enviado ter `shippedAt` igual ao que a lojista teria
   * gravado pela tela. Um dos dois caminhos esquecer a data é um pedido que a
   * varredura seguinte não consegue explicar.
   */
  const t = transicaoDeStatus(status, bodyStr(body(req), 'cancelReason', '', 200), 'erp');
  if ((await q.run(
    `UPDATE orders SET ${t.sql} WHERE id = ?`,
    [...t.params, req.params.id],
  )) === 0) {
    fail('Pedido não encontrado.', 404, 'not_found');
  }
  fireWebhooks('order.status_changed', { orderId: req.params.id, status });
  jsonOk(res, { ok: true });
}));

// --------------------------------------------------- notas fiscais ----

/**
 * O que impede esta chave de NF-e de ser gravada neste pedido agora.
 *
 * Devolve o problema em `erro` em vez de lançar, para quem chama poder apagar
 * os arquivos recém-gravados antes de abortar — é o mesmo padrão de
 * `lerDataUrl` e `motivoParaNaoDesativar`, e existe porque o tsconfig da raiz
 * compila sem `strict`.
 */
function problemaComANota(linha: Row, pedidoId: string): { erro: string; status: number; codigo: string } {
  if (String(linha.order_id) !== pedidoId) {
    return {
      erro: `Esta chave de NF-e já está registrada no pedido ${String(linha.order_id)}. `
        + 'Uma chave pertence a um pedido só.',
      status: 409,
      codigo: 'invoice_key_conflict',
    };
  }
  if (String(linha.status) === 'canceled') {
    return {
      erro: 'Esta nota fiscal está cancelada e não volta a valer por reenvio. '
        + 'Emita uma nota nova, com chave nova.',
      status: 409,
      codigo: 'invoice_canceled',
    };
  }
  return { erro: '', status: 200, codigo: '' };
}

/**
 * POST /api/v1/orders/{id}/invoices — o ERP sobe a NF-e do faturamento.
 *
 * `multipart/form-data`, e não JSON com base64: são dois binários de até 3 MB
 * somados, e base64 incharia 33% para depois obrigar o servidor a montar a
 * string inteira na memória. É a única rota da API que não fala JSON.
 *
 * Idempotente pela chave de acesso: o ERP reenvia por retry sem medo. A
 * garantia está na CHAVE PRIMÁRIA da tabela, não numa checagem daqui —
 * checagem na aplicação não segura duas requisições simultâneas com a mesma
 * chave, porque as duas leriam "não existe" antes de qualquer uma gravar.
 *
 * Esta rota NÃO mexe no status do pedido. Faturar não é despachar, e a
 * transição para `shipped` continua sendo exclusividade do PATCH /orders/{id}.
 */
v1Routes.post('/orders/:id/invoices', h(async (req, res) => {
  await requireApiKey(req);
  const pedidoId = String(req.params.id ?? '');

  /*
   * O corpo é lido ANTES de olhar se o pedido existe.
   *
   * Parece invertido — 404 seria mais barato antes de carregar 3 MB —, mas
   * responder sem consumir a requisição deixa o restante do envio na conexão,
   * e vários clientes HTTP transformam isso em "connection reset" em vez de
   * mostrarem o 404 que já tinha sido enviado. O integrador leria erro de rede
   * onde havia uma resposta clara.
   */
  const form = await lerMultipart(req, TETO_CORPO);
  if (form.erro !== '') fail(form.erro, form.status, form.codigo);

  if ((await q.one('SELECT id FROM orders WHERE id = ?', [pedidoId])) === null) {
    fail('Pedido não encontrado.', 404, 'not_found');
  }

  // ------------------------------------------------------ os campos ----

  const chave = String(form.campos.key ?? '').trim();
  if (!chaveDeNfeValida(chave)) {
    fail(
      'A chave de acesso da NF-e precisa ter exatamente 44 dígitos, sem espaços nem máscara.',
      422,
      'invalid_nfe_key',
    );
  }

  const inteiro = (valor: string): number => (/^\d{1,9}$/.test(valor.trim()) ? Number(valor) : -1);
  const numero = inteiro(String(form.campos.number ?? ''));
  if (numero < 0) fail('Informe "number" como um número inteiro.', 422, 'invalid_invoice');
  const serie = inteiro(String(form.campos.series ?? ''));
  if (serie < 0) fail('Informe "series" como um número inteiro.', 422, 'invalid_invoice');

  /*
   * A data de autorização precisa vir COM fuso.
   *
   * "2026-09-22T14:32:10", sem o `-03:00`, é ambíguo: o servidor teria de
   * chutar um fuso, e uma nota autorizada às 23h30 mudaria de dia conforme o
   * chute. A SEFAZ sempre devolve o deslocamento; exigir aqui é exigir o que
   * o ERP já tem em mãos.
   */
  const emitidaEm = String(form.campos.issuedAt ?? '').trim();
  const emitidaComFuso = /(?:Z|[+-]\d{2}:?\d{2})$/.test(emitidaEm);
  const emitidaLocal = emitidaComFuso ? mysqlDateTime(emitidaEm) : null;
  if (emitidaLocal === null) {
    fail(
      'Informe "issuedAt" em ISO 8601 COM fuso (ex.: 2026-09-22T14:32:10-03:00).',
      422,
      'invalid_invoice',
    );
  }

  /*
   * O valor entra como TEXTO e sai como texto.
   *
   * Passar por `Number` aqui seria perder o ponto: 1234.56 não existe exato em
   * binário, e valor de nota fiscal tem de bater centavo a centavo com o XML.
   * A string vai direto para a coluna DECIMAL, que guarda os dígitos.
   */
  const valorBruto = String(form.campos.totalAmount ?? '').trim().replace(',', '.');
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(valorBruto)) {
    fail('Informe "totalAmount" como decimal (ex.: "1234.56").', 422, 'invalid_invoice');
  }

  // ---------------------------------------------------- os arquivos ----

  const xml = form.arquivos.xml;
  const pdf = form.arquivos.pdf;
  if (xml === undefined) fail('Envie o XML processado no campo "xml".', 422, 'invalid_invoice');
  if (pdf === undefined) fail('Envie o DANFE no campo "pdf".', 422, 'invalid_invoice');

  if (xml.bytes.length > TETO_XML) {
    fail(`O XML tem ${Math.round(xml.bytes.length / 1024)} KB; o máximo é 1 MB.`, 413, 'file_too_large');
  }
  if (pdf.bytes.length > TETO_PDF) {
    fail(`O PDF tem ${Math.round(pdf.bytes.length / 1024)} KB; o máximo é 2 MB.`, 413, 'file_too_large');
  }

  /*
   * O tipo é conferido pelo CONTEÚDO, não pelo Content-Type declarado.
   *
   * O cabeçalho é escrito pelo cliente: um executável anunciado como
   * `application/pdf` entraria sem esta checagem, e a loja passaria a servir
   * esse arquivo a compradores. O `application/octet-stream` que várias
   * bibliotecas HTTP mandam por padrão, por outro lado, é aceito sem drama —
   * recusar por causa dele barraria envio legítimo por um detalhe que não diz
   * nada sobre o arquivo.
   */
  const problemaXml = problemaNoXml(xml.bytes);
  if (problemaXml !== '') fail(problemaXml, 415, 'unsupported_media_type');
  const problemaPdf = problemaNoPdf(pdf.bytes);
  if (problemaPdf !== '') fail(problemaPdf, 415, 'unsupported_media_type');

  // ------------------------------------------------------- gravação ----

  const existente = await q.one(
    `SELECT ${COLUNAS_DA_NOTA} FROM order_invoices WHERE nfe_key = ?`,
    [chave],
  );
  if (existente !== null) {
    const p = problemaComANota(existente, pedidoId);
    if (p.erro !== '') fail(p.erro, p.status, p.codigo);
  }

  const tokenXml = novoToken();
  const tokenPdf = novoToken();
  await guardarArquivoDaNota(tokenXml, 'xml', xml.bytes);
  await guardarArquivoDaNota(tokenPdf, 'pdf', pdf.bytes);
  const descartarNovos = async (): Promise<void> => {
    await apagarArquivoDaNota(tokenXml, 'xml');
    await apagarArquivoDaNota(tokenPdf, 'pdf');
  };

  let criada = existente === null;
  if (criada) {
    try {
      await q.run(
        `INSERT INTO order_invoices
           (nfe_key, order_id, number, series, issued_at, total_amount, status, xml_token, pdf_token)
         VALUES (?, ?, ?, ?, ?, ?, 'authorized', ?, ?)`,
        [chave, pedidoId, numero, serie, emitidaLocal, valorBruto, tokenXml, tokenPdf],
      );
    } catch (e) {
      if ((e as { code?: string })?.code !== 'ER_DUP_ENTRY') {
        await descartarNovos();
        throw e;
      }
      /*
       * Corrida: outra requisição com a MESMA chave inseriu entre a consulta
       * acima e este INSERT. É exatamente o caso que a chave primária existe
       * para resolver; aqui só seguimos para o caminho de substituição.
       */
      criada = false;
    }
  }

  if (!criada) {
    const atual = await q.one(
      `SELECT ${COLUNAS_DA_NOTA} FROM order_invoices WHERE nfe_key = ?`,
      [chave],
    );
    if (atual === null) {
      await descartarNovos();
      fail('Não foi possível gravar a nota. Tente novamente.', 409, 'invoice_key_conflict');
    }
    const p = problemaComANota(atual, pedidoId);
    if (p.erro !== '') {
      await descartarNovos();
      fail(p.erro, p.status, p.codigo);
    }

    const trocadas = await q.run(
      `UPDATE order_invoices
          SET number = ?, series = ?, issued_at = ?, total_amount = ?,
              xml_token = ?, pdf_token = ?
        WHERE nfe_key = ? AND order_id = ? AND status = 'authorized'`,
      [numero, serie, emitidaLocal, valorBruto, tokenXml, tokenPdf, chave, pedidoId],
    );
    if (trocadas === 0) {
      await descartarNovos();
      fail(
        'Esta nota fiscal está cancelada e não volta a valer por reenvio.',
        409,
        'invoice_canceled',
      );
    }

    /*
     * Os arquivos antigos SOMEM, e é a parte que não pode ser esquecida.
     *
     * Token novo sem apagar o velho deixaria a URL anterior funcionando para
     * sempre — e ela já circulou: foi para o e-mail do comprador e para o log
     * do ERP. Substituir uma nota tem de invalidar o que foi substituído.
     */
    await apagarArquivoDaNota(String(atual.xml_token), 'xml');
    await apagarArquivoDaNota(String(atual.pdf_token), 'pdf');
  }

  const gravada = await q.one(
    `SELECT ${COLUNAS_DA_NOTA} FROM order_invoices WHERE nfe_key = ?`,
    [chave],
  );
  jsonOk(res, { invoice: invoiceRowToApi(gravada ?? {}) }, criada ? 201 : 200);
}));

/**
 * PATCH /api/v1/orders/{id}/invoices/{key} — cancelamento da nota.
 *
 * Aceita uma transição só: `authorized → canceled`. Reenviar o cancelamento de
 * uma nota já cancelada responde 200 com a mesma nota, de propósito — é retry
 * do ERP, não erro, e transformar retry em 422 faria o outro lado repetir para
 * sempre tentando "consertar" algo que já está no estado pedido.
 *
 * A nota cancelada CONTINUA na resposta do pedido, com `status: "canceled"`:
 * o ERP precisa do histórico. Quem deixa de apresentá-la como válida é a loja
 * — a tela do comprador não a mostra, e a rota de download a recusa para ele.
 */
v1Routes.patch('/orders/:id/invoices/:key', h(async (req, res) => {
  await requireApiKey(req);

  const status = bodyStr(body(req), 'status', '', 20);
  if (status !== 'canceled') {
    fail(
      'A única mudança aceita é {"status": "canceled"}. Nota autorizada não volta atrás por aqui.',
      422,
      'invalid_status',
    );
  }

  const chave = String(req.params.key ?? '').trim();
  if (!chaveDeNfeValida(chave)) {
    fail('A chave de acesso da NF-e precisa ter exatamente 44 dígitos.', 422, 'invalid_nfe_key');
  }

  const pedidoId = String(req.params.id ?? '');
  const nota = await q.one(
    `SELECT ${COLUNAS_DA_NOTA} FROM order_invoices WHERE nfe_key = ? AND order_id = ?`,
    [chave, pedidoId],
  );
  if (nota === null) fail('Nota fiscal não encontrada neste pedido.', 404, 'not_found');

  if (String(nota.status) !== 'canceled') {
    await q.run(
      `UPDATE order_invoices SET status = 'canceled', canceled_at = NOW()
        WHERE nfe_key = ? AND order_id = ?`,
      [chave, pedidoId],
    );
  }

  const depois = await q.one(
    `SELECT ${COLUNAS_DA_NOTA} FROM order_invoices WHERE nfe_key = ?`,
    [chave],
  );
  jsonOk(res, { invoice: invoiceRowToApi(depois ?? {}) });
}));

/**
 * GET /api/v1/invoices/{token}.xml|.pdf — o arquivo em si.
 *
 * É a ÚNICA rota da v1 que não exige chave de API, e a exceção é o ponto do
 * desenho: quem baixa a nota é, na maior parte das vezes, o comprador, do
 * navegador dele. Três identidades servem:
 *
 *   - o ERP, pela chave de API (é quem subiu o arquivo);
 *   - o dono da loja, pela sessão do painel;
 *   - o cliente logado, e SÓ se o pedido for dele.
 *
 * O token do caminho tem 192 bits de aleatoriedade e nenhum significado: não é
 * a chave da NF-e, não é o id do pedido, não é derivado de nada. Mesmo assim
 * ele sozinho não basta — a conferência de quem está pedindo é o que protege o
 * arquivo caso a URL vaze num encaminhamento de e-mail ou num log.
 *
 * O XML tem CPF, nome e endereço do comprador. Nada disto é cacheável nem
 * indexável, e os cabeçalhos abaixo dizem isso explicitamente.
 */
v1Routes.get('/invoices/:arquivo', h(async (req, res) => {
  const m = /^([0-9a-f]{48})\.(xml|pdf)$/.exec(String(req.params.arquivo ?? ''));
  if (m === null || !tokenValido(m[1])) fail('Nota fiscal não encontrada.', 404, 'not_found');
  const token = m[1];
  const extensao = m[2] as 'xml' | 'pdf';

  const coluna = extensao === 'xml' ? 'xml_token' : 'pdf_token';
  const nota = await q.one(
    `SELECT i.nfe_key, i.number, i.series, i.status, o.customer_id
       FROM order_invoices i
       JOIN orders o ON o.id = i.order_id
      WHERE i.${coluna} = ?`,
    [token],
  );
  if (nota === null) fail('Nota fiscal não encontrada.', 404, 'not_found');

  /*
   * Quem está pedindo. A chave de API é conferida primeiro e só quando o
   * header existe — a verificação custa um bcrypt, e o comprador nunca manda
   * header nenhum.
   */
  const daIntegracao = (req.get('Authorization') ?? '') !== '' && (await currentApiKey(req)) !== null;
  const daLoja = daIntegracao || (await currentAdmin(req)) !== null;
  const clienteId = currentCustomerId(req);
  const doComprador = clienteId !== null
    && nota.customer_id !== null
    && Number(nota.customer_id) === clienteId;

  if (!daLoja && !doComprador) {
    /*
     * Sem identidade nenhuma, 401 — é quase sempre sessão expirada, e mandar
     * entrar de novo resolve. Com identidade que não é a do dono, 404: dizer
     * "existe, mas não é sua" confirmaria a existência daquela nota a quem
     * está tentando adivinhar tokens.
     */
    if (clienteId === null) {
      fail('Entre na sua conta para baixar a nota fiscal deste pedido.', 401, 'unauthenticated');
    }
    fail('Nota fiscal não encontrada.', 404, 'not_found');
  }

  if (!daLoja && String(nota.status) === 'canceled') {
    fail(
      'Esta nota fiscal foi cancelada. Se houver nota nova para este pedido, ela aparece na sua conta.',
      404,
      'not_found',
    );
  }

  const bytes = await lerArquivoDaNota(token, extensao);
  if (bytes === null) fail('O arquivo desta nota fiscal não está mais disponível.', 404, 'not_found');

  res.setHeader('X-Robots-Tag', 'noindex, nofollow, noarchive');
  res.setHeader('Cache-Control', 'no-store, private');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Type',
    extensao === 'xml' ? 'application/xml; charset=utf-8' : 'application/pdf',
  );
  /*
   * O nome oferecido no download traz número e série, e não a chave de acesso.
   * A chave não entra no caminho por contrato; mantê-la fora também do nome do
   * arquivo evita que ela acabe num log de servidor de arquivos alheio.
   */
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="nota-fiscal-${Number(nota.number) || 0}-${Number(nota.series) || 0}.${extensao}"`,
  );
  res.send(bytes);
}));

// GET /api/v1/customers
v1Routes.get('/customers', h(async (req, res) => {
  await requireApiKey(req);
  const rows = await q.all(
    `SELECT c.id, c.name, c.email, c.phone, c.created_at,
            COUNT(o.id) AS orders_count,
            COALESCE(SUM(CASE WHEN o.status <> 'canceled' THEN o.total ELSE 0 END), 0) AS total_spent
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id, c.name, c.email, c.phone, c.created_at
      ORDER BY c.created_at DESC
      LIMIT 500`,
  );
  jsonOk(res, {
    customers: rows.map((c) => ({
      id: String(c.id),
      name: c.name,
      email: c.email,
      phone: c.phone,
      ordersCount: Number(c.orders_count) || 0,
      totalSpent: Number(c.total_spent) || 0,
      createdAt: iso(c.created_at),
    })),
  });
}));
