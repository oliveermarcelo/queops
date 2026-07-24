/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  DollarSign, ShoppingCart, Users, ArrowRight, TrendingUp, TrendingDown,
  Receipt, UserPlus, Crown, ArrowUpRight, Calendar,
} from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { brl, fmtDate, Card, StatusBadge } from '../ui';
import { Order } from '../types';

const PERIODS: { id: number; label: string }[] = [
  { id: 7, label: '7 dias' },
  { id: 30, label: '30 dias' },
  { id: 90, label: '90 dias' },
];

const isRevenue = (o: Order) => o.status !== 'canceled';
const DAY = 86400000;
const toInputDate = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export default function Dashboard({ goTo }: { goTo: (m: any) => void }) {
  const { state } = useAdmin();
  const { orders, products, customers } = state;

  // The active window is always a [from, to] range in ms. Quick buttons and the
  // custom date pickers both write into this same range.
  const [from, setFrom] = useState<number>(Date.now() - 30 * DAY);
  const [to, setTo] = useState<number>(Date.now());
  const [presetDays, setPresetDays] = useState<number | null>(30);

  const applyPreset = (days: number) => {
    setPresetDays(days);
    setFrom(Date.now() - days * DAY);
    setTo(Date.now());
  };
  const applyFromInput = (v: string) => { setPresetDays(null); setFrom(new Date(v + 'T00:00:00').getTime()); };
  const applyToInput = (v: string) => { setPresetDays(null); setTo(new Date(v + 'T23:59:59').getTime()); };

  const windowDays = Math.max(1, Math.round((to - from) / DAY));
  const inWindow = (iso: string, lo: number, hi: number) => {
    const t = new Date(iso).getTime();
    return t >= lo && t <= hi;
  };

  const stats = useMemo(() => {
    const prevTo = from;
    const prevFrom = from - (to - from);

    const current = orders.filter((o) => inWindow(o.createdAt, from, to));
    const previous = orders.filter((o) => inWindow(o.createdAt, prevFrom, prevTo));

    const sum = (list: Order[]) => list.filter(isRevenue).reduce((s, o) => s + o.total, 0);
    const revCur = sum(current);
    const revPrev = sum(previous);
    const curPaid = current.filter(isRevenue).length;
    const prevPaid = previous.filter(isRevenue).length;
    const ticketCur = curPaid ? revCur / curPaid : 0;
    const ticketPrev = prevPaid ? revPrev / prevPaid : 0;

    const newCustCur = customers.filter((c) => inWindow(c.createdAt, from, to)).length;
    const newCustPrev = customers.filter((c) => inWindow(c.createdAt, prevFrom, prevTo)).length;

    const pct = (cur: number, prev: number) =>
      prev === 0 ? (cur > 0 ? 100 : 0) : Math.round(((cur - prev) / prev) * 100);

    return {
      current,
      revCur, revPct: pct(revCur, revPrev),
      ordCur: current.length, ordPct: pct(current.length, previous.length),
      ticketCur, ticketPct: pct(ticketCur, ticketPrev),
      newCustCur, newCustPct: pct(newCustCur, newCustPrev),
    };
  }, [orders, customers, from, to]);

  // Revenue series (buckets) for the chart
  const series = useMemo(() => {
    const buckets = windowDays <= 10 ? Math.max(2, windowDays) : windowDays <= 31 ? 10 : 12;
    const span = (to - from) / buckets;
    const arr = Array.from({ length: buckets }, () => 0);
    orders.filter(isRevenue).forEach((o) => {
      const t = new Date(o.createdAt).getTime();
      if (t >= from && t <= to) {
        const idx = Math.min(buckets - 1, Math.floor((t - from) / span));
        arr[idx] += o.total;
      }
    });
    return arr;
  }, [orders, from, to, windowDays]);
  const maxSeries = Math.max(1, ...series);

  // Top customers within the window
  const topCustomers = useMemo(() => {
    const map = new Map<string, { name: string; total: number; orders: number }>();
    stats.current.filter(isRevenue).forEach((o) => {
      const e = map.get(o.customerEmail) ?? { name: o.customerName, total: 0, orders: 0 };
      e.total += o.total; e.orders += 1;
      map.set(o.customerEmail, e);
    });
    return [...map.values()].sort((a, b) => b.total - a.total).slice(0, 5);
  }, [stats.current]);

  // New customers list
  const newCustomers = useMemo(
    () => [...customers]
      .filter((c) => inWindow(c.createdAt, from, to))
      .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
      .slice(0, 5),
    [customers, from, to]
  );

  const recent = [...orders].slice(0, 5);

  const kpis = [
    { label: 'Faturamento', value: brl(stats.revCur), pct: stats.revPct, icon: DollarSign, color: 'text-emerald-600 bg-emerald-50' },
    { label: 'Pedidos', value: String(stats.ordCur), pct: stats.ordPct, icon: ShoppingCart, color: 'text-blue-600 bg-blue-50' },
    { label: 'Ticket médio', value: brl(stats.ticketCur || 0), pct: stats.ticketPct, icon: Receipt, color: 'text-purple-600 bg-purple-50' },
    { label: 'Novos clientes', value: String(stats.newCustCur), pct: stats.newCustPct, icon: UserPlus, color: 'text-amber-600 bg-amber-50' },
  ];

  return (
    <div className="space-y-6">
      {/* Period filter */}
      <div className="flex items-start lg:items-center justify-between flex-col lg:flex-row gap-3">
        <p className="text-sm text-gray-500">
          Visão geral · <span className="font-semibold text-gray-700">{windowDays} dia(s)</span>
          <span className="text-gray-400"> (vs período anterior)</span>
        </p>
        <div className="flex items-center gap-3 flex-wrap">
          {/* Quick presets */}
          <div className="flex gap-1 bg-white border border-gray-200 rounded-lg p-1">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                onClick={() => applyPreset(p.id)}
                className={`px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
                  presetDays === p.id ? 'bg-primary-blue text-white' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {/* Custom date range */}
          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-1.5">
            <Calendar size={15} className="text-gray-400" />
            <input
              type="date"
              value={toInputDate(from)}
              max={toInputDate(to)}
              onChange={(e) => e.target.value && applyFromInput(e.target.value)}
              className="text-xs text-gray-700 focus:outline-none bg-transparent"
            />
            <span className="text-gray-300 text-xs">→</span>
            <input
              type="date"
              value={toInputDate(to)}
              min={toInputDate(from)}
              max={toInputDate(Date.now())}
              onChange={(e) => e.target.value && applyToInput(e.target.value)}
              className="text-xs text-gray-700 focus:outline-none bg-transparent"
            />
          </div>
        </div>
      </div>

      {/* KPI cards with comparison */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((k) => {
          const Icon = k.icon;
          const up = k.pct >= 0;
          return (
            <Card key={k.label} className="p-5">
              <div className="flex items-start justify-between">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${k.color}`}>
                  <Icon size={20} />
                </div>
                <span className={`inline-flex items-center gap-0.5 text-xs font-bold px-1.5 py-0.5 rounded-full ${
                  up ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'
                }`}>
                  {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                  {up ? '+' : ''}{k.pct}%
                </span>
              </div>
              <p className="text-2xl font-extrabold text-gray-900 mt-3">{k.value}</p>
              <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
            </Card>
          );
        })}
      </div>

      {/* Revenue chart */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="font-bold text-gray-800">Faturamento no período</h2>
            <p className="text-xs text-gray-400">Receita por intervalo (pedidos não cancelados)</p>
          </div>
          <span className="text-lg font-extrabold text-primary-blue">{brl(stats.revCur)}</span>
        </div>
        <div className="flex items-stretch gap-2 h-48">
          {series.map((v, i) => (
            <div key={i} className="flex-1 flex flex-col items-center justify-end group h-full">
              <span className="text-[9px] text-gray-400 mb-1 font-mono opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                {v > 0 ? brl(v) : ''}
              </span>
              <div className="w-full flex-1 flex items-end bg-gray-50 rounded-md overflow-hidden">
                <div
                  className="w-full bg-gradient-to-t from-primary-blue to-primary-container rounded-md transition-all duration-500 group-hover:from-brand-red group-hover:to-brand-red"
                  style={{ height: `${Math.max(2, (v / maxSeries) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top customers */}
        <Card className="p-6">
          <div className="flex items-center gap-2 mb-4">
            <Crown size={16} className="text-amber-500" />
            <h2 className="font-bold text-gray-800">Clientes que mais compraram</h2>
          </div>
          <div className="space-y-3">
            {topCustomers.map((c, i) => (
              <div key={c.name} className="flex items-center gap-3">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-extrabold flex-shrink-0 ${
                  i === 0 ? 'bg-amber-400 text-white' : i === 1 ? 'bg-gray-300 text-white' : i === 2 ? 'bg-amber-700/70 text-white' : 'bg-gray-100 text-gray-500'
                }`}>{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p>
                  <p className="text-[11px] text-gray-400">{c.orders} pedido(s)</p>
                </div>
                <span className="text-sm font-bold text-gray-900">{brl(c.total)}</span>
              </div>
            ))}
            {topCustomers.length === 0 && <p className="text-sm text-gray-400">Sem dados no período.</p>}
          </div>
        </Card>

        {/* New customers */}
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <UserPlus size={16} className="text-emerald-500" />
              <h2 className="font-bold text-gray-800">Novos clientes</h2>
            </div>
            <button onClick={() => goTo('customers')} className="text-xs font-bold text-primary-blue inline-flex items-center gap-1 hover:underline">
              Ver todos <ArrowRight size={14} />
            </button>
          </div>
          <div className="space-y-3">
            {newCustomers.map((c) => (
              <div key={c.id} className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-primary-blue/10 text-primary-blue flex items-center justify-center font-bold text-xs flex-shrink-0">
                  {c.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">{c.name}</p>
                  <p className="text-[11px] text-gray-400 truncate">{c.email}</p>
                </div>
                <span className="text-[11px] text-gray-400">{fmtDate(c.createdAt)}</span>
              </div>
            ))}
            {newCustomers.length === 0 && <p className="text-sm text-gray-400">Nenhum novo cliente no período.</p>}
          </div>
        </Card>
      </div>

      {/* Recent orders */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-bold text-gray-800">Pedidos recentes</h2>
          <button onClick={() => goTo('orders')} className="text-xs font-bold text-primary-blue inline-flex items-center gap-1 hover:underline">
            Ver todos <ArrowRight size={14} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                <th className="py-2 font-semibold">Pedido</th>
                <th className="py-2 font-semibold">Cliente</th>
                <th className="py-2 font-semibold">Data</th>
                <th className="py-2 font-semibold text-right">Total</th>
                <th className="py-2 font-semibold text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((o) => (
                <tr key={o.id} className="border-b border-gray-50">
                  <td className="py-2.5 font-mono text-xs font-bold text-gray-700">{o.id}</td>
                  <td className="py-2.5 text-gray-600">{o.customerName}</td>
                  <td className="py-2.5 text-gray-500 text-xs">{fmtDate(o.createdAt)}</td>
                  <td className="py-2.5 text-right font-semibold">{brl(o.total)}</td>
                  <td className="py-2.5 text-right"><StatusBadge status={o.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Quick footer cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center"><Users size={18} /></div>
          <div><p className="text-lg font-extrabold text-gray-900">{customers.length}</p><p className="text-[11px] text-gray-500">clientes totais</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><ShoppingCart size={18} /></div>
          <div><p className="text-lg font-extrabold text-gray-900">{orders.length}</p><p className="text-[11px] text-gray-500">pedidos totais</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><DollarSign size={18} /></div>
          <div><p className="text-lg font-extrabold text-gray-900">{brl(orders.filter(isRevenue).reduce((s, o) => s + o.total, 0))}</p><p className="text-[11px] text-gray-500">receita total</p></div>
        </Card>
        <Card className="p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center"><ArrowUpRight size={18} /></div>
          <div><p className="text-lg font-extrabold text-gray-900">{products.length}</p><p className="text-[11px] text-gray-500">produtos ativos</p></div>
        </Card>
      </div>
    </div>
  );
}
