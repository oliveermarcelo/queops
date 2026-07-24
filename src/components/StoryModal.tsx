/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { X, Award, Users, ShieldAlert, History } from 'lucide-react';
import { motion } from 'motion/react';
import { COMPANY_HISTORY } from '../data';

interface StoryModalProps {
  onClose: () => void;
}

export default function StoryModal({ onClose }: StoryModalProps) {
  const iconsList = [History, Users, Award, ShieldAlert];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <motion.div
        id="story-modal-container"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="bg-white rounded-xl shadow-2xl max-w-2xl w-full overflow-hidden animate-fade-in border border-gray-100 flex flex-col"
      >
        {/* Top Header */}
        <div className="bg-primary-blue text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center space-x-2.5">
            <Award className="w-5.5 h-5.5 text-yellow-400" />
            <h3 className="text-base font-bold font-sans">Nossa História & Propósito</h3>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/10 p-1.5 rounded-lg transition"
          >
            <X size={18} />
          </button>
        </div>

        {/* Core Content */}
        <div className="p-6 sm:p-8 space-y-6 overflow-y-auto max-h-[70vh] text-left">
          <div className="space-y-4">
            <h4 className="text-lg font-bold text-primary-container font-sans leading-tight">
              {COMPANY_HISTORY.title}
            </h4>
            
            {COMPANY_HISTORY.paragraphs.map((p, idx) => (
              <p key={idx} className="text-xs sm:text-sm text-gray-600 leading-relaxed font-sans">
                {p}
              </p>
            ))}
          </div>

          {/* Graphical Live Stats Row */}
          <div className="pt-6 border-t border-gray-100">
            <h5 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-4">
              Quéops Pirâmides em Números:
            </h5>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {COMPANY_HISTORY.stats.map((stat, idx) => (
                <div key={idx} className="bg-gray-50 p-4 rounded-xl text-center border border-gray-150/40">
                  <span className="text-xl sm:text-2xl font-black text-primary-blue block font-mono">
                    {stat.value}
                  </span>
                  <span className="text-[10px] text-gray-400 font-semibold uppercase tracking-wider block mt-1 hover:text-gray-600 transition-colors">
                    {stat.label}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer actions */}
        <div className="bg-gray-50 py-4 px-6 border-t border-gray-100 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-primary-container hover:bg-primary-blue text-white text-xs font-semibold cursor-pointer transition shadow-sm"
          >
            Fechar História
          </button>
        </div>
      </motion.div>
    </div>
  );
}
