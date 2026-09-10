/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Página de documento legal — troca, privacidade, termos.
 *
 * É página, e não modal como "Sobre nós", de propósito: política de troca
 * precisa de endereço próprio. O cliente manda o link para alguém, o Mercado
 * Pago e os marketplaces pedem a URL, e o buscador indexa. Nada disso existe
 * quando o texto só aparece por cima da home.
 *
 * A leitura também pede: são páginas longas, lidas por quem tem um problema
 * concreto — coluna estreita, títulos que se acham correndo o olho, e o
 * e-mail de contato clicável, porque toda seção termina mandando escrever
 * para lá.
 */

import React from 'react';
import { ArrowLeft } from 'lucide-react';

import { LegalDoc } from '../legal';

/**
 * Transforma o e-mail no meio do parágrafo em link.
 *
 * O texto é dado, não JSX, então o endereço chega como parte da frase. Deixá-lo
 * como texto puro obrigaria a pessoa a selecionar e copiar à mão, no exato
 * momento em que ela está tentando resolver um problema com o pedido.
 */
function comEmailClicavel(texto: string): React.ReactNode {
  const partes = texto.split(/([\w.+-]+@[\w-]+\.[\w.-]+)/g);
  return partes.map((parte, i) =>
    /^[\w.+-]+@[\w-]+\.[\w.-]+$/.test(parte) ? (
      <a
        key={i}
        href={`mailto:${parte}`}
        className="text-primary-blue font-medium underline underline-offset-2 hover:text-brand-gold transition-colors"
      >
        {parte}
      </a>
    ) : (
      <React.Fragment key={i}>{parte}</React.Fragment>
    ),
  );
}

export default function LegalPage({ doc, onBack }: { doc: LegalDoc; onBack: () => void }) {
  return (
    /*
     * O `pt-40 lg:pt-44` é o que desce o conteúdo abaixo do cabeçalho, que é
     * `fixed` e portanto não ocupa espaço no fluxo da página. É a mesma medida
     * de ProductsPage e AccountPage — sem ela, o título e o botão de voltar
     * nascem escondidos atrás do menu.
     */
    <main className="flex-1 bg-brand-cream pt-40 lg:pt-44 pb-20">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-primary-blue transition-colors mb-8"
        >
          <ArrowLeft size={16} />
          Voltar para a loja
        </button>

        <header className="pb-6 border-b border-gray-200">
          <h1 className="text-2xl sm:text-3xl font-extrabold text-brand-text tracking-tight">
            {doc.title}
          </h1>
          <p className="mt-2 text-sm text-gray-500">{doc.entity}</p>
          <p className="mt-1 text-sm text-gray-500">{doc.validFrom}</p>
        </header>

        <article className="mt-8 space-y-7">
          {doc.sections.map((secao, i) => (
            <section key={i} className="space-y-3">
              {secao.heading !== '' && (
                <h2 className="text-base font-bold text-brand-text">{secao.heading}</h2>
              )}
              {secao.blocks.map((bloco, j) =>
                bloco.items.length > 0 ? (
                  <ul
                    key={j}
                    className="list-disc pl-5 space-y-2 text-[15px] text-gray-700 leading-relaxed marker:text-brand-gold"
                  >
                    {bloco.items.map((item, k) => (
                      <li key={k}>{comEmailClicavel(item)}</li>
                    ))}
                  </ul>
                ) : (
                  <p key={j} className="text-[15px] text-gray-700 leading-relaxed">
                    {comEmailClicavel(bloco.text)}
                  </p>
                ),
              )}
            </section>
          ))}
        </article>
      </div>
    </main>
  );
}
