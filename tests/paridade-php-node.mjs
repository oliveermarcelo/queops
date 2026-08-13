/**
 * Paridade entre a API PHP (que sai) e a API Node (que entra).
 *
 *   node tests/paridade-php-node.mjs
 *
 * Aponta os dois servidores para o MESMO banco e compara as respostas JSON
 * campo por campo. É o teste que justifica apagar o `api/` em PHP: se as duas
 * implementações devolvem exatamente o mesmo objeto para o mesmo pedido, o
 * front-end não tem como notar a troca.
 *
 * Pré-requisitos (ver tests/README.md):
 *   PHP  em  http://127.0.0.1:8000   com api/config.php apontando para o banco
 *   Node em  http://127.0.0.1:8080   com o .env apontando para o mesmo banco
 *
 * Só rotas de LEITURA e de cotação entram aqui: criar pedido muda estoque, e a
 * segunda execução responderia diferente da primeira por motivo legítimo. A
 * gravação é coberta por tests/e2e/compra-completa.mjs.
 */

const PHP = process.env.PHP_URL ?? 'http://127.0.0.1:8000';
const NODE = process.env.NODE_URL ?? 'http://127.0.0.1:8080';

let ok = 0;
const falhas = [];

/** Campos que mudam a cada requisição por natureza — não são divergência. */
const VOLATEIS = new Set(['csrfToken']);

function normalize(v) {
  if (Array.isArray(v)) return v.map(normalize);
  if (v && typeof v === 'object') {
    const out = {};
    for (const k of Object.keys(v).sort()) {
      out[k] = VOLATEIS.has(k) ? '<volátil>' : normalize(v[k]);
    }
    return out;
  }
  return v;
}

/** Primeiro caminho onde os dois objetos divergem (ou null). */
function firstDiff(a, b, path = '') {
  if (JSON.stringify(a) === JSON.stringify(b)) return null;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    return `${path || '(raiz)'}: PHP=${JSON.stringify(a)} Node=${JSON.stringify(b)}`;
  }
  if (Array.isArray(a) !== Array.isArray(b)) return `${path}: um é lista, o outro não`;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return `${path}: ${a.length} itens no PHP, ${b.length} no Node`;
    for (let i = 0; i < a.length; i++) {
      const d = firstDiff(a[i], b[i], `${path}[${i}]`);
      if (d) return d;
    }
    return null;
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const d = firstDiff(a[k], b[k], path ? `${path}.${k}` : k);
    if (d) return d;
  }
  return null;
}

async function chamar(base, method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const texto = await res.text();
  let json;
  try {
    json = JSON.parse(texto);
  } catch {
    json = { '<não-json>': texto.slice(0, 200) };
  }
  return { status: res.status, json };
}

/** Token CSRF de cada backend (cada um tem a sua sessão). */
async function csrf(base) {
  const res = await fetch(base + '/api/session');
  const cookie = res.headers.getSetCookie?.()?.[0] ?? res.headers.get('set-cookie') ?? '';
  const { csrfToken } = await res.json();
  return { token: csrfToken, cookie: cookie.split(';')[0] };
}

async function comparar(nome, method, path, body) {
  const extras = {};
  if (method !== 'GET') {
    const [p, n] = await Promise.all([csrf(PHP), csrf(NODE)]);
    extras.php = { 'X-CSRF-Token': p.token, Cookie: p.cookie };
    extras.node = { 'X-CSRF-Token': n.token, Cookie: n.cookie };
  }
  const [php, node] = await Promise.all([
    chamar(PHP, method, path, body, extras.php),
    chamar(NODE, method, path, body, extras.node),
  ]);

  if (php.status !== node.status) {
    falhas.push(`${nome}: status PHP=${php.status} Node=${node.status}`);
    return;
  }
  const d = firstDiff(normalize(php.json), normalize(node.json));
  if (d) {
    falhas.push(`${nome}: ${d}`);
    return;
  }
  ok++;
  console.log(`  ok   ${nome} (${php.status})`);
}

console.log('Paridade PHP → Node\n');

// ---------------------------------------------------------------- leitura ----
await comparar('GET /api/session', 'GET', '/api/session');
await comparar('GET /api/catalog', 'GET', '/api/catalog');
await comparar('GET /api/products', 'GET', '/api/products');
await comparar('GET /api/products/{id}', 'GET', '/api/products/placa-de-cobre-m-1001');
await comparar('GET /api/products/{inexistente} → 404', 'GET', '/api/products/nao-existe-mesmo');
await comparar('GET /api/account (visitante)', 'GET', '/api/account');
await comparar('GET /api/admin/me (deslogado)', 'GET', '/api/admin/me');
await comparar('GET /api/admin/state (sem sessão) → 401', 'GET', '/api/admin/state');
await comparar('GET /api/v1/products (sem chave) → 401', 'GET', '/api/v1/products');
await comparar('GET /api/rota-que-nao-existe → 404', 'GET', '/api/rota-que-nao-existe');

// -------------------------------------------------------------- cotações ----
const item = { productId: 'placa-de-cobre-m-1001', quantity: 2 };

await comparar('quote: CEP da capital', 'POST', '/api/checkout/quote', {
  items: [item], cep: '01310100', payment: 'card',
});
await comparar('quote: Pix aplica desconto', 'POST', '/api/checkout/quote', {
  items: [item], cep: '01310100', payment: 'pix',
});
await comparar('quote: UF sem preço cai no padrão', 'POST', '/api/checkout/quote', {
  items: [item], cep: '40000000', payment: 'card',
});
await comparar('quote: acima do mínimo, frete grátis', 'POST', '/api/checkout/quote', {
  items: [{ ...item, quantity: 30 }], cep: '40000000', payment: 'card',
});
await comparar('quote: cupom válido', 'POST', '/api/checkout/quote', {
  items: [{ ...item, quantity: 4 }], cep: '01310100', coupon: 'BEMVINDO10', payment: 'card',
});
await comparar('quote: cupom inexistente devolve erro no campo', 'POST', '/api/checkout/quote', {
  items: [item], cep: '01310100', coupon: 'NAOEXISTE', payment: 'card',
});
await comparar('quote: cupom abaixo do mínimo', 'POST', '/api/checkout/quote', {
  items: [{ productId: 'placa-de-cobre-m-1001', quantity: 1 }], cep: '01310100', coupon: 'BEMVINDO10', payment: 'pix',
});
await comparar('quote: sacola vazia', 'POST', '/api/checkout/quote', { items: [], cep: '01310100' });
await comparar('quote: produto inexistente na sacola', 'POST', '/api/checkout/quote', {
  items: [{ productId: 'fantasma', quantity: 1 }], cep: '01310100',
});
await comparar('quote: quantidade acima do estoque', 'POST', '/api/checkout/quote', {
  items: [{ productId: 'placa-de-cobre-m-1001', quantity: 999 }], cep: '01310100',
});
await comparar('quote: CEP em branco (sem UF)', 'POST', '/api/checkout/quote', { items: [item] });

// -------------------------------------------------------------- validação ----
await comparar('POST /api/orders sem nome → 422', 'POST', '/api/orders', { items: [item] });
await comparar('POST /api/orders com CPF inválido → 422', 'POST', '/api/orders', {
  items: [item], name: 'Teste', email: 'teste@exemplo.com', phone: '11999998888', cpf: '11111111111',
});
await comparar('POST /api/orders sem CEP → 422', 'POST', '/api/orders', {
  items: [item], name: 'Teste', email: 'teste@exemplo.com', phone: '11999998888', cpf: '52998224725',
  payment: 'pix', address: { street: 'Rua A', number: '1', city: 'São Paulo', state: 'SP' },
});
await comparar('POST /api/account/login com senha errada → 401', 'POST', '/api/account/login', {
  email: 'ninguem-mesmo@exemplo.com', password: 'errada',
});
await comparar('POST /api/admin/login com senha errada → 401', 'POST', '/api/admin/login', {
  email: 'ninguem-admin@exemplo.com', password: 'errada',
});
await comparar('POST /api/account/register com e-mail inválido → 422', 'POST', '/api/account/register', {
  name: 'Teste', email: 'nao-e-email', password: 'senhasegura123',
});

console.log('');
if (falhas.length === 0) {
  console.log(`Paridade confirmada: ${ok} comparações idênticas.`);
  process.exit(0);
}
console.log(`${ok} idênticas, ${falhas.length} divergentes:`);
for (const f of falhas) console.log('  FALHA ' + f);
process.exit(1);
