/**
 * Imagens enviadas pelo painel.
 *
 * Antes disto, "Enviar imagem" transformava o arquivo numa data URL e mandava
 * no corpo do produto. A coluna `image` é VARCHAR(500): a data URL de qualquer
 * foto real tem dezenas de milhares de caracteres e era CORTADA em 500 — o
 * prefixo `data:image/...;base64,` sobrevivia, então a validação passava, o
 * produto salvava com 200 e a imagem simplesmente não aparecia. Falha
 * silenciosa e cara: quem cadastrou acha que subiu a foto.
 *
 * Agora o arquivo vira arquivo. O painel manda os bytes uma vez, o servidor
 * grava em disco e devolve uma URL curta (`/midia/xxxx.jpg`), que é o que
 * entra na coluna.
 */

import { createHash, randomBytes } from 'node:crypto';
import { existsSync, promises as fs } from 'node:fs';
import path from 'node:path';

import { config } from './config.ts';
import { isInternalHost } from './providers.ts';

/** Formatos aceitos → extensão. Raster apenas; SVG não entra (ver abaixo). */
const TIPOS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};

/**
 * Teto de 3 MB por imagem.
 *
 * Um pouco acima do limite de 2 MB que o painel aplica antes de enviar: o
 * servidor não pode confiar na checagem do navegador, e uma margem evita
 * recusar por poucos bytes um arquivo que a tela aceitou.
 */
export const TAMANHO_MAXIMO = 3 * 1024 * 1024;

export function pastaDeMidia(): string {
  return path.resolve(process.cwd(), config.midiaDir);
}

/**
 * Interpreta uma data URL de imagem.
 *
 * Devolve o problema em `erro` em vez de lançar: quem chama transforma isso em
 * 422 com mensagem legível, e um arquivo estranho não derruba a requisição.
 *
 * SVG fica de fora de propósito. É XML, pode conter script, e seria servido do
 * mesmo domínio da loja — ou seja, com acesso à sessão de quem abrisse. Para
 * foto de produto não faz falta nenhuma.
 */
/*
 * O formato do retorno segue o padrão do resto do projeto: `erro` vazio
 * significa que deu certo (como em `problemaNaSenha` e `motivoParaNaoDesativar`).
 *
 * A alternativa natural seria uma união discriminada por `ok`. Ela não serve
 * aqui: o tsconfig da raiz compila sem `strict`, e sem `strictNullChecks` o
 * TypeScript não estreita união por booleano — o mesmo arquivo passaria na
 * verificação do servidor e falharia na da raiz.
 */
export interface LeituraDeImagem {
  /** Vazio quando deu certo. */
  erro: string;
  bytes: Buffer;
  extensao: string;
}

const VAZIO = Buffer.alloc(0);
const falhaAoLer = (erro: string): LeituraDeImagem => ({ erro, bytes: VAZIO, extensao: '' });

export function lerDataUrl(dataUrl: string): LeituraDeImagem {
  const m = /^data:([a-z/+-]+);base64,(.+)$/is.exec(String(dataUrl).trim());
  if (m === null) return falhaAoLer('Envie a imagem como data URL base64.');

  const tipo = m[1].toLowerCase();
  const extensao = TIPOS[tipo];
  if (extensao === undefined) {
    return falhaAoLer(`Formato ${tipo} não é aceito. Use PNG, JPG, WEBP, AVIF ou GIF.`);
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(m[2], 'base64');
  } catch {
    return falhaAoLer('A imagem chegou corrompida.');
  }
  if (bytes.length === 0) return falhaAoLer('A imagem chegou vazia.');
  if (bytes.length > TAMANHO_MAXIMO) {
    return falhaAoLer(
      `Imagem muito grande (${Math.round(bytes.length / 1024)} KB; máximo 3 MB).`,
    );
  }

  return { erro: '', bytes, extensao };
}

/**
 * Grava a imagem e devolve a URL.
 *
 * O nome do arquivo é o hash do conteúdo. Duas consequências boas: mandar a
 * mesma foto duas vezes não duplica o arquivo, e o nome nunca colide nem
 * depende do que veio do cliente — nome de arquivo vindo de fora é caminho
 * conhecido para escrever onde não se deve.
 */
export interface ResultadoDoUpload {
  /** Vazio quando deu certo. */
  erro: string;
  url: string;
  bytes: number;
  /** Verdadeiro quando o arquivo já existia e foi reaproveitado. */
  reaproveitada: boolean;
}

export async function guardarImagem(dataUrl: string): Promise<ResultadoDoUpload> {
  const lido = lerDataUrl(dataUrl);
  if (lido.erro !== '') return { erro: lido.erro, url: '', bytes: 0, reaproveitada: false };
  return await guardarBytes(lido.bytes, lido.extensao);
}

/** Grava bytes já validados. Separado para o download e o upload compartilharem. */
export async function guardarBytes(
  bytes: Buffer,
  extensao: string,
): Promise<ResultadoDoUpload> {
  const lido = { bytes, extensao };
  const pasta = pastaDeMidia();
  await fs.mkdir(pasta, { recursive: true });

  const hash = createHash('sha256').update(lido.bytes).digest('hex').slice(0, 24);
  const nome = `${hash}.${lido.extensao}`;
  const destino = path.join(pasta, nome);

  if (existsSync(destino)) {
    return { erro: '', url: `/midia/${nome}`, bytes: lido.bytes.length, reaproveitada: true };
  }

  /*
   * Escreve num temporário e renomeia.
   *
   * `rename` no mesmo sistema de arquivos é atômico: ou o arquivo aparece
   * inteiro, ou não aparece. Sem isso, um upload interrompido no meio deixaria
   * um arquivo truncado com o nome definitivo — e como o nome é o hash do
   * conteúdo, esse arquivo quebrado seria reaproveitado para sempre.
   */
  const temporario = path.join(pasta, `.tmp-${randomBytes(8).toString('hex')}`);
  await fs.writeFile(temporario, lido.bytes);
  await fs.rename(temporario, destino);

  return { erro: '', url: `/midia/${nome}`, bytes: lido.bytes.length, reaproveitada: false };
}

/** A URL aponta para um arquivo nosso de mídia? */
export function ehUrlDeMidia(url: string): boolean {
  return /^\/midia\/[0-9a-f]{24}\.(png|jpg|webp|avif|gif)$/i.test(String(url));
}

/**
 * Apaga um arquivo de mídia que ninguém mais usa.
 *
 * Não é chamada quando uma imagem sai de um produto: o mesmo arquivo pode
 * estar em outro (o nome é o hash do conteúdo, então fotos iguais compartilham
 * o arquivo). Quem chama precisa ter conferido que não há mais referências.
 */
export async function apagarImagem(url: string): Promise<boolean> {
  if (!ehUrlDeMidia(url)) return false;
  const nome = path.basename(url);
  try {
    await fs.unlink(path.join(pastaDeMidia(), nome));
    return true;
  } catch {
    // Arquivo já não existe: o resultado desejado, então não é erro.
    return false;
  }
}

/**
 * Quais fotos o catálogo usa e o servidor não tem.
 *
 * Existe porque a falha era invisível: o banco guarda `/midia/abc.png`, o
 * arquivo some do disco, e a loja mostra um quadrado cinza. Nada no painel
 * dizia que o problema era o ARQUIVO — a conclusão natural de quem cadastrou é
 * que o upload não funciona, e a reação é subir tudo de novo.
 *
 * O caso que leva a isso é o deploy: `midia/` fica dentro da pasta da
 * aplicação, e publicar substituindo a pasta inteira leva as fotos junto. Por
 * isso a contagem fica à vista no painel, e não num comando de SSH.
 */
export interface FotosAusentes {
  /** Quantas URLs distintas de /midia o catálogo referencia. */
  referenciadas: number;
  /** Quantas delas não estão no disco. */
  ausentes: number;
  /** Algumas, para conferir à mão. */
  exemplos: string[];
  /** A pasta onde o servidor procura — é o que se muda no MIDIA_DIR. */
  pasta: string;
  /**
   * A pasta sobrevive a uma publicação?
   *
   * Falso quando ela está dentro do diretório de versão, que a hospedagem
   * descarta a cada publicação. É o que separa "estas fotos se perderam antes
   * da correção" de "estas vão se perder de novo" — duas situações que pedem
   * ações opostas, e o aviso dizia a mesma coisa nas duas.
   */
  duravel: boolean;
}

export function conferirMidia(urls: string[]): FotosAusentes {
  const pasta = pastaDeMidia();
  const distintas = [...new Set(urls.filter((u) => ehUrlDeMidia(u)))];
  const faltando: string[] = [];

  for (const url of distintas) {
    if (!existsSync(path.join(pasta, path.basename(url)))) faltando.push(url);
  }

  return {
    referenciadas: distintas.length,
    ausentes: faltando.length,
    exemplos: faltando.slice(0, 5),
    pasta,
    duravel: !/[/\\]hbuilds[/\\]versions[/\\]/.test(pasta),
  };
}

// ------------------------------------------------------------ download ----

/**
 * Baixa uma imagem de um endereço e guarda como arquivo da loja.
 *
 * Existe porque o ERP tem as fotos e a loja não: antes, mandar `image` com uma
 * URL só gravava o ENDEREÇO. Três problemas nisso, e os três apareceram:
 * a vitrine ficava refém do servidor do outro lado (se ele cair, a loja fica
 * sem foto), endereço de rede interna não funciona de fora, e nada garantia
 * que aquilo era mesmo uma imagem.
 *
 * Baixando, a foto passa a ser da loja: mesmo arquivo, mesmo cache, mesmo
 * nome por hash — e sobrevive a qualquer coisa do lado de lá.
 *
 * As travas não são opcionais. Uma URL que vem de fora e é requisitada pelo
 * servidor é a definição de SSRF: sem a checagem de host, bastaria mandar
 * `http://169.254.169.254/latest/meta-data/` para a loja buscar as credenciais
 * da própria instância.
 */
export async function baixarImagem(
  url: string,
  timeoutMs = 15_000,
): Promise<ResultadoDoUpload> {
  const falha = (erro: string): ResultadoDoUpload =>
    ({ erro, url: '', bytes: 0, reaproveitada: false });

  let parsed: URL;
  try {
    parsed = new URL(String(url ?? '').trim());
  } catch {
    return falha('Endereço de imagem inválido.');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return falha('Endereço de imagem precisa ser http ou https.');
  }
  if (await isInternalHost(parsed.hostname)) {
    return falha('Endereço interno ou reservado não é permitido.');
  }

  let res: Response;
  try {
    res = await fetch(parsed, {
      // Um host público que responde 302 para 169.254.169.254 fecharia o
      // buraco por fora; seguir redirect sozinho reabriria.
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'image/*' },
    });
  } catch (e) {
    return falha(`Não consegui baixar a imagem: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (res.status >= 300 && res.status < 400) {
    return falha('O endereço da imagem redireciona, e redirecionamento não é seguido.');
  }
  if (!res.ok) return falha(`O endereço da imagem respondeu HTTP ${res.status}.`);

  const tipo = String(res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const extensao = TIPOS[tipo];
  if (extensao === undefined) {
    return falha(`O endereço não devolveu imagem (Content-Type: ${tipo || 'ausente'}).`);
  }

  /*
   * Confere o tamanho ANTES de ler, e de novo depois.
   *
   * O cabeçalho pode mentir ou faltar; ler sem limite deixaria um arquivo de
   * gigabytes consumir a memória do servidor.
   */
  const declarado = Number(res.headers.get('content-length') ?? '0');
  if (Number.isFinite(declarado) && declarado > TAMANHO_MAXIMO) {
    return falha(`Imagem muito grande (${Math.round(declarado / 1024)} KB; máximo 3 MB).`);
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(await res.arrayBuffer());
  } catch (e) {
    return falha(`Não consegui ler a imagem: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (bytes.length === 0) return falha('A imagem veio vazia.');
  if (bytes.length > TAMANHO_MAXIMO) {
    return falha(`Imagem muito grande (${Math.round(bytes.length / 1024)} KB; máximo 3 MB).`);
  }

  return await guardarBytes(bytes, extensao);
}
