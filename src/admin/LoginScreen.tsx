/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Lock, Mail, AlertCircle } from 'lucide-react';
import { login, DEMO_CREDENTIALS } from './auth';
import logo from '../assets/logo.svg';

export default function LoginScreen({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (login(email, password)) {
      onSuccess();
    } else {
      setError('E-mail ou senha inválidos.');
    }
  };

  return (
    <div className="min-h-screen bg-primary-blue flex items-center justify-center p-4 font-sans">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
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
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">E-mail</label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@queopspiramides.com.br"
                className="w-full border border-gray-200 rounded-lg py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Senha</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full border border-gray-200 rounded-lg py-2.5 pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary-blue/20 focus:border-primary-blue"
              />
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-xs text-brand-red font-medium">
              <AlertCircle size={14} /> {error}
            </div>
          )}

          <button
            type="submit"
            className="w-full py-3 rounded-lg bg-primary-blue hover:bg-primary-container text-white font-bold text-sm uppercase tracking-wider transition-colors"
          >
            Entrar
          </button>
        </form>

        <div className="mt-6 p-3 rounded-lg bg-gray-50 border border-gray-100 text-[11px] text-gray-500 leading-relaxed">
          <strong className="text-gray-700">Acesso de demonstração</strong><br />
          E-mail: <code className="text-primary-blue">{DEMO_CREDENTIALS.user}</code><br />
          Senha: <code className="text-primary-blue">{DEMO_CREDENTIALS.pass}</code>
        </div>
      </div>
    </div>
  );
}
