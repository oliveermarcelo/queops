/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Conta do cliente.
 *
 * A sessão vive num cookie httpOnly emitido pelo PHP — o JavaScript não tem
 * como lê-lo nem forjá-lo. O que existia antes (um objeto de perfil solto no
 * localStorage) permitia a qualquer pessoa "logar" editando o storage, e os
 * pedidos exibidos eram fictícios.
 */

import { api } from '../api/client';

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
  status: 'pending' | 'paid' | 'shipped' | 'delivered' | 'canceled';
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
  favorites: string[];
}

interface AccountResponse {
  account: CustomerAccount | null;
}

/** Perfil de quem está logado, ou null. */
export async function fetchAccount(): Promise<CustomerAccount | null> {
  const res = await api.get<AccountResponse>('/account');
  return res.account;
}

export async function login(email: string, password: string): Promise<CustomerAccount> {
  const res = await api.post<{ account: CustomerAccount }>('/account/login', { email, password });
  return res.account;
}

export async function register(
  name: string,
  email: string,
  password: string,
): Promise<CustomerAccount> {
  const res = await api.post<{ account: CustomerAccount }>('/account/register', {
    name,
    email,
    password,
  });
  return res.account;
}

export async function logout(): Promise<void> {
  await api.post('/account/logout');
}

export interface ProfilePatch {
  name?: string;
  phone?: string;
  cpf?: string;
  address?: Omit<CustomerAddress, 'isDefault'> | Omit<CustomerAddress, 'id' | 'isDefault'>;
}

export async function saveProfile(patch: ProfilePatch): Promise<CustomerAccount> {
  const res = await api.put<{ account: CustomerAccount }>('/account', patch);
  return res.account;
}

/** Rótulos em português para o status do pedido. */
export const ORDER_STATUS_LABEL: Record<CustomerOrder['status'], string> = {
  pending: 'Aguardando pagamento',
  paid: 'Pagamento aprovado',
  shipped: 'A caminho',
  delivered: 'Entregue',
  canceled: 'Cancelado',
};

// ------------------------------------------------------------- endereços ----

export async function createAddress(address: Omit<CustomerAddress, 'id'>): Promise<CustomerAccount> {
  const res = await api.post<{ account: CustomerAccount }>('/account/addresses', address);
  return res.account;
}

export async function updateAddress(address: CustomerAddress): Promise<CustomerAccount> {
  const res = await api.put<{ account: CustomerAccount }>(
    `/account/addresses/${encodeURIComponent(address.id)}`,
    address,
  );
  return res.account;
}

export async function deleteAddress(id: string): Promise<CustomerAccount> {
  const res = await api.del<{ account: CustomerAccount }>(
    `/account/addresses/${encodeURIComponent(id)}`,
  );
  return res.account;
}

export async function saveFavorites(favorites: string[]): Promise<CustomerAccount> {
  const res = await api.put<{ account: CustomerAccount }>('/account/favorites', { favorites });
  return res.account;
}
