/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Roteador mínimo, sem dependências: /admin abre o painel, o resto abre a loja.
 *
 * O painel entra por `lazy()` de propósito — são nove módulos, dashboard e
 * formulários que nenhum visitante da vitrine precisa baixar. Assim o chunk do
 * admin só é buscado por quem realmente acessa /admin.
 */

import React, { Suspense } from 'react';
import App from './App';
import { CatalogProvider } from './catalog/CatalogContext';

const AdminApp = React.lazy(() => import('./admin/AdminApp'));

function AdminFallback() {
  return (
    <div className="min-h-screen bg-primary-blue flex items-center justify-center">
      <p className="text-white/70 text-sm tracking-wide">Carregando o painel…</p>
    </div>
  );
}

export default function Root() {
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';

  if (path.startsWith('/admin')) {
    return (
      <Suspense fallback={<AdminFallback />}>
        <AdminApp />
      </Suspense>
    );
  }

  return (
    <CatalogProvider>
      <App />
    </CatalogProvider>
  );
}
