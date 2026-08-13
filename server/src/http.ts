/**
 * Helpers de requisição/resposta — as mesmas regras da versão PHP.
 *
 * Os leitores de corpo (`bodyStr`, `bodyInt`, …) existem para que nenhuma rota
 * confie no que chegou: todo campo tem tipo esperado, valor padrão e limite de
 * tamanho. Sem isso, um cliente poderia mandar um objeto onde se espera texto,
 * ou 5 MB de string num campo de 20 caracteres.
 */

import type { Request, Response } from 'express';
import { isIP } from 'node:net';

export type Body = Record<string, any>;

export function body(req: Request): Body {
  const b = (req as Request & { body?: unknown }).body;
  return b !== null && typeof b === 'object' && !Array.isArray(b) ? (b as Body) : {};
}

/** Responde JSON com os mesmos cabeçalhos que a API PHP enviava. */
export function jsonOk(res: Response, data: unknown, status = 200): void {
  res.status(status);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // A API nunca deve ser cacheada por intermediários.
  res.setHeader('Cache-Control', 'no-store');
  res.send(JSON.stringify(data));
}

// ------------------------------------------------------------- leitores ----

export function bodyStr(b: Body, key: string, def = '', max = 500): string {
  const v = b?.[key];
  if (v === undefined || v === null) return def;
  if (typeof v === 'object') return def;
  return String(v).trim().slice(0, max);
}

export function bodyFloat(b: Body, key: string, def = 0): number {
  const v = b?.[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  return def;
}

export function bodyInt(b: Body, key: string, def = 0): number {
  const v = bodyFloat(b, key, Number.NaN);
  return Number.isFinite(v) ? Math.trunc(v) : def;
}

export function bodyBool(b: Body, key: string, def = false): boolean {
  if (!b || !Object.prototype.hasOwnProperty.call(b, key)) return def;
  const v = b[key];
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on'].includes(s)) return true;
    if (['0', 'false', 'no', 'off', ''].includes(s)) return false;
  }
  return def;
}

/** Query string como texto, com limite. */
export function queryStr(req: Request, key: string, def = '', max = 200): string {
  const v = req.query?.[key];
  if (typeof v !== 'string') return def;
  return v.trim().slice(0, max);
}

// ------------------------------------------------------------ numéricos ----

/**
 * Arredonda para 2 casas do jeito que o PHP arredonda.
 *
 * `Math.round(2.675 * 100) / 100` devolve 2.67, porque 2.675 não existe exato
 * em binário e o produto vira 267.49999999999997. O `round()` do PHP corrige a
 * representação antes de arredondar, e é isso que o `toPrecision(15)` faz aqui.
 * Um centavo de diferença entre a prévia do checkout e o valor gravado no
 * pedido é o tipo de bug que só aparece na conciliação do fim do mês.
 */
export function round2(value: number): number {
  return roundTo(value, 2);
}

export function roundTo(value: number, places: number): number {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** places;
  const scaled = Number((value * f).toPrecision(15));
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return rounded / f;
}

/**
 * Número no formato brasileiro: 1.234,56 — igual ao
 * `number_format($v, 2, ',', '.')` que as mensagens ao cliente usavam no PHP.
 */
export function brl(value: number): string {
  const [inteiro, centavos] = round2(value).toFixed(2).split('.');
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${centavos}`;
}

// ---------------------------------------------------------------- datas ----

/** Data ISO-8601 a partir de um DATETIME do MySQL (que já vem em -03:00). */
export function iso(value: unknown): string | null {
  if (!value) return null;
  const s = String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}-03:00`;
}

/** "hoje" no fuso de São Paulo, como YYYY-MM-DD. */
export function todaySP(): string {
  return dateSP(0);
}

/** Data em São Paulo, deslocada em dias, como YYYY-MM-DD. */
export function dateSP(plusDays: number): string {
  const now = new Date(Date.now() + plusDays * 86_400_000 - 3 * 3_600_000);
  return now.toISOString().slice(0, 10);
}

/** Data em São Paulo no formato brasileiro. */
export function dateBR(plusDays: number): string {
  const [y, m, d] = dateSP(plusDays).split('-');
  return `${d}/${m}/${y}`;
}

// ------------------------------------------------------------------- IP ----

/**
 * IP do cliente em binário, para a coluna VARBINARY(16) de login_attempts.
 * Equivale ao `inet_pton` do PHP; endereços IPv4 mapeados em IPv6
 * (::ffff:1.2.3.4) são normalizados para os 4 bytes do IPv4.
 */
export function clientIpBinary(req: Request): Buffer | null {
  const ip = (req.ip ?? '').replace(/^::ffff:/i, '');
  if (isIP(ip) === 4) {
    const parts = ip.split('.').map(Number);
    if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
    return Buffer.from(parts);
  }
  if (isIP(ip) === 6) {
    return ipv6ToBuffer(ip);
  }
  return null;
}

function ipv6ToBuffer(ip: string): Buffer | null {
  const [head, tail] = ip.split('::');
  const toWords = (s: string): number[] =>
    s === '' || s === undefined ? [] : s.split(':').map((h) => parseInt(h, 16));
  const left = toWords(head);
  const right = ip.includes('::') ? toWords(tail ?? '') : [];
  const fill = 8 - left.length - right.length;
  if (fill < 0) return null;
  const words = [...left, ...new Array(Math.max(0, fill)).fill(0), ...right];
  if (words.length !== 8 || words.some((w) => !Number.isInteger(w) || w < 0 || w > 0xffff)) return null;
  const buf = Buffer.alloc(16);
  words.forEach((w, i) => buf.writeUInt16BE(w, i * 2));
  return buf;
}

// ------------------------------------------------------------ validação ----

const EMAIL_RE = /^[^\s@,;:<>()[\]\\"]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;

/** Equivalente prático ao FILTER_VALIDATE_EMAIL do PHP. */
export function validEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

/** Validação de CPF com os dois dígitos verificadores. */
export function validCpf(value: string): boolean {
  const cpf = value.replace(/\D/g, '');
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += Number(cpf[i]) * (t + 1 - i);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== Number(cpf[t])) return false;
  }
  return true;
}

export function digits(value: string): string {
  return value.replace(/\D/g, '');
}
