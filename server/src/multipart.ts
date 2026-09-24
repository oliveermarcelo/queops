/**
 * Leitura de `multipart/form-data` — o formato em que arquivo sobe de verdade.
 *
 * O resto da API fala JSON, e por um bom motivo: é tudo texto curto. Arquivo
 * binário em JSON só existe em base64, que incha 33% e obriga o servidor a
 * montar a string inteira na memória antes de decodificar. Para o XML e o
 * DANFE da NF-e isso seria pagar caro por nada — e foi por isso que o contrato
 * com o ERP pediu multipart explicitamente.
 *
 * Não entra dependência para isso. `busboy`/`multer` resolvem um problema bem
 * maior do que o nosso (vários arquivos, streaming para disco, campos
 * repetidos); aqui são dois arquivos pequenos, com teto conhecido, num endpoint
 * só. O que este módulo faz é o mínimo do RFC 7578 que esse caso exige — e o
 * mínimo é auditável numa sentada, o que para código que recebe bytes de fora
 * vale mais do que ser genérico.
 *
 * O `express.json()` montado em app.ts NÃO consome esta requisição: ele olha o
 * Content-Type e devolve o controle quando não é JSON. O corpo chega aqui
 * intacto.
 */

import type { Request } from 'express';

/** Um arquivo que veio no formulário. */
export interface ArquivoEnviado {
  /** Nome do campo (`xml`, `pdf`). */
  campo: string;
  /** Nome que o cliente deu ao arquivo. Nunca usado para gravar em disco. */
  nomeDoArquivo: string;
  /** Content-Type declarado pelo cliente — conferido, nunca confiado. */
  tipo: string;
  bytes: Buffer;
}

/*
 * O resultado segue o padrão do projeto: `erro` vazio significa que deu certo
 * (como em `lerDataUrl`, `problemaNaSenha`, `motivoParaNaoDesativar`). União
 * discriminada por booleano não serve aqui — o tsconfig da raiz compila sem
 * `strict`, e sem `strictNullChecks` o TypeScript não estreita união por
 * booleano: o mesmo arquivo passaria na verificação do servidor e falharia na
 * da raiz.
 */
export interface FormularioMultipart {
  /** Vazio quando deu certo. */
  erro: string;
  /** Código de erro da API, quando `erro` não é vazio. */
  codigo: string;
  /** Status HTTP a devolver, quando `erro` não é vazio. */
  status: number;
  campos: Record<string, string>;
  arquivos: Record<string, ArquivoEnviado>;
}

const SEM_ARQUIVOS: Record<string, ArquivoEnviado> = {};

function falha(erro: string, status: number, codigo: string): FormularioMultipart {
  return { erro, status, codigo, campos: {}, arquivos: SEM_ARQUIVOS };
}

/**
 * Teto absoluto de leitura, muito acima do teto real do endpoint.
 *
 * Existe para o caso em que alguém manda um corpo gigante: até este ponto os
 * bytes são lidos e DESCARTADOS, só para a requisição terminar direito e o
 * cliente receber o nosso 413 em vez de uma conexão cortada no meio — um erro
 * de rede genérico não diz a quem integra que o arquivo passou do tamanho.
 * Acima daqui, a conexão cai mesmo: aí não é mais engano de tamanho.
 */
const TETO_ABSOLUTO = 25 * 1024 * 1024;

/** Limites de forma, para um corpo malformado não virar trabalho infinito. */
const MAXIMO_DE_PARTES = 20;
const MAXIMO_DE_CABECALHO = 4 * 1024;

/**
 * Lê o corpo inteiro na memória, com teto.
 *
 * Fica na memória de propósito: os arquivos desta rota somam no máximo 3 MB e
 * precisam ser inspecionados por inteiro (o XML é validado, o PDF tem a
 * assinatura conferida) antes de qualquer gravação. Escrever em disco primeiro
 * para depois ler de volta só adicionaria um arquivo temporário para limpar.
 */
async function lerCorpo(req: Request, maximo: number): Promise<{ erro: string; bytes: Buffer }> {
  /*
   * O Content-Length é conferido ANTES de ler um byte.
   *
   * É o caminho barato e o mais comum: um DANFE de 8 MB é recusado na hora,
   * sem o servidor carregar 8 MB para descobrir o que o cabeçalho já dizia.
   */
  const declarado = Number(req.get('Content-Length') ?? '');
  if (Number.isFinite(declarado) && declarado > TETO_ABSOLUTO) {
    return { erro: 'Corpo grande demais.', bytes: Buffer.alloc(0) };
  }

  return await new Promise((resolve) => {
    const pedacos: Buffer[] = [];
    let total = 0;
    let estourou = false;

    req.on('data', (pedaco: Buffer) => {
      total += pedaco.length;
      if (total > TETO_ABSOLUTO) {
        estourou = true;
        req.destroy();
        return;
      }
      // Acima do teto do endpoint, continua lendo mas não guarda: o objetivo
      // passa a ser só terminar a requisição para poder responder 413.
      if (total <= maximo) pedacos.push(pedaco);
      else estourou = true;
    });
    req.on('end', () => {
      resolve(estourou
        ? { erro: 'Corpo grande demais.', bytes: Buffer.alloc(0) }
        : { erro: '', bytes: Buffer.concat(pedacos) });
    });
    req.on('error', () => {
      resolve({ erro: 'A requisição foi interrompida antes de terminar.', bytes: Buffer.alloc(0) });
    });
  });
}

/** Extrai o boundary do Content-Type, aceitando a forma entre aspas. */
function boundaryDe(contentType: string): string {
  const m = /;\s*boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  if (m === null) return '';
  return (m[1] ?? m[2] ?? '').trim();
}

/** `name="xml"` e `filename="nota.xml"` do Content-Disposition. */
function atributoDoCabecalho(linha: string, nome: string): string {
  const re = new RegExp(`;\\s*${nome}\\s*=\\s*(?:"([^"]*)"|([^;\\s]+))`, 'i');
  const m = re.exec(linha);
  if (m === null) return '';
  return (m[1] ?? m[2] ?? '').trim();
}

/**
 * Lê e interpreta um corpo multipart/form-data.
 *
 * `maximoDoCorpo` é o teto do endpoint: acima dele o retorno vem com 413 e o
 * código `file_too_large`, que é o que o contrato do ERP espera — e não o erro
 * genérico que um limite de framework produziria.
 */
export async function lerMultipart(
  req: Request,
  maximoDoCorpo: number,
): Promise<FormularioMultipart> {
  const contentType = req.get('Content-Type') ?? '';
  if (!/^multipart\/form-data\b/i.test(contentType)) {
    return falha(
      'Envie os arquivos como multipart/form-data.',
      415,
      'unsupported_media_type',
    );
  }

  const boundary = boundaryDe(contentType);
  if (boundary === '') {
    return falha(
      'O cabeçalho Content-Type veio sem boundary — o corpo multipart não pode ser lido.',
      422,
      'invalid_multipart',
    );
  }

  const lido = await lerCorpo(req, maximoDoCorpo);
  if (lido.erro !== '') {
    /*
     * Corpo acima do teto vira 413 `file_too_large`, e não um erro de leitura.
     *
     * É a única conclusão possível quando a soma passa do teto: os dois
     * arquivos são a quase totalidade do corpo. Dizer "erro ao ler" mandaria o
     * ERP tentar de novo para sempre com o mesmo arquivo grande.
     */
    return falha(
      `Corpo da requisição grande demais (máximo de ${Math.round(maximoDoCorpo / 1024)} KB no total).`,
      413,
      'file_too_large',
    );
  }

  const separador = Buffer.from(`\r\n--${boundary}`);
  // O `\r\n` da frente faz o primeiro boundary ter a mesma forma dos outros.
  const corpo = Buffer.concat([Buffer.from('\r\n'), lido.bytes]);

  let posicao = corpo.indexOf(separador);
  if (posicao < 0) {
    return falha('Corpo multipart malformado: boundary não encontrado.', 422, 'invalid_multipart');
  }

  const campos: Record<string, string> = {};
  const arquivos: Record<string, ArquivoEnviado> = {};
  let partes = 0;

  for (;;) {
    let p = posicao + separador.length;

    // `--` logo depois do boundary é o fim do formulário.
    if (corpo[p] === 0x2d && corpo[p + 1] === 0x2d) break;

    // Espaço de transporte, tolerado pelo RFC, e o CRLF obrigatório.
    while (corpo[p] === 0x20 || corpo[p] === 0x09) p++;
    if (!(corpo[p] === 0x0d && corpo[p + 1] === 0x0a)) {
      return falha('Corpo multipart malformado.', 422, 'invalid_multipart');
    }
    p += 2;

    const fim = corpo.indexOf(separador, p);
    if (fim < 0) {
      return falha(
        'Corpo multipart incompleto — o envio terminou antes do boundary final.',
        422,
        'invalid_multipart',
      );
    }

    if (++partes > MAXIMO_DE_PARTES) {
      return falha('Formulário com partes demais.', 422, 'invalid_multipart');
    }

    const parte = corpo.subarray(p, fim);
    const corte = parte.indexOf('\r\n\r\n');
    if (corte < 0 || corte > MAXIMO_DE_CABECALHO) {
      return falha('Parte do formulário sem cabeçalho válido.', 422, 'invalid_multipart');
    }

    const cabecalho = parte.subarray(0, corte).toString('utf8');
    const conteudo = parte.subarray(corte + 4);

    let disposition = '';
    let tipo = '';
    for (const linha of cabecalho.split('\r\n')) {
      if (/^content-disposition\s*:/i.test(linha)) disposition = linha;
      else if (/^content-type\s*:/i.test(linha)) tipo = linha.split(':').slice(1).join(':').trim();
    }

    const nome = atributoDoCabecalho(disposition, 'name');
    if (nome === '') {
      return falha('Parte do formulário sem nome de campo.', 422, 'invalid_multipart');
    }

    /*
     * Ter `filename` é o que separa arquivo de campo de texto.
     *
     * O nome em si é guardado só para aparecer em mensagem de erro: quem grava
     * em disco é o módulo das notas, com um nome que ele mesmo sorteia. Nome de
     * arquivo vindo de fora é caminho conhecido para escrever onde não se deve.
     */
    const nomeDoArquivo = atributoDoCabecalho(disposition, 'filename');
    if (nomeDoArquivo === '' && !/;\s*filename\s*=/i.test(disposition)) {
      campos[nome] = conteudo.toString('utf8').trim().slice(0, 500);
    } else {
      arquivos[nome] = {
        campo: nome,
        nomeDoArquivo: nomeDoArquivo.slice(0, 200),
        tipo: tipo.split(';')[0].trim().toLowerCase(),
        bytes: conteudo,
      };
    }

    posicao = fim;
  }

  return { erro: '', codigo: '', status: 200, campos, arquivos };
}
