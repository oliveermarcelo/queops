import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

import { CSP_META } from './server/src/csp.ts';

/**
 * Content-Security-Policy — defesa em profundidade contra injeção de script.
 *
 * A política é a MESMA que o Express manda como header HTTP: as duas leem de
 * server/src/csp.ts, onde está o porquê de cada exceção. Manter duas cópias já
 * as fez divergir, e o navegador aplica a INTERSEÇÃO da <meta> com o header —
 * a mais restritiva bloqueia em silêncio o que a outra libera.
 *
 * A <meta> só é injetada no build de produção (`apply: 'build'`), para o HMR do
 * Vite (que usa script inline e eval) continuar funcionando em `npm run dev`.
 */
const CSP = CSP_META;

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const tag =
        `<meta http-equiv="Content-Security-Policy" content="${CSP}" />` +
        `\n    <meta http-equiv="X-Content-Type-Options" content="nosniff" />`;
      return html.replace('</title>', `</title>\n    ${tag}`);
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), cspPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    build: {
      rollupOptions: {
        output: {
          /**
           * Separa as bibliotecas grandes do código da aplicação. Somado ao
           * `React.lazy` do painel (src/Root.tsx), quem entra só na vitrine
           * não baixa mais o admin inteiro.
           */
          manualChunks: {
            react: ['react', 'react-dom', 'react-dom/client'],
            motion: ['motion'],
            icons: ['lucide-react'],
          },
        },
      },
      // Avisa cedo se um chunk voltar a crescer demais.
      chunkSizeWarningLimit: 350,
    },
    server: {
      // HMR desligado no AI Studio via DISABLE_HMR.
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      /**
       * Em desenvolvimento, /api vai para o servidor Node:
       *   npm run dev:api
       * Em produção não existe proxy: o próprio Express serve o dist/ e a API
       * no mesmo processo (ver server/src/app.ts).
       */
      proxy: {
        '/api': {
          target: process.env.API_PROXY ?? 'http://127.0.0.1:8080',
          changeOrigin: false,
        },
      },
    },
  };
});
