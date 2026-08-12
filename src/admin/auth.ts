/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Autenticação do painel.
 *
 * A checagem acontece no servidor: a senha é comparada com um hash bcrypt e a
 * sessão vive num cookie httpOnly. A versão anterior comparava e-mail e senha
 * dentro do próprio JavaScript — a senha ia no bundle e qualquer pessoa que
 * abrisse /admin entrava.
 */

import { api, getSession } from '../api/client';

export interface AdminUser {
  name: string;
  email: string;
}

/** Quem está logado no painel, ou null. Consulta o servidor. */
export async function currentUser(): Promise<AdminUser | null> {
  const res = await api.get<{ admin: AdminUser | null }>('/admin/me');
  return res.admin;
}

export async function login(email: string, password: string): Promise<AdminUser> {
  const res = await api.post<{ admin: AdminUser }>('/admin/login', { email, password });
  // A sessão mudou: renova o token CSRF associado a ela.
  await getSession(true);
  return res.admin;
}

export async function logout(): Promise<void> {
  await api.post('/admin/logout');
  await getSession(true);
}
