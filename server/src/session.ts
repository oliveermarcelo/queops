/**
 * Sessão em cookie httpOnly, com o estado guardado no MySQL.
 *
 * Por que no banco e não em memória: a aplicação Node da Hostinger é reiniciada
 * a cada deploy e pode rodar em mais de um processo. Sessão em memória faria
 * todo mundo ser deslogado no meio do trabalho — e, com dois processos, o login
 * "sumiria" a cada requisição que caísse no outro.
 *
 * O contrato com o navegador é o MESMO da versão PHP:
 *   cookie `qp_session`, httpOnly, SameSite=Lax, Secure em produção, sem
 *   validade (expira ao fechar o navegador).
 *
 * Duas identidades independentes convivem na mesma sessão:
 *   adminId    → painel administrativo
 *   customerId → área do cliente na loja
 * Entrar como cliente nunca concede acesso ao painel, e vice-versa.
 */

import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';

import { config } from './config.ts';
import { q } from './db.ts';

export const COOKIE_NAME = 'qp_session';

/** Regenera o identificador a cada 30 minutos (reduz a janela de fixation). */
const ROTATE_AFTER_MS = 30 * 60 * 1000;

/** Sessão parada por mais de 14 dias é recolhida pela limpeza. */
const GC_DAYS = 14;

export interface SessionData {
  adminId?: number;
  customerId?: number;
  csrf?: string;
  createdAt?: number;
}

function newId(): string {
  return randomBytes(32).toString('hex');
}

export class Session {
  id: string | null = null;
  data: SessionData = {};
  /** Campo declarado à mão (e não como parâmetro do construtor) porque o Node
   *  roda estes arquivos apagando só os tipos, sem transformar parâmetros. */
  private readonly res: Response;

  constructor(res: Response) {
    this.res = res;
  }

  private setCookie(id: string): void {
    this.res.cookie(COOKIE_NAME, id, {
      path: '/',
      httpOnly: true, // inacessível a JavaScript → imune a roubo por XSS
      secure: config.secureCookies, // só trafega em HTTPS
      sameSite: 'lax', // barra envio em requisições cross-site
      // sem maxAge/expires: cookie de sessão, morre ao fechar o navegador
    });
  }

  private clearCookie(): void {
    this.res.clearCookie(COOKIE_NAME, {
      path: '/',
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: 'lax',
    });
  }

  /** Carrega a sessão apontada pelo cookie, se ela existir. */
  async load(cookieId: string | undefined): Promise<void> {
    if (!cookieId || !/^[0-9a-f]{64}$/.test(cookieId)) return;
    const row = await q.one('SELECT payload FROM sessions WHERE id = ?', [cookieId]);
    if (row === null) return; // cookie de sessão já expirada: começa em branco
    this.id = cookieId;
    try {
      const parsed = JSON.parse(String(row.payload));
      if (parsed && typeof parsed === 'object') this.data = parsed as SessionData;
    } catch {
      this.data = {};
    }
    // Rotação periódica do identificador.
    if (Date.now() - (this.data.createdAt ?? 0) > ROTATE_AFTER_MS) {
      await this.regenerate();
    }
  }

  /** Grava o estado atual, criando a sessão (e o cookie) se ainda não existir. */
  async save(): Promise<void> {
    if (this.id === null) {
      this.id = newId();
      this.data.createdAt ??= Date.now();
      this.setCookie(this.id);
    }
    await q.run(
      `INSERT INTO sessions (id, payload) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = NOW()`,
      [this.id, JSON.stringify(this.data)],
    );
    // Limpeza barata e sem cron: uma requisição em cada 200 recolhe o lixo.
    if (Math.random() < 0.005) {
      await q
        .run(`DELETE FROM sessions WHERE updated_at < (NOW() - INTERVAL ${GC_DAYS} DAY)`)
        .catch(() => 0);
    }
  }

  /**
   * Troca o identificador preservando os dados — chamado em todo login e
   * logout, para que um id capturado antes da autenticação não sirva depois.
   */
  async regenerate(): Promise<void> {
    const antigo = this.id;
    this.id = newId();
    this.data.createdAt = Date.now();
    this.setCookie(this.id);
    await q.run(
      `INSERT INTO sessions (id, payload) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = NOW()`,
      [this.id, JSON.stringify(this.data)],
    );
    if (antigo) await q.run('DELETE FROM sessions WHERE id = ?', [antigo]);
  }

  /** Apaga a sessão inteira e o cookie. */
  async destroy(): Promise<void> {
    if (this.id) await q.run('DELETE FROM sessions WHERE id = ?', [this.id]);
    this.id = null;
    this.data = {};
    this.clearCookie();
  }
}

/** Cookies da requisição, sem depender de cookie-parser. */
export function parseCookies(req: Request): Record<string, string> {
  const header = req.headers.cookie;
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name !== '') {
      try {
        out[name] = decodeURIComponent(value);
      } catch {
        out[name] = value;
      }
    }
  }
  return out;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      qp: Session;
    }
  }
}

/** Middleware: anexa `req.qp` já carregada. */
export async function sessionMiddleware(req: Request, res: Response, next: (e?: unknown) => void): Promise<void> {
  const s = new Session(res);
  req.qp = s;
  try {
    await s.load(parseCookies(req)[COOKIE_NAME]);
    next();
  } catch (e) {
    next(e);
  }
}
