/**
 * Rotas públicas da loja: sessão, catálogo, cotação, pedido e carrinho
 * abandonado. Nada aqui exige login — mas nada aqui confia em preço vindo
 * do navegador.
 */

import { Router } from 'express';

import { csrfToken, currentAdmin, currentCustomerId } from '../auth.ts';
import { nextCounter, q, transaction } from '../db.ts';
import { fail } from '../errors.ts';
import {
  body, bodyStr, dateBR, dateSP, digits, jsonOk, validCpf, validEmail,
} from '../http.ts';
import { deliveryDaysFor, normalizeCep, quoteCart } from '../pricing.ts';
import { fireWebhooks } from '../providers.ts';
import { fetchProducts, getSettings, productRowToApi, publicSettings } from '../store.ts';
import { h } from './helpers.ts';

export const publicRoutes = Router();

// GET /api/session — token CSRF + quem está logado (loja e painel)
publicRoutes.get('/session', h(async (req, res) => {
  const admin = await currentAdmin(req);
  jsonOk(res, {
    csrfToken: await csrfToken(req),
    admin: admin ? { name: admin.name, email: admin.email } : null,
    customer: currentCustomerId(req) !== null,
  });
}));

// GET /api/catalog — tudo que a vitrine precisa em uma requisição só
publicRoutes.get('/catalog', h(async (_req, res) => {
  const parents = await q.all('SELECT * FROM categories ORDER BY position ASC, name ASC');

  const children = new Map<string, { id: string; name: string }[]>();
  for (const s of await q.all('SELECT * FROM subcategories ORDER BY position ASC, name ASC')) {
    const key = String(s.parent_id);
    const list = children.get(key);
    const entry = { id: String(s.id), name: String(s.name) };
    if (list) list.push(entry);
    else children.set(key, [entry]);
  }

  jsonOk(res, {
    products: await fetchProducts(),
    categories: parents.map((c) => ({ id: c.id, name: c.name, description: c.description })),
    menu: parents.map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      featured: Boolean(c.featured),
      subcategories: children.get(String(c.id)) ?? [],
    })),
    settings: await publicSettings(),
  });
}));

// GET /api/products
publicRoutes.get('/products', h(async (_req, res) => {
  jsonOk(res, { products: await fetchProducts() });
}));

// GET /api/products/:id
publicRoutes.get('/products/:id', h(async (req, res) => {
  const row = await q.one('SELECT * FROM products WHERE id = ? AND active = 1', [req.params.id]);
  if (row === null) fail('Produto não encontrado.', 404, 'not_found');
  jsonOk(res, { product: productRowToApi(row) });
}));

// POST /api/checkout/quote — prévia de frete/cupom/total (sem gravar nada)
publicRoutes.post('/checkout/quote', h(async (req, res) => {
  const b = body(req);
  jsonOk(res, await quoteCart(
    b.items,
    bodyStr(b, 'state', '', 2),
    bodyStr(b, 'cep', '', 12),
    bodyStr(b, 'coupon', '', 40),
    bodyStr(b, 'payment', 'card', 10),
  ));
}));

// POST /api/orders — cria o pedido de verdade
publicRoutes.post('/orders', h(async (req, res) => {
  const b = body(req);

  const name = bodyStr(b, 'name', '', 160);
  const email = bodyStr(b, 'email', '', 190).toLowerCase();
  const phone = bodyStr(b, 'phone', '', 30);
  const cpf = bodyStr(b, 'cpf', '', 20);
  const payment = bodyStr(b, 'payment', 'pix', 10);

  if (name === '') fail('Informe o nome completo.', 422, 'invalid_name');
  if (!validEmail(email)) fail('Informe um e-mail válido.', 422, 'invalid_email');
  if (digits(phone).length < 10) fail('Informe um telefone com DDD.', 422, 'invalid_phone');
  if (!validCpf(cpf)) fail('CPF inválido.', 422, 'invalid_cpf');
  if (!['card', 'pix', 'boleto'].includes(payment)) fail('Forma de pagamento inválida.', 422, 'invalid_payment');
  // Respeita o que está habilitado no painel: esconder o boleto na tela não
  // adianta se a API continuar aceitando um pedido com boleto.
  const settings = await getSettings();
  if (!(settings.payments as Record<string, boolean>)?.[payment]) {
    fail('Esta forma de pagamento não está disponível.', 422, 'payment_disabled');
  }

  const endereco = b.address !== null && typeof b.address === 'object' && !Array.isArray(b.address)
    ? (b.address as Record<string, unknown>)
    : {};
  const cep = bodyStr(endereco, 'cep', '', 12);
  const uf = bodyStr(endereco, 'state', 'SP', 2).toUpperCase();
  if (normalizeCep(cep) === '') fail('Informe um CEP válido com 8 dígitos.', 422, 'invalid_cep');
  if (
    bodyStr(endereco, 'street') === ''
    || bodyStr(endereco, 'number') === ''
    || bodyStr(endereco, 'city') === ''
  ) {
    fail('Preencha rua, número e cidade.', 422, 'invalid_address');
  }

  const sessionCustomerId = currentCustomerId(req);
  const etaDays = deliveryDaysFor(uf);

  let gravado: { orderId: string; quote: Awaited<ReturnType<typeof quoteCart>> };

  try {
    gravado = await transaction(async (tx) => {
      /*
       * O total é recalculado DENTRO da transação — o valor que veio do
       * navegador é ignorado, e o preço lido é o mesmo que a baixa de estoque
       * logo abaixo enxerga.
       */
      const quote = await quoteCart(
        b.items,
        uf,
        cep,
        bodyStr(b, 'coupon', '', 40),
        payment,
        tx,
      );
      if (quote.items.length === 0) {
        throw new EmptyCart();
      }

      /*
       * Vínculo com o cliente.
       *
       * Se houver sessão, é o próprio dono da conta: pode atualizar o
       * cadastro. Sem sessão (compra como visitante), o pedido é apenas
       * ASSOCIADO ao cadastro existente daquele e-mail — nada do perfil é
       * sobrescrito. Caso contrário, quem soubesse o e-mail de um cliente
       * conseguiria trocar nome, CPF, telefone e endereço padrão dele
       * apenas finalizando um pedido.
       */
      let customerId = sessionCustomerId;
      const isOwner = customerId !== null;

      if (isOwner) {
        await tx.run('UPDATE customers SET name = ?, phone = ?, cpf = ? WHERE id = ?', [name, phone, cpf, customerId]);
      } else {
        const existing = await tx.one('SELECT id FROM customers WHERE email = ?', [email]);
        if (existing) {
          customerId = Number(existing.id);
        } else {
          await tx.run('INSERT INTO customers (name, email, phone, cpf) VALUES (?, ?, ?, ?)', [name, email, phone, cpf]);
          customerId = tx.lastId();
        }
      }

      const id = 'QP-' + String(await nextCounter(tx, 'order')).padStart(6, '0');

      await tx.run(
        `INSERT INTO orders (
            id, customer_id, customer_name, customer_email, customer_phone, customer_cpf,
            subtotal, shipping_cost, discount, total, coupon_code, status, payment, channel,
            ship_cep, ship_street, ship_number, ship_complement, ship_neighborhood, ship_city, ship_state,
            delivery_eta
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id, customerId, name, email, phone, cpf,
          quote.subtotal, quote.shipping, quote.discount, quote.total,
          quote.couponCode, 'pending', payment, 'site',
          cep, bodyStr(endereco, 'street', '', 160), bodyStr(endereco, 'number', '', 20),
          bodyStr(endereco, 'complement', '', 120), bodyStr(endereco, 'neighborhood', '', 120),
          bodyStr(endereco, 'city', '', 120), uf,
          dateSP(etaDays),
        ],
      );

      for (const it of quote.items) {
        await tx.run(
          'INSERT INTO order_items (order_id, product_id, name, quantity, unit_price) VALUES (?,?,?,?,?)',
          [id, it.productId, it.name, it.quantity, it.unitPrice],
        );
        // Baixa de estoque com trava no próprio UPDATE: nunca fica negativo,
        // mesmo com dois pedidos simultâneos do último item.
        const affected = await tx.run(
          'UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?',
          [it.quantity, it.productId, it.quantity],
        );
        if (affected === 0) throw new Error('Estoque insuficiente para ' + it.name);
      }

      if (quote.couponCode !== null) {
        // O UPDATE condicional é a própria checagem do limite: se outro
        // pedido consumiu a última utilização entre a cotação e agora,
        // nenhuma linha é afetada e a transação inteira é desfeita.
        const usado = await tx.run(
          `UPDATE coupons SET uses = uses + 1
            WHERE code = ? AND active = 1
              AND (max_uses IS NULL OR uses < max_uses)`,
          [quote.couponCode],
        );
        if (usado === 0) throw new Error('Cupom esgotado: ' + quote.couponCode);
      }

      // O endereço só entra na agenda de quem está logado. O endereço de
      // entrega do pedido fica gravado no próprio pedido, de qualquer forma.
      if (isOwner) {
        await tx.run('UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?', [customerId]);
        await tx.run(
          `INSERT INTO customer_addresses
             (customer_id, label, cep, street, number, complement, neighborhood, city, state, is_default)
           VALUES (?,?,?,?,?,?,?,?,?,1)`,
          [
            customerId, 'Principal', cep, bodyStr(endereco, 'street', '', 160),
            bodyStr(endereco, 'number', '', 20), bodyStr(endereco, 'complement', '', 120),
            bodyStr(endereco, 'neighborhood', '', 120), bodyStr(endereco, 'city', '', 120), uf,
          ],
        );
      }

      return { orderId: id, quote };
    });
  } catch (e) {
    if (e instanceof EmptyCart) {
      fail('A sua sacola está vazia ou os itens não estão mais disponíveis.', 422, 'empty_cart');
    }
    console.error('[queops] falha ao gravar pedido:', e);
    fail('Não foi possível concluir o pedido. Confira o estoque e tente de novo.', 409, 'order_failed');
  }

  const { orderId, quote } = gravado;

  // Marca como recuperado qualquer carrinho abandonado deste e-mail.
  await q.run("UPDATE abandoned_carts SET status = 'recovered' WHERE customer_email = ? AND status = 'open'", [email]);

  fireWebhooks('order.created', { orderId, total: quote.total, email });

  jsonOk(res, {
    order: {
      id: orderId,
      customerName: name,
      total: quote.total,
      subtotal: quote.subtotal,
      shipping: quote.shipping,
      discount: quote.discount,
      payment,
      deliveryEta: dateBR(etaDays),
    },
  }, 201);
}));

/** Sacola vazia: sinaliza 422 em vez do 409 genérico de falha de pedido. */
class EmptyCart extends Error {}

// POST /api/carts/abandoned — registra a sacola para recuperação
publicRoutes.post('/carts/abandoned', h(async (req, res) => {
  const b = body(req);
  const email = bodyStr(b, 'email', '', 190).toLowerCase();
  if (!validEmail(email)) fail('E-mail inválido.', 422, 'invalid_email');

  const quote = await quoteCart(b.items, '', '', '', 'card');
  if (quote.items.length === 0) {
    jsonOk(res, { ok: true, skipped: true });
    return;
  }

  const nome = bodyStr(b, 'name', '', 160);
  const fone = bodyStr(b, 'phone', '', 30);

  // Um carrinho aberto por e-mail: atualiza em vez de acumular lixo.
  const cartId = await transaction(async (tx) => {
    const existing = await tx.one(
      "SELECT id FROM abandoned_carts WHERE customer_email = ? AND status = 'open'",
      [email],
    );
    const id = existing
      ? String(existing.id)
      : 'AC-' + String(await nextCounter(tx, 'cart')).padStart(5, '0');

    if (existing) {
      await tx.run(
        'UPDATE abandoned_carts SET customer_name = ?, customer_phone = ?, total = ?, abandoned_at = NOW() WHERE id = ?',
        [nome, fone, quote.subtotal, id],
      );
      await tx.run('DELETE FROM abandoned_cart_items WHERE cart_id = ?', [id]);
    } else {
      await tx.run(
        'INSERT INTO abandoned_carts (id, customer_name, customer_email, customer_phone, total) VALUES (?,?,?,?,?)',
        [id, nome, email, fone, quote.subtotal],
      );
    }
    for (const it of quote.items) {
      await tx.run(
        'INSERT INTO abandoned_cart_items (cart_id, product_id, name, quantity, unit_price) VALUES (?,?,?,?,?)',
        [id, it.productId, it.name, it.quantity, it.unitPrice],
      );
    }
    return id;
  });

  jsonOk(res, { ok: true, cartId });
}));
