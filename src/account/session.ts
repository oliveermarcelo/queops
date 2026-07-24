/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Mock customer session for the storefront. No backend — persists a simple
 * profile in localStorage so "Minha Conta" works for the demo.
 */

export interface CustomerAddress {
  id: string;
  label: string;
  cep: string;
  street: string;
  number: string;
  complement?: string;
  neighborhood: string;
  city: string;
  state: string;
  isDefault?: boolean;
}

export interface CustomerOrderItem {
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface CustomerOrder {
  id: string;
  date: string; // ISO
  status: 'processing' | 'shipped' | 'delivered' | 'canceled';
  items: CustomerOrderItem[];
  total: number;
}

export interface CustomerAccount {
  name: string;
  email: string;
  phone: string;
  cpf: string;
  addresses: CustomerAddress[];
  orders: CustomerOrder[];
  favorites: string[]; // product ids
}

const KEY = 'km_customer_session_v2';

function demoAccount(name: string, email: string): CustomerAccount {
  const d = (daysAgo: number) => {
    const x = new Date();
    x.setDate(x.getDate() - daysAgo);
    return x.toISOString();
  };
  return {
    name,
    email,
    phone: '(11) 99999-0000',
    cpf: '529.982.247-25',
    addresses: [
      {
        id: 'addr-1', label: 'Casa', cep: '01310-100', street: 'Av. Paulista',
        number: '1000', complement: 'Apto 52', neighborhood: 'Bela Vista',
        city: 'São Paulo', state: 'SP', isDefault: true,
      },
    ],
    orders: [
      {
        id: 'QP-784512', date: d(3), status: 'shipped',
        items: [
          { name: 'Pirâmide de Cristal com 3,5cm de Base', quantity: 1, unitPrice: 233.0 },
          { name: 'Incenso Massala (caixa)', quantity: 2, unitPrice: 12.0 },
        ],
        total: 257.0,
      },
      {
        id: 'QP-781203', date: d(18), status: 'delivered',
        items: [{ name: 'Ametista Drusa Pequena', quantity: 3, unitPrice: 35.0 }],
        total: 105.0,
      },
      {
        id: 'QP-779880', date: d(42), status: 'delivered',
        items: [
          { name: 'Pirâmide de Cobre Vazada 24cm', quantity: 1, unitPrice: 278.0 },
          { name: 'Pêndulo de Radiestesia', quantity: 1, unitPrice: 45.0 },
        ],
        total: 323.0,
      },
    ],
    favorites: [],
  };
}

export function getSession(): CustomerAccount | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CustomerAccount) : null;
  } catch {
    return null;
  }
}

export function saveSession(acc: CustomerAccount): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(acc));
  } catch {
    /* ignore */
  }
}

/** Mock login/registration — creates (or reuses) a demo account. */
export function startSession(name: string, email: string): CustomerAccount {
  const existing = getSession();
  const acc = existing && existing.email === email
    ? existing
    : demoAccount(name || email.split('@')[0], email);
  saveSession(acc);
  return acc;
}

export function endSession(): void {
  localStorage.removeItem(KEY);
}
