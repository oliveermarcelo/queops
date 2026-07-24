/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { Search, Mail, Phone, MessageCircle, X, Send, Loader2, CheckCircle2 } from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { Customer } from '../types';
import { brl, fmtDate, Card, Btn, inputCls } from '../ui';
import { openExternal } from '../../utils/safeUrl';

export default function CustomersAdmin() {
  const { state } = useAdmin();
  const [query, setQuery] = useState('');
  const [emailTo, setEmailTo] = useState<Customer | null>(null);

  const customers = useMemo(() => {
    const q = query.toLowerCase();
    return [...state.customers]
      .filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .sort((a, b) => b.totalSpent - a.totalSpent);
  }, [state.customers, query]);

  const openWhatsApp = (phone: string, name: string) => {
    const text = encodeURIComponent(`Olá, ${name.split(' ')[0]}! Aqui é da Quéops Pirâmides. 👋`);
    openExternal(`https://wa.me/${phone.replace(/\D/g, '')}?text=${text}`);
  };

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cliente" className={`${inputCls} pl-9`} />
      </div>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100 bg-gray-50/50">
                <th className="py-3 px-4 font-semibold">Cliente</th>
                <th className="py-3 px-4 font-semibold">Contato</th>
                <th className="py-3 px-4 font-semibold text-center">Pedidos</th>
                <th className="py-3 px-4 font-semibold text-right">Total gasto</th>
                <th className="py-3 px-4 font-semibold">Desde</th>
                <th className="py-3 px-4 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id} className="border-b border-gray-50 hover:bg-gray-50/50">
                  <td className="py-2.5 px-4">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary-blue/10 text-primary-blue flex items-center justify-center font-bold text-xs">
                        {c.name.charAt(0)}
                      </div>
                      <span className="font-semibold text-gray-800">{c.name}</span>
                    </div>
                  </td>
                  <td className="py-2.5 px-4 text-xs text-gray-500 space-y-0.5">
                    <p className="flex items-center gap-1"><Mail size={12} /> {c.email}</p>
                    <p className="flex items-center gap-1"><Phone size={12} /> {c.phone}</p>
                  </td>
                  <td className="py-2.5 px-4 text-center font-semibold">{c.ordersCount}</td>
                  <td className="py-2.5 px-4 text-right font-semibold">{brl(c.totalSpent)}</td>
                  <td className="py-2.5 px-4 text-xs text-gray-500">{fmtDate(c.createdAt)}</td>
                  <td className="py-2.5 px-4">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => openWhatsApp(c.phone, c.name)}
                        title="Enviar WhatsApp"
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-[#25D366] hover:bg-[#1ebd5d] text-white transition-colors"
                      >
                        <MessageCircle size={16} />
                      </button>
                      <button
                        onClick={() => setEmailTo(c)}
                        title="Enviar e-mail"
                        className="inline-flex items-center justify-center w-9 h-9 rounded-lg bg-primary-blue hover:bg-primary-container text-white transition-colors"
                      >
                        <Mail size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={6} className="py-10 text-center text-gray-400 text-sm">Nenhum cliente encontrado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {emailTo && <EmailModal customer={emailTo} onClose={() => setEmailTo(null)} />}
    </div>
  );
}

function EmailModal({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [subject, setSubject] = useState('Quéops Pirâmides — novidades pra você');
  const [body, setBody] = useState(
    `Olá, ${customer.name.split(' ')[0]}!\n\nTemos novidades e ofertas especiais selecionadas pra você na Quéops Pirâmides. Aproveite!\n\nEquipe Quéops Pirâmides`
  );
  const [phase, setPhase] = useState<'edit' | 'sending' | 'sent'>('edit');

  const send = () => {
    setPhase('sending');
    setTimeout(() => {
      setPhase('sent');
      setTimeout(onClose, 1400);
    }, 1300);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={phase === 'sending' ? undefined : onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-primary-blue/10 text-primary-blue flex items-center justify-center">
              <Mail size={18} />
            </div>
            <h3 className="font-bold text-gray-800">Enviar e-mail</h3>
          </div>
          {phase !== 'sending' && (
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-700 rounded-full hover:bg-gray-100"><X size={18} /></button>
          )}
        </div>

        {phase === 'sent' ? (
          <div className="p-10 text-center">
            <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto text-emerald-600 mb-4 ring-8 ring-emerald-50/50">
              <CheckCircle2 size={36} />
            </div>
            <p className="font-bold text-gray-900">E-mail enviado!</p>
            <p className="text-sm text-gray-500 mt-1">A mensagem foi enviada para {customer.email}.</p>
          </div>
        ) : (
          <>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Para</label>
                <input value={customer.email} disabled className={`${inputCls} bg-gray-50 text-gray-500`} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Assunto</label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Mensagem</label>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className={inputCls} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-2">
              <Btn variant="ghost" onClick={onClose} disabled={phase === 'sending'}>Cancelar</Btn>
              <button
                onClick={send}
                disabled={phase === 'sending'}
                className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-primary-blue hover:bg-primary-container text-white text-xs font-bold uppercase tracking-wider transition-colors disabled:opacity-60"
              >
                {phase === 'sending' ? <><Loader2 size={15} className="animate-spin" /> Enviando...</> : <><Send size={15} /> Enviar e-mail</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
