/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Entrar / criar conta — agora contra o backend, com senha de verdade.
 */

import React, { useState } from 'react';
import { X, User, Mail, Lock, AlertCircle, Loader2 } from 'lucide-react';
import { motion } from 'motion/react';
import ModalShell from './ModalShell';
import { CustomerAccount, login, register } from '../account/session';

interface AccountModalProps {
  onClose: () => void;
  onSuccess?: (account: CustomerAccount) => void;
}

const inputCls =
  'w-full text-sm border border-gray-200 rounded-lg py-2.5 pl-9 pr-3 bg-gray-50/50 focus:outline-none focus:ring-2 focus:ring-primary-blue/30 focus:border-primary-blue';

export default function AccountModal({ onClose, onSuccess }: AccountModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;

    if (mode === 'register' && password.length < 8) {
      setError('A senha precisa ter pelo menos 8 caracteres.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const account =
        mode === 'login' ? await login(email, password) : await register(name, email, password);
      onSuccess?.(account);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível continuar.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="account-modal-title"
      className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
      >
        <div className="bg-primary-blue text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
              <User className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="account-modal-title" className="text-base font-bold font-sans">
                {mode === 'login' ? 'Entrar na conta' : 'Criar conta'}
              </h2>
              <p className="text-[11px] text-white/70">Acompanhe pedidos e agilize a compra</p>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="p-1.5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {mode === 'register' && (
            <div className="space-y-1">
              <label htmlFor="acc-name" className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                Nome completo
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
                <input
                  id="acc-name"
                  type="text"
                  required
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Maria Oliveira"
                  className={inputCls}
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <label htmlFor="acc-email" className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              E-mail
            </label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
              <input
                id="acc-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                className={inputCls}
              />
            </div>
          </div>

          <div className="space-y-1">
            <label htmlFor="acc-pass" className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Senha
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
              <input
                id="acc-pass"
                type="password"
                required
                minLength={mode === 'register' ? 8 : undefined}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={inputCls}
              />
            </div>
            {mode === 'register' && (
              <p className="text-[11px] text-gray-400 pt-0.5">Mínimo de 8 caracteres.</p>
            )}
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 text-xs text-brand-red font-medium">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full py-3 bg-brand-red hover:bg-[#82502d] disabled:opacity-60 text-white font-bold text-xs uppercase tracking-widest rounded-lg transition-colors shadow-sm inline-flex items-center justify-center gap-2"
          >
            {busy && <Loader2 size={14} className="animate-spin" aria-hidden="true" />}
            {mode === 'login' ? 'Entrar' : 'Criar minha conta'}
          </button>

          <p className="text-center text-xs text-gray-500 pt-1">
            {mode === 'login' ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'register' : 'login');
                setError('');
              }}
              className="text-primary-blue font-bold hover:underline"
            >
              {mode === 'login' ? 'Cadastre-se' : 'Entrar'}
            </button>
          </p>
        </form>
      </motion.div>
    </ModalShell>
  );
}
