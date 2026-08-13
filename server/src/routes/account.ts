/**
 * Área do cliente: cadastro, login com senha real, perfil, endereços e
 * histórico de pedidos vindo do banco.
 */

import { Router } from 'express';

import {
  assertLoginAllowed, currentCustomerId, customerLoginSession, customerLogout,
  hashPassword, recordLoginAttempt, requireCustomer, verifyPassword,
} from '../auth.ts';
import { placeholders, q, transaction } from '../db.ts';
import { fail } from '../errors.ts';
import { body, bodyBool, bodyStr, iso, jsonOk, validCpf, validEmail } from '../http.ts';
import { h } from './helpers.ts';

export const accountRoutes = Router();

/** Tudo que a tela "Minha conta" mostra, em três consultas. */
async function customerPayload(id: number): Promise<Record<string, unknown>> {
  const c = await q.one('SELECT id, name, email, phone, cpf FROM customers WHERE id = ?', [id]);
  if (c === null) fail('Conta não encontrada.', 404, 'not_found');

  const addresses = (
    await q.all(
      'SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC',
      [id],
    )
  ).map((a) => ({
    id: String(a.id),
    label: a.label,
    cep: a.cep,
    street: a.street,
    number: a.number,
    complement: a.complement,
    neighborhood: a.neighborhood,
    city: a.city,
    state: a.state,
    isDefault: Boolean(a.is_default),
  }));

  const orders = await q.all(
    'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50',
    [id],
  );

  // Uma consulta para os itens de todos os pedidos, em vez de uma por pedido.
  const itemsByOrder = new Map<string, { name: unknown; quantity: number; unitPrice: number }[]>();
  if (orders.length) {
    const ids = orders.map((o) => o.id);
    const rows = await q.all(
      `SELECT order_id, name, quantity, unit_price FROM order_items
        WHERE order_id IN (${placeholders(ids.length)}) ORDER BY id ASC`,
      ids,
    );
    for (const i of rows) {
      const key = String(i.order_id);
      const item = { name: i.name, quantity: Number(i.quantity) || 0, unitPrice: Number(i.unit_price) || 0 };
      const list = itemsByOrder.get(key);
      if (list) list.push(item);
      else itemsByOrder.set(key, [item]);
    }
  }

  return {
    name: c.name,
    email: c.email,
    phone: c.phone,
    cpf: c.cpf,
    addresses,
    orders: orders.map((o) => ({
      id: o.id,
      date: iso(o.created_at),
      status: o.status,
      total: Number(o.total) || 0,
      items: itemsByOrder.get(String(o.id)) ?? [],
    })),
    favorites: (
      await q.all('SELECT product_id FROM customer_favorites WHERE customer_id = ?', [id])
    ).map((f) => f.product_id),
  };
}

// POST /api/account/register
accountRoutes.post('/register', h(async (req, res) => {
  const b = body(req);
  const name = bodyStr(b, 'name', '', 160);
  const email = bodyStr(b, 'email', '', 190).toLowerCase();
  const pass = typeof b.password === 'string' ? b.password : '';

  if (name === '') fail('Informe o seu nome.', 422, 'invalid_name');
  if (!validEmail(email)) fail('Informe um e-mail válido.', 422, 'invalid_email');
  if (pass.length < 8) fail('A senha precisa ter pelo menos 8 caracteres.', 422, 'weak_password');

  /*
   * Qualquer cadastro pré-existente com este e-mail bloqueia o registro,
   * inclusive o de quem comprou como visitante (senha nula).
   *
   * Deixar o visitante "assumir" o próprio cadastro parece conveniente, mas
   * como não há confirmação de e-mail, bastava saber o endereço de alguém
   * para criar uma senha e receber CPF, telefone, endereço e o histórico de
   * pedidos daquela pessoa. Definir senha para um cadastro existente só é
   * seguro depois de um link de confirmação enviado por e-mail.
   */
  if ((await q.one('SELECT id FROM customers WHERE email = ?', [email])) !== null) {
    fail(
      'Já existe cadastro com este e-mail. Faça login ou fale com a loja para recuperar o acesso.',
      409,
      'email_taken',
    );
  }

  const hash = await hashPassword(pass);
  const id = await transaction(async (tx) => {
    await tx.run('INSERT INTO customers (name, email, password_hash) VALUES (?,?,?)', [name, email, hash]);
    return tx.lastId();
  });

  await customerLoginSession(req, id);
  jsonOk(res, { account: await customerPayload(id) }, 201);
}));

// POST /api/account/login
accountRoutes.post('/login', h(async (req, res) => {
  const b = body(req);
  const email = bodyStr(b, 'email', '', 190).toLowerCase();
  const pass = typeof b.password === 'string' ? b.password : '';

  await assertLoginAllowed(req, 'customer', email);
  const c = await q.one('SELECT id, password_hash FROM customers WHERE email = ?', [email]);
  const ok = c !== null
    && typeof c.password_hash === 'string'
    && c.password_hash !== ''
    && (await verifyPassword(pass, c.password_hash));

  await recordLoginAttempt(req, 'customer', email, ok);
  if (!ok || c === null) fail('E-mail ou senha inválidos.', 401, 'invalid_credentials');

  const id = Number(c.id);
  await customerLoginSession(req, id);
  jsonOk(res, { account: await customerPayload(id) });
}));

// POST /api/account/logout
accountRoutes.post('/logout', h(async (req, res) => {
  await customerLogout(req);
  jsonOk(res, { ok: true });
}));

// GET /api/account
accountRoutes.get('/', h(async (req, res) => {
  const id = currentCustomerId(req);
  jsonOk(res, { account: id === null ? null : await customerPayload(id) });
}));

// PUT /api/account — dados pessoais e endereço padrão
accountRoutes.put('/', h(async (req, res) => {
  const id = requireCustomer(req);
  const b = body(req);

  const name = bodyStr(b, 'name', '', 160);
  const phone = bodyStr(b, 'phone', '', 30);
  const cpf = bodyStr(b, 'cpf', '', 20);
  if (cpf !== '' && !validCpf(cpf)) fail('CPF inválido.', 422, 'invalid_cpf');

  await q.run(
    "UPDATE customers SET name = COALESCE(NULLIF(?, ''), name), phone = ?, cpf = ? WHERE id = ?",
    [name, phone, cpf, id],
  );

  if (b.address !== null && typeof b.address === 'object' && !Array.isArray(b.address)) {
    const a = b.address as Record<string, unknown>;
    await q.run('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [id]);
    const addrId = bodyStr(a, 'id', '', 20);
    const params = [
      bodyStr(a, 'label', 'Principal', 60), bodyStr(a, 'cep', '', 12),
      bodyStr(a, 'street', '', 160), bodyStr(a, 'number', '', 20),
      bodyStr(a, 'complement', '', 120), bodyStr(a, 'neighborhood', '', 120),
      bodyStr(a, 'city', '', 120), bodyStr(a, 'state', 'SP', 2).toUpperCase(),
    ];
    // O WHERE inclui customer_id: ninguém edita endereço de outra conta.
    const exists = /^\d+$/.test(addrId)
      ? await q.one('SELECT id FROM customer_addresses WHERE id = ? AND customer_id = ?', [addrId, id])
      : null;
    if (exists) {
      await q.run(
        `UPDATE customer_addresses
            SET label=?, cep=?, street=?, number=?, complement=?, neighborhood=?, city=?, state=?, is_default=1
          WHERE id = ? AND customer_id = ?`,
        [...params, addrId, id],
      );
    } else {
      await q.run(
        `INSERT INTO customer_addresses
           (label, cep, street, number, complement, neighborhood, city, state, is_default, customer_id)
         VALUES (?,?,?,?,?,?,?,?,1,?)`,
        [...params, id],
      );
    }
  }

  jsonOk(res, { account: await customerPayload(id) });
}));

// ------------------------------------------------------------- endereços ----

// POST /api/account/addresses — novo endereço
accountRoutes.post('/addresses', h(async (req, res) => {
  const id = requireCustomer(req);
  const a = body(req);
  const isDefault = bodyBool(a, 'isDefault');
  if (isDefault) {
    await q.run('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [id]);
  }
  await q.run(
    `INSERT INTO customer_addresses
        (customer_id, label, cep, street, number, complement, neighborhood, city, state, is_default)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      id, bodyStr(a, 'label', 'Endereço', 60), bodyStr(a, 'cep', '', 12),
      bodyStr(a, 'street', '', 160), bodyStr(a, 'number', '', 20),
      bodyStr(a, 'complement', '', 120), bodyStr(a, 'neighborhood', '', 120),
      bodyStr(a, 'city', '', 120), bodyStr(a, 'state', 'SP', 2).toUpperCase(),
      isDefault ? 1 : 0,
    ],
  );
  jsonOk(res, { account: await customerPayload(id) }, 201);
}));

// PUT /api/account/addresses/:id
accountRoutes.put('/addresses/:id', h(async (req, res) => {
  const id = requireCustomer(req);
  const a = body(req);
  // O WHERE inclui customer_id: ninguém edita endereço de outra conta.
  const owned = await q.one('SELECT id FROM customer_addresses WHERE id = ? AND customer_id = ?', [
    req.params.id, id,
  ]);
  if (owned === null) fail('Endereço não encontrado.', 404, 'not_found');

  const isDefault = bodyBool(a, 'isDefault');
  if (isDefault) {
    await q.run('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [id]);
  }
  await q.run(
    `UPDATE customer_addresses
        SET label=?, cep=?, street=?, number=?, complement=?, neighborhood=?, city=?, state=?, is_default=?
      WHERE id = ? AND customer_id = ?`,
    [
      bodyStr(a, 'label', 'Endereço', 60), bodyStr(a, 'cep', '', 12),
      bodyStr(a, 'street', '', 160), bodyStr(a, 'number', '', 20),
      bodyStr(a, 'complement', '', 120), bodyStr(a, 'neighborhood', '', 120),
      bodyStr(a, 'city', '', 120), bodyStr(a, 'state', 'SP', 2).toUpperCase(),
      isDefault ? 1 : 0, req.params.id, id,
    ],
  );
  jsonOk(res, { account: await customerPayload(id) });
}));

// DELETE /api/account/addresses/:id
accountRoutes.delete('/addresses/:id', h(async (req, res) => {
  const id = requireCustomer(req);
  await q.run('DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?', [req.params.id, id]);
  jsonOk(res, { account: await customerPayload(id) });
}));

// PUT /api/account/favorites — lista completa de ids favoritos
accountRoutes.put('/favorites', h(async (req, res) => {
  const id = requireCustomer(req);
  const b = body(req);
  const lista = Array.isArray(b.favorites) ? b.favorites : [];
  const ids = [
    ...new Set(
      lista
        .map((v: unknown) => (typeof v === 'string' ? v.slice(0, 100) : ''))
        .filter((v: string) => v !== ''),
    ),
  ].slice(0, 300);

  await transaction(async (tx) => {
    await tx.run('DELETE FROM customer_favorites WHERE customer_id = ?', [id]);
    for (const pid of ids) {
      await tx.run('INSERT IGNORE INTO customer_favorites (customer_id, product_id) VALUES (?,?)', [id, pid]);
    }
  });
  jsonOk(res, { account: await customerPayload(id) });
}));
