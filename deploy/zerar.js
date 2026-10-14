"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// server/src/env.ts
var import_node_fs, import_node_path, candidatos;
var init_env = __esm({
  "server/src/env.ts"() {
    "use strict";
    import_node_fs = require("node:fs");
    import_node_path = __toESM(require("node:path"), 1);
    candidatos = [
      import_node_path.default.resolve(process.cwd(), ".env"),
      // Quando o app roda de uma subpasta (ex.: .build/app.js chamado da raiz).
      import_node_path.default.resolve(process.cwd(), "..", ".env")
    ];
    for (const arquivo of candidatos) {
      if (!(0, import_node_fs.existsSync)(arquivo)) continue;
      try {
        process.loadEnvFile(arquivo);
        break;
      } catch (e) {
        console.error(`[queops] n\xE3o consegui ler ${arquivo}:`, e instanceof Error ? e.message : e);
      }
    }
  }
});

// server/src/config.ts
function env(name, fallback = "") {
  const v = process.env[name];
  return v === void 0 || v === "" ? fallback : v;
}
function detectPublicDir() {
  for (const pasta of ["public", "dist"]) {
    if ((0, import_node_fs2.existsSync)(import_node_path2.default.join(process.cwd(), pasta, "index.html"))) return pasta;
  }
  return "public";
}
function envBool(name, fallback) {
  const v = process.env[name];
  if (v === void 0 || v === "") return fallback;
  return ["1", "true", "yes", "on"].includes(v.toLowerCase());
}
var import_node_fs2, import_node_path2, config;
var init_config = __esm({
  "server/src/config.ts"() {
    "use strict";
    init_env();
    import_node_fs2 = require("node:fs");
    import_node_path2 = __toESM(require("node:path"), 1);
    __name(env, "env");
    __name(detectPublicDir, "detectPublicDir");
    __name(envBool, "envBool");
    config = {
      env: env("APP_ENV", "production") === "development" ? "development" : "production",
      get isProd() {
        return this.env === "production";
      },
      port: Number(env("PORT", "3000")) || 3e3,
      host: env("HOST", "0.0.0.0"),
      db: {
        host: env("DB_HOST", "localhost"),
        port: Number(env("DB_PORT", "3306")) || 3306,
        database: env("DB_NAME"),
        user: env("DB_USER"),
        password: env("DB_PASS")
      },
      appKey: env("APP_KEY"),
      appUrl: env("APP_URL", "https://queopspiramides.com.br"),
      secureCookies: envBool("SECURE_COOKIES", true),
      publicDir: env("PUBLIC_DIR", "") || detectPublicDir(),
      midiaDir: env("MIDIA_DIR", "midia"),
      notasDir: env("NOTAS_DIR", "notas"),
      trustProxy: envBool("TRUST_PROXY", true)
    };
  }
});

// server/src/errors.ts
function fail(message, status = 400, code = "bad_request", cause) {
  throw new ApiError(message, status, code, cause);
}
var ApiError;
var init_errors = __esm({
  "server/src/errors.ts"() {
    "use strict";
    ApiError = class extends Error {
      static {
        __name(this, "ApiError");
      }
      status;
      code;
      constructor(message, status = 400, code = "bad_request", cause) {
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.code = code;
        if (cause !== void 0) this.cause = cause;
      }
    };
    __name(fail, "fail");
  }
});

// server/src/db.ts
var db_exports = {};
__export(db_exports, {
  closePool: () => closePool,
  getPool: () => getPool,
  nextCounter: () => nextCounter,
  placeholders: () => placeholders,
  q: () => q,
  transaction: () => transaction
});
function getPool() {
  if (pool) return pool;
  pool = import_promise.default.createPool({
    host: config.db.host,
    port: config.db.port,
    user: config.db.user,
    password: config.db.password,
    database: config.db.database,
    charset: "utf8mb4",
    timezone: "-03:00",
    dateStrings: true,
    decimalNumbers: true,
    waitForConnections: true,
    // A Hostinger limita conexões simultâneas por usuário de banco; 10 é
    // folgado para uma loja e continua longe do teto do plano.
    connectionLimit: Number(process.env.DB_POOL ?? 10) || 10,
    maxIdle: 4,
    idleTimeout: 6e4,
    enableKeepAlive: true,
    namedPlaceholders: false
  });
  return pool;
}
async function closePool() {
  if (pool) {
    const p = pool;
    pool = null;
    await p.end();
  }
}
function rethrow(e) {
  const err = e;
  const conexao = [
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    "EHOSTUNREACH",
    "ER_ACCESS_DENIED_ERROR",
    "ER_BAD_DB_ERROR",
    "ER_DBACCESS_DENIED_ERROR",
    "PROTOCOL_CONNECTION_LOST"
  ];
  if (err.code && conexao.includes(err.code)) {
    console.error("[queops] falha ao conectar no MySQL:", err.code, err.message);
    fail("N\xE3o foi poss\xEDvel conectar ao banco de dados.", 503, "db_unavailable", e);
  }
  throw e;
}
function wrap(exec, lastIdRef) {
  return {
    async all(sql, params = []) {
      try {
        const [rows] = await exec(sql, params);
        return rows;
      } catch (e) {
        rethrow(e);
      }
    },
    async one(sql, params = []) {
      const rows = await this.all(sql, params);
      return rows.length ? rows[0] : null;
    },
    async run(sql, params = []) {
      try {
        const [res] = await exec(sql, params);
        const header = res;
        if (header.insertId) lastIdRef.value = Number(header.insertId);
        return Number(header.affectedRows ?? 0);
      } catch (e) {
        rethrow(e);
      }
    },
    lastId() {
      return lastIdRef.value;
    }
  };
}
async function transaction(fn) {
  let conn;
  try {
    conn = await getPool().getConnection();
  } catch (e) {
    rethrow(e);
  }
  const ref = { value: 0 };
  const tx = wrap((sql, params) => conn.execute(sql, params), ref);
  try {
    await conn.beginTransaction();
    const out = await fn(tx, conn);
    await conn.commit();
    return out;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
    }
    throw e;
  } finally {
    conn.release();
  }
}
async function nextCounter(exec, name) {
  await exec.run(
    `INSERT INTO counters (name, value) VALUES (?, 1)
     ON DUPLICATE KEY UPDATE value = value + 1`,
    [name]
  );
  const row = await exec.one("SELECT value FROM counters WHERE name = ?", [name]);
  return Number(row?.value ?? 1);
}
function placeholders(n) {
  return new Array(n).fill("?").join(",");
}
var import_promise, pool, poolRef, q;
var init_db = __esm({
  "server/src/db.ts"() {
    "use strict";
    import_promise = __toESM(require("mysql2/promise"), 1);
    init_config();
    init_errors();
    pool = null;
    __name(getPool, "getPool");
    __name(closePool, "closePool");
    __name(rethrow, "rethrow");
    __name(wrap, "wrap");
    poolRef = { value: 0 };
    q = wrap(
      (sql, params) => getPool().execute(sql, params),
      poolRef
    );
    __name(transaction, "transaction");
    __name(nextCounter, "nextCounter");
    __name(placeholders, "placeholders");
  }
});

// server/src/zerar.ts
init_config();
var ORDEM = [
  { tabela: "order_invoices", o_que: "notas fiscais dos pedidos" },
  { tabela: "order_items", o_que: "itens dos pedidos" },
  { tabela: "orders", o_que: "pedidos" },
  { tabela: "abandoned_cart_items", o_que: "itens de carrinho abandonado" },
  { tabela: "abandoned_carts", o_que: "carrinhos abandonados" },
  { tabela: "customer_favorites", o_que: "favoritos dos clientes" },
  { tabela: "customer_addresses", o_que: "endere\xE7os dos clientes" },
  { tabela: "customers", o_que: "clientes" },
  { tabela: "product_group_values", o_que: "valores das varia\xE7\xF5es" },
  { tabela: "product_group_options", o_que: "op\xE7\xF5es dos eixos" },
  { tabela: "product_group_axes", o_que: "eixos de varia\xE7\xE3o" },
  { tabela: "product_groups", o_que: "grupos de varia\xE7\xE3o" },
  { tabela: "product_images", o_que: "fotos extras dos produtos" },
  { tabela: "products", o_que: "produtos" },
  { tabela: "subcategories", o_que: "subcategorias" },
  { tabela: "categories", o_que: "categorias da loja" },
  { tabela: "erp_categories", o_que: "categorias recebidas do ERP" },
  { tabela: "sessions", o_que: "sess\xF5es abertas (voc\xEA vai precisar entrar de novo)" },
  { tabela: "login_attempts", o_que: "hist\xF3rico de tentativas de login" }
];
var PRESERVADO = [
  ["admin_users", "usu\xE1rios do painel"],
  ["integrations", "credenciais das integra\xE7\xF5es (Mercado Pago, Melhor Envio, Correios)"],
  ["store_config", "configura\xE7\xF5es da loja: frete, Pix, dados, recupera\xE7\xE3o"],
  ["api_keys", "chaves de API \u2014 a que o ERP usa continua valendo"],
  ["webhooks", "URLs de webhook cadastradas"],
  ["coupons", "cupons de desconto"]
];
async function principal() {
  const confirmado = process.argv.includes("--confirmo");
  const { q: q2, closePool: closePool2 } = await Promise.resolve().then(() => (init_db(), db_exports));
  console.log("");
  console.log("  ZERAR A LOJA");
  console.log("  ------------");
  console.log(`  banco:    ${config.db.database}  (em ${config.db.host})`);
  console.log(`  ambiente: ${config.env}`);
  console.log("");
  const existentes = new Set(
    (await q2.all(
      `SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()`
    )).map((r) => String(r.t ?? r.TABLE_NAME ?? "").toLowerCase())
  );
  let total = 0;
  const plano = [];
  for (const item of ORDEM) {
    if (!existentes.has(item.tabela)) continue;
    const r = await q2.one(`SELECT COUNT(*) AS n FROM \`${item.tabela}\``);
    const linhas = Number(r?.n ?? 0);
    plano.push({ ...item, linhas });
    total += linhas;
  }
  console.log("  SER\xC1 APAGADO:");
  for (const p of plano) {
    console.log(`    ${String(p.linhas).padStart(7)}  ${p.o_que}`);
  }
  console.log(`    ${String(total).padStart(7)}  linhas no total`);
  console.log("");
  console.log("  FICA COMO EST\xC1:");
  for (const [tabela, texto] of PRESERVADO) {
    if (existentes.has(tabela)) console.log(`             ${texto}`);
  }
  console.log("");
  if (!confirmado) {
    console.log("  Nada foi apagado \u2014 isto foi uma simula\xE7\xE3o.");
    console.log("");
    console.log("  Confira o nome do banco acima. Se for esse mesmo, FA\xC7A O BACKUP e rode:");
    console.log("");
    console.log("      node zerar.js --confirmo");
    console.log("");
    await closePool2();
    return;
  }
  for (const p of plano) {
    await q2.run(`DELETE FROM \`${p.tabela}\``);
    console.log(`  - ${p.o_que}: ${p.linhas} apagado(s)`);
  }
  if (existentes.has("counters")) {
    await q2.run("DELETE FROM counters WHERE name IN ('order', 'cart')");
    console.log("  - contador de pedidos: zerado (o pr\xF3ximo ser\xE1 QP-000001)");
  }
  console.log("");
  console.log("  Pronto. A loja est\xE1 vazia e o painel continua acess\xEDvel.");
  console.log("");
  console.log("  Pr\xF3ximos passos:");
  console.log("    1. entre no painel de novo (as sess\xF5es foram encerradas);");
  console.log("    2. pe\xE7a ao ERP a carga de categorias e, depois, a de produtos;");
  console.log("    3. as fotos antigas continuam na pasta midia/ e as notas em notas/.");
  console.log("       Elas n\xE3o s\xE3o apagadas aqui de prop\xF3sito: n\xE3o h\xE1 backup delas junto");
  console.log("       do dump do banco. Para limpar, confira a pasta e apague \xE0 m\xE3o.");
  console.log("");
  await closePool2();
}
__name(principal, "principal");
principal().catch((e) => {
  console.error("");
  console.error("  Falhou:", e instanceof Error ? e.message : String(e));
  console.error("  Nada al\xE9m do que foi listado acima foi apagado.");
  console.error("");
  process.exit(1);
});
//# sourceMappingURL=zerar.js.map
