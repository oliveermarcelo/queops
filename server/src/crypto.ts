/**
 * Cifragem simétrica das credenciais de integração (AES-256-GCM).
 *
 * Motivo: tokens de ERP, Z-API, Mercado Pago e afins são segredos de terceiros.
 * Guardá-los em texto puro significa que qualquer leitura indevida do banco
 * (backup vazado, injeção de SQL em outro sistema, acesso ao phpMyAdmin)
 * entrega as chaves da operação inteira. Com GCM ganhamos também autenticação:
 * um registro adulterado falha ao decifrar em vez de devolver lixo silencioso.
 *
 * O formato do blob é o MESMO da versão PHP — "v1.<iv>.<tag>.<payload>", tudo
 * em base64 — então as credenciais já salvas continuam legíveis depois da
 * troca de runtime, desde que a APP_KEY seja a mesma.
 */

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'node:crypto';

import { config } from './config.ts';
import { fail } from './errors.ts';

const CIPHER = 'aes-256-gcm';

let cached: Buffer | null = null;

export function appKey(): Buffer {
  if (cached) return cached;
  if (!config.appKey) {
    fail(
      'APP_KEY não configurada. Gere com: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'base64\'))"',
      500,
      'missing_app_key',
    );
  }
  const key = Buffer.from(config.appKey, 'base64');
  if (key.length !== 32) {
    fail('APP_KEY inválida: precisa ser 32 bytes em base64.', 500, 'invalid_app_key');
  }
  return (cached = key);
}

/** Cifra um objeto. Devolve "v1.<iv>.<tag>.<payload>" em base64. */
export function encryptPayload(data: Record<string, unknown>): string {
  const iv = randomBytes(12); // tamanho recomendado para GCM
  const c = createCipheriv(CIPHER, appKey(), iv);
  const body = Buffer.concat([c.update(JSON.stringify(data), 'utf8'), c.final()]);
  const tag = c.getAuthTag();
  return `v1.${iv.toString('base64')}.${tag.toString('base64')}.${body.toString('base64')}`;
}

/** Decifra o formato acima. Devolve {} se o dado estiver ausente ou corrompido. */
export function decryptPayload(blob: unknown): Record<string, unknown> {
  if (typeof blob !== 'string' || blob === '') return {};
  const parts = blob.split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') return {};
  try {
    const iv = Buffer.from(parts[1], 'base64');
    const tag = Buffer.from(parts[2], 'base64');
    const body = Buffer.from(parts[3], 'base64');
    if (iv.length !== 12 || tag.length !== 16) return {};
    const d = createDecipheriv(CIPHER, appKey(), iv);
    d.setAuthTag(tag);
    const plain = Buffer.concat([d.update(body), d.final()]).toString('utf8');
    const parsed = JSON.parse(plain);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.error('[queops] payload de integração não pôde ser decifrado (chave trocada?)');
    return {};
  }
}

/** Comparação de strings em tempo constante — para tokens e CSRF. */
export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a, 'utf8');
  const bb = Buffer.from(b, 'utf8');
  if (ba.length !== bb.length || ba.length === 0) return false;
  return timingSafeEqual(ba, bb);
}
