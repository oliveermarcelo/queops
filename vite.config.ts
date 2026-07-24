import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, Plugin} from 'vite';

/**
 * Content-Security-Policy — defense-in-depth against script injection (XSS).
 *
 * Injected into the built index.html ONLY (apply: 'build'), so Vite's dev HMR
 * (which relies on inline scripts/eval) keeps working in `npm run dev`.
 *
 *  - script-src 'self'  → no inline <script>, no eval; scripts only from our origin
 *  - img-src https: data: → catalog images, admin-pasted URLs and inline uploads
 *  - connect-src https:  → admin panel calls payment/ERP/WhatsApp APIs directly
 *  - object-src 'none', base-uri 'self', form-action 'self', frame-ancestors 'none'
 *
 * NOTE: a <meta> CSP cannot enforce frame-ancestors or send reports. For
 * production, ALSO set this (and HSTS) as a real HTTP header on the server/CDN.
 * Revisit when the backend is added.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self' data:",
  "connect-src 'self' https:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

function cspPlugin(): Plugin {
  return {
    name: 'inject-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const tag = `<meta http-equiv="Content-Security-Policy" content="${CSP}" />`
        + `\n    <meta http-equiv="X-Content-Type-Options" content="nosniff" />`;
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
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
