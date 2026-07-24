/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mock auth for the admin area. Credentials are checked client-side only —
 * replace with a real backend session before production.
 */

const SESSION_KEY = 'km_admin_session';

// Demo credentials (clearly not for production).
const DEMO_USER = 'admin@queopspiramides.com.br';
const DEMO_PASS = 'admin123';

export function login(email: string, password: string): boolean {
  if (email.trim().toLowerCase() === DEMO_USER && password === DEMO_PASS) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ email, at: Date.now() }));
    return true;
  }
  return false;
}

export function logout(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function isAuthenticated(): boolean {
  return !!sessionStorage.getItem(SESSION_KEY);
}

export function currentUser(): string | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw).email as string) : null;
  } catch {
    return null;
  }
}

export const DEMO_CREDENTIALS = { user: DEMO_USER, pass: DEMO_PASS };
