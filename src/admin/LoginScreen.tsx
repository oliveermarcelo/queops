/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Tela de acesso ao painel.
 *
 * A senha é verificada no servidor (bcrypt) e a sessão volta num cookie
 * httpOnly. As credenciais de demonstração que ficavam impressas aqui embaixo
 * foram removidas: elas transformavam o painel em área pública.
 */

import React, { useState } from 'react';
import { Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';
import { AdminUser, login } from './auth';
import logo from '../assets/logo.svg';

export default function LoginScreen({ onSuccess }: { onSuccess: (user: AdminUser) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      onSuccess(await login(email, password));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível entrar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-primary-blue flex items-center justify-center p-4 font-sans">
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute -top-24 -left-24 w-96 h-96 rounded-full bg-brand-gold/10 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 w-96 h-96 rounded-full bg-brand-red/10 blur-3xl" />
      </div>

      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl p-8">
        <div className="flex flex-col items-center mb-8">
          <img src={logo} alt="Quéops Pirâmides" className="h-14 w-auto mb-4" />
          <h1 className="text-lg font-extrabold text-gray-900">Painel Administrativo</h1>
          <p className="text-sm text-gray-500">Acesse para gerenciar a sua loja</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="admin-email" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              E-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
              <input
                id="admin-email"
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full border border-gray-200 rounded-lg py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue"
              />
            </div>
          </div>

          <div>
            <label htmlFor="admin-pass" className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
              Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
              <input
                id="admin-pass"
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue"
              />
            </div>
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 text-xs text-brand-red font-medium">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 rounded-lg bg-primary-blue hover:bg-primary-container disabled:opacity-60 text-white font-bold text-sm uppercase tracking-wider transition-colors inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
            Entrar
          </button>
        </form>

        <p className="mt-6 text-[11px] text-gray-400 text-center leading-relaxed">
          Acesso restrito. Tentativas seguidas de senha incorreta bloqueiam o e-mail por 15 minutos.
        </p>
      </div>
    </div>
  );
}
