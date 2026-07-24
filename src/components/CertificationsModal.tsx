/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, ShieldCheck, Heart, Leaf, CloudSnow } from 'lucide-react';
import { motion } from 'motion/react';

interface CertificationsModalProps {
  onClose: () => void;
}

export default function CertificationsModal({ onClose }: CertificationsModalProps) {
  const certs = [
    {
      title: 'Proporção Fiel à Grande Pirâmide',
      desc: 'Cada pirâmide é construída na proporção exata da Grande Pirâmide de Quéops. Ângulos e medidas são conferidos peça a peça para preservar a geometria original.',
      icon: ShieldCheck,
      color: 'text-blue-500 bg-blue-50',
    },
    {
      title: 'Lapidação Artesanal Própria',
      desc: 'Fabricamos pirâmides de cobre desde 1996 e lapidamos cristais desde 2019, com técnica própria. Todo o processo é feito à mão, sem produção em série.',
      icon: Heart,
      color: 'text-red-500 bg-red-50',
    },
    {
      title: 'Cristais de Origem Selecionada',
      desc: 'Nossos cristais e ametistas são escolhidos individualmente por procedência e qualidade energética, garantindo autenticidade e beleza natural em cada peça.',
      icon: Leaf,
      color: 'text-emerald-500 bg-emerald-50',
    },
    {
      title: 'Embalagem Protegida para Envio',
      desc: 'Cada item é embalado com cuidado especial para viajar em segurança. Enviamos para todo o Brasil preservando a integridade de pirâmides, cristais e imagens.',
      icon: CloudSnow,
      color: 'text-indigo-500 bg-indigo-50',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        id="certs-modal-container"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl max-w-xl w-full overflow-hidden animate-fade-in border border-gray-100 flex flex-col"
      >
        {/* Header */}
        <div className="bg-primary-blue text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5.5 h-5.5 text-yellow-400" />
            <h3 className="text-base font-bold font-sans">Selo de Autenticidade Artesanal</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[65vh] text-left">
          <p className="text-xs text-gray-500 leading-relaxed font-sans mb-4">
O cuidado artesanal é o que define cada peça da Quéops Pirâmides. Fabricamos e lapidamos com técnica própria desde 1990, unindo geometria sagrada, materiais nobres e seleção rigorosa de cristais e imagens.
          </p>

          <div className="space-y-4">
            {certs.map((cert, idx) => {
              const Icon = cert.icon;
              return (
                <div key={idx} className="flex gap-4 p-4 rounded-xl border border-gray-150 bg-gray-50/30">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${cert.color}`}>
                    <Icon size={20} />
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-xs font-bold text-gray-800 leading-tight">
                      {cert.title}
                    </h4>
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      {cert.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Action Bottom */}
        <div className="bg-gray-50 py-4 px-6 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-primary-container hover:bg-primary-blue text-white text-xs font-semibold cursor-pointer transition shadow-sm"
          >
            Entendido
          </button>
        </div>
      </motion.div>
    </div>
  );
}
