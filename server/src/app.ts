/**
 * Monta o aplicativo Express: um único processo serve a vitrine compilada e a
 * API.
 *
 * Este arquivo é o que substitui os dois `.htaccess` da versão Apache. Cada
 * bloco abaixo tem o comentário do que ele reproduz, porque não é óbvio olhando
 * só o código que "esta linha aqui é o fallback da SPA" ou que "estes headers
 * eram do mod_headers".
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

import compression from 'compression';
import express, { type NextFunction, type Request, type Response } from 'express';

import { requireCsrf } from './auth.ts';
import { config } from './config.ts';
import { CSP_API, CSP_LOJA } from './csp.ts';
import { ApiError } from './errors.ts';
import { jsonOk } from './http.ts';
import { accountRoutes } from './routes/account.ts';
import { adminRoutes } from './routes/admin.ts';
import { publicRoutes } from './routes/public.ts';
import { v1Routes } from './routes/v1.ts';
import { webhookRoutes } from './routes/webhooks.ts';
import { sessionMiddleware } from './session.ts';

/*
 * A política em si mora em csp.ts, compartilhada com o build do front — a <meta>
 * do index.html e este header precisam dizer a MESMA coisa (o navegador aplica
 * a interseção das duas). Ver o comentário lá.
 */

export function createApp(): express.Express {
  const app = express();

  app.disable('x-powered-by');
  // Passenger/nginx (Hostinger) põe X-Forwarded-For e X-Forwarded-Proto; sem
  // isto, todo cliente apareceria com o IP do proxy no rate limiting.
  if (config.trustProxy) app.set('trust proxy', true);

  // Equivale ao mod_deflate: comprime HTML, CSS, JS e JSON.
  app.use(compression());

  /**
   * HTTPS obrigatório — só quando o proxy DIZ que a requisição veio em http.
   *
   * Redirecionar apenas por `req.secure === false` daria laço infinito num
   * ambiente que termina o TLS e não repassa o cabeçalho: o navegador iria
   * para https, o proxy entregaria sem header, e nós mandaríamos para https
   * outra vez.
   */
  app.use((req, res, next) => {
    const proto = req.get('X-Forwarded-Proto');
    if (config.isProd && proto !== undefined && proto.split(',')[0].trim() === 'http') {
      res.redirect(301, 'https://' + req.get('Host') + req.originalUrl);
      return;
    }
    next();
  });

  // Cabeçalhos de segurança — o que o mod_headers do .htaccess enviava.
  app.use((req, res, next) => {
    const isApi = req.path === '/api' || req.path.startsWith('/api/');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Content-Security-Policy', isApi ? CSP_API : CSP_LOJA);
    if (!isApi) {
      res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
    }
    // HSTS: só depois de confirmar que o HTTPS responde em todo o domínio.
    // Uma vez enviado, o navegador se recusa a acessar o site por HTTP durante
    // o período abaixo — ligue com consciência, via variável de ambiente.
    if (config.isProd && process.env.HSTS === 'true') {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  // ------------------------------------------------------------- API ----

  const api = express.Router();

  api.use(express.json({ limit: '1mb' }));
  // Corpo inválido responde no formato de erro da API, não no HTML do Express.
  api.use((err: unknown, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof SyntaxError) {
      jsonOk(res, { error: { code: 'invalid_json', message: 'Corpo da requisição não é um JSON válido.' } }, 400);
      return;
    }
    next(err);
  });

  api.use(sessionMiddleware);

  /**
   * CSRF em tudo que altera estado, EXCETO /api/v1/* e /api/webhooks/*.
   *
   * As duas exceções têm o mesmo motivo: quem chama é outro servidor, não o
   * navegador de ninguém. Não há cookie de sessão envolvido, então não há
   * requisição forjada a barrar — exigir um token que o chamador não tem como
   * obter só quebraria a integração. Cada uma se autentica do seu jeito: a v1
   * por chave no Authorization, os webhooks por assinatura HMAC.
   */
  api.use((req, _res, next) => {
    const servidorAServidor = req.path.startsWith('/v1/') || req.path.startsWith('/webhooks/');
    if (!servidorAServidor) requireCsrf(req);
    next();
  });

  api.use('/webhooks', webhookRoutes);
  api.use('/v1', v1Routes);
  api.use('/admin', adminRoutes);
  api.use('/account', accountRoutes);
  api.use('/', publicRoutes);

  api.use((_req, _res, next) => {
    next(new ApiError('Endpoint não encontrado.', 404, 'not_found'));
  });

  app.use('/api', api);

  // -------------------------------------------------- vitrine estática ----

  const publicDir = path.resolve(process.cwd(), config.publicDir);
  const indexHtml = path.join(publicDir, 'index.html');

  app.use(
    express.static(publicDir, {
      index: false, // o fallback abaixo é que decide quem recebe o index.html
      etag: true,
      lastModified: true,
      setHeaders(res, filePath) {
        // Assets com hash no nome (o Vite gera nomes únicos por build) podem
        // ser guardados para sempre; qualquer mudança troca o nome do arquivo.
        if (/-[A-Za-z0-9_-]{8,}\.(js|css|woff2?)$/.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          return;
        }
        if (/\.(png|jpe?g|webp|avif|gif|svg|ico)$/i.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=2592000');
          return;
        }
        if (/\.woff2?$/i.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000');
          return;
        }
        // O HTML nunca deve ser cacheado, para o navegador sempre pegar o
        // build novo depois de um deploy.
        res.setHeader('Cache-Control', 'no-cache');
      },
    }),
  );

  /**
   * Fallback da SPA: /admin e qualquer outra rota devolvem o index.html em vez
   * de 404 — é a regra `RewriteRule ^ index.html [L]` do .htaccess.
   *
   * Vale só para GET/HEAD de navegação: um POST para uma URL inexistente deve
   * continuar dando 404, não a página inicial.
   */
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      next();
      return;
    }
    if (!existsSync(indexHtml)) {
      res
        .status(500)
        .type('text/plain')
        .send(
          'Front-end não encontrado. Rode `npm run build` e confirme que a pasta '
          + `"${config.publicDir}" está ao lado do servidor.`,
        );
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(indexHtml);
  });

  // ---------------------------------------------------- erros no fim ----

  app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const isApi = req.path === '/api' || req.path.startsWith('/api/');

    if (err instanceof ApiError) {
      if (isApi) {
        jsonOk(res, { error: { code: err.code, message: err.message } }, err.status);
      } else {
        res.status(err.status).type('text/plain').send(err.message);
      }
      return;
    }

    console.error('[queops]', err);
    const message = config.isProd
      ? 'Erro interno. Tente novamente em instantes.'
      : err instanceof Error
        ? err.message
        : String(err);

    if (isApi) {
      jsonOk(res, { error: { code: 'internal_error', message } }, 500);
    } else {
      res.status(500).type('text/plain').send(message);
    }
  });

  return app;
}
