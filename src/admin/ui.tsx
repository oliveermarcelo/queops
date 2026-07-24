/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Small shared UI primitives for the admin panel.
 */

import React from 'react';

export const brl = (n: number) =>
  n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string; key?: React.Key }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function PageActions({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 flex-wrap">{children}</div>;
}

export function Btn({
  children, onClick, variant = 'primary', type = 'button', className = '', disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  className?: string;
  disabled?: boolean;
}) {
  const styles = {
    primary: 'bg-primary-blue hover:bg-primary-container text-white',
    ghost: 'bg-white border border-gray-200 text-gray-700 hover:bg-gray-50',
    danger: 'bg-brand-red/90 hover:bg-brand-red text-white',
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-50 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

export function Field({
  label, children,
}: { label: string; children: React.ReactNode; key?: React.Key }) {
  return (
    <label className="block">
      <span className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">{label}</span>
      {children}
    </label>
  );
}

export const inputCls =
  'w-full border border-gray-200 rounded-lg py-2.5 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue';

export function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: 'bg-amber-100 text-amber-700',
    paid: 'bg-blue-100 text-blue-700',
    shipped: 'bg-indigo-100 text-indigo-700',
    delivered: 'bg-emerald-100 text-emerald-700',
    canceled: 'bg-gray-200 text-gray-600',
    connected: 'bg-emerald-100 text-emerald-700',
    error: 'bg-red-100 text-red-700',
    unknown: 'bg-gray-100 text-gray-500',
  };
  const labels: Record<string, string> = {
    pending: 'Pendente', paid: 'Pago', shipped: 'Enviado',
    delivered: 'Entregue', canceled: 'Cancelado',
    connected: 'Conectado', error: 'Erro', unknown: 'Não testado',
  };
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold ${map[status] ?? 'bg-gray-100 text-gray-500'}`}>
      {labels[status] ?? status}
    </span>
  );
}
