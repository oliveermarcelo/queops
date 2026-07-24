/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { OrderStatus } from '../types';
import { brl, fmtDate, Card, inputCls } from '../ui';

const STATUSES: { id: OrderStatus | 'all'; label: string }[] = [
  { id: 'all', label: 'Todos' },
  { id: 'pending', label: 'Pendentes' },
  { id: 'paid', label: 'Pagos' },
  { id: 'shipped', label: 'Enviados' },
  { id: 'delivered', label: 'Entregues' },
  { id: 'canceled', label: 'Cancelados' },
];

const CHANNEL_LABEL: Record<string, string> = { site: 'Site', whatsapp: 'WhatsApp', erp: 'ERP' };

// Status-colored select (acts as the badge itself, no duplicate label)
const STATUS_SELECT: Record<OrderStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  paid: 'bg-blue-50 text-blue-700 border-blue-200',
  shipped: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  delivered: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  canceled: 'bg-gray-100 text-gray-500 border-gray-200',
};

export default function OrdersAdmin() {
  const { state, setOrderStatus } = useAdmin();
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  const [query, setQuery] = useState('');

  const orders = useMemo(() => {
    const q = query.toLowerCase();
    return [...state.orders]
      .filter((o) => (filter === 'all' ? true : o.status === filter))
      .filter((o) => o.id.toLowerCase().includes(q) || o.customerName.toLowerCase().includes(q))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }, [state.orders, filter, query]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1.5 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s.id}
              onClick={() => setFilter(s.id)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                filter === s.id ? 'bg-primary-blue text-white' : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar pedido/cliente" className={`${inputCls} pl-9`} />
        </div>
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
                <th className="py-3 px-4 font-semibold">Pedido</th>
                <th className="py-3 px-4 font-semibold">Cliente</th>
                <th className="py-3 px-4 font-semibold">Canal</th>
                <th className="py-3 px-4 font-semibold">Data</th>
                <th className="py-3 px-4 font-semibold text-right">Total</th>
                <th className="py-3 px-4 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 px-4 font-mono text-xs font-bold text-gray-700">{o.id}</td>
                  <td className="py-2.5 px-4">
                    <p className="text-gray-700">{o.customerName}</p>
                    <p className="text-[11px] text-gray-400">{o.items.length} item(ns)</p>
                  </td>
                  <td className="py-2.5 px-4 text-gray-500 text-xs">{CHANNEL_LABEL[o.channel]}</td>
                  <td className="py-2.5 px-4 text-gray-500 text-xs">{fmtDate(o.createdAt)}</td>
                  <td className="py-2.5 px-4 text-right font-semibold">{brl(o.total)}</td>
                  <td className="py-2.5 px-4">
                    <select
                      value={o.status}
                      onChange={(e) => setOrderStatus(o.id, e.target.value as OrderStatus)}
                      className={`text-xs font-bold rounded-full py-1.5 pl-3 pr-7 border cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary-blue/20 appearance-none bg-[length:14px] bg-[right_0.5rem_center] bg-no-repeat ${STATUS_SELECT[o.status]}`}
                      style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23666' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E\")" }}
                    >
                      <option value="pending">Pendente</option>
                      <option value="paid">Pago</option>
                      <option value="shipped">Enviado</option>
                      <option value="delivered">Entregue</option>
                      <option value="canceled">Cancelado</option>
                    </select>
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">Nenhum pedido neste filtro.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
