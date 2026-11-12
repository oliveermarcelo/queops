/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * O botão do WhatsApp que acompanha o cliente pela loja inteira.
 *
 * O contato existia só no rodapé — ou seja, só para quem rolasse a página até
 * o fim. Quem está em dúvida no meio de uma página de produto é exatamente
 * quem mais precisa perguntar, e era de quem o caminho estava mais longe.
 *
 * Fica ACIMA de tudo que é conteúdo e ABAIXO de tudo que é modal: `z-40`
 * contra o `z-50` da sacola e dos diálogos. Um botão flutuante que aparece por
 * cima de um formulário aberto cobre justamente o campo que a pessoa ia
 * preencher.
 */

import React from 'react';
import { LOJA } from '../config';

/**
 * O número, só dígitos.
 *
 * Aceita as duas formas que existem no projeto: o que a lojista digita em
 * Configurações (dígitos) e o `LOJA.whatsapp` do código, que é uma URL
 * inteira. Preferir o do painel é o que permite trocar o número sem publicar
 * o site de novo.
 */
function numeroDe(doPainel: string | undefined): string {
  const painel = String(doPainel ?? '').replace(/\D/g, '');
  if (painel.length >= 10) return painel;
  const fixo = String(LOJA.whatsapp ?? '').replace(/\D/g, '');
  return fixo.length >= 10 ? fixo : '';
}

export default function WhatsAppFlutuante({ numero, nomeDaLoja }: {
  numero?: string;
  nomeDaLoja?: string;
}) {
  const zap = numeroDe(numero);
  // Sem número cadastrado não há botão: um link para lugar nenhum é pior que
  // a ausência dele.
  if (zap === '') return null;

  const saudacao = `Olá! Vim pelo site da ${nomeDaLoja || 'loja'} e gostaria de tirar uma dúvida.`;
  const href = `https://wa.me/${zap}?text=${encodeURIComponent(saudacao)}`;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Falar com a loja no WhatsApp"
      title="Falar no WhatsApp"
      className="
        fixed z-40 bottom-5 right-5 sm:bottom-6 sm:right-6
        flex items-center justify-center
        w-14 h-14 rounded-full
        bg-[#25D366] hover:bg-[#1ebe5a] active:scale-95
        shadow-lg shadow-black/20
        transition-all
        focus:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/40
      "
    >
      {/*
        O ícone é SVG inline, e não da biblioteca de ícones.
        O lucide não tem a marca do WhatsApp — usar um telefone genérico faria
        o botão parecer "ligar", que é outra coisa, e ninguém reconheceria de
        relance. Reconhecimento imediato é a razão de um botão flutuante
        existir.
      */}
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="w-7 h-7 text-white"
        aria-hidden="true"
      >
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51a12.8 12.8 0 0 0-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.247-.694.247-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 0 1-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 0 1-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884a9.82 9.82 0 0 1 6.988 2.896 9.825 9.825 0 0 1 2.893 6.994c-.003 5.45-4.437 9.886-9.885 9.886m8.413-18.297A11.815 11.815 0 0 0 12.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 0 0 5.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893A11.821 11.821 0 0 0 20.464 3.488" />
      </svg>
    </a>
  );
}
