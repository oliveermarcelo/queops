/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Mail, Check, AlertCircle, Instagram, Facebook, Phone, MapPin, Clock,
  CreditCard, QrCode, Barcode, ShieldCheck, ArrowRight, Send,
} from 'lucide-react';
import logoWhite from '../assets/logo-white.svg';

interface FooterProps {
  onOpenStory: () => void;
  onOpenCertifications: () => void;
}

export default function Footer({ onOpenStory, onOpenCertifications }: FooterProps) {
  const [newsletterEmail, setNewsletterEmail] = useState('');
  const [newsletterStatus, setNewsletterStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleSubscribe = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsletterEmail.trim() || !newsletterEmail.includes('@')) {
      setNewsletterStatus('error');
      return;
    }
    setNewsletterStatus('success');
    setNewsletterEmail('');
    setTimeout(() => setNewsletterStatus('idle'), 3000);
  };

  return (
    <footer id="main-footer" className="relative bg-[#2a1206] text-white overflow-hidden">
      <div className="absolute -top-24 right-1/4 w-96 h-96 rounded-full bg-brand-gold/5 blur-3xl pointer-events-none" />

      {/* Newsletter band */}
      <div className="relative border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 flex flex-col lg:flex-row items-center justify-between gap-6">
          <div className="text-center lg:text-left">
            <h3 className="text-xl sm:text-2xl font-extrabold">
              Receba novidades e ofertas <span className="text-brand-gold">exclusivas</span>
            </h3>
            <p className="text-sm text-white/60 mt-1">Cadastre seu e-mail e seja o primeiro a saber das novidades.</p>
          </div>
          <form onSubmit={handleSubscribe} className="w-full lg:w-auto">
            <div className="flex gap-2 w-full lg:w-[420px]">
              <input
                type="email"
                placeholder="Seu melhor e-mail"
                value={newsletterEmail}
                onChange={(e) => setNewsletterEmail(e.target.value)}
                className="flex-1 text-sm rounded-xl px-4 py-3 bg-white/10 border border-white/15 text-white placeholder:text-white/40 focus:outline-none focus:ring-2 focus:ring-brand-gold/40 focus:border-brand-gold/50"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-brand-gold hover:bg-white text-primary-blue font-bold text-sm uppercase tracking-wider transition-colors whitespace-nowrap"
              >
                <Send size={15} /> Cadastrar
              </button>
            </div>
            {newsletterStatus === 'success' && (
              <p className="text-xs text-emerald-300 font-medium flex items-center gap-1 mt-2"><Check size={13} /> E-mail registrado com sucesso!</p>
            )}
            {newsletterStatus === 'error' && (
              <p className="text-xs text-red-300 font-medium flex items-center gap-1 mt-2"><AlertCircle size={13} /> Informe um e-mail válido.</p>
            )}
          </form>
        </div>
      </div>

      {/* Main columns */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
        <div className="grid grid-cols-2 lg:grid-cols-12 gap-8 lg:gap-10">
          {/* Brand */}
          <div className="col-span-2 lg:col-span-4 space-y-5">
            <img src={logoWhite} alt="Quéops Pirâmides" className="h-12 w-auto" />
            <p className="text-sm text-white/60 leading-relaxed max-w-xs">
              Pirâmides artesanais, cristais e artigos espirituais feitos à mão desde 1990.
              Criamos possibilidades para que as pessoas alcancem a Harmonia, a Felicidade e a Paz.
            </p>
            <div className="flex items-center gap-2.5">
              {[Instagram, Facebook].map((Icon, i) => (
                <a
                  key={i}
                  href="#"
                  className="w-9 h-9 rounded-full bg-white/10 hover:bg-brand-gold hover:text-primary-blue flex items-center justify-center text-white/80 transition-colors"
                >
                  <Icon size={17} />
                </a>
              ))}
              <a
                href="https://wa.me/5511000000000"
                target="_blank"
                rel="noopener noreferrer"
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-[#25D366] flex items-center justify-center text-white/80 hover:text-white transition-colors"
                title="WhatsApp"
              >
                <Phone size={16} />
              </a>
            </div>
          </div>

          {/* Categorias */}
          <div className="lg:col-span-2">
            <h4 className="font-bold text-sm mb-4">Categorias</h4>
            <ul className="space-y-2.5 text-sm text-white/60">
              {['Pirâmides', 'Cristais', 'Incensos', 'Acessórios', 'Decoração'].map((c) => (
                <li key={c}><a href="#" className="hover:text-brand-gold transition-colors">{c}</a></li>
              ))}
            </ul>
          </div>

          {/* Institucional */}
          <div className="lg:col-span-3">
            <h4 className="font-bold text-sm mb-4">Institucional</h4>
            <ul className="space-y-2.5 text-sm text-white/60">
              <li><button onClick={onOpenStory} className="hover:text-brand-gold transition-colors">Sobre nós</button></li>
              <li><button onClick={onOpenCertifications} className="hover:text-brand-gold transition-colors">Qualidade & Selos</button></li>
              <li><a href="#privacidade" className="hover:text-brand-gold transition-colors">Política de Privacidade</a></li>
              <li><a href="#termos" className="hover:text-brand-gold transition-colors">Termos de Uso</a></li>
              <li><a href="#trocas" className="hover:text-brand-gold transition-colors">Trocas e Devoluções</a></li>
            </ul>
          </div>

          {/* Atendimento */}
          <div className="col-span-2 lg:col-span-3">
            <h4 className="font-bold text-sm mb-4">Atendimento</h4>
            <ul className="space-y-3 text-sm text-white/60">
              <li className="flex items-start gap-2.5">
                <Phone size={16} className="text-brand-gold mt-0.5 flex-shrink-0" />
                <a href="tel:+551130000000" className="hover:text-brand-gold transition-colors">(11) 3000-0000</a>
              </li>
              <li className="flex items-start gap-2.5">
                <Mail size={16} className="text-brand-gold mt-0.5 flex-shrink-0" />
                <a href="mailto:contato@queopspiramides.com.br" className="hover:text-brand-gold transition-colors break-all">contato@queopspiramides.com.br</a>
              </li>
              <li className="flex items-start gap-2.5">
                <Clock size={16} className="text-brand-gold mt-0.5 flex-shrink-0" />
                <span>Seg a Sex, 8h às 18h</span>
              </li>
              <li className="flex items-start gap-2.5">
                <MapPin size={16} className="text-brand-gold mt-0.5 flex-shrink-0" />
                <span>São Paulo · SP — entregas para todo o Brasil</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Trust + payments */}
        <div className="mt-12 pt-8 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-5">
          <div className="flex items-center gap-2 text-sm text-white/60">
            <ShieldCheck size={18} className="text-emerald-400" />
            Site seguro · seus dados protegidos
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-white/40 uppercase tracking-wider">Pagamento:</span>
            {[CreditCard, QrCode, Barcode].map((Icon, i) => (
              <div key={i} className="w-10 h-7 rounded-md bg-white/10 flex items-center justify-center text-white/70">
                <Icon size={16} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legal bar */}
      <div className="relative border-t border-white/10 bg-black/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5 text-center sm:flex sm:items-center sm:justify-between text-[11px] text-white/40 gap-4">
          <p>© {new Date().getFullYear()} Quéops Pirâmides. Todos os direitos reservados.</p>
          <p className="font-mono mt-2 sm:mt-0">
            Quéops Pirâmides Ltda. · CNPJ 00.000.000/0000-00
            <a href="/admin" className="ml-2 text-white/30 hover:text-brand-gold transition-colors">· Admin</a>
          </p>
        </div>
      </div>
    </footer>
  );
}
