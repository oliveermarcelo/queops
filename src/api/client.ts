/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Cliente HTTP da API da loja.
 *
 * Três responsabilidades:
 *  1. mandar sempre o cookie de sessão (`credentials: 'same-origin'`);
 *  2. anexar o token CSRF em toda escrita, buscando-o quando ainda não existe;
 *  3. transformar erro da API em `ApiError` com mensagem já pronta para exibir.
 *
 * Nenhum segredo passa por aqui: senhas vão no corpo do POST e nunca são
 * guardadas, e credenciais de integração jamais chegam ao navegador.
 */

const BASE = '/api';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, status: number, code: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }

  /** 401: a sessão caiu ou nunca existiu. */
  get isUnauthenticated(): boolean {
    return this.status === 401;
  }
}

let csrfToken: string | null = null;
let sessionPromise: Promise<SessionInfo> | null = null;

export interface SessionInfo {
  csrfToken: string;
  admin: { name: string; email: string } | null;
  customer: boolean;
}

/** Busca (uma única vez) o token CSRF e quem está logado. */
export function getSession(force = false): Promise<SessionInfo> {
  if (force) {
    sessionPromise = null;
  }
  sessionPromise ??= request<SessionInfo>('GET', '/session').then((s) => {
    csrfToken = s.csrfToken;
    return s;
  });
  return sessionPromise;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  if (method !== 'GET' && method !== 'HEAD') {
    if (csrfToken === null) {
      await getSession();
    }
    if (csrfToken) {
      headers['X-CSRF-Token'] = csrfToken;
    }
  }

  let res: Response;
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      credentials: 'same-origin',
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('Sem conexão com o servidor da loja.', 0, 'network_error');
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const text = await res.text();
  let payload: unknown = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      throw new ApiError('Resposta inválida do servidor.', res.status, 'invalid_response');
    }
  }

  if (!res.ok) {
    const err = (payload as { error?: { message?: string; code?: string } } | null)?.error;
    // O token expira junto com a sessão: renova e deixa o chamador repetir.
    if (res.status === 419) {
      csrfToken = null;
      sessionPromise = null;
    }
    throw new ApiError(
      err?.message ?? 'Não foi possível concluir a operação.',
      res.status,
      err?.code ?? 'error',
    );
  }

  return payload as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};
