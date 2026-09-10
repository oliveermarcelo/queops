/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, ShieldCheck, Heart, Leaf, CloudSnow } from 'lucide-react';
import { motion } from 'motion/react';
import ModalShell from './ModalShell';

interface CertificationsModalProps {
  onClose: () => void;
}

export default function CertificationsModal({ onClose }: CertificationsModalProps) {
  /*
   * Os quatro selos, com o texto escrito pela dona da loja.
   *
   * São afirmações que a loja faz sobre si mesma — procedência, certificado,
   * técnica. Não é copy a ser melhorada por conta própria: se a frase muda, é
   * porque ela mudou.
   */
  const certs = [
    {
      title: 'Proporção Fiel à Grande Pirâmide',
      desc: 'Cada pirâmide é rigorosamente construída na proporção exata da Grande Pirâmide de Quéops. Ângulos e medidas são aferidos milimetricamente, peça a peça, garantindo fidelidade à geometria original.',
      icon: ShieldCheck,
      color: 'text-blue-500 bg-blue-50',
    },
    {
      title: 'Fabricação e Lapidação Própria',
      desc: 'Dominamos uma técnica própria em um processo puramente artesanal, onde cada cristal lapidado e cada pirâmide de cobre ganham uma identidade única.',
      icon: Heart,
      color: 'text-red-500 bg-red-50',
    },
    {
      title: 'Cristais com Certificado',
      desc: 'A procedência de cada cristal é tratada com o máximo rigor. Trabalhamos exclusivamente com Cristais de Rocha selecionados e acompanhados de certificado de garantia, assegurando a legitimidade, a pureza e a beleza natural das peças.',
      icon: Leaf,
      color: 'text-emerald-500 bg-emerald-50',
    },
    {
      title: 'Embalagem Própria para Envio',
      desc: 'Desenvolvemos embalagens exclusivas de alta proteção, projetadas especificamente para o envio aéreo nacional e internacional. Enviamos para todo o mundo, assegurando o tratamento especial que preserva a integridade de nossas pirâmides, cristais e peças durante todo o trajeto.',
      icon: CloudSnow,
      color: 'text-indigo-500 bg-indigo-50',
    },
  ];

  return (
    <ModalShell
      onClose={onClose}
      labelledBy="certs-modal-title"
      overlayClassName="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto"
      className="max-w-xl w-full"
    >
      <motion.div
        id="certs-modal-container"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl w-full overflow-hidden animate-fade-in border border-gray-100 flex flex-col"
      >
        {/* Header */}
        <div className="bg-primary-blue text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-5.5 h-5.5 text-yellow-400" />
            <h2 id="certs-modal-title" className="text-base font-bold font-sans">Selo de Autenticidade Artesanal</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 overflow-y-auto max-h-[65vh] text-left">
          <p className="text-xs text-gray-500 leading-relaxed font-sans mb-4">
Na Quéops Pirâmides, a excelência nasce do Respeito. Fabricamos e lapidamos cada peça através de técnicas exclusivas, combinando a precisão das medidas exatas, o uso de materiais nobres e a máxima qualidade.
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
    </ModalShell>
  );
}
