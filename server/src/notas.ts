/**
 * Notas fiscais (NF-e) de um pedido: guarda os arquivos, valida o conteúdo e
 * monta as URLs privadas.
 *
 * O ERP emite a nota no faturamento e manda para cá o XML processado e o
 * DANFE. Um pedido pode ter VÁRIAS notas — faturamento parcial é o caso comum
 * de quem tem estoque em mais de um lugar.
 *
 * A diferença mais importante deste módulo para `midia.ts`, que também guarda
 * arquivo enviado de fora:
 *
 *   midia/  é PÚBLICA — o `express.static` de app.ts a serve em /midia, e tem
 *           de ser assim: foto de produto aparece na vitrine para quem passa.
 *   notas/  NÃO é servida por ninguém. O XML da NF-e traz CPF, nome e endereço
 *           do comprador; um arquivo desses atrás de uma URL pública é
 *           vazamento de dado pessoal esperando um buscador passar.
 *
 * Por isso o nome do arquivo aqui NÃO é o hash do conteúdo (como em midia.ts),
 * e sim um token sorteado: hash é determinístico, e quem tivesse o XML poderia
 * calcular o nome do arquivo de qualquer outra loja com o mesmo XML. Cada
 * arquivo sai por uma rota que confere quem está pedindo.
 */

import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

import { config } from './config.ts';
import { iso } from './http.ts';

// ------------------------------------------------------------- limites ----

/** XML processado: 1 MB, como o contrato com o ERP definiu. */
export const TETO_XML = 1024 * 1024;
/** DANFE em PDF: 2 MB. */
export const TETO_PDF = 2 * 1024 * 1024;
/**
 * Teto do corpo inteiro: os dois arquivos mais a folga dos campos de texto e
 * dos cabeçalhos de cada parte do multipart.
 *
 * Existe para o 413 sair no NOSSO formato de erro, com o código
 * `file_too_large`, antes de o servidor montar na memória algo que não vai
 * usar. Sem um teto próprio, um corpo enorme só falharia lá na frente, com uma
 * mensagem genérica que não ensina nada a quem integra.
 */
export const TETO_CORPO = TETO_XML + TETO_PDF + 128 * 1024;

// -------------------------------------------------------------- pasta ----

export function pastaDeNotas(): string {
  return path.resolve(process.cwd(), config.notasDir);
}

/**
 * Token do arquivo: 24 bytes de aleatoriedade criptográfica (192 bits), bem
 * acima dos 128 exigidos.
 *
 * É o segredo inteiro: quem tem o token baixa o arquivo (se também provar
 * quem é — ver a rota). Nada previsível entra aqui, nem a chave da NF-e, nem o
 * id do pedido, nem data. Uma URL adivinhável seria o mesmo que pasta pública.
 */
export function novoToken(): string {
  return randomBytes(24).toString('hex');
}

/** O token é um token nosso, e não um caminho disfarçado? */
export function tokenValido(token: string): boolean {
  return /^[0-9a-f]{48}$/.test(String(token));
}

function caminhoDoArquivo(token: string, extensao: 'xml' | 'pdf'): string {
  return path.join(pastaDeNotas(), `${token}.${extensao}`);
}

/** Grava o arquivo da nota. O nome vem do token, nunca do que o cliente mandou. */
export async function guardarArquivoDaNota(
  token: string,
  extensao: 'xml' | 'pdf',
  bytes: Buffer,
): Promise<void> {
  const pasta = pastaDeNotas();
  await fs.mkdir(pasta, { recursive: true });
  /*
   * Escreve num temporário e renomeia — o mesmo cuidado de midia.ts.
   * `rename` no mesmo sistema de arquivos é atômico: ou o arquivo aparece
   * inteiro, ou não aparece. Um envio interrompido no meio não deixa um XML
   * truncado com o nome definitivo, que seria entregue ao comprador como se
   * fosse a nota dele.
   */
  const temporario = path.join(pasta, `.tmp-${randomBytes(8).toString('hex')}`);
  await fs.writeFile(temporario, bytes, { mode: 0o600 });
  await fs.rename(temporario, caminhoDoArquivo(token, extensao));
}

export async function lerArquivoDaNota(
  token: string,
  extensao: 'xml' | 'pdf',
): Promise<Buffer | null> {
  if (!tokenValido(token)) return null;
  try {
    return await fs.readFile(caminhoDoArquivo(token, extensao));
  } catch {
    return null;
  }
}

/**
 * Apaga o arquivo de um token que saiu de circulação.
 *
 * Chamada no reenvio de uma nota: o contrato manda gerar tokens novos e
 * remover os arquivos antigos, para que uma URL que já circulou (num e-mail,
 * num log do ERP) pare de funcionar. Não é limpeza de disco — é revogação.
 */
export async function apagarArquivoDaNota(
  token: string,
  extensao: 'xml' | 'pdf',
): Promise<boolean> {
  if (!tokenValido(token)) return false;
  try {
    await fs.unlink(caminhoDoArquivo(token, extensao));
    return true;
  } catch {
    // Já não existe: é o resultado desejado, então não é erro.
    return false;
  }
}

// ---------------------------------------------------------- validação ----

/** A chave de acesso da NF-e: 44 dígitos, sem espaço e sem máscara. */
export function chaveDeNfeValida(chave: string): boolean {
  return /^\d{44}$/.test(String(chave));
}

/**
 * O arquivo é mesmo um PDF?
 *
 * Confere a assinatura do conteúdo, não o Content-Type declarado — o cliente
 * escreve o que quiser no cabeçalho, e um `.exe` anunciado como
 * `application/pdf` entraria sem isso. Devolve o problema em texto; vazio
 * significa aceito.
 */
export function problemaNoPdf(bytes: Buffer): string {
  if (bytes.length === 0) return 'O PDF chegou vazio.';
  if (bytes.subarray(0, 5).toString('latin1') !== '%PDF-') {
    return 'O arquivo enviado em "pdf" não é um PDF (não começa com %PDF-).';
  }
  return '';
}

/**
 * O arquivo é um XML bem formado — e sem a porta de entrada do XXE?
 *
 * Duas decisões que merecem explicação:
 *
 * 1. O XML é VERIFICADO, não interpretado. O contrato pede "XML parseável com
 *    proteção contra XXE (entidades externas desabilitadas)". Node não traz
 *    parser de XML, e a loja não precisa de nenhum dado de dentro do arquivo:
 *    número, série, valor e chave vêm nos campos do formulário. Um verificador
 *    de boa-formação resolve o que o contrato quer saber — "isto é XML de
 *    verdade?" — e é imune a XXE por construção, porque não existe expansão de
 *    entidade nenhuma para ser abusada. É proteção mais forte do que
 *    desabilitar entidades num parser, porque não depende de configurar certo.
 *
 * 2. `<!DOCTYPE` e `<!ENTITY` são RECUSADOS. XXE, billion laughs e leitura de
 *    arquivo do servidor entram todos por uma declaração de entidade, e NF-e
 *    autorizada pela SEFAZ nunca tem DOCTYPE. Recusar não custa nada de
 *    legítimo e fecha a família inteira de ataques — inclusive contra o parser
 *    de quem for abrir este arquivo depois, do outro lado.
 */
export function problemaNoXml(bytes: Buffer): string {
  if (bytes.length === 0) return 'O XML chegou vazio.';

  let texto: string;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return 'O XML precisa estar em UTF-8 — a NF-e autorizada sempre está.';
  }
  // BOM: legal no arquivo, atrapalha a leitura caractere a caractere.
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);

  if (/<!\s*(DOCTYPE|ENTITY)/i.test(texto)) {
    return 'O XML declara DOCTYPE ou ENTITY. NF-e autorizada não tem declaração de entidade, '
      + 'e ela é a porta de entrada de XXE — o arquivo foi recusado.';
  }

  const problema = problemaDeFormaDoXml(texto);
  return problema === '' ? '' : `O XML não está bem formado: ${problema}.`;
}

/** Nome de elemento ou de atributo aceitável (sem os exotismos do XML 1.0). */
const NOME = /^[A-Za-z_:][A-Za-z0-9_.:-]*$/;

/**
 * Referências permitidas: as cinco predefinidas e as numéricas.
 *
 * Qualquer outra só existiria se tivesse sido DECLARADA — e declaração é
 * exatamente o que foi recusado acima. Verificar aqui também torna a recusa
 * independente da ordem em que as duas checagens acontecem.
 */
const ENTIDADE = /^(amp|lt|gt|quot|apos|#\d{1,7}|#x[0-9A-Fa-f]{1,6})$/;

function problemaNasEntidades(trecho: string): string {
  let i = trecho.indexOf('&');
  while (i >= 0) {
    const fim = trecho.indexOf(';', i + 1);
    if (fim < 0 || fim - i > 12) return `referência "&" sem ";" logo depois`;
    const nome = trecho.slice(i + 1, fim);
    if (!ENTIDADE.test(nome)) return `entidade "&${nome};" não é permitida`;
    i = trecho.indexOf('&', fim + 1);
  }
  return '';
}

/** Acha o `>` que fecha a tag, ignorando os que estiverem dentro de aspas. */
function fimDaTag(s: string, inicio: number): number {
  let aspas = '';
  for (let i = inicio; i < s.length; i++) {
    const c = s[i];
    if (aspas !== '') {
      if (c === aspas) aspas = '';
      continue;
    }
    if (c === '"' || c === "'") aspas = c;
    else if (c === '>') return i;
  }
  return -1;
}

function problemaNosAtributos(resto: string): string {
  let i = 0;
  for (;;) {
    while (i < resto.length && /\s/.test(resto[i])) i++;
    if (i >= resto.length) return '';
    const m = /^([^\s=/>]+)\s*=\s*("([^"]*)"|'([^']*)')/.exec(resto.slice(i));
    if (m === null) return `atributo malformado em "${resto.slice(i, i + 30).trim()}"`;
    if (!NOME.test(m[1])) return `nome de atributo inválido "${m[1]}"`;
    const problema = problemaNasEntidades(m[3] ?? m[4] ?? '');
    if (problema !== '') return problema;
    i += m[0].length;
  }
}

/**
 * Verificador de boa-formação: prólogo, comentários, CDATA, aninhamento de
 * elementos e um único elemento raiz.
 *
 * Não valida contra o schema da NF-e de propósito. O layout é do fisco e muda
 * por nota técnica; uma loja que recusasse XML por não reconhecer a versão do
 * leiaute passaria a barrar nota válida sempre que a SEFAZ mudasse algo — e
 * conferir leiaute é trabalho de quem emite, que é justamente quem está
 * mandando o arquivo.
 */
function problemaDeFormaDoXml(s: string): string {
  const pilha: string[] = [];
  let raizes = 0;
  let i = 0;

  const foraDaRaiz = (): boolean => pilha.length === 0;

  while (i < s.length) {
    const abre = s.indexOf('<', i);
    const texto = abre < 0 ? s.slice(i) : s.slice(i, abre);
    if (foraDaRaiz() && texto.trim() !== '') return 'há texto fora do elemento raiz';
    const problemaDeTexto = problemaNasEntidades(texto);
    if (problemaDeTexto !== '') return problemaDeTexto;
    if (abre < 0) break;

    if (s.startsWith('<!--', abre)) {
      const fim = s.indexOf('-->', abre + 4);
      if (fim < 0) return 'comentário não fechado';
      i = fim + 3;
      continue;
    }
    if (s.startsWith('<![CDATA[', abre)) {
      if (foraDaRaiz()) return 'CDATA fora do elemento raiz';
      const fim = s.indexOf(']]>', abre + 9);
      if (fim < 0) return 'CDATA não fechado';
      i = fim + 3;
      continue;
    }
    if (s.startsWith('<?', abre)) {
      const fim = s.indexOf('?>', abre + 2);
      if (fim < 0) return 'declaração <? ... ?> não fechada';
      i = fim + 2;
      continue;
    }
    if (s.startsWith('<!', abre)) {
      return 'declaração <! ... > não é aceita';
    }

    const fecha = fimDaTag(s, abre + 1);
    if (fecha < 0) return 'tag não fechada';
    const bruto = s.slice(abre + 1, fecha);
    i = fecha + 1;

    if (bruto.startsWith('/')) {
      const nome = bruto.slice(1).trim();
      if (!NOME.test(nome)) return `nome de elemento inválido "${nome}"`;
      if (pilha.pop() !== nome) return `</${nome}> não fecha o elemento aberto`;
      continue;
    }

    const proprio = bruto.endsWith('/');
    const miolo = proprio ? bruto.slice(0, -1) : bruto;
    const m = /^([^\s/>]+)([\s\S]*)$/.exec(miolo.trim());
    if (m === null) return 'tag vazia';
    if (!NOME.test(m[1])) return `nome de elemento inválido "${m[1]}"`;
    const problemaDeAtributo = problemaNosAtributos(m[2]);
    if (problemaDeAtributo !== '') return problemaDeAtributo;

    if (foraDaRaiz()) raizes++;
    if (!proprio) pilha.push(m[1]);
  }

  if (pilha.length > 0) return `o elemento <${pilha[pilha.length - 1]}> ficou aberto`;
  if (raizes === 0) return 'não há elemento nenhum';
  if (raizes > 1) return 'há mais de um elemento raiz';
  return '';
}

// ------------------------------------------------------------- saída ----

/**
 * Converte a linha do banco no objeto que a API publica.
 *
 * `totalAmount` sai como STRING, e é de propósito. O pool roda com
 * `decimalNumbers: true` — DECIMAL volta como número de ponto flutuante, e
 * 1234.56 em binário não é 1234.56. Para valor de nota fiscal isso não serve:
 * o número tem de bater com o que está no XML, centavo a centavo, para a
 * conciliação fechar. Quem lê no banco usa `CAST(total_amount AS CHAR)` e
 * entrega os dígitos exatos.
 */
export function invoiceRowToApi(r: Record<string, any>): Record<string, unknown> {
  const token = (t: unknown, ext: string): string =>
    `${config.appUrl.replace(/\/+$/, '')}/api/v1/invoices/${String(t)}.${ext}`;
  return {
    key: String(r.nfe_key ?? ''),
    number: Number(r.number) || 0,
    series: Number(r.series) || 0,
    issuedAt: iso(r.issued_at),
    /** Texto, não número — ver o comentário acima. */
    totalAmount: String(r.total_amount_txt ?? r.total_amount ?? '0'),
    status: String(r.status ?? 'authorized'),
    xmlUrl: token(r.xml_token, 'xml'),
    pdfUrl: token(r.pdf_token, 'pdf'),
  };
}

/**
 * As colunas que `invoiceRowToApi` espera, com o valor exato do DECIMAL.
 *
 * Fica aqui para que nenhuma consulta esqueça o CAST — esquecer não quebra
 * nada visível, só troca o valor da nota por uma aproximação binária dele.
 */
export const COLUNAS_DA_NOTA =
  'nfe_key, order_id, number, series, issued_at, status, xml_token, pdf_token, '
  + 'CAST(total_amount AS CHAR) AS total_amount_txt';
