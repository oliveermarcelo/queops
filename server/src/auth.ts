/**
 * CSRF, limitação de tentativas de login, sessão de admin/cliente e chaves de API.
 *
 * As senhas continuam em bcrypt: os hashes `$2y$…` gerados pelo
 * `password_hash()` do PHP são lidos sem conversão, então ninguém precisa
 * redefinir senha por causa da troca de runtime.
 */

import { randomBytes } from 'node:crypto';

import bcrypt from 'bcryptjs';
import type { Request } from 'express';

import { safeEqual } from './crypto.ts';
import { q, type Row } from './db.ts';
import { fail } from './errors.ts';
import { clientIpBinary } from './http.ts';

/**
 * Custo do bcrypt para SENHAS: 12, o mesmo do `PASSWORD_DEFAULT` do PHP 8.4,
 * para que hashes gerados antes e depois da migração conversem.
 *
 * São ~300 ms em JavaScript puro. É caro de propósito — é isso que torna
 * inviável testar milhões de senhas contra um banco vazado — e login humano é
 * raro. A versão assíncrona do bcryptjs divide o trabalho em fatias, então o
 * custo não trava o laço de eventos do processo inteiro.
 */
const ROUNDS_SENHA = 12;

/**
 * Custo para CHAVES DE API: 10.
 *
 * O token tem 160 bits de entropia aleatória, então não existe "adivinhar a
 * senha" a defender; o hash serve só para que um banco vazado não entregue
 * chaves utilizáveis. Um ERP que consulta a API a cada minuto não deve pagar
 * 300 ms de CPU por requisição para proteger um segredo que já é forte.
 */
const ROUNDS_TOKEN = 10;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS_SENHA);
}

export function hashApiToken(token: string): Promise<string> {
  return bcrypt.hash(token, ROUNDS_TOKEN);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  // bcryptjs entende os prefixos $2a$, $2b$ e $2y$ — o do PHP é $2y$.
  return bcrypt.compare(plain, hash).catch(() => false);
}

/**
 * Hash descartável usado quando o e-mail não existe.
 *
 * Sem ele, "e-mail inexistente" responderia na hora e "e-mail existente, senha
 * errada" levaria os ~60 ms do bcrypt: a diferença de tempo permite descobrir
 * quais e-mails têm conta. Comparar contra um hash real iguala o custo.
 */
const DUMMY_HASH = bcrypt.hashSync('senha-que-nao-existe-' + randomBytes(16).toString('hex'), ROUNDS_SENHA);

// ---------------------------------------------------------------- CSRF ----

export async function csrfToken(req: Request): Promise<string> {
  if (!req.qp.data.csrf) {
    req.qp.data.csrf = randomBytes(32).toString('hex');
    await req.qp.save();
  }
  return req.qp.data.csrf;
}

/**
 * Exige o token CSRF em toda requisição que altera estado.
 *
 * O cookie de sessão é SameSite=Lax, o que já barra a maior parte dos ataques,
 * mas o token cobre o caso de navegadores antigos e de subdomínios hostis.
 */
export function requireCsrf(req: Request): void {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return;
  const sent = req.get('X-CSRF-Token') ?? '';
  const known = req.qp.data.csrf ?? '';
  if (known === '' || !safeEqual(known, sent)) {
    fail('Token de segurança inválido. Recarregue a página.', 419, 'csrf_mismatch');
  }
}

// ------------------------------------------------------- Rate limiting ----

/** Bloqueia após muitas falhas seguidas do mesmo e-mail ou do mesmo IP. */
export async function assertLoginAllowed(req: Request, scope: string, identifier: string): Promise<void> {
  const ip = clientIpBinary(req);

  const byUser = await q.one(
    `SELECT COUNT(*) AS n FROM login_attempts
      WHERE scope = ? AND identifier = ? AND success = 0
        AND created_at > (NOW() - INTERVAL 15 MINUTE)`,
    [scope, identifier.toLowerCase()],
  );
  if (Number(byUser?.n ?? 0) >= 8) {
    fail('Muitas tentativas. Aguarde 15 minutos e tente de novo.', 429, 'too_many_attempts');
  }

  if (ip !== null) {
    const byIp = await q.one(
      `SELECT COUNT(*) AS n FROM login_attempts
        WHERE ip = ? AND success = 0 AND created_at > (NOW() - INTERVAL 15 MINUTE)`,
      [ip],
    );
    if (Number(byIp?.n ?? 0) >= 25) {
      fail('Muitas tentativas a partir deste endereço.', 429, 'too_many_attempts');
    }
  }
}

export async function recordLoginAttempt(
  req: Request,
  scope: string,
  identifier: string,
  success: boolean,
): Promise<void> {
  await q.run('INSERT INTO login_attempts (scope, identifier, ip, success) VALUES (?, ?, ?, ?)', [
    scope,
    identifier.toLowerCase(),
    clientIpBinary(req),
    success ? 1 : 0,
  ]);
  // Higiene: mantém a tabela pequena.
  if (Math.random() < 0.02) {
    await q.run('DELETE FROM login_attempts WHERE created_at < (NOW() - INTERVAL 7 DAY)').catch(() => 0);
  }
}

// --------------------------------------------------------------- Admin ----

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  role: string;
}

export async function currentAdmin(req: Request): Promise<AdminUser | null> {
  const id = req.qp.data.adminId;
  if (!id) return null;
  const row = await q.one('SELECT id, name, email, role FROM admin_users WHERE id = ? AND active = 1', [id]);
  if (row === null) return null;
  return { id: Number(row.id), name: String(row.name), email: String(row.email), role: String(row.role) };
}

export async function requireAdmin(req: Request): Promise<AdminUser> {
  const admin = await currentAdmin(req);
  if (admin === null) fail('Faça login no painel para continuar.', 401, 'unauthenticated');
  return admin;
}

export async function adminLogin(req: Request, emailRaw: string, password: string): Promise<AdminUser | null> {
  const email = emailRaw.trim().toLowerCase();
  await assertLoginAllowed(req, 'admin', email);

  const user = await q.one('SELECT * FROM admin_users WHERE email = ? AND active = 1', [email]);
  const hash = typeof user?.password_hash === 'string' ? user.password_hash : DUMMY_HASH;
  const ok = (await verifyPassword(password, hash)) && user !== null;

  await recordLoginAttempt(req, 'admin', email, ok);
  if (!ok || user === null) return null;

  req.qp.data.adminId = Number(user.id);
  await req.qp.regenerate();
  await q.run('UPDATE admin_users SET last_login_at = NOW() WHERE id = ?', [user.id]);

  return {
    id: Number(user.id),
    name: String(user.name),
    email: String(user.email),
    role: String(user.role),
  };
}

export async function adminLogout(req: Request): Promise<void> {
  delete req.qp.data.adminId;
  await req.qp.regenerate();
}

// ------------------------------------------------------------ Cliente ----

export function currentCustomerId(req: Request): number | null {
  const id = req.qp.data.customerId;
  return id ? Number(id) : null;
}

export function requireCustomer(req: Request): number {
  const id = currentCustomerId(req);
  if (id === null) fail('Entre na sua conta para continuar.', 401, 'unauthenticated');
  return id;
}

export async function customerLoginSession(req: Request, customerId: number): Promise<void> {
  req.qp.data.customerId = customerId;
  await req.qp.regenerate();
}

export async function customerLogout(req: Request): Promise<void> {
  delete req.qp.data.customerId;
  await req.qp.regenerate();
}

// ------------------------------------------------------- Chaves de API ----

/**
 * Autentica pelo header `Authorization: Bearer qp_live_...`.
 *
 * Só o hash do token fica no banco, então a verificação percorre as chaves
 * ativas com o prefixo correspondente — o prefixo (16 caracteres) é indexado,
 * o que mantém a busca barata sem precisar guardar o segredo em claro.
 */
export async function currentApiKey(req: Request): Promise<Row | null> {
  const header = req.get('Authorization') ?? '';
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m) return null;
  const token = m[1];

  const candidatas = await q.all('SELECT * FROM api_keys WHERE token_prefix = ? AND revoked = 0', [
    token.slice(0, 16),
  ]);
  for (const k of candidatas) {
    if (await verifyPassword(token, String(k.token_hash))) {
      /*
       * O teste feito pelo painel NÃO conta como uso.
       *
       * `last_used_at` responde a uma pergunta específica: "o ERP já chamou a
       * loja?". É o diagnóstico mais útil que a loja tem quando o outro lado
       * jura que integrou — se nada chegou, o problema está antes daqui.
       *
       * Se o botão "Testar" do painel gravasse uso, a resposta viraria "sim,
       * alguém chamou" logo depois do primeiro clique — e o dono passaria a ler
       * como confirmação do ERP a própria chamada dele. Uma evidência que se
       * contamina ao ser consultada não serve de evidência.
       *
       * A distinção é a sessão de admin: ela vem do cookie httpOnly do painel,
       * que só existe em quem entrou no painel. Nenhum ERP tem esse cookie, e
       * ler isso não custa consulta nenhuma — a sessão já foi decodificada
       * pelo middleware.
       */
      const doPainel = Boolean(req.qp?.data?.adminId);
      if (!doPainel) {
        await q.run('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [k.id]);
      }
      return k;
    }
  }
  return null;
}

/** Exige uma chave de API válida (usada pelos endpoints /api/v1/*). */
export async function requireApiKey(req: Request): Promise<Row> {
  const key = await currentApiKey(req);
  if (key === null) {
    fail('Envie uma chave válida no header Authorization: Bearer <token>.', 401, 'invalid_api_key');
  }
  return key;
}
