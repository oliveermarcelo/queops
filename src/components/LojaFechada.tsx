/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A loja ainda não abriu.
 *
 * Montar uma loja leva semanas, e o endereço está no ar desde o primeiro dia:
 * sem isto, a única forma de não receber um pedido no meio da montagem seria
 * não publicar o site — e aí ninguém consegue conferir como ele está ficando.
 *
 * O que esta tela NÃO é: uma trava. Quem recusa o pedido é o servidor, com
 * 503, porque esconder a vitrine no navegador não fecha uma loja cujo endereço
 * de checkout continua respondendo.
 */

import React from 'react';
import logoWhite from '../assets/logo-white.svg';

export default function LojaFechada({ nome, mensagem, whatsapp }: {
  nome: string;
  mensagem: string;
  whatsapp: string;
}) {
  const texto = mensagem.trim() !== ''
    ? mensagem
    : 'Estamos preparando tudo com cuidado para receber você. Volte em breve.';

  const zap = String(whatsapp ?? '').replace(/\D/g, '');

  return (
    <main className="min-h-screen bg-primary-blue flex items-center justify-center px-6 py-16">
      <div className="max-w-lg text-center">
        <img
          src={logoWhite}
          alt={nome}
          className="h-16 mx-auto mb-8 opacity-90"
          /*
            Importado, e não por caminho fixo: o Vite põe o hash no nome do
            arquivo. Escrito à mão, o endereço quebraria no próximo build — e
            esta é a primeira impressão da loja.
          */
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <h1 className="text-2xl sm:text-3xl font-bold text-white mb-4">{nome}</h1>
        <p className="text-white/80 leading-relaxed whitespace-pre-line">{texto}</p>

        {zap !== '' && (
          <a
            href={`https://wa.me/${zap}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block mt-8 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white text-sm font-bold transition-colors"
          >
            Falar com a gente no WhatsApp
          </a>
        )}
      </div>
    </main>
  );
}
