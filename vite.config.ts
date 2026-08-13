import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, Plugin } from 'vite';

/**
 * Content-Security-Policy — defesa em profundidade contra injeção de script.
 *
 * Vai só no build de produção (`apply: 'build'`), para o HMR do Vite (que usa
 * script inline e eval) continuar funcionando em `npm run dev`.
 *
 *  - script-src 'self'   → nada de <script> inline nem eval
 *  - img-src 'self' https: data: → o catálogo é servido do próprio domínio, mas
 *    o painel permite colar a URL de uma imagem externa ao cadastrar um produto;
 *    `safeImageSrc` já barra esquemas perigosos (javascript:, data:text/html, SVG)
 *  - connect-src 'self'  → o front só fala com a nossa API; as chamadas a
 *    gateways e ERPs saem do servidor Node, não do navegador
 *  - object-src 'none', base-uri 'self', form-action 'self'
 *
 * Uma CSP em <meta> não consegue impor frame-ancestors nem enviar relatórios —
 * essa diretiva vai como header HTTP real, enviado pelo Express (server/src/app.ts).
 * Em produção, sirva a política inteira também como header no servidor/CDN.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  // frame-ancestors é ignorado em <meta>: vai como header, no Express.
  'upgrade-insecure-requests',
].join('; ');

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
