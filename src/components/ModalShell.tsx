/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Casca acessível para modais e gavetas.
 *
 * Antes cada modal era uma `<div>` com overlay clicável: leitor de tela não
 * anunciava nada, Esc não fechava e o Tab continuava passeando pela página
 * atrás do overlay. Aqui centralizamos os quatro comportamentos que todo
 * diálogo precisa ter:
 *
 *  - `role="dialog"` + `aria-modal` + título associado por `aria-labelledby`;
 *  - Esc fecha;
 *  - o foco entra no diálogo e fica preso nele enquanto estiver aberto;
 *  - ao fechar, o foco volta para o elemento que abriu.
 */

import React, { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

interface ModalShellProps {
  onClose: () => void;
  /** Id do elemento que dá nome ao diálogo (geralmente o <h2>). */
  labelledBy?: string;
  /** Rótulo textual, quando não há título visível. */
  label?: string;
  className?: string;
  overlayClassName?: string;
  children: React.ReactNode;
}

export default function ModalShell({
  onClose,
  labelledBy,
  label,
  className = '',
  overlayClassName = 'fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4',
  children,
}: ModalShellProps) {
  const ref = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  /*
   * `onClose` costuma ser uma arrow function criada no JSX do pai, ou seja, uma
   * referência nova a cada render. Se ela entrasse nas dependências do efeito,
   * mexer na quantidade dentro da gaveta remontaria tudo: o scroll do fundo
   * seria destravado e o foco saltaria de volta para o primeiro botão. Guardamos
   * a versão mais recente numa ref e montamos o efeito uma única vez.
   */
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    openerRef.current = document.activeElement as HTMLElement | null;

    // Foca o primeiro controle do diálogo (ou o próprio contêiner).
    const node = ref.current;
    const first = node?.querySelector(FOCUSABLE) as HTMLElement | null | undefined;
    (first ?? node)?.focus({ preventScroll: true });

    // Trava a rolagem do fundo enquanto o modal estiver aberto.
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;

      const items = (Array.from(node.querySelectorAll(FOCUSABLE)) as HTMLElement[]).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (!e.shiftKey && document.activeElement === lastItem) {
        e.preventDefault();
        firstItem.focus();
      } else if (e.shiftKey && document.activeElement === firstItem) {
        e.preventDefault();
        lastItem.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      document.body.style.overflow = previousOverflow;
      openerRef.current?.focus?.({ preventScroll: true });
    };
    // Sem dependências: monta ao abrir, desmonta ao fechar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={overlayClassName}>
      {/* Fundo clicável. aria-hidden: já existe o Esc e o botão de fechar. */}
      <div className="absolute inset-0" onClick={() => onCloseRef.current()} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        aria-label={labelledBy ? undefined : label}
        tabIndex={-1}
        className={`relative outline-none ${className}`}
      >
        {children}
      </div>
    </div>
  );
}
