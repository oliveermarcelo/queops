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
