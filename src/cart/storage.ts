/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Persistência da sacola.
 *
 * O carrinho antes vivia só em `useState`, começava com dois itens fixos do
 * mockup e sumia a cada F5. Aqui guardamos apenas `{id, quantidade}` — nunca o
 * preço: o valor é sempre recalculado pelo servidor, então mexer no
 * localStorage não muda quanto se paga.
 */

const KEY = 'queops_cart_v1';

export interface StoredCartLine {
  id: string;
  qty: number;
}

export function loadCart(): StoredCartLine[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (l): l is StoredCartLine =>
          !!l && typeof (l as StoredCartLine).id === 'string' && Number.isFinite((l as StoredCartLine).qty),
      )
      .map((l) => ({ id: l.id, qty: Math.max(1, Math.min(999, Math.floor(l.qty))) }));
  } catch {
    return [];
  }
}

export function saveCart(lines: StoredCartLine[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    /* quota cheia ou modo privado: seguir sem persistir */
  }
}

export function clearCart(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
