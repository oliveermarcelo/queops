/**
 * Recebe produto do ERP — o outro lado da API v1.
 *
 * O ERP manda o produto no MESMO formato em que a loja o devolve
 * (`GET /api/v1/products`), o que evita duas linguagens para a mesma coisa: o
 * time do ERP lê um item, muda o preço e devolve o mesmo objeto.
 *
 * Três regras governam a gravação, e as três existem por um motivo específico:
 *
 *   1. CAMPO TRAVADO NÃO É SOBRESCRITO. Quando alguém edita preço ou estoque no
 *      painel, aquele campo entra em `locked_fields` e passa a ignorar o ERP. É
 *      o que concilia "o ERP é a fonte da verdade" com "o painel precisa ter
 *      autonomia": sem isso, a correção feita à mão volta sozinha no próximo
 *      ciclo e a conclusão de quem cuida da loja é "o site está com defeito".
 *
 *   2. A RESPOSTA DIZ O QUE FOI APLICADO E O QUE FOI IGNORADO. Recusar a
 *      requisição inteira por causa de um campo travado faria o ERP repetir
 *      para sempre um envio que nunca vai passar; responder 200 mudo faria ele
 *      acreditar que aplicou. Aceitar o que dá e relatar o resto é a única
 *      saída que deixa os dois lados sabendo o que aconteceu.
 *
 *   3. CAMPO DESCONHECIDO VIRA AVISO, NÃO ERRO. Um `preco` no lugar de `price`
 *      seria aceito em silêncio e o preço nunca mudaria — defeito caro e
 *      invisível. O aviso aparece na resposta, e a gravação continua.
 */

import { q, type Q, type Row } from './db.ts';
import { round2 } from './http.ts';
import { pesoEmGramas } from './pricing.ts';
import { safeImageUrl } from './routes/admin.ts';

/** Campos que o ERP pode gravar → coluna correspondente. */
const CAMPOS: Record<string, string> = {
  sku: 'sku',
  name: 'name',
  category: 'category',
  subcategory: 'subcategory',
  categoryLabel: 'category_label',
  description: 'description',
  longDescription: 'long_description',
  price: 'price',
  oldPrice: 'old_price',
  stock: 'stock',
  image: 'image',
  weight: 'weight',
  tag: 'tag',
  ingredients: 'ingredients',
  highlight: 'highlight',
  active: 'active',
};

/** Campos aceitos no corpo que não são coluna de produto. */
const EXTRAS = new Set(['id']);

export interface ResultadoGravacao {
  id: string;
  ok: boolean;
  /** Verdadeiro quando o produto não existia e foi criado agora. */
  criado: boolean;
  /** Campos gravados. */
  applied: string[];
  /** Campos recusados, com o motivo — hoje só `locked_in_panel`. */
  ignored: { field: string; reason: string }[];
  /** Problemas que não impedem a gravação, mas que o ERP precisa saber. */
  warnings: string[];
  /** Preenchido quando nada foi gravado. */
  error?: { code: string; message: string };
}

export function camposTravados(row: Row | null): string[] {
  const bruto = String(row?.locked_fields ?? '');
  return bruto.split(',').map((x) => x.trim()).filter((x) => x !== '');
}

/** Texto para a coluna, sem duplicatas e em ordem estável. */
export function serializarTravas(campos: Iterable<string>): string {
  return [...new Set([...campos].filter((c) => c in CAMPOS))].sort().join(',').slice(0, 255);
}

interface Convertido {
  valor: unknown;
  erro?: string;
  aviso?: string;
}

/** Converte e valida um campo do DTO para o formato da coluna. */
function converter(campo: string, valor: unknown): Convertido {
  const texto = (max: number): Convertido => ({ valor: String(valor ?? '').slice(0, max) });

  switch (campo) {
    case 'name': {
      const n = String(valor ?? '').trim().slice(0, 255);
      if (n === '') return { valor: null, erro: 'name não pode ser vazio' };
      return { valor: n };
    }
    case 'price':
    case 'oldPrice': {
      const n = Number(valor);
      if (!Number.isFinite(n) || n < 0) {
        return { valor: null, erro: `${campo} precisa ser um número maior ou igual a zero` };
      }
      // oldPrice zero significa "sem preço de" — a coluna aceita nulo.
      if (campo === 'oldPrice' && n === 0) return { valor: null };
      return { valor: round2(n) };
    }
    case 'stock': {
      const n = Number(valor);
      if (!Number.isInteger(n) || n < 0) {
        return { valor: null, erro: 'stock precisa ser um inteiro maior ou igual a zero' };
      }
      return { valor: n };
    }
    case 'image': {
      const url = String(valor ?? '').slice(0, 500);
      if (url !== '' && !safeImageUrl(url)) {
        return { valor: null, erro: 'image não é um endereço de imagem aceito' };
      }
      return { valor: url };
    }
    case 'weight': {
      const bruto = String(valor ?? '').slice(0, 120);
      if (bruto.trim() === '') return { valor: '' };
      /*
       * O peso alimenta a cotação de frete. Texto que a loja não consegue
       * interpretar cai no peso padrão, e frete calculado com peso errado é
       * prejuízo silencioso — ninguém reclama de frete barato demais.
       */
      const gramas = pesoEmGramas(bruto, -1);
      if (gramas <= 0) {
        return {
          valor: bruto,
          aviso: `weight "${bruto}" não foi reconhecido como peso; o frete vai usar o padrão. `
            + 'Use "1,2 kg" ou "800 g".',
        };
      }
      return { valor: bruto };
    }
    case 'highlight':
    case 'active':
      return { valor: valor === true || valor === 1 || valor === '1' || valor === 'true' ? 1 : 0 };
    case 'subcategory':
    case 'tag': {
      const t = String(valor ?? '').trim().slice(0, 100);
      return { valor: t === '' ? null : t };
    }
    case 'sku':
      return texto(64);
    case 'category':
      return texto(100);
    case 'categoryLabel':
      return texto(120);
    case 'description':
    case 'ingredients':
      return texto(2000);
    case 'longDescription':
      return texto(20000);
    default:
      return { valor: null, erro: 'campo não gravável' };
  }
}

/**
 * Grava (cria ou atualiza) um produto vindo do ERP.
 *
 * `id` identifica o produto — é a mesma chave devolvida na leitura. Só os
 * campos presentes no corpo são tocados: mandar `{ "price": 10 }` muda o preço
 * e não zera o resto, o que permite ao ERP enviar apenas o que ele controla.
 */
export async function gravarProdutoDoErp(
  id: string,
  dto: Record<string, unknown>,
  exec: Q = q,
): Promise<ResultadoGravacao> {
  const resultado: ResultadoGravacao = {
    id, ok: false, criado: false, applied: [], ignored: [], warnings: [],
  };

  if (id === '' || id.length > 100) {
    resultado.error = { code: 'invalid_id', message: 'Informe um id de até 100 caracteres.' };
    return resultado;
  }

  const atual = await exec.one('SELECT * FROM products WHERE id = ?', [id]);
  const travados = new Set(camposTravados(atual));
  const criando = atual === null;

  const colunas: string[] = [];
  const valores: unknown[] = [];

  for (const [campo, valor] of Object.entries(dto)) {
    if (EXTRAS.has(campo)) continue;
    if (!(campo in CAMPOS)) {
      resultado.warnings.push(`campo "${campo}" não é gravável e foi ignorado`);
      continue;
    }
    if (travados.has(campo)) {
      resultado.ignored.push({ field: campo, reason: 'locked_in_panel' });
      continue;
    }
    const { valor: convertido, erro, aviso } = converter(campo, valor);
    if (erro !== undefined) {
      resultado.error = { code: 'invalid_field', message: erro };
      return resultado;
    }
    if (aviso !== undefined) resultado.warnings.push(aviso);
    colunas.push(CAMPOS[campo]);
    valores.push(convertido);
    resultado.applied.push(campo);
  }

  if (criando && !resultado.applied.includes('name')) {
    resultado.error = {
      code: 'missing_name',
      message: 'Produto novo precisa de "name". Para atualizar um existente, confira o id.',
    };
    return resultado;
  }

  if (colunas.length === 0) {
    // Nada a gravar não é erro: pode ser um ciclo em que tudo estava travado.
    resultado.ok = true;
    return resultado;
  }

  if (criando) {
    await exec.run(
      `INSERT INTO products (id, ${colunas.join(', ')}) VALUES (?${', ?'.repeat(colunas.length)})`,
      [id, ...valores],
    );
    resultado.criado = true;
  } else {
    await exec.run(
      `UPDATE products SET ${colunas.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`,
      [...valores, id],
    );
  }

  /*
   * Categoria que não existe na loja não impede a gravação, mas o produto não
   * aparece em menu nenhum — fica só na busca. Avisar é o que evita a pergunta
   * "cadastrei e não apareceu".
   */
  const categoria = String(dto.category ?? (atual?.category ?? ''));
  if (categoria !== '') {
    const existe = await exec.one('SELECT id FROM categories WHERE id = ?', [categoria]);
    if (existe === null) {
      resultado.warnings.push(
        `a categoria "${categoria}" não existe na loja: o produto não vai aparecer no menu. `
        + 'Cadastre a categoria no painel ou use uma existente.',
      );
    }
  }

  resultado.ok = true;
  return resultado;
}

/**
 * Marca como travados os campos que uma edição do painel mudou de fato.
 *
 * Chamado quando a lojista salva um produto: o que ela ajustou passa a resistir
 * ao ERP. Comparação por valor, e não "veio no corpo": o painel envia o produto
 * inteiro a cada salvamento, então tratar tudo como edição travaria o cadastro
 * completo no primeiro clique — e o ERP nunca mais atualizaria nada.
 */
export async function travarCamposEditados(
  id: string,
  dto: Record<string, unknown>,
  antes: Row | null,
  exec: Q = q,
): Promise<string[]> {
  if (antes === null) return [];

  const mudados: string[] = [];
  for (const [campo, valor] of Object.entries(dto)) {
    if (!(campo in CAMPOS)) continue;
    const { valor: convertido, erro } = converter(campo, valor);
    if (erro !== undefined) continue;
    const anterior = antes[CAMPOS[campo]];
    const iguais = convertido === null || anterior === null
      ? convertido === anterior || (convertido === null && anterior === null)
      : String(Number.isFinite(Number(anterior)) && typeof convertido === 'number'
        ? Number(anterior)
        : anterior) === String(convertido);
    if (!iguais) mudados.push(campo);
  }
  if (mudados.length === 0) return camposTravados(antes);

  const todos = serializarTravas([...camposTravados(antes), ...mudados]);
  await exec.run('UPDATE products SET locked_fields = ? WHERE id = ?', [todos, id]);
  return todos.split(',').filter((x) => x !== '');
}

/** Solta as travas de um produto: ele volta a seguir o ERP. */
export async function destravarCampos(
  id: string,
  campos: string[] | null,
  exec: Q = q,
): Promise<string[]> {
  const atual = await exec.one('SELECT locked_fields FROM products WHERE id = ?', [id]);
  if (atual === null) return [];
  const restantes = campos === null
    ? []
    : camposTravados(atual).filter((c) => !campos.includes(c));
  await exec.run('UPDATE products SET locked_fields = ? WHERE id = ?', [
    serializarTravas(restantes), id,
  ]);
  return restantes;
}
