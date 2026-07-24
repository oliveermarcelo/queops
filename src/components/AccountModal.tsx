/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { X, User, Mail, Lock, Check } from 'lucide-react';
import { motion } from 'motion/react';

interface AccountModalProps {
  onClose: () => void;
  onSuccess?: (name: string, email: string) => void;
}

export default function AccountModal({ onClose, onSuccess }: AccountModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [done, setDone] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Mock auth: start a demo session and open "Minha Conta".
    setDone(true);
    setTimeout(() => onSuccess?.(name, email), 1100);
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 10 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative overflow-hidden border border-gray-100"
      >
        {/* Header */}
        <div className="bg-primary-blue text-white px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold font-sans">
                {mode === 'login' ? 'Entrar na conta' : 'Criar conta'}
              </h2>
              <p className="text-[11px] text-white/70">Acompanhe pedidos e agilize a compra</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-full text-white/80 hover:text-white transition">
            <X size={18} />
          </button>
        </div>

        {done ? (
          <div className="p-10 text-center space-y-3">
            <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto text-emerald-600">
              <Check size={30} />
            </div>
            <p className="text-sm font-bold text-gray-800">
              {mode === 'login' ? 'Bem-vindo de volta!' : 'Conta criada com sucesso!'}
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {mode === 'register' && (
              <div className="space-y-1">
                <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Nome completo</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Maria Oliveira"
                    className="w-full text-sm border border-gray-200 rounded-lg py-2.5 pl-9 pr-3 bg-gray-50/50 focus:outline-none focus:ring-1 focus:ring-primary-blue"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">E-mail</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@email.com"
                  className="w-full text-sm border border-gray-200 rounded-lg py-2.5 pl-9 pr-3 bg-gray-50/50 focus:outline-none focus:ring-1 focus:ring-primary-blue"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider">Senha</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-sm border border-gray-200 rounded-lg py-2.5 pl-9 pr-3 bg-gray-50/50 focus:outline-none focus:ring-1 focus:ring-primary-blue"
                />
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3 bg-brand-red hover:bg-[#a10100] text-white font-bold text-xs uppercase tracking-widest rounded-lg transition-colors shadow-sm"
            >
              {mode === 'login' ? 'Entrar' : 'Criar minha conta'}
            </button>

            <p className="text-center text-xs text-gray-500 pt-1">
              {mode === 'login' ? 'Ainda não tem conta?' : 'Já tem conta?'}{' '}
              <button
                type="button"
                onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
                className="text-primary-blue font-bold hover:underline"
              >
                {mode === 'login' ? 'Cadastre-se' : 'Entrar'}
              </button>
            </p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
