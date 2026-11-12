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
import { CatalogProvider, useCatalog } from './catalog/CatalogContext';
import LojaFechada from './components/LojaFechada';

const AdminApp = React.lazy(() => import('./admin/AdminApp'));

function AdminFallback() {
  return (
    <div className="min-h-screen bg-primary-blue flex items-center justify-center">
      <p className="text-white/70 text-sm tracking-wide">Carregando o painel…</p>
    </div>
  );
}

/**
 * Loja fechada: o visitante vê o aviso, quem é do painel vê a loja.
 *
 * Precisa ser um componente separado porque lê o catálogo, e o catálogo só
 * existe dentro do `CatalogProvider`.
 *
 * Enquanto carrega, mostra a loja — e não o aviso. Errar para o lado do aviso
 * faria toda visita começar com "estamos fechados" por uma fração de segundo,
 * inclusive numa loja aberta.
 */
function LojaOuAviso() {
  const { settings, admin, loading } = useCatalog();
  const fechada = settings?.storeClosed === true;

  if (!loading && fechada && !admin) {
    return (
      <LojaFechada
        nome={settings?.name ?? 'Quéops Pirâmides'}
        mensagem={settings?.closedMessage ?? ''}
        whatsapp={settings?.whatsapp ?? ''}
      />
    );
  }

  return (
    <>
      <App />
      {/*
        Quem cuida da loja precisa saber que está vendo algo que o cliente não
        vê. Sem esta faixa, a lojista confere a vitrine, acha tudo normal, e
        não descobre que a loja está fechada para o público.

        Flutuando no RODAPÉ, e não no topo: o cabeçalho da loja é fixo e
        cobriria uma faixa colocada acima dele — o aviso existiria no HTML e
        ninguém veria. Aqui ela acompanha a rolagem e não empurra o layout.
      */}
      {fechada && admin && (
        <div className="fixed bottom-0 inset-x-0 z-[60] bg-amber-500 text-amber-950 text-center text-xs font-bold px-4 py-2.5 shadow-lg">
          A loja está <b>FECHADA</b> para o público — ninguém além de você consegue ver ou
          comprar. Reabra em Painel → Configurações.
        </div>
      )}
    </>
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
      <LojaOuAviso />
    </CatalogProvider>
  );
}
