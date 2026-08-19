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
function configProblems() {
  const p = [];
  if (!config.db.database) p.push("DB_NAME n\xE3o definido.");
  if (!config.db.user) p.push("DB_USER n\xE3o definido.");
  if (!config.db.password) p.push("DB_PASS n\xE3o definido.");
  if (!config.appKey) {
    p.push(`APP_KEY n\xE3o definida. Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);
  } else {
    const raw = Buffer.from(config.appKey, "base64");
    if (raw.length !== 32) p.push("APP_KEY inv\xE1lida: precisa ser 32 bytes em base64.");
  }
  return p;
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
      trustProxy: envBool("TRUST_PROXY", true)
    };
    __name(configProblems, "configProblems");
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

// server/src/crypto.ts
function appKey() {
  if (cached) return cached;
  if (!config.appKey) {
    fail(
      `APP_KEY n\xE3o configurada. Gere com: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`,
      500,
      "missing_app_key"
    );
  }
  const key = Buffer.from(config.appKey, "base64");
  if (key.length !== 32) {
    fail("APP_KEY inv\xE1lida: precisa ser 32 bytes em base64.", 500, "invalid_app_key");
  }
  return cached = key;
}
function encryptPayload(data) {
  const iv = (0, import_node_crypto.randomBytes)(12);
  const c = (0, import_node_crypto.createCipheriv)(CIPHER, appKey(), iv);
  const body2 = Buffer.concat([c.update(JSON.stringify(data), "utf8"), c.final()]);
  const tag = c.getAuthTag();
  return `v1.${iv.toString("base64")}.${tag.toString("base64")}.${body2.toString("base64")}`;
}
function decryptPayload(blob) {
  if (typeof blob !== "string" || blob === "") return {};
  const parts = blob.split(".");
  if (parts.length !== 4 || parts[0] !== "v1") return {};
  try {
    const iv = Buffer.from(parts[1], "base64");
    const tag = Buffer.from(parts[2], "base64");
    const body2 = Buffer.from(parts[3], "base64");
    if (iv.length !== 12 || tag.length !== 16) return {};
    const d = (0, import_node_crypto.createDecipheriv)(CIPHER, appKey(), iv);
    d.setAuthTag(tag);
    const plain = Buffer.concat([d.update(body2), d.final()]).toString("utf8");
    const parsed = JSON.parse(plain);
    return parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    console.error("[queops] payload de integra\xE7\xE3o n\xE3o p\xF4de ser decifrado (chave trocada?)");
    return {};
  }
}
function safeEqual(a, b) {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length || ba.length === 0) return false;
  return (0, import_node_crypto.timingSafeEqual)(ba, bb);
}
var import_node_crypto, CIPHER, cached;
var init_crypto = __esm({
  "server/src/crypto.ts"() {
    "use strict";
    import_node_crypto = require("node:crypto");
    init_config();
    init_errors();
    CIPHER = "aes-256-gcm";
    cached = null;
    __name(appKey, "appKey");
    __name(encryptPayload, "encryptPayload");
    __name(decryptPayload, "decryptPayload");
    __name(safeEqual, "safeEqual");
  }
});

// server/src/db.ts
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

// server/src/http.ts
function body(req) {
  const b = req.body;
  return b !== null && typeof b === "object" && !Array.isArray(b) ? b : {};
}
function jsonOk(res, data, status = 200) {
  res.status(status);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Cache-Control", "no-store");
  res.send(JSON.stringify(data));
}
function bodyStr(b, key, def = "", max = 500) {
  const v = b?.[key];
  if (v === void 0 || v === null) return def;
  if (typeof v === "object") return def;
  return String(v).trim().slice(0, max);
}
function bodyFloat(b, key, def = 0) {
  const v = b?.[key];
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return def;
}
function bodyInt(b, key, def = 0) {
  const v = bodyFloat(b, key, Number.NaN);
  return Number.isFinite(v) ? Math.trunc(v) : def;
}
function bodyBool(b, key, def = false) {
  if (!b || !Object.prototype.hasOwnProperty.call(b, key)) return def;
  const v = b[key];
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (["1", "true", "yes", "on"].includes(s)) return true;
    if (["0", "false", "no", "off", ""].includes(s)) return false;
  }
  return def;
}
function queryStr(req, key, def = "", max = 200) {
  const v = req.query?.[key];
  if (typeof v !== "string") return def;
  return v.trim().slice(0, max);
}
function round2(value) {
  return roundTo(value, 2);
}
function roundTo(value, places) {
  if (!Number.isFinite(value)) return 0;
  const f = 10 ** places;
  const scaled = Number((value * f).toPrecision(15));
  const rounded = Math.sign(scaled) * Math.round(Math.abs(scaled));
  return rounded / f;
}
function brl(value) {
  const [inteiro, centavos] = round2(value).toFixed(2).split(".");
  return `${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${centavos}`;
}
function iso(value) {
  if (!value) return null;
  const s = String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}-03:00`;
}
function dateSP(plusDays) {
  const now = new Date(Date.now() + plusDays * 864e5 - 3 * 36e5);
  return now.toISOString().slice(0, 10);
}
function dateBR(plusDays) {
  const [y, m, d] = dateSP(plusDays).split("-");
  return `${d}/${m}/${y}`;
}
function clientIpBinary(req) {
  const ip = (req.ip ?? "").replace(/^::ffff:/i, "");
  if ((0, import_node_net.isIP)(ip) === 4) {
    const parts = ip.split(".").map(Number);
    if (parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) return null;
    return Buffer.from(parts);
  }
  if ((0, import_node_net.isIP)(ip) === 6) {
    return ipv6ToBuffer(ip);
  }
  return null;
}
function ipv6ToBuffer(ip) {
  const [head, tail] = ip.split("::");
  const toWords = /* @__PURE__ */ __name((s) => s === "" || s === void 0 ? [] : s.split(":").map((h2) => parseInt(h2, 16)), "toWords");
  const left = toWords(head);
  const right = ip.includes("::") ? toWords(tail ?? "") : [];
  const fill = 8 - left.length - right.length;
  if (fill < 0) return null;
  const words = [...left, ...new Array(Math.max(0, fill)).fill(0), ...right];
  if (words.length !== 8 || words.some((w) => !Number.isInteger(w) || w < 0 || w > 65535)) return null;
  const buf = Buffer.alloc(16);
  words.forEach((w, i) => buf.writeUInt16BE(w, i * 2));
  return buf;
}
function validEmail(value) {
  return value.length <= 254 && EMAIL_RE.test(value);
}
function validCpf(value) {
  const cpf = value.replace(/\D/g, "");
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  for (let t = 9; t < 11; t++) {
    let sum = 0;
    for (let i = 0; i < t; i++) sum += Number(cpf[i]) * (t + 1 - i);
    let check = sum * 10 % 11;
    if (check === 10) check = 0;
    if (check !== Number(cpf[t])) return false;
  }
  return true;
}
function digits(value) {
  return value.replace(/\D/g, "");
}
var import_node_net, EMAIL_RE;
var init_http = __esm({
  "server/src/http.ts"() {
    "use strict";
    import_node_net = require("node:net");
    __name(body, "body");
    __name(jsonOk, "jsonOk");
    __name(bodyStr, "bodyStr");
    __name(bodyFloat, "bodyFloat");
    __name(bodyInt, "bodyInt");
    __name(bodyBool, "bodyBool");
    __name(queryStr, "queryStr");
    __name(round2, "round2");
    __name(roundTo, "roundTo");
    __name(brl, "brl");
    __name(iso, "iso");
    __name(dateSP, "dateSP");
    __name(dateBR, "dateBR");
    __name(clientIpBinary, "clientIpBinary");
    __name(ipv6ToBuffer, "ipv6ToBuffer");
    EMAIL_RE = /^[^\s@,;:<>()[\]\\"]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)+$/;
    __name(validEmail, "validEmail");
    __name(validCpf, "validCpf");
    __name(digits, "digits");
  }
});

// server/src/store.ts
var store_exports = {};
__export(store_exports, {
  DEFAULT_RECOVERY: () => DEFAULT_RECOVERY,
  DEFAULT_SETTINGS: () => DEFAULT_SETTINGS,
  DEFAULT_SHIPPING: () => DEFAULT_SHIPPING,
  INTEGRATION_IDS: () => INTEGRATION_IDS,
  INTEGRATION_SECRET_FIELDS: () => INTEGRATION_SECRET_FIELDS,
  configGet: () => configGet,
  configMerge: () => configMerge,
  configSet: () => configSet,
  fetchIntegrations: () => fetchIntegrations,
  fetchOrders: () => fetchOrders,
  fetchProducts: () => fetchProducts,
  getRecovery: () => getRecovery,
  getSettings: () => getSettings,
  getShipping: () => getShipping,
  integrationSecrets: () => integrationSecrets,
  integrationToApi: () => integrationToApi,
  orderRowToApi: () => orderRowToApi,
  productRowToApi: () => productRowToApi,
  publicSettings: () => publicSettings
});
function isPlainObject(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}
function configMerge(def, saved) {
  const out = { ...def };
  for (const [key, value] of Object.entries(saved ?? {})) {
    if (isPlainObject(value) && isPlainObject(def[key])) {
      out[key] = key === "perState" ? value : configMerge(def[key], value);
      continue;
    }
    out[key] = value;
  }
  return out;
}
async function configGet(key, def, exec = q) {
  const row = await exec.one("SELECT config_val FROM store_config WHERE config_key = ?", [key]);
  if (row === null) return def;
  try {
    const decoded = JSON.parse(String(row.config_val));
    if (!isPlainObject(decoded)) return def;
    return configMerge(def, decoded);
  } catch {
    return def;
  }
}
async function configSet(key, value, exec = q) {
  await exec.run(
    `INSERT INTO store_config (config_key, config_val) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE config_val = VALUES(config_val)`,
    [key, JSON.stringify(value)]
  );
}
async function publicSettings(exec = q) {
  const s = await getSettings(exec);
  const sh = await getShipping(exec);
  const free = sh.freeShipping ?? {};
  return {
    name: s.name,
    email: s.email,
    phone: s.phone,
    whatsapp: s.whatsapp,
    pixDiscountPct: Number(s.pixDiscountPct) || 0,
    payments: s.payments,
    // 0 = não há frete grátis por valor.
    freeShippingFrom: free.enabled ? Number(free.minOrder ?? 0) || 0 : 0,
    // Estimativa exibida antes de o cliente informar o CEP.
    shippingFrom: Number(sh.defaultPrice ?? 0) || 0
  };
}
function productRowToApi(r) {
  const out = {
    id: r.id,
    sku: r.sku,
    name: r.name,
    category: r.category,
    categoryLabel: r.category_label,
    description: String(r.description ?? ""),
    price: Number(r.price) || 0,
    stock: Number(r.stock) || 0,
    image: r.image,
    weight: String(r.weight ?? ""),
    active: Boolean(r.active)
  };
  if (r.subcategory) out.subcategory = r.subcategory;
  if (r.long_description) out.longDescription = r.long_description;
  if (r.old_price !== null && r.old_price !== void 0) out.oldPrice = Number(r.old_price);
  if (r.tag) out.tag = r.tag;
  if (r.ingredients) out.ingredients = r.ingredients;
  if (r.highlight) out.highlight = true;
  return out;
}
async function fetchProducts(onlyActive = true, exec = q) {
  const sql = `SELECT * FROM products${onlyActive ? " WHERE active = 1" : ""} ORDER BY position ASC, name ASC`;
  return (await exec.all(sql)).map(productRowToApi);
}
function orderRowToApi(r, items) {
  return {
    id: r.id,
    createdAt: iso(r.created_at),
    customerName: r.customer_name,
    customerEmail: r.customer_email,
    customerPhone: r.customer_phone,
    items: items.map((i) => ({
      productId: i.product_id,
      name: i.name,
      quantity: Number(i.quantity) || 0,
      unitPrice: Number(i.unit_price) || 0
    })),
    subtotal: Number(r.subtotal) || 0,
    shipping: Number(r.shipping_cost) || 0,
    discount: Number(r.discount) || 0,
    total: Number(r.total) || 0,
    couponCode: r.coupon_code,
    status: r.status,
    payment: r.payment,
    channel: r.channel,
    trackingCode: String(r.tracking_code ?? ""),
    trackingStatus: String(r.tracking_status ?? "")
  };
}
async function fetchOrders(limit = 500, exec = q) {
  const cap = Math.max(1, Math.min(Math.trunc(limit) || 500, 2e3));
  const orders = await exec.all(`SELECT * FROM orders ORDER BY created_at DESC LIMIT ${cap}`);
  if (orders.length === 0) return [];
  const ids = orders.map((o) => o.id);
  const rows = await exec.all(
    `SELECT * FROM order_items WHERE order_id IN (${placeholders(ids.length)}) ORDER BY id ASC`,
    ids
  );
  const byOrder = /* @__PURE__ */ new Map();
  for (const row of rows) {
    const key = String(row.order_id);
    const list = byOrder.get(key);
    if (list) list.push(row);
    else byOrder.set(key, [row]);
  }
  return orders.map((o) => orderRowToApi(o, byOrder.get(String(o.id)) ?? []));
}
function integrationToApi(row) {
  const fields = decryptPayload(row.fields_enc);
  const safe = {};
  const configured = [];
  for (const [k, v] of Object.entries(fields)) {
    if (v === "" || v === null || v === void 0) continue;
    configured.push(k);
    safe[k] = INTEGRATION_SECRET_FIELDS.includes(k) ? "" : String(v);
  }
  return {
    id: row.id,
    enabled: Boolean(row.enabled),
    fields: safe,
    configured,
    lastStatus: row.last_status || "unknown",
    lastCheckedAt: iso(row.last_checked_at)
  };
}
async function fetchIntegrations(exec = q) {
  const rows = await exec.all("SELECT * FROM integrations");
  const byId = {};
  for (const r of rows) byId[String(r.id)] = integrationToApi(r);
  for (const id of INTEGRATION_IDS) {
    byId[id] ??= {
      id,
      enabled: false,
      fields: {},
      configured: [],
      lastStatus: "unknown",
      lastCheckedAt: null
    };
  }
  return byId;
}
async function integrationSecrets(id, exec = q) {
  const row = await exec.one("SELECT fields_enc FROM integrations WHERE id = ?", [id]);
  return row ? decryptPayload(row.fields_enc) : {};
}
var DEFAULT_SETTINGS, DEFAULT_SHIPPING, DEFAULT_RECOVERY, INTEGRATION_IDS, INTEGRATION_SECRET_FIELDS, getSettings, getShipping, getRecovery;
var init_store = __esm({
  "server/src/store.ts"() {
    "use strict";
    init_crypto();
    init_db();
    init_http();
    DEFAULT_SETTINGS = {
      name: "Qu\xE9ops Pir\xE2mides",
      email: "contato@queopspiramides.com.br",
      phone: "(11) 0000-0000",
      whatsapp: "5511000000000",
      pixDiscountPct: 5,
      payments: { card: true, pix: true, boleto: true }
    };
    DEFAULT_SHIPPING = {
      defaultPrice: 24.9,
      perState: {
        SP: 14.9,
        RJ: 19.9,
        MG: 19.9,
        ES: 22.9,
        PR: 24.9,
        SC: 24.9,
        RS: 27.9,
        DF: 22.9
      },
      cepRanges: [
        { id: "cr1", from: "01000000", to: "05999999", price: 9.9, label: "Capital SP" }
      ],
      // `states` lista UFs com frete grátis INCONDICIONAL (qualquer valor). Fica
      // vazio por padrão: com 'SP' aqui, o mínimo de R$ 199 e a faixa de CEP da
      // capital nunca seriam aplicados — todo pedido paulista sairia com frete 0.
      freeShipping: { enabled: true, minOrder: 199, states: [] }
    };
    DEFAULT_RECOVERY = {
      enabled: true,
      delayMinutes: 60,
      message: "Ol\xE1 {nome}! \u{1F44B} Voc\xEA esqueceu alguns itens na sua sacola da Qu\xE9ops Pir\xE2mides (total {valor}). Use o cupom {cupom} e finalize com desconto: ",
      couponCode: "VOLTA10"
    };
    INTEGRATION_IDS = [
      "uno",
      "erp",
      "zapi",
      "evolution",
      "chatwoot",
      "chatvolt",
      "mercadopago",
      "pagseguro",
      "stripe",
      "pagarme",
      "correios",
      "melhorenvio",
      "frenet"
    ];
    INTEGRATION_SECRET_FIELDS = [
      "accessToken",
      "secretKey",
      "apiKey",
      "apiToken",
      "token",
      "clientToken",
      "password",
      "encryptionKey",
      "webhookSecret",
      "accessCode"
    ];
    __name(isPlainObject, "isPlainObject");
    __name(configMerge, "configMerge");
    __name(configGet, "configGet");
    __name(configSet, "configSet");
    getSettings = /* @__PURE__ */ __name((exec = q) => configGet("settings", DEFAULT_SETTINGS, exec), "getSettings");
    getShipping = /* @__PURE__ */ __name((exec = q) => configGet("shipping", DEFAULT_SHIPPING, exec), "getShipping");
    getRecovery = /* @__PURE__ */ __name((exec = q) => configGet("recovery", DEFAULT_RECOVERY, exec), "getRecovery");
    __name(publicSettings, "publicSettings");
    __name(productRowToApi, "productRowToApi");
    __name(fetchProducts, "fetchProducts");
    __name(orderRowToApi, "orderRowToApi");
    __name(fetchOrders, "fetchOrders");
    __name(integrationToApi, "integrationToApi");
    __name(fetchIntegrations, "fetchIntegrations");
    __name(integrationSecrets, "integrationSecrets");
  }
});

// server/src/correios.ts
var correios_exports = {};
__export(correios_exports, {
  SERVICO_PAC: () => SERVICO_PAC,
  SERVICO_SEDEX: () => SERVICO_SEDEX,
  _internos: () => _internos,
  autenticar: () => autenticar,
  cotar: () => cotar,
  cotarTodos: () => cotarTodos,
  credsFrom: () => credsFrom,
  esquecerToken: () => esquecerToken,
  nomeDoServico: () => nomeDoServico,
  rastrear: () => rastrear,
  servicesOf: () => servicesOf
});
function nomeDoServico(codigo) {
  return NOMES[codigo] ?? `Correios ${codigo}`;
}
function credsFrom(f) {
  const s = /* @__PURE__ */ __name((k) => String(f[k] ?? "").trim(), "s");
  return {
    user: s("user"),
    accessCode: s("accessCode"),
    postingCard: s("postingCard").replace(/\D/g, ""),
    contract: s("contract"),
    dr: s("dr"),
    services: s("services"),
    originCep: s("originCep").replace(/\D/g, "")
  };
}
function servicesOf(c) {
  const lista = (c.services ?? "").split(/[,;\s]+/).map((x) => x.replace(/\D/g, "")).filter((x) => x.length > 0);
  return lista.length > 0 ? lista : [SERVICO_PAC, SERVICO_SEDEX];
}
async function autenticar(c) {
  const chave = `${c.user}:${c.postingCard}`;
  const agora = Date.now();
  const salvo = cache.get(chave);
  if (salvo && salvo.expiraEm - 5 * 6e4 > agora) {
    return { token: salvo.token, erro: "" };
  }
  const basic = Buffer.from(`${c.user}:${c.accessCode}`).toString("base64");
  const r = await httpCall(
    "POST",
    `${BASE}/token/v1/autentica/cartaopostagem`,
    { Authorization: "Basic " + basic },
    { numero: c.postingCard }
  );
  if (!r.ok) return { token: "", erro: explicar(r) };
  let dados;
  try {
    dados = JSON.parse(r.body);
  } catch {
    return { token: "", erro: "Resposta inesperada dos Correios ao autenticar." };
  }
  if (!dados.token) return { token: "", erro: "Os Correios n\xE3o devolveram token." };
  const expira = dados.expiraEm ? Date.parse(dados.expiraEm) : NaN;
  cache.set(chave, {
    token: dados.token,
    expiraEm: Number.isFinite(expira) ? expira : agora + 12 * 36e5
  });
  return { token: dados.token, erro: "" };
}
function esquecerToken(c) {
  cache.delete(`${c.user}:${c.postingCard}`);
}
function explicar(r, onde = "auth") {
  if (r.status === 401 || r.status === 403) {
    return "Usu\xE1rio ou c\xF3digo de acesso recusado. Lembre: o c\xF3digo de acesso \xE0 API n\xE3o \xE9 a senha do site \u2014 gere em Meu Correios \u2192 Gerenciar acesso \xE0 API.";
  }
  if (r.status === 400) {
    const detalhe = detalheDoErro(r.body);
    if (detalhe !== "") return detalhe;
    if (onde === "cotacao") {
      return 'Cota\xE7\xE3o recusada pelos Correios, sem detalhe. Confira em "Servi\xE7os a cotar" se os c\xF3digos pertencem ao seu contrato \u2014 os de balc\xE3o (04510 PAC, 04014 Sedex) cotam sem contrato e servem para testar.';
    }
    return "Requisi\xE7\xE3o recusada. Confira o n\xFAmero do cart\xE3o de postagem.";
  }
  if (r.status === 0) return `N\xE3o foi poss\xEDvel falar com os Correios: ${r.error}`;
  return `Correios responderam HTTP ${r.status}.`;
}
function detalheDoErro(body2) {
  const limpo = String(body2 ?? "").trim();
  if (limpo === "") return "";
  try {
    const d = JSON.parse(limpo);
    const candidatos2 = [
      d.msgs,
      d.msg,
      d.message,
      d.txErro,
      d.error,
      d.descricao,
      d.causa,
      d.mensagem,
      d.detail,
      d.erros
    ];
    for (const c of candidatos2) {
      if (Array.isArray(c) && c.length > 0) {
        const partes = c.map((x) => {
          if (typeof x === "string") return x;
          const o = x;
          return String(o?.descricao ?? o?.mensagem ?? o?.msg ?? JSON.stringify(x));
        });
        return partes.join(" \xB7 ").slice(0, 300);
      }
      if (typeof c === "string" && c.trim() !== "") return c.trim().slice(0, 300);
    }
    return limpo.slice(0, 300);
  } catch {
    return limpo.length <= 300 ? limpo : "";
  }
}
function moeda(v) {
  const n = Number(String(v ?? "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}
async function cotar(c, servico, cepDestino, pesoGramas, dim = {}) {
  const vazio = { servico, nome: nomeDoServico(servico), preco: 0, prazoDias: 0, erro: "" };
  const { token, erro } = await autenticar(c);
  if (erro) return { ...vazio, erro };
  const origem = (c.originCep ?? "").replace(/\D/g, "");
  const destino = String(cepDestino ?? "").replace(/\D/g, "");
  if (origem.length !== 8) return { ...vazio, erro: "CEP de origem n\xE3o configurado no painel." };
  if (destino.length !== 8) return { ...vazio, erro: "CEP de destino inv\xE1lido." };
  const produto = {
    coProduto: servico,
    nuRequisicao: "1",
    cepOrigem: origem,
    cepDestino: destino,
    psObjeto: String(Math.max(300, Math.round(pesoGramas))),
    tpObjeto: "2",
    // pacote
    comprimento: String(Math.max(16, dim.comprimento ?? 16)),
    altura: String(Math.max(2, dim.altura ?? 5)),
    largura: String(Math.max(11, dim.largura ?? 11))
  };
  const contrato = (c.contract ?? "").replace(/\D/g, "");
  const dr = (c.dr ?? "").replace(/\D/g, "");
  if (contrato !== "" && dr !== "") {
    produto.nuContrato = contrato;
    produto.nuDR = dr;
  }
  const corpo = { idLote: "1", parametrosProduto: [produto] };
  const auth = { Authorization: "Bearer " + token };
  const [preco, prazo] = await Promise.all([
    httpCall("POST", `${BASE}/preco/v1/nacional`, auth, corpo),
    httpCall("POST", `${BASE}/prazo/v1/nacional`, auth, corpo)
  ]);
  if (preco.status === 401) {
    esquecerToken(c);
    return { ...vazio, erro: "Token expirado; tente de novo." };
  }
  if (!preco.ok) {
    console.error(
      `[queops] Correios recusaram a cota\xE7\xE3o de ${servico} (HTTP ${preco.status}):`,
      String(preco.body ?? "").slice(0, 600)
    );
    return { ...vazio, erro: explicar(preco, "cotacao") };
  }
  try {
    const p = JSON.parse(preco.body);
    const item = Array.isArray(p) ? p[0] : null;
    if (!item) return { ...vazio, erro: "Correios n\xE3o devolveram pre\xE7o." };
    if (item.txErro) return { ...vazio, erro: String(item.txErro) };
    let dias = 0;
    if (prazo.ok) {
      const q2 = JSON.parse(prazo.body);
      dias = Number(q2?.[0]?.prazoEntrega ?? 0) || 0;
    }
    return {
      servico,
      nome: nomeDoServico(servico),
      preco: moeda(item.pcFinal ?? item.pcBase),
      prazoDias: dias,
      erro: ""
    };
  } catch {
    return { ...vazio, erro: "Resposta inesperada dos Correios ao cotar." };
  }
}
async function cotarTodos(c, cepDestino, pesoGramas, dim) {
  const servicos = servicesOf(c);
  const todas = await Promise.all(servicos.map((s) => cotar(c, s, cepDestino, pesoGramas, dim)));
  const boas = todas.filter((x) => x.erro === "" && x.preco > 0);
  return boas.length > 0 ? boas.sort((a, b) => a.preco - b.preco) : todas;
}
async function rastrear(c, codigo) {
  const { token, erro } = await autenticar(c);
  if (erro) return { eventos: [], erro };
  const limpo = String(codigo ?? "").trim().toUpperCase().replace(/\s/g, "");
  if (!/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(limpo)) {
    return { eventos: [], erro: "C\xF3digo de rastreio inv\xE1lido (formato AA123456789BR)." };
  }
  const r = await httpCall(
    "GET",
    `${BASE}/srorastro/v1/objetos/${limpo}?resultado=T`,
    { Authorization: "Bearer " + token }
  );
  if (r.status === 401) {
    esquecerToken(c);
    return { eventos: [], erro: "Token expirado; tente de novo." };
  }
  if (!r.ok) return { eventos: [], erro: explicar(r, "rastreio") };
  try {
    const dados = JSON.parse(r.body);
    const obj = dados.objetos?.[0];
    if (!obj) return { eventos: [], erro: "Objeto n\xE3o encontrado." };
    if (obj.mensagem) return { eventos: [], erro: String(obj.mensagem) };
    const brutos = obj.eventos ?? [];
    const eventos = brutos.map((e) => {
      const u = e.unidade ?? {};
      const end = u.endereco ?? {};
      const cidade = String(end.cidade ?? "");
      const uf = String(end.uf ?? "");
      return {
        data: String(e.dtHrCriado ?? ""),
        descricao: String(e.descricao ?? ""),
        local: cidade && uf ? `${cidade}/${uf}` : String(u.tipo ?? "")
      };
    });
    return { eventos, erro: "" };
  } catch {
    return { eventos: [], erro: "Resposta inesperada dos Correios ao rastrear." };
  }
}
var BASE, SERVICO_PAC, SERVICO_SEDEX, NOMES, cache, _internos;
var init_correios = __esm({
  "server/src/correios.ts"() {
    "use strict";
    init_providers();
    BASE = "https://api.correios.com.br";
    SERVICO_PAC = "03298";
    SERVICO_SEDEX = "03220";
    NOMES = {
      "03298": "PAC",
      "03220": "Sedex",
      "03158": "Sedex 10",
      "03204": "Sedex Hoje",
      "04510": "PAC",
      "04014": "Sedex"
    };
    __name(nomeDoServico, "nomeDoServico");
    __name(credsFrom, "credsFrom");
    __name(servicesOf, "servicesOf");
    cache = /* @__PURE__ */ new Map();
    __name(autenticar, "autenticar");
    __name(esquecerToken, "esquecerToken");
    __name(explicar, "explicar");
    __name(detalheDoErro, "detalheDoErro");
    _internos = { detalheDoErro };
    __name(moeda, "moeda");
    __name(cotar, "cotar");
    __name(cotarTodos, "cotarTodos");
    __name(rastrear, "rastrear");
  }
});

// server/src/providers.ts
function isPrivateIp(ip) {
  const kind = (0, import_node_net2.isIP)(ip);
  if (kind === 4) return isPrivateIpv4(ip);
  if (kind === 6) return isPrivateIpv6(ip.toLowerCase());
  return true;
}
function isPrivateIpv4(ip) {
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  return a === 0 || // 0.0.0.0/8
  a === 10 || // 10.0.0.0/8
  a === 127 || // loopback
  a === 100 && b >= 64 && b <= 127 || // 100.64.0.0/10 (CGNAT)
  a === 169 && b === 254 || // link-local (metadados de nuvem)
  a === 172 && b >= 16 && b <= 31 || // 172.16.0.0/12
  a === 192 && b === 0 || // 192.0.0.0/24 e 192.0.2.0/24
  a === 192 && b === 168 || // 192.168.0.0/16
  a === 198 && (b === 18 || b === 19) || // benchmark
  a === 198 && b === 51 || // documentação
  a === 203 && b === 0 || // documentação
  a >= 224;
}
function isPrivateIpv6(ip) {
  if (ip === "::" || ip === "::1") return true;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) return isPrivateIpv4(mapped[1]);
  const head = parseInt(ip.split(":")[0] || "0", 16);
  if (Number.isNaN(head)) return true;
  if ((head & 65024) === 64512) return true;
  if ((head & 65472) === 65152) return true;
  if ((head & 65280) === 65280) return true;
  return false;
}
async function isInternalHost(hostRaw) {
  const host = String(hostRaw ?? "").replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "" || host === "localhost" || host.endsWith(".localhost")) return true;
  if (host.endsWith(".internal") || host.endsWith(".local")) return true;
  if ((0, import_node_net2.isIP)(host)) return isPrivateIp(host);
  const ips = [];
  const [v4, v6] = await Promise.all([
    import_node_dns.promises.resolve4(host).catch(() => []),
    import_node_dns.promises.resolve6(host).catch(() => [])
  ]);
  ips.push(...v4, ...v6);
  if (ips.length === 0) return true;
  return ips.some(isPrivateIp);
}
async function httpCall(method, url, headers = {}, json = null, timeoutMs = 12e3) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, status: 0, body: "", error: "URL inv\xE1lida (use http ou https)." };
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    return { ok: false, status: 0, body: "", error: "URL inv\xE1lida (use http ou https)." };
  }
  if (await isInternalHost(parsed.hostname)) {
    return { ok: false, status: 0, body: "", error: "Endere\xE7o interno ou reservado n\xE3o \xE9 permitido." };
  }
  const h2 = { ...headers };
  if (json !== null) h2["Content-Type"] = "application/json";
  try {
    const res = await fetch(parsed, {
      method,
      headers: h2,
      body: json === null ? void 0 : JSON.stringify(json),
      redirect: "manual",
      // evita redirect para host interno
      signal: AbortSignal.timeout(timeoutMs)
    });
    const body2 = (await res.text()).slice(0, 2e4);
    return { ok: res.status >= 200 && res.status < 300, status: res.status, body: body2, error: "" };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 0, body: "", error: msg };
  }
}
function trimSlash(s) {
  return s.replace(/\/+$/, "");
}
async function providerTest(id, f) {
  const meta = PROVIDERS_META[id];
  if (!meta) return { ok: false, message: "Provedor desconhecido." };
  const missing = meta.fields.filter((k) => str(f, k).trim() === "");
  if (missing.length) {
    const nomes = missing.map((k) => FIELD_LABELS[k] ?? k).join(", ");
    return { ok: false, message: `Salve antes de testar. Falta preencher: ${nomes}.` };
  }
  const enc = encodeURIComponent;
  let r;
  switch (id) {
    case "zapi":
      r = await httpCall(
        "GET",
        `https://api.z-api.io/instances/${enc(str(f, "instanceId"))}/token/${enc(str(f, "token"))}/status`,
        str(f, "clientToken") ? { "Client-Token": str(f, "clientToken") } : {}
      );
      return { ok: r.ok, message: r.ok ? "Conex\xE3o Z-API OK." : `Falha (HTTP ${r.status}). ${r.error}` };
    case "evolution":
      r = await httpCall(
        "GET",
        `${trimSlash(str(f, "baseUrl"))}/instance/connectionState/${enc(str(f, "instance"))}`,
        { apikey: str(f, "apiKey") }
      );
      return { ok: r.ok, message: r.ok ? "Conex\xE3o Evolution OK." : `Falha (HTTP ${r.status}). ${r.error}` };
    case "chatwoot":
      r = await httpCall(
        "GET",
        `${trimSlash(str(f, "baseUrl"))}/api/v1/accounts/${enc(str(f, "accountId"))}/conversations`,
        { api_access_token: str(f, "apiToken") }
      );
      return { ok: r.ok, message: r.ok ? "Conex\xE3o Chatwoot OK." : `Falha (HTTP ${r.status}). ${r.error}` };
    case "chatvolt":
      r = await httpCall("GET", "https://api.chatvolt.ai/agents", {
        Authorization: "Bearer " + str(f, "apiKey")
      });
      return { ok: r.ok, message: r.ok ? "Conex\xE3o Chatvolt OK." : `Falha (HTTP ${r.status}). ${r.error}` };
    case "mercadopago":
      r = await httpCall("GET", "https://api.mercadopago.com/users/me", {
        Authorization: "Bearer " + str(f, "accessToken")
      });
      return {
        ok: r.ok,
        message: r.ok ? "Mercado Pago conectado." : `Falha (HTTP ${r.status}). Confira o Access Token.`
      };
    case "stripe":
      r = await httpCall("GET", "https://api.stripe.com/v1/account", {
        Authorization: "Bearer " + str(f, "secretKey")
      });
      return {
        ok: r.ok,
        message: r.ok ? "Stripe conectado." : `Falha (HTTP ${r.status}). Confira a Secret Key.`
      };
    case "pagarme":
      r = await httpCall("GET", "https://api.pagar.me/core/v5/balance", {
        Authorization: "Basic " + Buffer.from(str(f, "apiKey") + ":").toString("base64")
      });
      return {
        ok: r.ok,
        message: r.ok ? "Pagar.me conectado." : `Falha (HTTP ${r.status}). Confira a API Key.`
      };
    case "melhorenvio": {
      const base = str(f, "sandbox") === "sandbox" ? "https://sandbox.melhorenvio.com.br" : "https://melhorenvio.com.br";
      r = await httpCall("GET", base + "/api/v2/me", {
        Authorization: "Bearer " + str(f, "token"),
        Accept: "application/json"
      });
      return { ok: r.ok, message: r.ok ? "Melhor Envio conectado." : `Falha (HTTP ${r.status}).` };
    }
    case "uno":
      r = await httpCall("GET", "https://api.unoerp.com/v1/ping", {
        Authorization: "Bearer " + str(f, "token")
      });
      return { ok: r.ok, message: r.ok ? "UNO ERP conectado." : `Falha (HTTP ${r.status}). ${r.error}` };
    case "erp":
      r = await httpCall("GET", trimSlash(str(f, "baseUrl")) + "/health", {
        Authorization: "Bearer " + str(f, "token")
      });
      return { ok: r.ok, message: r.ok ? "ERP respondeu OK." : `Falha (HTTP ${r.status}). ${r.error}` };
    case "correios": {
      const { credsFrom: credsFrom2, autenticar: autenticar2, cotarTodos: cotarTodos2 } = await Promise.resolve().then(() => (init_correios(), correios_exports));
      const creds = credsFrom2(f);
      const { erro } = await autenticar2(creds);
      if (erro) return { ok: false, message: erro };
      if ((creds.originCep ?? "").length !== 8) {
        return {
          ok: false,
          message: 'Usu\xE1rio e c\xF3digo de acesso conferem, mas falta o CEP de origem \u2014 sem ele nenhuma cota\xE7\xE3o sai, e o frete continua saindo pela tabela fixa. Preencha "CEP de origem" e salve.'
        };
      }
      const cotacoes = await cotarTodos2(creds, "01310100", 500);
      const boas = cotacoes.filter((c) => c.erro === "" && c.preco > 0);
      if (boas.length === 0) {
        const detalhe = cotacoes.map((c) => `${c.nome}: ${c.erro || "sem pre\xE7o"}`).join(" \xB7 ").slice(0, 400);
        return {
          ok: false,
          message: `Autenticou, mas nenhum servi\xE7o cotou \u2014 ${detalhe}`
        };
      }
      const amostra = boas.map((c) => `${c.nome} (${c.servico}) R$ ${c.preco.toFixed(2).replace(".", ",")}`).join(" \xB7 ");
      const parciais = cotacoes.length - boas.length;
      return {
        ok: true,
        message: `Correios cotando: ${amostra} (500 g para S\xE3o Paulo).` + (parciais > 0 ? ` ${parciais} servi\xE7o(s) n\xE3o cotaram.` : "")
      };
    }
    default:
      return { ok: true, message: "Credenciais salvas com seguran\xE7a no servidor." };
  }
}
async function providerSendWhatsapp(phone, message, exec = q) {
  for (const id of ["zapi", "evolution"]) {
    const row = await exec.one("SELECT enabled FROM integrations WHERE id = ?", [id]);
    if (!row || !row.enabled) continue;
    const f = await integrationSecrets(id, exec);
    const enc = encodeURIComponent;
    const r = id === "zapi" ? await httpCall(
      "POST",
      `https://api.z-api.io/instances/${enc(str(f, "instanceId"))}/token/${enc(str(f, "token"))}/send-text`,
      str(f, "clientToken") ? { "Client-Token": str(f, "clientToken") } : {},
      { phone, message }
    ) : await httpCall(
      "POST",
      `${trimSlash(str(f, "baseUrl"))}/message/sendText/${enc(str(f, "instance"))}`,
      { apikey: str(f, "apiKey") },
      { number: phone, text: message }
    );
    return { ok: r.ok, message: r.ok ? "Mensagem enviada." : `Falha (HTTP ${r.status}).` };
  }
  return { ok: false, message: "Nenhum provedor de WhatsApp est\xE1 ativo em Integra\xE7\xF5es." };
}
function fireWebhooks(event, payload) {
  void (async () => {
    try {
      const hooks = await q.all("SELECT url FROM webhooks WHERE event = ? AND active = 1", [event]);
      await Promise.all(
        hooks.map((h2) => httpCall("POST", String(h2.url), { "X-Queops-Event": event }, payload, 5e3))
      );
    } catch (e) {
      console.error("[queops] falha ao disparar webhooks de", event, e);
    }
  })();
}
var import_node_net2, import_node_dns, str, FIELD_LABELS, PROVIDERS_META;
var init_providers = __esm({
  "server/src/providers.ts"() {
    "use strict";
    import_node_net2 = require("node:net");
    import_node_dns = require("node:dns");
    init_db();
    init_store();
    str = /* @__PURE__ */ __name((f, k) => {
      const v = f[k];
      return v === null || v === void 0 || typeof v === "object" ? "" : String(v);
    }, "str");
    FIELD_LABELS = {
      accessCode: "C\xF3digo de acesso \xE0 API",
      accessToken: "Access Token",
      accountId: "Account ID",
      agentId: "Agent ID",
      apiKey: "API Key",
      apiToken: "API Token",
      baseUrl: "URL base",
      company: "Empresa",
      email: "E-mail",
      encryptionKey: "Encryption Key",
      instance: "Inst\xE2ncia",
      instanceId: "Instance ID",
      postingCard: "Cart\xE3o de postagem",
      publicKey: "Public Key",
      publishableKey: "Publishable Key",
      secretKey: "Secret Key",
      token: "Token",
      user: "Usu\xE1rio"
    };
    PROVIDERS_META = {
      mercadopago: { fields: ["publicKey", "accessToken"] },
      // webhookSecret é opcional no teste de conexão
      pagseguro: { fields: ["email", "token"] },
      stripe: { fields: ["publishableKey", "secretKey"] },
      pagarme: { fields: ["apiKey", "encryptionKey"] },
      correios: { fields: ["user", "accessCode", "postingCard"] },
      melhorenvio: { fields: ["token"] },
      frenet: { fields: ["token"] },
      uno: { fields: ["token", "company"] },
      erp: { fields: ["baseUrl", "token"] },
      zapi: { fields: ["instanceId", "token"] },
      evolution: { fields: ["baseUrl", "instance", "apiKey"] },
      chatwoot: { fields: ["baseUrl", "accountId", "apiToken"] },
      chatvolt: { fields: ["apiKey", "agentId"] }
    };
    __name(isPrivateIp, "isPrivateIp");
    __name(isPrivateIpv4, "isPrivateIpv4");
    __name(isPrivateIpv6, "isPrivateIpv6");
    __name(isInternalHost, "isInternalHost");
    __name(httpCall, "httpCall");
    __name(trimSlash, "trimSlash");
    __name(providerTest, "providerTest");
    __name(providerSendWhatsapp, "providerSendWhatsapp");
    __name(fireWebhooks, "fireWebhooks");
  }
});

// server/src/schema.ts
var schema_exports = {};
__export(schema_exports, {
  addMissingColumns: () => addMissingColumns,
  addMissingIndexes: () => addMissingIndexes,
  dbDir: () => dbDir,
  sincronizarEstrutura: () => sincronizarEstrutura,
  splitStatements: () => splitStatements
});
function dbDir() {
  const candidatos2 = [
    import_node_path4.default.resolve(process.cwd(), "server/db"),
    import_node_path4.default.resolve(process.cwd(), "db")
  ];
  for (const c of candidatos2) {
    try {
      (0, import_node_fs4.readFileSync)(import_node_path4.default.join(c, "schema.sql"));
      return c;
    } catch {
    }
  }
  throw new Error(
    "schema.sql n\xE3o encontrado. Rode a migra\xE7\xE3o da raiz do projeto (onde est\xE1 a pasta server/db ou db)."
  );
}
function splitStatements(sql) {
  const noComments = sql.replace(/^[ \t]*--.*$/gm, "");
  const statements = noComments.split(";").map((s) => s.trim()).filter((s) => s !== "");
  return { statements, noComments };
}
function tabelaAusente(e) {
  return e?.code === "ER_NO_SUCH_TABLE";
}
async function addMissingColumns(noComments, say) {
  let adicionadas = 0;
  const re = /CREATE TABLE IF NOT EXISTS\s+(\w+)\s*\(([\s\S]*?)\)\s*ENGINE=/g;
  for (const [, tabela, corpo] of noComments.matchAll(re)) {
    const declaradas = /* @__PURE__ */ new Map();
    for (const linhaBruta of corpo.split("\n")) {
      const linha = linhaBruta.trim();
      if (linha === "") continue;
      const m = new RegExp(`^\`?(\\w+)\`?\\s+((?:${TIPOS_SQL})\\b.*?),?$`, "i").exec(linha);
      if (m) declaradas.set(m[1], m[2].trim().replace(/,$/, ""));
    }
    let existentes;
    try {
      existentes = (await q.all(`SHOW COLUMNS FROM \`${tabela}\``)).map((r) => String(r.Field));
    } catch (e) {
      if (tabelaAusente(e)) continue;
      throw e;
    }
    let anterior = null;
    for (const [coluna, definicao] of declaradas) {
      if (!existentes.includes(coluna)) {
        const posicao = anterior === null ? "FIRST" : `AFTER \`${anterior}\``;
        await q.run(`ALTER TABLE \`${tabela}\` ADD COLUMN \`${coluna}\` ${definicao} ${posicao}`);
        say(`  + coluna ${tabela}.${coluna}`);
        adicionadas++;
      }
      anterior = coluna;
    }
  }
  return adicionadas;
}
async function addMissingIndexes(say) {
  let criados = 0;
  for (const { tabela, nome, definicao } of INDICES) {
    const existe = await q.one(
      `SELECT 1 AS ok FROM information_schema.statistics
        WHERE table_schema = DATABASE() AND table_name = ? AND index_name = ?
        LIMIT 1`,
      [tabela, nome]
    );
    if (existe !== null) continue;
    try {
      await q.run(`ALTER TABLE \`${tabela}\` ADD ${definicao}`);
      say(`  + \xEDndice ${tabela}.${nome}`);
      criados++;
    } catch (e) {
      if (tabelaAusente(e)) continue;
      const err = e;
      say(`  ! n\xE3o consegui criar ${tabela}.${nome}: ${err.code ?? ""} ${err.message ?? ""}`.trimEnd());
    }
  }
  return criados;
}
async function sincronizarEstrutura(say) {
  const sql = (0, import_node_fs4.readFileSync)(import_node_path4.default.join(dbDir(), "schema.sql"), "utf8");
  const { noComments } = splitStatements(sql);
  const colunas = await addMissingColumns(noComments, say);
  const indices = await addMissingIndexes(say);
  return { colunas, indices };
}
var import_node_fs4, import_node_path4, TIPOS_SQL, INDICES;
var init_schema = __esm({
  "server/src/schema.ts"() {
    "use strict";
    import_node_fs4 = require("node:fs");
    import_node_path4 = __toESM(require("node:path"), 1);
    init_db();
    __name(dbDir, "dbDir");
    __name(splitStatements, "splitStatements");
    TIPOS_SQL = "VARCHAR|VARBINARY|BINARY|CHAR|TINYTEXT|TEXT|MEDIUMTEXT|LONGTEXT|TINYINT|SMALLINT|MEDIUMINT|BIGINT|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|DATETIME|TIMESTAMP|DATE|TIME|YEAR|ENUM|SET|JSON|BLOB|MEDIUMBLOB|LONGBLOB|BOOLEAN|BOOL";
    __name(tabelaAusente, "tabelaAusente");
    __name(addMissingColumns, "addMissingColumns");
    INDICES = [
      {
        tabela: "orders",
        nome: "uq_order_payment_ref",
        // Único: é por ele que o webhook do provedor encontra o pedido, e o mesmo
        // pagamento não pode acabar vinculado a dois pedidos diferentes.
        definicao: "UNIQUE KEY uq_order_payment_ref (payment_ref)"
      }
    ];
    __name(addMissingIndexes, "addMissingIndexes");
    __name(sincronizarEstrutura, "sincronizarEstrutura");
  }
});

// server/src/app.ts
var import_node_fs3 = require("node:fs");
var import_node_path3 = __toESM(require("node:path"), 1);
var import_compression = __toESM(require("compression"), 1);
var import_express6 = __toESM(require("express"), 1);

// server/src/auth.ts
var import_node_crypto2 = require("node:crypto");
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
init_crypto();
init_db();
init_errors();
init_http();
var ROUNDS_SENHA = 12;
var ROUNDS_TOKEN = 10;
function hashPassword(plain) {
  return import_bcryptjs.default.hash(plain, ROUNDS_SENHA);
}
__name(hashPassword, "hashPassword");
function hashApiToken(token) {
  return import_bcryptjs.default.hash(token, ROUNDS_TOKEN);
}
__name(hashApiToken, "hashApiToken");
function verifyPassword(plain, hash) {
  return import_bcryptjs.default.compare(plain, hash).catch(() => false);
}
__name(verifyPassword, "verifyPassword");
var DUMMY_HASH = import_bcryptjs.default.hashSync("senha-que-nao-existe-" + (0, import_node_crypto2.randomBytes)(16).toString("hex"), ROUNDS_SENHA);
async function csrfToken(req) {
  if (!req.qp.data.csrf) {
    req.qp.data.csrf = (0, import_node_crypto2.randomBytes)(32).toString("hex");
    await req.qp.save();
  }
  return req.qp.data.csrf;
}
__name(csrfToken, "csrfToken");
function requireCsrf(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const sent = req.get("X-CSRF-Token") ?? "";
  const known = req.qp.data.csrf ?? "";
  if (known === "" || !safeEqual(known, sent)) {
    fail("Token de seguran\xE7a inv\xE1lido. Recarregue a p\xE1gina.", 419, "csrf_mismatch");
  }
}
__name(requireCsrf, "requireCsrf");
async function assertLoginAllowed(req, scope, identifier) {
  const ip = clientIpBinary(req);
  const byUser = await q.one(
    `SELECT COUNT(*) AS n FROM login_attempts
      WHERE scope = ? AND identifier = ? AND success = 0
        AND created_at > (NOW() - INTERVAL 15 MINUTE)`,
    [scope, identifier.toLowerCase()]
  );
  if (Number(byUser?.n ?? 0) >= 8) {
    fail("Muitas tentativas. Aguarde 15 minutos e tente de novo.", 429, "too_many_attempts");
  }
  if (ip !== null) {
    const byIp = await q.one(
      `SELECT COUNT(*) AS n FROM login_attempts
        WHERE ip = ? AND success = 0 AND created_at > (NOW() - INTERVAL 15 MINUTE)`,
      [ip]
    );
    if (Number(byIp?.n ?? 0) >= 25) {
      fail("Muitas tentativas a partir deste endere\xE7o.", 429, "too_many_attempts");
    }
  }
}
__name(assertLoginAllowed, "assertLoginAllowed");
async function recordLoginAttempt(req, scope, identifier, success) {
  await q.run("INSERT INTO login_attempts (scope, identifier, ip, success) VALUES (?, ?, ?, ?)", [
    scope,
    identifier.toLowerCase(),
    clientIpBinary(req),
    success ? 1 : 0
  ]);
  if (Math.random() < 0.02) {
    await q.run("DELETE FROM login_attempts WHERE created_at < (NOW() - INTERVAL 7 DAY)").catch(() => 0);
  }
}
__name(recordLoginAttempt, "recordLoginAttempt");
async function currentAdmin(req) {
  const id = req.qp.data.adminId;
  if (!id) return null;
  const row = await q.one("SELECT id, name, email, role FROM admin_users WHERE id = ? AND active = 1", [id]);
  if (row === null) return null;
  return { id: Number(row.id), name: String(row.name), email: String(row.email), role: String(row.role) };
}
__name(currentAdmin, "currentAdmin");
async function requireAdmin(req) {
  const admin = await currentAdmin(req);
  if (admin === null) fail("Fa\xE7a login no painel para continuar.", 401, "unauthenticated");
  return admin;
}
__name(requireAdmin, "requireAdmin");
async function adminLogin(req, emailRaw, password) {
  const email = emailRaw.trim().toLowerCase();
  await assertLoginAllowed(req, "admin", email);
  const user = await q.one("SELECT * FROM admin_users WHERE email = ? AND active = 1", [email]);
  const hash = typeof user?.password_hash === "string" ? user.password_hash : DUMMY_HASH;
  const ok = await verifyPassword(password, hash) && user !== null;
  await recordLoginAttempt(req, "admin", email, ok);
  if (!ok || user === null) return null;
  req.qp.data.adminId = Number(user.id);
  await req.qp.regenerate();
  await q.run("UPDATE admin_users SET last_login_at = NOW() WHERE id = ?", [user.id]);
  return {
    id: Number(user.id),
    name: String(user.name),
    email: String(user.email),
    role: String(user.role)
  };
}
__name(adminLogin, "adminLogin");
async function adminLogout(req) {
  delete req.qp.data.adminId;
  await req.qp.regenerate();
}
__name(adminLogout, "adminLogout");
function currentCustomerId(req) {
  const id = req.qp.data.customerId;
  return id ? Number(id) : null;
}
__name(currentCustomerId, "currentCustomerId");
function requireCustomer(req) {
  const id = currentCustomerId(req);
  if (id === null) fail("Entre na sua conta para continuar.", 401, "unauthenticated");
  return id;
}
__name(requireCustomer, "requireCustomer");
async function customerLoginSession(req, customerId) {
  req.qp.data.customerId = customerId;
  await req.qp.regenerate();
}
__name(customerLoginSession, "customerLoginSession");
async function customerLogout(req) {
  delete req.qp.data.customerId;
  await req.qp.regenerate();
}
__name(customerLogout, "customerLogout");
async function currentApiKey(req) {
  const header = req.get("Authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(header);
  if (!m) return null;
  const token = m[1];
  const candidatas = await q.all("SELECT * FROM api_keys WHERE token_prefix = ? AND revoked = 0", [
    token.slice(0, 16)
  ]);
  for (const k of candidatas) {
    if (await verifyPassword(token, String(k.token_hash))) {
      await q.run("UPDATE api_keys SET last_used_at = NOW() WHERE id = ?", [k.id]);
      return k;
    }
  }
  return null;
}
__name(currentApiKey, "currentApiKey");
async function requireApiKey(req) {
  const key = await currentApiKey(req);
  if (key === null) {
    fail("Envie uma chave v\xE1lida no header Authorization: Bearer <token>.", 401, "invalid_api_key");
  }
  return key;
}
__name(requireApiKey, "requireApiKey");

// server/src/app.ts
init_config();

// server/src/csp.ts
var MP_SCRIPT = "https://sdk.mercadopago.com https://*.mercadopago.com https://*.mlstatic.com";
var MP_CONEXAO = "https://*.mercadopago.com https://*.mercadopago.com.br https://*.mlstatic.com";
var MP_IFRAME = "https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com";
var COMUNS = [
  "default-src 'self'",
  `script-src 'self' ${MP_SCRIPT}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self' data:",
  `connect-src 'self' ${MP_CONEXAO}`,
  `frame-src ${MP_IFRAME}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "upgrade-insecure-requests"
];
var CSP_META = COMUNS.join("; ");
var CSP_LOJA = [...COMUNS, "frame-ancestors 'none'"].join("; ");
var CSP_API = "default-src 'none'; frame-ancestors 'none'";

// server/src/app.ts
init_errors();
init_http();

// server/src/routes/account.ts
var import_express = require("express");
init_db();
init_errors();
init_http();

// server/src/routes/helpers.ts
function h(fn) {
  return (req, res, next) => {
    fn(req, res).catch(next);
  };
}
__name(h, "h");

// server/src/routes/account.ts
var accountRoutes = (0, import_express.Router)();
async function customerPayload(id) {
  const c = await q.one("SELECT id, name, email, phone, cpf FROM customers WHERE id = ?", [id]);
  if (c === null) fail("Conta n\xE3o encontrada.", 404, "not_found");
  const addresses = (await q.all(
    "SELECT * FROM customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC",
    [id]
  )).map((a) => ({
    id: String(a.id),
    label: a.label,
    cep: a.cep,
    street: a.street,
    number: a.number,
    complement: a.complement,
    neighborhood: a.neighborhood,
    city: a.city,
    state: a.state,
    isDefault: Boolean(a.is_default)
  }));
  const orders = await q.all(
    "SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50",
    [id]
  );
  const itemsByOrder = /* @__PURE__ */ new Map();
  if (orders.length) {
    const ids = orders.map((o) => o.id);
    const rows = await q.all(
      `SELECT order_id, name, quantity, unit_price FROM order_items
        WHERE order_id IN (${placeholders(ids.length)}) ORDER BY id ASC`,
      ids
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
      items: itemsByOrder.get(String(o.id)) ?? []
    })),
    favorites: (await q.all("SELECT product_id FROM customer_favorites WHERE customer_id = ?", [id])).map((f) => f.product_id)
  };
}
__name(customerPayload, "customerPayload");
accountRoutes.post("/register", h(async (req, res) => {
  const b = body(req);
  const name = bodyStr(b, "name", "", 160);
  const email = bodyStr(b, "email", "", 190).toLowerCase();
  const pass = typeof b.password === "string" ? b.password : "";
  if (name === "") fail("Informe o seu nome.", 422, "invalid_name");
  if (!validEmail(email)) fail("Informe um e-mail v\xE1lido.", 422, "invalid_email");
  if (pass.length < 8) fail("A senha precisa ter pelo menos 8 caracteres.", 422, "weak_password");
  if (await q.one("SELECT id FROM customers WHERE email = ?", [email]) !== null) {
    fail(
      "J\xE1 existe cadastro com este e-mail. Fa\xE7a login ou fale com a loja para recuperar o acesso.",
      409,
      "email_taken"
    );
  }
  const hash = await hashPassword(pass);
  const id = await transaction(async (tx) => {
    await tx.run("INSERT INTO customers (name, email, password_hash) VALUES (?,?,?)", [name, email, hash]);
    return tx.lastId();
  });
  await customerLoginSession(req, id);
  jsonOk(res, { account: await customerPayload(id) }, 201);
}));
accountRoutes.post("/login", h(async (req, res) => {
  const b = body(req);
  const email = bodyStr(b, "email", "", 190).toLowerCase();
  const pass = typeof b.password === "string" ? b.password : "";
  await assertLoginAllowed(req, "customer", email);
  const c = await q.one("SELECT id, password_hash FROM customers WHERE email = ?", [email]);
  const ok = c !== null && typeof c.password_hash === "string" && c.password_hash !== "" && await verifyPassword(pass, c.password_hash);
  await recordLoginAttempt(req, "customer", email, ok);
  if (!ok || c === null) fail("E-mail ou senha inv\xE1lidos.", 401, "invalid_credentials");
  const id = Number(c.id);
  await customerLoginSession(req, id);
  jsonOk(res, { account: await customerPayload(id) });
}));
accountRoutes.post("/logout", h(async (req, res) => {
  await customerLogout(req);
  jsonOk(res, { ok: true });
}));
accountRoutes.get("/", h(async (req, res) => {
  const id = currentCustomerId(req);
  jsonOk(res, { account: id === null ? null : await customerPayload(id) });
}));
accountRoutes.put("/", h(async (req, res) => {
  const id = requireCustomer(req);
  const b = body(req);
  const name = bodyStr(b, "name", "", 160);
  const phone = bodyStr(b, "phone", "", 30);
  const cpf = bodyStr(b, "cpf", "", 20);
  if (cpf !== "" && !validCpf(cpf)) fail("CPF inv\xE1lido.", 422, "invalid_cpf");
  await q.run(
    "UPDATE customers SET name = COALESCE(NULLIF(?, ''), name), phone = ?, cpf = ? WHERE id = ?",
    [name, phone, cpf, id]
  );
  if (b.address !== null && typeof b.address === "object" && !Array.isArray(b.address)) {
    const a = b.address;
    await q.run("UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?", [id]);
    const addrId = bodyStr(a, "id", "", 20);
    const params = [
      bodyStr(a, "label", "Principal", 60),
      bodyStr(a, "cep", "", 12),
      bodyStr(a, "street", "", 160),
      bodyStr(a, "number", "", 20),
      bodyStr(a, "complement", "", 120),
      bodyStr(a, "neighborhood", "", 120),
      bodyStr(a, "city", "", 120),
      bodyStr(a, "state", "SP", 2).toUpperCase()
    ];
    const exists = /^\d+$/.test(addrId) ? await q.one("SELECT id FROM customer_addresses WHERE id = ? AND customer_id = ?", [addrId, id]) : null;
    if (exists) {
      await q.run(
        `UPDATE customer_addresses
            SET label=?, cep=?, street=?, number=?, complement=?, neighborhood=?, city=?, state=?, is_default=1
          WHERE id = ? AND customer_id = ?`,
        [...params, addrId, id]
      );
    } else {
      await q.run(
        `INSERT INTO customer_addresses
           (label, cep, street, number, complement, neighborhood, city, state, is_default, customer_id)
         VALUES (?,?,?,?,?,?,?,?,1,?)`,
        [...params, id]
      );
    }
  }
  jsonOk(res, { account: await customerPayload(id) });
}));
accountRoutes.post("/addresses", h(async (req, res) => {
  const id = requireCustomer(req);
  const a = body(req);
  const isDefault = bodyBool(a, "isDefault");
  if (isDefault) {
    await q.run("UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?", [id]);
  }
  await q.run(
    `INSERT INTO customer_addresses
        (customer_id, label, cep, street, number, complement, neighborhood, city, state, is_default)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    [
      id,
      bodyStr(a, "label", "Endere\xE7o", 60),
      bodyStr(a, "cep", "", 12),
      bodyStr(a, "street", "", 160),
      bodyStr(a, "number", "", 20),
      bodyStr(a, "complement", "", 120),
      bodyStr(a, "neighborhood", "", 120),
      bodyStr(a, "city", "", 120),
      bodyStr(a, "state", "SP", 2).toUpperCase(),
      isDefault ? 1 : 0
    ]
  );
  jsonOk(res, { account: await customerPayload(id) }, 201);
}));
accountRoutes.put("/addresses/:id", h(async (req, res) => {
  const id = requireCustomer(req);
  const a = body(req);
  const owned = await q.one("SELECT id FROM customer_addresses WHERE id = ? AND customer_id = ?", [
    req.params.id,
    id
  ]);
  if (owned === null) fail("Endere\xE7o n\xE3o encontrado.", 404, "not_found");
  const isDefault = bodyBool(a, "isDefault");
  if (isDefault) {
    await q.run("UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?", [id]);
  }
  await q.run(
    `UPDATE customer_addresses
        SET label=?, cep=?, street=?, number=?, complement=?, neighborhood=?, city=?, state=?, is_default=?
      WHERE id = ? AND customer_id = ?`,
    [
      bodyStr(a, "label", "Endere\xE7o", 60),
      bodyStr(a, "cep", "", 12),
      bodyStr(a, "street", "", 160),
      bodyStr(a, "number", "", 20),
      bodyStr(a, "complement", "", 120),
      bodyStr(a, "neighborhood", "", 120),
      bodyStr(a, "city", "", 120),
      bodyStr(a, "state", "SP", 2).toUpperCase(),
      isDefault ? 1 : 0,
      req.params.id,
      id
    ]
  );
  jsonOk(res, { account: await customerPayload(id) });
}));
accountRoutes.delete("/addresses/:id", h(async (req, res) => {
  const id = requireCustomer(req);
  await q.run("DELETE FROM customer_addresses WHERE id = ? AND customer_id = ?", [req.params.id, id]);
  jsonOk(res, { account: await customerPayload(id) });
}));
accountRoutes.put("/favorites", h(async (req, res) => {
  const id = requireCustomer(req);
  const b = body(req);
  const lista = Array.isArray(b.favorites) ? b.favorites : [];
  const ids = [
    ...new Set(
      lista.map((v) => typeof v === "string" ? v.slice(0, 100) : "").filter((v) => v !== "")
    )
  ].slice(0, 300);
  await transaction(async (tx) => {
    await tx.run("DELETE FROM customer_favorites WHERE customer_id = ?", [id]);
    for (const pid of ids) {
      await tx.run("INSERT IGNORE INTO customer_favorites (customer_id, product_id) VALUES (?,?)", [id, pid]);
    }
  });
  jsonOk(res, { account: await customerPayload(id) });
}));

// server/src/routes/admin.ts
var import_node_crypto3 = require("node:crypto");
var import_express2 = require("express");
init_config();
init_crypto();
init_db();
init_errors();
init_http();
init_providers();
init_store();
var adminRoutes = (0, import_express2.Router)();
var STATUS_PEDIDO = ["pending", "paid", "shipped", "delivered", "canceled"];
var rid = /* @__PURE__ */ __name((prefix, bytes) => prefix + (0, import_node_crypto3.randomBytes)(bytes).toString("hex"), "rid");
adminRoutes.post("/login", h(async (req, res) => {
  const b = body(req);
  const user = await adminLogin(req, bodyStr(b, "email", "", 190), typeof b.password === "string" ? b.password : "");
  if (user === null) fail("E-mail ou senha inv\xE1lidos.", 401, "invalid_credentials");
  jsonOk(res, { admin: { name: user.name, email: user.email } });
}));
adminRoutes.post("/logout", h(async (req, res) => {
  await adminLogout(req);
  jsonOk(res, { ok: true });
}));
adminRoutes.get("/me", h(async (req, res) => {
  const a = await currentAdmin(req);
  jsonOk(res, { admin: a ? { name: a.name, email: a.email } : null });
}));
adminRoutes.get("/state", h(async (req, res) => {
  await requireAdmin(req);
  const customers = (await q.all(
    `SELECT c.id, c.name, c.email, c.phone, c.created_at,
              COUNT(o.id) AS orders_count,
              COALESCE(SUM(CASE WHEN o.status <> 'canceled' THEN o.total ELSE 0 END), 0) AS total_spent
         FROM customers c
         LEFT JOIN orders o ON o.customer_id = c.id
        GROUP BY c.id, c.name, c.email, c.phone, c.created_at
        ORDER BY total_spent DESC`
  )).map((c) => ({
    id: String(c.id),
    name: c.name,
    email: c.email,
    phone: c.phone,
    ordersCount: Number(c.orders_count) || 0,
    totalSpent: Number(c.total_spent) || 0,
    createdAt: iso(c.created_at)
  }));
  const carts = await q.all("SELECT * FROM abandoned_carts ORDER BY abandoned_at DESC LIMIT 200");
  const cartItems = /* @__PURE__ */ new Map();
  if (carts.length) {
    const ids = carts.map((c) => c.id);
    for (const i of await q.all(
      `SELECT * FROM abandoned_cart_items WHERE cart_id IN (${placeholders(ids.length)})`,
      ids
    )) {
      const key = String(i.cart_id);
      const item = {
        productId: i.product_id,
        name: i.name,
        quantity: Number(i.quantity) || 0,
        unitPrice: Number(i.unit_price) || 0
      };
      const list = cartItems.get(key);
      if (list) list.push(item);
      else cartItems.set(key, [item]);
    }
  }
  const subs = /* @__PURE__ */ new Map();
  for (const sub of await q.all("SELECT * FROM subcategories ORDER BY position ASC, name ASC")) {
    const key = String(sub.parent_id);
    const entry = { id: String(sub.id), name: String(sub.name) };
    const list = subs.get(key);
    if (list) list.push(entry);
    else subs.set(key, [entry]);
  }
  jsonOk(res, {
    menu: (await q.all("SELECT * FROM categories ORDER BY position ASC, name ASC")).map((c) => ({
      id: c.id,
      name: c.name,
      icon: c.icon,
      featured: Boolean(c.featured),
      subcategories: subs.get(String(c.id)) ?? []
    })),
    products: await fetchProducts(false),
    orders: await fetchOrders(),
    customers,
    coupons: (await q.all("SELECT * FROM coupons ORDER BY created_at DESC")).map((c) => ({
      id: c.id,
      code: c.code,
      type: c.type,
      value: Number(c.value) || 0,
      active: Boolean(c.active),
      minOrder: c.min_order === null ? null : Number(c.min_order),
      expiresAt: c.expires_at === null ? null : String(c.expires_at).slice(0, 10),
      uses: Number(c.uses) || 0,
      maxUses: c.max_uses === null ? null : Number(c.max_uses)
    })),
    settings: await getSettings(),
    shipping: await getShipping(),
    recovery: await getRecovery(),
    integrations: await fetchIntegrations(),
    abandonedCarts: carts.map((c) => ({
      id: c.id,
      customerName: c.customer_name,
      customerEmail: c.customer_email,
      customerPhone: c.customer_phone,
      items: cartItems.get(String(c.id)) ?? [],
      total: Number(c.total) || 0,
      abandonedAt: iso(c.abandoned_at),
      status: c.status,
      remindersSent: Number(c.reminders_sent) || 0
    })),
    apiKeys: (await q.all("SELECT * FROM api_keys ORDER BY created_at DESC")).map((k) => ({
      id: k.id,
      name: k.name,
      // Só o prefixo volta: o token completo aparece uma única vez, na criação.
      token: String(k.token_prefix) + "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022",
      createdAt: iso(k.created_at),
      lastUsedAt: iso(k.last_used_at),
      revoked: Boolean(k.revoked)
    })),
    webhooks: (await q.all("SELECT * FROM webhooks ORDER BY created_at DESC")).map((w) => ({
      id: w.id,
      url: w.url,
      event: w.event,
      active: Boolean(w.active)
    }))
  });
}));
adminRoutes.post("/products", h(async (req, res) => {
  await requireAdmin(req);
  const b = body(req);
  const id = bodyStr(b, "id", "", 64) || rid("p-", 6);
  const name = bodyStr(b, "name", "", 255);
  if (name === "") fail("O produto precisa de um nome.", 422, "invalid_name");
  const price = bodyFloat(b, "price");
  if (price < 0) fail("Pre\xE7o n\xE3o pode ser negativo.", 422, "invalid_price");
  const image = bodyStr(b, "image", "", 500);
  if (image !== "" && !safeImageUrl(image)) fail("Endere\xE7o de imagem inv\xE1lido.", 422, "invalid_image");
  const atual = await q.one("SELECT active FROM products WHERE id = ?", [id]);
  await q.run(
    `INSERT INTO products (
        id, sku, name, category, subcategory, category_label, description, long_description,
        price, old_price, stock, image, tag, weight, ingredients, highlight, active
     ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE
        sku=VALUES(sku), name=VALUES(name), category=VALUES(category), subcategory=VALUES(subcategory),
        category_label=VALUES(category_label), description=VALUES(description),
        long_description=VALUES(long_description), price=VALUES(price), old_price=VALUES(old_price),
        stock=VALUES(stock), image=VALUES(image), tag=VALUES(tag), weight=VALUES(weight),
        ingredients=VALUES(ingredients), highlight=VALUES(highlight), active=VALUES(active)`,
    [
      id,
      bodyStr(b, "sku", "", 64),
      name,
      bodyStr(b, "category", "", 64),
      bodyStr(b, "subcategory", "", 64) || null,
      bodyStr(b, "categoryLabel", "", 120),
      bodyStr(b, "description", "", 2e3),
      bodyStr(b, "longDescription", "", 2e4),
      price,
      bodyFloat(b, "oldPrice", 0) > 0 ? bodyFloat(b, "oldPrice") : null,
      Math.max(0, bodyInt(b, "stock")),
      image,
      bodyStr(b, "tag", "", 40) || null,
      bodyStr(b, "weight", "", 120),
      bodyStr(b, "ingredients", "", 2e3),
      bodyBool(b, "highlight") ? 1 : 0,
      // Sem `active` no corpo, mantém o estado atual: salvar uma edição de
      // produto excluído não pode trazê-lo de volta à vitrine.
      bodyBool(b, "active", atual === null || Boolean(atual.active)) ? 1 : 0
    ]
  );
  const row = await q.one("SELECT * FROM products WHERE id = ?", [id]);
  jsonOk(res, { product: productRowToApi(row) });
}));
adminRoutes.delete("/products/:id", h(async (req, res) => {
  await requireAdmin(req);
  await q.run("UPDATE products SET active = 0 WHERE id = ?", [req.params.id]);
  jsonOk(res, { ok: true });
}));
adminRoutes.patch("/orders/:id", h(async (req, res) => {
  await requireAdmin(req);
  const status = bodyStr(body(req), "status", "", 20);
  if (!STATUS_PEDIDO.includes(status)) fail("Status inv\xE1lido.", 422, "invalid_status");
  if (await q.run("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id]) === 0) {
    fail("Pedido n\xE3o encontrado.", 404, "not_found");
  }
  fireWebhooks("order.status_changed", { orderId: req.params.id, status });
  jsonOk(res, { ok: true });
}));
adminRoutes.post("/coupons", h(async (req, res) => {
  await requireAdmin(req);
  const b = body(req);
  const code = bodyStr(b, "code", "", 40).toUpperCase();
  if (code === "") fail("Informe o c\xF3digo do cupom.", 422, "invalid_code");
  const type = bodyStr(b, "type", "percent", 10);
  if (!["percent", "fixed"].includes(type)) fail("Tipo de cupom inv\xE1lido.", 422, "invalid_type");
  const value = bodyFloat(b, "value");
  if (value <= 0 || type === "percent" && value > 100) {
    fail("Valor de desconto inv\xE1lido.", 422, "invalid_value");
  }
  const id = bodyStr(b, "id", "", 40) || rid("c-", 5);
  await q.run(
    `INSERT INTO coupons (id, code, type, value, active, min_order, expires_at, max_uses)
     VALUES (?,?,?,?,?,?,?,?)
     ON DUPLICATE KEY UPDATE code=VALUES(code), type=VALUES(type), value=VALUES(value),
        active=VALUES(active), min_order=VALUES(min_order), expires_at=VALUES(expires_at),
        max_uses=VALUES(max_uses)`,
    [
      id,
      code,
      type,
      value,
      bodyBool(b, "active", true) ? 1 : 0,
      b.minOrder !== void 0 && b.minOrder !== null && Number.isFinite(Number(b.minOrder)) ? Number(b.minOrder) : null,
      bodyStr(b, "expiresAt", "", 10) || null,
      bodyInt(b, "maxUses", 0) > 0 ? bodyInt(b, "maxUses") : null
    ]
  );
  jsonOk(res, { ok: true, id });
}));
adminRoutes.delete("/coupons/:id", h(async (req, res) => {
  await requireAdmin(req);
  await q.run("DELETE FROM coupons WHERE id = ?", [req.params.id]);
  jsonOk(res, { ok: true });
}));
var CONFIGURAVEIS = {
  settings: DEFAULT_SETTINGS,
  shipping: DEFAULT_SHIPPING,
  recovery: DEFAULT_RECOVERY
};
for (const key of Object.keys(CONFIGURAVEIS)) {
  adminRoutes.put(`/${key}`, h(async (req, res) => {
    await requireAdmin(req);
    const def = CONFIGURAVEIS[key];
    await configSet(key, configMerge(await configGet(key, def), body(req)));
    jsonOk(res, { [key]: await configGet(key, def) });
  }));
}
adminRoutes.put("/integrations/:id", h(async (req, res) => {
  await requireAdmin(req);
  const id = req.params.id;
  if (!INTEGRATION_IDS.includes(id)) {
    fail("Integra\xE7\xE3o desconhecida.", 404, "not_found");
  }
  const b = body(req);
  const current = await integrationSecrets(id);
  const incoming = b.fields !== null && typeof b.fields === "object" && !Array.isArray(b.fields) ? b.fields : {};
  for (const [k, raw] of Object.entries(incoming)) {
    if (raw === null || raw === void 0 || typeof raw === "object") continue;
    const v = String(raw).trim();
    if (v === "" && INTEGRATION_SECRET_FIELDS.includes(k)) continue;
    current[k] = v.slice(0, 2e3);
  }
  await q.run(
    `INSERT INTO integrations (id, enabled, fields_enc) VALUES (?,?,?)
     ON DUPLICATE KEY UPDATE enabled = VALUES(enabled), fields_enc = VALUES(fields_enc)`,
    [id, bodyBool(b, "enabled") ? 1 : 0, encryptPayload(current)]
  );
  const row = await q.one("SELECT * FROM integrations WHERE id = ?", [id]);
  jsonOk(res, { integration: integrationToApi(row) });
}));
adminRoutes.post("/integrations/:id/test", h(async (req, res) => {
  await requireAdmin(req);
  const id = req.params.id;
  if (!INTEGRATION_IDS.includes(id)) {
    fail("Integra\xE7\xE3o desconhecida.", 404, "not_found");
  }
  const result = await providerTest(id, await integrationSecrets(id));
  await q.run(
    `INSERT INTO integrations (id, last_status, last_checked_at) VALUES (?,?,NOW())
     ON DUPLICATE KEY UPDATE last_status = VALUES(last_status), last_checked_at = NOW()`,
    [id, result.ok ? "connected" : "error"]
  );
  jsonOk(res, result);
}));
adminRoutes.post("/whatsapp/test", h(async (req, res) => {
  await requireAdmin(req);
  const phone = digits(bodyStr(body(req), "phone", "", 20));
  if (phone.length < 10) fail("Informe o n\xFAmero com DDI e DDD.", 422, "invalid_phone");
  jsonOk(res, await providerSendWhatsapp(phone, "Mensagem de teste \u2014 Qu\xE9ops Pir\xE2mides \u2705"));
}));
adminRoutes.put("/orders/:id/tracking", h(async (req, res) => {
  await requireAdmin(req);
  const code = bodyStr(body(req), "trackingCode", "", 40).trim().toUpperCase().replace(/\s/g, "");
  if (code !== "" && !/^[A-Z]{2}\d{9}[A-Z]{2}$/.test(code)) {
    fail("C\xF3digo de rastreio inv\xE1lido (formato AA123456789BR).", 422, "invalid_tracking");
  }
  const existe = await q.one("SELECT id FROM orders WHERE id = ?", [req.params.id]);
  if (!existe) fail("Pedido n\xE3o encontrado.", 404, "not_found");
  await q.run(
    "UPDATE orders SET tracking_code = ?, tracking_status = '', tracking_at = NULL WHERE id = ?",
    [code, req.params.id]
  );
  jsonOk(res, { trackingCode: code });
}));
adminRoutes.get("/orders/:id/tracking", h(async (req, res) => {
  await requireAdmin(req);
  const row = await q.one("SELECT tracking_code FROM orders WHERE id = ?", [req.params.id]);
  if (!row) fail("Pedido n\xE3o encontrado.", 404, "not_found");
  const code = String(row.tracking_code ?? "");
  if (code === "") jsonOk(res, { trackingCode: "", eventos: [], erro: "Pedido sem c\xF3digo de rastreio." });
  const { credsFrom: credsFrom2, rastrear: rastrear2 } = await Promise.resolve().then(() => (init_correios(), correios_exports));
  const { eventos, erro } = await rastrear2(credsFrom2(await integrationSecrets("correios")), code);
  if (erro === "" && eventos.length > 0) {
    await q.run(
      "UPDATE orders SET tracking_status = ?, tracking_at = NOW() WHERE id = ?",
      [eventos[0].descricao.slice(0, 190), req.params.id]
    );
  }
  jsonOk(res, { trackingCode: code, eventos, erro });
}));
adminRoutes.patch("/carts/:id", h(async (req, res) => {
  await requireAdmin(req);
  const status = bodyStr(body(req), "status", "", 20);
  if (!["open", "recovered", "discarded"].includes(status)) fail("Status inv\xE1lido.", 422, "invalid_status");
  await q.run("UPDATE abandoned_carts SET status = ? WHERE id = ?", [status, req.params.id]);
  jsonOk(res, { ok: true });
}));
adminRoutes.post("/carts/:id/remind", h(async (req, res) => {
  await requireAdmin(req);
  const cart = await q.one("SELECT * FROM abandoned_carts WHERE id = ?", [req.params.id]);
  if (cart === null) fail("Carrinho n\xE3o encontrado.", 404, "not_found");
  const rec = await getRecovery();
  const msg = String(rec.message).replaceAll("{nome}", String(cart.customer_name || "tudo bem?")).replaceAll("{valor}", "R$ " + brl(Number(cart.total) || 0)).replaceAll("{cupom}", String(rec.couponCode ?? "")) + config.appUrl;
  const result = await providerSendWhatsapp(String(cart.customer_phone ?? ""), msg);
  if (result.ok) {
    await q.run("UPDATE abandoned_carts SET reminders_sent = reminders_sent + 1 WHERE id = ?", [req.params.id]);
  }
  jsonOk(res, result);
}));
adminRoutes.post("/api-keys", h(async (req, res) => {
  await requireAdmin(req);
  const name = bodyStr(body(req), "name", "Nova chave", 120);
  const token = "qp_live_" + (0, import_node_crypto3.randomBytes)(20).toString("hex");
  const id = rid("k-", 6);
  await q.run("INSERT INTO api_keys (id, name, token_prefix, token_hash) VALUES (?,?,?,?)", [
    id,
    name,
    token.slice(0, 16),
    await hashApiToken(token)
  ]);
  jsonOk(res, { id, name, token }, 201);
}));
adminRoutes.patch("/api-keys/:id", h(async (req, res) => {
  await requireAdmin(req);
  await q.run("UPDATE api_keys SET revoked = 1 WHERE id = ?", [req.params.id]);
  jsonOk(res, { ok: true });
}));
adminRoutes.delete("/api-keys/:id", h(async (req, res) => {
  await requireAdmin(req);
  await q.run("DELETE FROM api_keys WHERE id = ?", [req.params.id]);
  jsonOk(res, { ok: true });
}));
adminRoutes.post("/webhooks", h(async (req, res) => {
  await requireAdmin(req);
  const b = body(req);
  const url = bodyStr(b, "url", "", 500);
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    fail("Informe uma URL http(s) v\xE1lida.", 422, "invalid_url");
  }
  if (!["http:", "https:"].includes(parsed.protocol)) {
    fail("Informe uma URL http(s) v\xE1lida.", 422, "invalid_url");
  }
  if (await isInternalHost(parsed.hostname)) {
    fail("N\xE3o \xE9 poss\xEDvel apontar um webhook para um endere\xE7o interno.", 422, "internal_url");
  }
  const id = rid("wh-", 6);
  await q.run("INSERT INTO webhooks (id, url, event, active) VALUES (?,?,?,1)", [
    id,
    url,
    bodyStr(b, "event", "order.created", 60)
  ]);
  jsonOk(res, { ok: true, id }, 201);
}));
adminRoutes.delete("/webhooks/:id", h(async (req, res) => {
  await requireAdmin(req);
  await q.run("DELETE FROM webhooks WHERE id = ?", [req.params.id]);
  jsonOk(res, { ok: true });
}));
function safeImageUrl(url) {
  if (/^data:image\/(png|jpe?g|gif|webp|avif|bmp|x-icon);base64,/i.test(url)) return true;
  if (/^\/[^/]/.test(url)) return true;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}
__name(safeImageUrl, "safeImageUrl");

// server/src/routes/public.ts
var import_express3 = require("express");
init_db();
init_errors();
init_config();
init_http();

// server/src/payments/mercadopago.ts
var import_mercadopago = require("mercadopago");
init_errors();
init_store();
init_db();
var PROVEDOR = "mercadopago";
async function credenciais(exec = q) {
  const f = await integrationSecrets(PROVEDOR, exec);
  const texto = /* @__PURE__ */ __name((k) => {
    const v = f[k];
    return v === null || v === void 0 || typeof v === "object" ? "" : String(v).trim();
  }, "texto");
  const accessToken = texto("accessToken");
  if (accessToken === "") return null;
  return {
    publicKey: texto("publicKey"),
    accessToken,
    webhookSecret: texto("webhookSecret")
  };
}
__name(credenciais, "credenciais");
async function habilitado(exec = q) {
  const row = await exec.one("SELECT enabled FROM integrations WHERE id = ?", [PROVEDOR]);
  if (!row?.enabled) return false;
  return await credenciais(exec) !== null;
}
__name(habilitado, "habilitado");
function cliente(cred) {
  return new import_mercadopago.Order(
    new import_mercadopago.MercadoPagoConfig({
      accessToken: cred.accessToken,
      options: { timeout: 15e3 }
    })
  );
}
__name(cliente, "cliente");
function ambiente(cred) {
  return cred.accessToken.startsWith("TEST-") ? "teste" : "producao";
}
__name(ambiente, "ambiente");
function traduzirStatus(status, detalhe) {
  const s = String(status ?? "").toLowerCase();
  const d = String(detalhe ?? "").toLowerCase();
  if (s === "processed" || s === "approved" || d === "accredited") return "aprovado";
  if (s === "action_required" || s === "pending" || s === "in_process" || s === "authorized" || s === "created" || d === "waiting_transfer" || d === "pending_capture") {
    return "aguardando";
  }
  return "recusado";
}
__name(traduzirStatus, "traduzirStatus");
function motivoRecusa(detalhe) {
  const mapa = {
    cc_rejected_bad_filled_card_number: "Confira o n\xFAmero do cart\xE3o.",
    cc_rejected_bad_filled_date: "Confira a data de validade do cart\xE3o.",
    cc_rejected_bad_filled_security_code: "Confira o c\xF3digo de seguran\xE7a (CVV).",
    cc_rejected_bad_filled_other: "Confira os dados do cart\xE3o.",
    cc_rejected_insufficient_amount: "O cart\xE3o n\xE3o tem limite suficiente para esta compra.",
    cc_rejected_high_risk: "O pagamento foi recusado pelo banco. Tente outro cart\xE3o ou pague com Pix.",
    cc_rejected_max_attempts: "Muitas tentativas com este cart\xE3o. Tente outro ou pague com Pix.",
    cc_rejected_call_for_authorize: "Ligue para o seu banco e autorize o valor desta compra.",
    cc_rejected_card_disabled: "O cart\xE3o est\xE1 desativado. Fale com o seu banco.",
    cc_rejected_duplicated_payment: "Este pagamento j\xE1 foi feito. Confira antes de tentar de novo.",
    cc_rejected_card_error: "N\xE3o foi poss\xEDvel processar o cart\xE3o. Tente novamente.",
    cc_rejected_blacklist: "O pagamento n\xE3o foi autorizado. Tente outro cart\xE3o ou pague com Pix.",
    cc_rejected_invalid_installments: "O cart\xE3o n\xE3o aceita esse n\xFAmero de parcelas.",
    rejected_by_bank: "O banco recusou a compra. Tente outro cart\xE3o ou pague com Pix.",
    expired: "O prazo para pagamento expirou."
  };
  return mapa[String(detalhe ?? "").toLowerCase()] ?? "O pagamento n\xE3o foi aprovado. Tente outro cart\xE3o ou pague com Pix.";
}
__name(motivoRecusa, "motivoRecusa");
function valor(n) {
  return (Math.round(n * 100) / 100).toFixed(2);
}
__name(valor, "valor");
function chaveIdempotencia(orderId, tentativa) {
  return `queops-${orderId}-${tentativa}`;
}
__name(chaveIdempotencia, "chaveIdempotencia");
function primeiroPagamento(resposta) {
  const transacoes = resposta?.transactions?.payments;
  return Array.isArray(transacoes) && transacoes.length > 0 ? transacoes[0] : null;
}
__name(primeiroPagamento, "primeiroPagamento");
function lerPix(pagamento) {
  const metodo = pagamento?.payment_method ?? {};
  const copiaECola = String(metodo.qr_code ?? "");
  const qrCodeBase64 = String(metodo.qr_code_base64 ?? "");
  if (copiaECola === "" && qrCodeBase64 === "") return void 0;
  return {
    copiaECola,
    qrCodeBase64,
    expiraEm: pagamento?.expiration_time ? String(pagamento.expiration_time) : null
  };
}
__name(lerPix, "lerPix");
async function cobrar(dados, cred, tentativa = 0) {
  const pagamento = { amount: valor(dados.total) };
  if (dados.metodo === "card") {
    pagamento.payment_method = {
      id: dados.paymentMethodId,
      type: "credit_card",
      token: dados.token,
      installments: dados.parcelas,
      // Aparece na fatura do cliente. Cartão com nome irreconhecível vira
      // contestação — e contestação custa mais caro que a venda.
      statement_descriptor: "QUEOPS"
    };
  } else {
    pagamento.payment_method = { id: "pix", type: "bank_transfer" };
    pagamento.expiration_time = `PT${dados.expiraEmMinutos}M`;
  }
  const corpo = {
    type: "online",
    processing_mode: "automatic",
    total_amount: valor(dados.total),
    external_reference: dados.orderId,
    description: dados.descricao,
    payer: {
      email: dados.pagador.email,
      first_name: dados.pagador.nome,
      last_name: dados.pagador.sobrenome,
      identification: { type: "CPF", number: dados.pagador.cpf }
    },
    transactions: { payments: [pagamento] },
    config: { online: { callback_url: dados.webhookUrl } }
  };
  let resposta;
  try {
    resposta = await cliente(cred).create({
      body: corpo,
      requestOptions: { idempotencyKey: chaveIdempotencia(dados.orderId, tentativa) }
    });
  } catch (e) {
    const err = e;
    console.error("[queops] falha ao cobrar no Mercado Pago:", err.status ?? "", err.message ?? e);
    fail(
      "N\xE3o conseguimos falar com o meio de pagamento. Nada foi cobrado \u2014 tente de novo em instantes.",
      502,
      "gateway_unavailable",
      e
    );
  }
  const pago = primeiroPagamento(resposta);
  const status = String(pago?.status ?? resposta?.status ?? "");
  const detalhe = String(pago?.status_detail ?? resposta?.status_detail ?? "");
  const traduzido = traduzirStatus(status, detalhe);
  return {
    status: traduzido,
    // O id do PEDIDO no MP é o que o webhook manda de volta; guardamos ele.
    ref: String(resposta?.id ?? ""),
    detalhe: detalhe || status,
    pix: dados.metodo === "pix" ? lerPix(pago) : void 0,
    mensagem: traduzido === "recusado" ? motivoRecusa(detalhe) : void 0
  };
}
__name(cobrar, "cobrar");
async function consultarPedido(ref, cred) {
  try {
    const resposta = await cliente(cred).get({ id: ref });
    const pago = primeiroPagamento(resposta);
    const status = String(pago?.status ?? resposta?.status ?? "");
    const detalhe = String(pago?.status_detail ?? resposta?.status_detail ?? "");
    return {
      status: traduzirStatus(status, detalhe),
      detalhe: detalhe || status,
      orderId: String(resposta?.external_reference ?? "")
    };
  } catch (e) {
    const err = e;
    console.error("[queops] falha ao consultar pedido no Mercado Pago:", ref, err.status ?? "", err.message ?? e);
    return null;
  }
}
__name(consultarPedido, "consultarPedido");

// server/src/payments/pedidos.ts
init_db();
init_providers();
var JA_RESOLVIDO = ["paid", "shipped", "delivered"];
async function devolverEstoque(tx, orderId) {
  const marcou = await tx.run(
    "UPDATE orders SET stock_restored = 1 WHERE id = ? AND stock_restored = 0",
    [orderId]
  );
  if (marcou === 0) return false;
  const itens = await tx.all(
    "SELECT product_id, quantity FROM order_items WHERE order_id = ?",
    [orderId]
  );
  for (const item of itens) {
    await tx.run("UPDATE products SET stock = stock + ? WHERE id = ?", [
      Number(item.quantity) || 0,
      item.product_id
    ]);
  }
  return true;
}
__name(devolverEstoque, "devolverEstoque");
async function aplicarPagamento(opts) {
  const { orderId, status, detalhe, provedor, ref } = opts;
  const resultado = await transaction(async (tx) => {
    const pedido = await tx.one("SELECT * FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    if (pedido === null) {
      return { mudou: false, status: "pending", estoqueDevolvido: false };
    }
    const atual = String(pedido.status);
    if (ref && ref !== "" && !pedido.payment_ref) {
      await tx.run("UPDATE orders SET payment_provider = ?, payment_ref = ? WHERE id = ?", [
        provedor,
        ref,
        orderId
      ]);
    }
    if (JA_RESOLVIDO.includes(atual)) {
      return { mudou: false, status: atual, estoqueDevolvido: false };
    }
    if (status === "aprovado") {
      await tx.run(
        `UPDATE orders
            SET status = 'paid',
                payment_detail = ?,
                paid_at = COALESCE(paid_at, NOW())
          WHERE id = ?`,
        [detalhe.slice(0, 60), orderId]
      );
      return { mudou: true, status: "paid", estoqueDevolvido: false };
    }
    if (status === "recusado") {
      const devolveu = await devolverEstoque(tx, orderId);
      await tx.run(
        "UPDATE orders SET status = 'canceled', payment_detail = ? WHERE id = ?",
        [detalhe.slice(0, 60), orderId]
      );
      return {
        mudou: atual !== "canceled",
        status: "canceled",
        estoqueDevolvido: devolveu
      };
    }
    await tx.run("UPDATE orders SET status = 'pending', payment_detail = ? WHERE id = ?", [
      detalhe.slice(0, 60),
      orderId
    ]);
    return { mudou: atual !== "pending", status: "pending", estoqueDevolvido: false };
  });
  if (resultado.mudou) {
    fireWebhooks("order.status_changed", { orderId, status: resultado.status, detalhe });
  }
  return resultado;
}
__name(aplicarPagamento, "aplicarPagamento");
async function cancelarSemCobranca(orderId, motivo) {
  await transaction(async (tx) => {
    const pedido = await tx.one("SELECT status FROM orders WHERE id = ? FOR UPDATE", [orderId]);
    if (pedido === null || JA_RESOLVIDO.includes(String(pedido.status))) return;
    await devolverEstoque(tx, orderId);
    await tx.run("UPDATE orders SET status = 'canceled', payment_detail = ? WHERE id = ?", [
      motivo.slice(0, 60),
      orderId
    ]);
  });
}
__name(cancelarSemCobranca, "cancelarSemCobranca");

// server/src/pricing.ts
init_db();
init_http();
init_store();
function normalizeCep(cep) {
  const d = String(cep ?? "").replace(/\D/g, "");
  return d.length === 8 ? d : "";
}
__name(normalizeCep, "normalizeCep");
var CEP_RANGES = [
  [1e3, 19999, "SP"],
  [2e4, 28999, "RJ"],
  [29e3, 29999, "ES"],
  [3e4, 39999, "MG"],
  [4e4, 48999, "BA"],
  [49e3, 49999, "SE"],
  [5e4, 56999, "PE"],
  [57e3, 57999, "AL"],
  [58e3, 58999, "PB"],
  [59e3, 59999, "RN"],
  [6e4, 63999, "CE"],
  [64e3, 64999, "PI"],
  [65e3, 65999, "MA"],
  [66e3, 68899, "PA"],
  [68900, 68999, "AP"],
  [69e3, 69299, "AM"],
  [69300, 69399, "RR"],
  [69400, 69899, "AM"],
  [69900, 69999, "AC"],
  [7e4, 72799, "DF"],
  [72800, 72999, "GO"],
  [73e3, 73699, "DF"],
  [73700, 76799, "GO"],
  [76800, 76999, "RO"],
  [77e3, 77999, "TO"],
  [78e3, 78899, "MT"],
  [79e3, 79999, "MS"],
  [8e4, 87999, "PR"],
  [88e3, 89999, "SC"],
  [9e4, 99999, "RS"]
];
function ufFromCep(cep) {
  const norm = normalizeCep(cep);
  if (norm === "") return "";
  const n = Number(norm.slice(0, 5));
  for (const [from, to, uf] of CEP_RANGES) {
    if (n >= from && n <= to) return uf;
  }
  return "";
}
__name(ufFromCep, "ufFromCep");
function deliveryDaysFor(uf) {
  switch (uf) {
    case "SP":
      return 3;
    case "RJ":
    case "MG":
    case "ES":
    case "PR":
    case "SC":
      return 4;
    case "RS":
    case "GO":
    case "DF":
    case "MS":
    case "BA":
      return 6;
    case "":
      return 7;
    default:
      return 8;
  }
}
__name(deliveryDaysFor, "deliveryDaysFor");
function calculateShipping(shipping, subtotal, ufRaw, cepRaw) {
  const uf = String(ufRaw ?? "").toUpperCase().slice(0, 2);
  const cep = normalizeCep(cepRaw);
  const free = shipping.freeShipping ?? {};
  const enabled = Boolean(free.enabled);
  const minOrder = Number(free.minOrder ?? 0) || 0;
  if (enabled && uf !== "" && (free.states ?? []).includes(uf)) {
    return { cost: 0, reason: "free_state", label: `Frete gr\xE1tis para ${uf}` };
  }
  if (cep !== "") {
    for (const range of shipping.cepRanges ?? []) {
      const from = normalizeCep(String(range?.from ?? ""));
      const to = normalizeCep(String(range?.to ?? ""));
      if (from === "" || to === "") continue;
      if (Number(cep) >= Number(from) && Number(cep) <= Number(to)) {
        if (range.free) {
          return { cost: 0, reason: "free_cep_range", label: String(range.label ?? "Frete gr\xE1tis") };
        }
        if (enabled && minOrder > 0 && subtotal >= minOrder) {
          return { cost: 0, reason: "free_min_order", label: "Frete gr\xE1tis" };
        }
        return {
          cost: round2(Number(range.price ?? 0) || 0),
          reason: "cep_range",
          label: String(range.label ?? "Entrega")
        };
      }
    }
  }
  if (enabled && minOrder > 0 && subtotal > 0 && subtotal >= minOrder) {
    return { cost: 0, reason: "free_min_order", label: "Frete gr\xE1tis" };
  }
  const perState = shipping.perState ?? {};
  if (uf !== "" && Object.prototype.hasOwnProperty.call(perState, uf)) {
    return { cost: round2(Number(perState[uf]) || 0), reason: "per_state", label: `Entrega para ${uf}` };
  }
  return {
    cost: round2(Number(shipping.defaultPrice ?? 0) || 0),
    reason: "default",
    label: "Entrega padr\xE3o"
  };
}
__name(calculateShipping, "calculateShipping");
async function resolveCoupon(code, subtotal, exec = q, today = new Date(Date.now() - 3 * 36e5).toISOString().slice(0, 10)) {
  const upper = String(code ?? "").trim().toUpperCase();
  if (upper === "") return [null, null];
  const row = await exec.one("SELECT * FROM coupons WHERE code = ?", [upper]);
  if (row === null) return [null, "Cupom n\xE3o encontrado."];
  if (!row.active) return [null, "Este cupom n\xE3o est\xE1 mais ativo."];
  if (row.expires_at !== null && String(row.expires_at).slice(0, 10) < today) {
    return [null, "Este cupom expirou."];
  }
  if (row.max_uses !== null && Number(row.uses) >= Number(row.max_uses)) {
    return [null, "Este cupom atingiu o limite de usos."];
  }
  if (row.min_order !== null && subtotal < Number(row.min_order)) {
    return [null, `Este cupom vale a partir de R$ ${brl(Number(row.min_order))}.`];
  }
  return [row, null];
}
__name(resolveCoupon, "resolveCoupon");
function pesoDoCarrinho(items, found) {
  const PADRAO_G = 500;
  let total = 0;
  for (const item of items) {
    const bruto = String(found.get(item.productId)?.weight ?? "").trim().toLowerCase();
    total += pesoEmGramas(bruto, PADRAO_G) * item.quantity;
  }
  return Math.max(300, Math.round(total));
}
__name(pesoDoCarrinho, "pesoDoCarrinho");
async function cotarNosCorreios(ship, cep, pesoGramas, exec, diagnostico) {
  const pulou = /* @__PURE__ */ __name((motivo) => {
    console.warn(`[queops] frete: Correios n\xE3o consultados \u2014 ${motivo}`);
    diagnostico.motivo = motivo;
    return null;
  }, "pulou");
  if (ship.reason.startsWith("free_")) return null;
  if (normalizeCep(cep) === "") return pulou("CEP de destino inv\xE1lido");
  try {
    const row = await exec.one(
      "SELECT enabled FROM integrations WHERE id = 'correios' AND enabled = 1"
    );
    if (!row) return pulou("integra\xE7\xE3o desligada em Painel \u2192 Integra\xE7\xF5es");
    const { integrationSecrets: integrationSecrets2 } = await Promise.resolve().then(() => (init_store(), store_exports));
    const { credsFrom: credsFrom2, cotarTodos: cotarTodos2 } = await Promise.resolve().then(() => (init_correios(), correios_exports));
    const creds = credsFrom2(await integrationSecrets2("correios", exec));
    if (creds.user === "" || creds.accessCode === "") {
      return pulou("usu\xE1rio ou c\xF3digo de acesso n\xE3o cadastrados");
    }
    if ((creds.originCep ?? "").length !== 8) {
      return pulou("CEP de origem n\xE3o configurado no painel");
    }
    const cotacoes = await cotarTodos2(creds, cep, pesoGramas);
    const melhor = cotacoes.find((c) => c.erro === "" && c.preco > 0);
    if (!melhor) {
      const erros = cotacoes.map((c) => `${c.nome}: ${c.erro || "sem pre\xE7o"}`).join(" \xB7 ");
      return pulou(`nenhum servi\xE7o cotou (${erros})`);
    }
    const prazo = melhor.prazoDias > 0 ? ` \u2014 at\xE9 ${melhor.prazoDias} dias \xFAteis` : "";
    return { cost: round2(melhor.preco), label: `${melhor.nome}${prazo}` };
  } catch (e) {
    return pulou(e instanceof Error ? e.message : String(e));
  }
}
__name(cotarNosCorreios, "cotarNosCorreios");
function pesoEmGramas(texto, padrao = 500) {
  const m = texto.match(/([\d.,]+)\s*(kg|g|gramas?|quilos?)?/i);
  if (!m) return padrao;
  const bruto = m[1].replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = Number(bruto);
  if (!Number.isFinite(n) || n <= 0) return padrao;
  const unidade = (m[2] ?? "").toLowerCase();
  if (unidade === "") return n < 100 ? Math.round(n * 1e3) : Math.round(n);
  if (unidade.startsWith("k") || unidade.startsWith("q")) return Math.round(n * 1e3);
  return Math.round(n);
}
__name(pesoEmGramas, "pesoEmGramas");
async function quoteCart(rawItems, ufIn, cep, couponCode, payment, exec = q) {
  let uf = String(ufIn ?? "").trim().toUpperCase();
  if (uf === "") uf = ufFromCep(cep);
  const wanted = /* @__PURE__ */ new Map();
  for (const item of Array.isArray(rawItems) ? rawItems : []) {
    if (item === null || typeof item !== "object") continue;
    const raw = item;
    const id = String(raw.productId ?? raw.id ?? "");
    const qty = Math.trunc(Number(raw.quantity ?? 0)) || 0;
    if (id === "" || qty < 1) continue;
    wanted.set(id, Math.min((wanted.get(id) ?? 0) + qty, 999));
  }
  if (wanted.size === 0) {
    return {
      items: [],
      subtotal: 0,
      shipping: 0,
      shippingLabel: "",
      couponDiscount: 0,
      couponCode: null,
      couponError: null,
      pixDiscount: 0,
      discount: 0,
      total: 0,
      uf,
      deliveryDays: deliveryDaysFor(uf),
      issues: ["Sacola vazia."]
    };
  }
  const ids = [...wanted.keys()];
  const rows = await exec.all(
    `SELECT * FROM products WHERE id IN (${placeholders(ids.length)}) AND active = 1`,
    ids
  );
  const found = new Map(rows.map((r) => [String(r.id), r]));
  const items = [];
  const issues = [];
  let subtotal = 0;
  for (const [id, qtyWanted] of wanted) {
    const p = found.get(id);
    if (!p) {
      issues.push("Um item da sacola n\xE3o est\xE1 mais dispon\xEDvel e foi removido.");
      continue;
    }
    const stock = Number(p.stock) || 0;
    if (stock <= 0) {
      issues.push(`\u201C${p.name}\u201D est\xE1 sem estoque e foi removido da sacola.`);
      continue;
    }
    let qty = qtyWanted;
    if (qty > stock) {
      issues.push(`\u201C${p.name}\u201D: s\xF3 temos ${stock} em estoque, ajustamos a quantidade.`);
      qty = stock;
    }
    const unit = Number(p.price) || 0;
    subtotal += unit * qty;
    items.push({
      productId: String(p.id),
      name: String(p.name),
      quantity: qty,
      unitPrice: unit,
      lineTotal: round2(unit * qty),
      image: String(p.image ?? "")
    });
  }
  subtotal = round2(subtotal);
  const ship = calculateShipping(await getShipping(exec), subtotal, uf, cep);
  const pesoTotal = pesoDoCarrinho(items, found);
  const diagnosticoFrete = { motivo: "" };
  const cotado = await cotarNosCorreios(ship, cep, pesoTotal, exec, diagnosticoFrete);
  if (cotado !== null) {
    ship.cost = cotado.cost;
    ship.label = cotado.label;
    ship.reason = "correios";
  }
  const [coupon, couponError] = await resolveCoupon(couponCode, subtotal, exec);
  let couponDiscount = 0;
  if (coupon !== null) {
    couponDiscount = coupon.type === "percent" ? subtotal * (Number(coupon.value) / 100) : Number(coupon.value);
    couponDiscount = round2(Math.min(couponDiscount, subtotal));
  }
  const settings = await getSettings(exec);
  const pixPct = Number(settings.pixDiscountPct ?? 0) || 0;
  const pixDiscount = payment === "pix" && pixPct > 0 ? round2(Math.max(0, subtotal - couponDiscount) * (pixPct / 100)) : 0;
  const discount = round2(couponDiscount + pixDiscount);
  const total = round2(Math.max(0, subtotal - discount) + ship.cost);
  return {
    items,
    subtotal,
    shipping: ship.cost,
    shippingLabel: ship.label,
    shippingReason: ship.reason,
    /*
     * Por que os Correios não entraram nesta cotação. Vazio quando entraram
     * (ou quando o frete grátis do painel tinha precedência, que é regra e não
     * falha). A rota só entrega este campo para administradores.
     */
    shippingNote: diagnosticoFrete.motivo,
    couponCode: coupon?.code ?? null,
    couponDiscount,
    couponError,
    pixDiscount,
    pixDiscountPct: pixPct,
    discount,
    total,
    uf,
    deliveryDays: deliveryDaysFor(uf),
    issues
  };
}
__name(quoteCart, "quoteCart");

// server/src/routes/public.ts
init_providers();
init_store();
var publicRoutes = (0, import_express3.Router)();
publicRoutes.get("/session", h(async (req, res) => {
  const admin = await currentAdmin(req);
  jsonOk(res, {
    csrfToken: await csrfToken(req),
    admin: admin ? { name: admin.name, email: admin.email } : null,
    customer: currentCustomerId(req) !== null
  });
}));
publicRoutes.get("/payments/config", h(async (_req, res) => {
  const settings = await getSettings();
  const metodos = settings.payments ?? {};
  const cred = await habilitado() ? await credenciais() : null;
  jsonOk(res, {
    provider: PROVEDOR,
    enabled: cred !== null && cred.publicKey !== "",
    publicKey: cred?.publicKey ?? "",
    // 'teste' aparece como aviso na tela: ninguém deve concluir uma compra de
    // verdade achando que pagou num ambiente onde o dinheiro não se move.
    ambiente: cred === null ? null : ambiente(cred),
    installmentsMax: INSTALLMENTS_MAX,
    methods: { card: metodos.card !== false, pix: metodos.pix !== false }
  });
}));
publicRoutes.get("/catalog", h(async (_req, res) => {
  const parents = await q.all("SELECT * FROM categories ORDER BY position ASC, name ASC");
  const children = /* @__PURE__ */ new Map();
  for (const s of await q.all("SELECT * FROM subcategories ORDER BY position ASC, name ASC")) {
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
      subcategories: children.get(String(c.id)) ?? []
    })),
    settings: await publicSettings()
  });
}));
publicRoutes.get("/products", h(async (_req, res) => {
  jsonOk(res, { products: await fetchProducts() });
}));
publicRoutes.get("/products/:id", h(async (req, res) => {
  const row = await q.one("SELECT * FROM products WHERE id = ? AND active = 1", [req.params.id]);
  if (row === null) fail("Produto n\xE3o encontrado.", 404, "not_found");
  jsonOk(res, { product: productRowToApi(row) });
}));
publicRoutes.post("/checkout/quote", h(async (req, res) => {
  const b = body(req);
  const cotacao = await quoteCart(
    b.items,
    bodyStr(b, "state", "", 2),
    bodyStr(b, "cep", "", 12),
    bodyStr(b, "coupon", "", 40),
    bodyStr(b, "payment", "card", 10)
  );
  const { shippingNote, ...publico } = cotacao;
  const admin = await currentAdmin(req);
  jsonOk(res, admin === null || !shippingNote ? publico : { ...publico, shippingNote });
}));
publicRoutes.post("/orders", h(async (req, res) => {
  const b = body(req);
  const name = bodyStr(b, "name", "", 160);
  const email = bodyStr(b, "email", "", 190).toLowerCase();
  const phone = bodyStr(b, "phone", "", 30);
  const cpf = bodyStr(b, "cpf", "", 20);
  const payment = bodyStr(b, "payment", "pix", 10);
  if (name === "") fail("Informe o nome completo.", 422, "invalid_name");
  if (!validEmail(email)) fail("Informe um e-mail v\xE1lido.", 422, "invalid_email");
  if (digits(phone).length < 10) fail("Informe um telefone com DDD.", 422, "invalid_phone");
  if (!validCpf(cpf)) fail("CPF inv\xE1lido.", 422, "invalid_cpf");
  if (!["card", "pix"].includes(payment)) fail("Forma de pagamento inv\xE1lida.", 422, "invalid_payment");
  const settings = await getSettings();
  if (!settings.payments?.[payment]) {
    fail("Esta forma de pagamento n\xE3o est\xE1 dispon\xEDvel.", 422, "payment_disabled");
  }
  const endereco = b.address !== null && typeof b.address === "object" && !Array.isArray(b.address) ? b.address : {};
  const cep = bodyStr(endereco, "cep", "", 12);
  const uf = bodyStr(endereco, "state", "SP", 2).toUpperCase();
  if (normalizeCep(cep) === "") fail("Informe um CEP v\xE1lido com 8 d\xEDgitos.", 422, "invalid_cep");
  if (bodyStr(endereco, "street") === "" || bodyStr(endereco, "number") === "" || bodyStr(endereco, "city") === "") {
    fail("Preencha rua, n\xFAmero e cidade.", 422, "invalid_address");
  }
  if (!await habilitado()) {
    fail(
      "A loja ainda n\xE3o est\xE1 aceitando pagamentos online. Fale com a gente para concluir a sua compra.",
      503,
      "payments_disabled"
    );
  }
  const cred = await credenciais();
  if (cred === null) {
    fail(
      "A loja ainda n\xE3o est\xE1 aceitando pagamentos online. Fale com a gente para concluir a sua compra.",
      503,
      "payments_disabled"
    );
  }
  const cartao = b.card !== null && typeof b.card === "object" && !Array.isArray(b.card) ? b.card : {};
  const cardToken = bodyStr(cartao, "token", "", 120);
  const cardMethodId = bodyStr(cartao, "paymentMethodId", "", 40);
  const parcelas = Math.max(1, Math.min(bodyInt(cartao, "installments", 1), INSTALLMENTS_MAX));
  if (payment === "card" && (cardToken === "" || cardMethodId === "")) {
    fail("Preencha os dados do cart\xE3o.", 422, "missing_card_token");
  }
  const sessionCustomerId = currentCustomerId(req);
  const etaDays = deliveryDaysFor(uf);
  let gravado;
  try {
    gravado = await transaction(async (tx) => {
      const quote2 = await quoteCart(
        b.items,
        uf,
        cep,
        bodyStr(b, "coupon", "", 40),
        payment,
        tx
      );
      if (quote2.items.length === 0) {
        throw new EmptyCart();
      }
      let customerId = sessionCustomerId;
      const isOwner = customerId !== null;
      if (isOwner) {
        await tx.run("UPDATE customers SET name = ?, phone = ?, cpf = ? WHERE id = ?", [name, phone, cpf, customerId]);
      } else {
        const existing = await tx.one("SELECT id FROM customers WHERE email = ?", [email]);
        if (existing) {
          customerId = Number(existing.id);
        } else {
          await tx.run("INSERT INTO customers (name, email, phone, cpf) VALUES (?, ?, ?, ?)", [name, email, phone, cpf]);
          customerId = tx.lastId();
        }
      }
      const id = "QP-" + String(await nextCounter(tx, "order")).padStart(6, "0");
      await tx.run(
        `INSERT INTO orders (
            id, customer_id, customer_name, customer_email, customer_phone, customer_cpf,
            subtotal, shipping_cost, discount, total, coupon_code, status, payment, channel,
            ship_cep, ship_street, ship_number, ship_complement, ship_neighborhood, ship_city, ship_state,
            delivery_eta
         ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        [
          id,
          customerId,
          name,
          email,
          phone,
          cpf,
          quote2.subtotal,
          quote2.shipping,
          quote2.discount,
          quote2.total,
          quote2.couponCode,
          "pending",
          payment,
          "site",
          cep,
          bodyStr(endereco, "street", "", 160),
          bodyStr(endereco, "number", "", 20),
          bodyStr(endereco, "complement", "", 120),
          bodyStr(endereco, "neighborhood", "", 120),
          bodyStr(endereco, "city", "", 120),
          uf,
          dateSP(etaDays)
        ]
      );
      for (const it of quote2.items) {
        await tx.run(
          "INSERT INTO order_items (order_id, product_id, name, quantity, unit_price) VALUES (?,?,?,?,?)",
          [id, it.productId, it.name, it.quantity, it.unitPrice]
        );
        const affected = await tx.run(
          "UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?",
          [it.quantity, it.productId, it.quantity]
        );
        if (affected === 0) throw new Error("Estoque insuficiente para " + it.name);
      }
      if (quote2.couponCode !== null) {
        const usado = await tx.run(
          `UPDATE coupons SET uses = uses + 1
            WHERE code = ? AND active = 1
              AND (max_uses IS NULL OR uses < max_uses)`,
          [quote2.couponCode]
        );
        if (usado === 0) throw new Error("Cupom esgotado: " + quote2.couponCode);
      }
      if (isOwner) {
        await tx.run("UPDATE customer_addresses SET is_default = 0 WHERE customer_id = ?", [customerId]);
        await tx.run(
          `INSERT INTO customer_addresses
             (customer_id, label, cep, street, number, complement, neighborhood, city, state, is_default)
           VALUES (?,?,?,?,?,?,?,?,?,1)`,
          [
            customerId,
            "Principal",
            cep,
            bodyStr(endereco, "street", "", 160),
            bodyStr(endereco, "number", "", 20),
            bodyStr(endereco, "complement", "", 120),
            bodyStr(endereco, "neighborhood", "", 120),
            bodyStr(endereco, "city", "", 120),
            uf
          ]
        );
      }
      return { orderId: id, quote: quote2 };
    });
  } catch (e) {
    if (e instanceof EmptyCart) {
      fail("A sua sacola est\xE1 vazia ou os itens n\xE3o est\xE3o mais dispon\xEDveis.", 422, "empty_cart");
    }
    console.error("[queops] falha ao gravar pedido:", e);
    fail("N\xE3o foi poss\xEDvel concluir o pedido. Confira o estoque e tente de novo.", 409, "order_failed");
  }
  const { orderId, quote } = gravado;
  const nomePartes = name.trim().split(/\s+/);
  const dadosBase = {
    orderId,
    total: quote.total,
    descricao: `Pedido ${orderId} \u2014 Qu\xE9ops Pir\xE2mides`,
    pagador: {
      email,
      nome: nomePartes[0] ?? name,
      sobrenome: nomePartes.slice(1).join(" ") || (nomePartes[0] ?? name),
      cpf: digits(cpf)
    },
    webhookUrl: `${config.appUrl.replace(/\/+$/, "")}/api/webhooks/mercadopago`
  };
  let cobranca;
  try {
    cobranca = payment === "card" ? await cobrar({
      ...dadosBase,
      metodo: "card",
      token: cardToken,
      parcelas,
      paymentMethodId: cardMethodId
    }, cred) : await cobrar({
      ...dadosBase,
      metodo: "pix",
      expiraEmMinutos: PIX_EXPIRA_MINUTOS
    }, cred);
  } catch (e) {
    try {
      await cancelarSemCobranca(orderId, "gateway_unavailable");
    } catch (falhaNaLimpeza) {
      console.error(
        `[queops] pedido ${orderId}: a cobran\xE7a falhou E o cancelamento tamb\xE9m.`,
        "O pedido ficou pendente com o estoque baixado \u2014 confira em Painel \u2192 Pedidos.",
        falhaNaLimpeza
      );
    }
    throw e;
  }
  await aplicarPagamento({
    orderId,
    status: cobranca.status,
    detalhe: cobranca.detalhe,
    provedor: PROVEDOR,
    ref: cobranca.ref
  });
  if (cobranca.status === "recusado") {
    fail(cobranca.mensagem ?? "O pagamento n\xE3o foi aprovado.", 402, "payment_rejected");
  }
  const anotados = Array.isArray(req.qp.data.pedidos) ? req.qp.data.pedidos : [];
  req.qp.data.pedidos = [...anotados.filter((x) => x !== orderId), orderId].slice(-20);
  await req.qp.save();
  await q.run("UPDATE abandoned_carts SET status = 'recovered' WHERE customer_email = ? AND status = 'open'", [email]);
  fireWebhooks("order.created", { orderId, total: quote.total, email, status: cobranca.status });
  if (ambiente(cred) === "teste") {
    console.log(`[queops] pedido ${orderId} cobrado em AMBIENTE DE TESTE \u2014 nenhum dinheiro se moveu.`);
  }
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
      // O que a tela precisa para não afirmar "pago" quando ainda não está:
      //   'aprovado'   → dinheiro confirmado
      //   'aguardando' → Pix emitido (vem o QR) ou cartão em análise
      paymentStatus: cobranca.status,
      pix: cobranca.pix ?? null,
      ambiente: ambiente(cred)
    }
  }, 201);
}));
publicRoutes.get("/orders/:id/status", h(async (req, res) => {
  const id = String(req.params.id ?? "").slice(0, 20);
  const linha = await q.one(
    "SELECT id, status, payment, payment_ref, customer_id, total FROM orders WHERE id = ?",
    [id]
  );
  const naSessao = (Array.isArray(req.qp.data.pedidos) ? req.qp.data.pedidos : []).includes(id);
  const clienteId = currentCustomerId(req);
  const eDono = linha !== null && clienteId !== null && Number(linha.customer_id) === clienteId;
  if (linha === null || !naSessao && !eDono) {
    fail("Pedido n\xE3o encontrado.", 404, "not_found");
  }
  let status = String(linha.status);
  const ref = linha.payment_ref === null ? "" : String(linha.payment_ref);
  if (status === "pending" && ref !== "") {
    const cred = await credenciais();
    if (cred !== null) {
      const real = await consultarPedido(ref, cred);
      if (real !== null) {
        await aplicarPagamento({
          orderId: id,
          status: real.status,
          detalhe: real.detalhe,
          provedor: PROVEDOR,
          ref
        });
        const depois = await q.one("SELECT status FROM orders WHERE id = ?", [id]);
        if (depois !== null) status = String(depois.status);
      }
    }
  }
  jsonOk(res, {
    id,
    // 'pending' | 'paid' | 'canceled' | … — o mesmo vocabulário do painel.
    status,
    pago: status === "paid",
    cancelado: status === "canceled"
  });
}));
var INSTALLMENTS_MAX = 6;
var PIX_EXPIRA_MINUTOS = 30;
var EmptyCart = class extends Error {
  static {
    __name(this, "EmptyCart");
  }
};
publicRoutes.post("/carts/abandoned", h(async (req, res) => {
  const b = body(req);
  const email = bodyStr(b, "email", "", 190).toLowerCase();
  if (!validEmail(email)) fail("E-mail inv\xE1lido.", 422, "invalid_email");
  const quote = await quoteCart(b.items, "", "", "", "card");
  if (quote.items.length === 0) {
    jsonOk(res, { ok: true, skipped: true });
    return;
  }
  const nome = bodyStr(b, "name", "", 160);
  const fone = bodyStr(b, "phone", "", 30);
  const cartId = await transaction(async (tx) => {
    const existing = await tx.one(
      "SELECT id FROM abandoned_carts WHERE customer_email = ? AND status = 'open'",
      [email]
    );
    const id = existing ? String(existing.id) : "AC-" + String(await nextCounter(tx, "cart")).padStart(5, "0");
    if (existing) {
      await tx.run(
        "UPDATE abandoned_carts SET customer_name = ?, customer_phone = ?, total = ?, abandoned_at = NOW() WHERE id = ?",
        [nome, fone, quote.subtotal, id]
      );
      await tx.run("DELETE FROM abandoned_cart_items WHERE cart_id = ?", [id]);
    } else {
      await tx.run(
        "INSERT INTO abandoned_carts (id, customer_name, customer_email, customer_phone, total) VALUES (?,?,?,?,?)",
        [id, nome, email, fone, quote.subtotal]
      );
    }
    for (const it of quote.items) {
      await tx.run(
        "INSERT INTO abandoned_cart_items (cart_id, product_id, name, quantity, unit_price) VALUES (?,?,?,?,?)",
        [id, it.productId, it.name, it.quantity, it.unitPrice]
      );
    }
    return id;
  });
  jsonOk(res, { ok: true, cartId });
}));

// server/src/routes/v1.ts
var import_express4 = require("express");
init_db();
init_errors();
init_http();
init_providers();
init_store();
var v1Routes = (0, import_express4.Router)();
var STATUS_PEDIDO2 = ["pending", "paid", "shipped", "delivered", "canceled"];
v1Routes.get("/products", h(async (req, res) => {
  await requireApiKey(req);
  jsonOk(res, { products: await fetchProducts() });
}));
v1Routes.get("/products/:id", h(async (req, res) => {
  await requireApiKey(req);
  const row = await q.one("SELECT * FROM products WHERE id = ?", [req.params.id]);
  if (row === null) fail("Produto n\xE3o encontrado.", 404, "not_found");
  jsonOk(res, { product: productRowToApi(row) });
}));
v1Routes.patch("/products/:id/stock", h(async (req, res) => {
  await requireApiKey(req);
  const stock = bodyInt(body(req), "stock", -1);
  if (stock < 0) fail('Informe "stock" como um inteiro n\xE3o negativo.', 422, "invalid_stock");
  if (await q.run("UPDATE products SET stock = ? WHERE id = ?", [stock, req.params.id]) === 0) {
    fail("Produto n\xE3o encontrado.", 404, "not_found");
  }
  jsonOk(res, { ok: true, id: req.params.id, stock });
}));
v1Routes.get("/orders", h(async (req, res) => {
  await requireApiKey(req);
  const where = [];
  const params = [];
  const status = queryStr(req, "status", "", 20);
  if (STATUS_PEDIDO2.includes(status)) {
    where.push("status = ?");
    params.push(status);
  }
  const since = queryStr(req, "since", "", 40);
  if (since !== "") {
    const t = Date.parse(since);
    if (Number.isFinite(t)) {
      where.push("created_at >= ?");
      params.push(new Date(t - 3 * 36e5).toISOString().slice(0, 19).replace("T", " "));
    }
  }
  const orders = await q.all(
    `SELECT * FROM orders${where.length ? " WHERE " + where.join(" AND ") : ""}
      ORDER BY created_at DESC LIMIT 200`,
    params
  );
  const items = /* @__PURE__ */ new Map();
  if (orders.length) {
    const ids = orders.map((o) => o.id);
    for (const i of await q.all(
      `SELECT * FROM order_items WHERE order_id IN (${placeholders(ids.length)}) ORDER BY id ASC`,
      ids
    )) {
      const key = String(i.order_id);
      const list = items.get(key);
      if (list) list.push(i);
      else items.set(key, [i]);
    }
  }
  jsonOk(res, { orders: orders.map((o) => orderRowToApi(o, items.get(String(o.id)) ?? [])) });
}));
v1Routes.get("/orders/:id", h(async (req, res) => {
  await requireApiKey(req);
  const o = await q.one("SELECT * FROM orders WHERE id = ?", [req.params.id]);
  if (o === null) fail("Pedido n\xE3o encontrado.", 404, "not_found");
  const items = await q.all("SELECT * FROM order_items WHERE order_id = ? ORDER BY id ASC", [req.params.id]);
  jsonOk(res, { order: orderRowToApi(o, items) });
}));
v1Routes.patch("/orders/:id", h(async (req, res) => {
  await requireApiKey(req);
  const status = bodyStr(body(req), "status", "", 20);
  if (!STATUS_PEDIDO2.includes(status)) fail("Status inv\xE1lido.", 422, "invalid_status");
  if (await q.run("UPDATE orders SET status = ? WHERE id = ?", [status, req.params.id]) === 0) {
    fail("Pedido n\xE3o encontrado.", 404, "not_found");
  }
  fireWebhooks("order.status_changed", { orderId: req.params.id, status });
  jsonOk(res, { ok: true });
}));
v1Routes.get("/customers", h(async (req, res) => {
  await requireApiKey(req);
  const rows = await q.all(
    `SELECT c.id, c.name, c.email, c.phone, c.created_at,
            COUNT(o.id) AS orders_count,
            COALESCE(SUM(CASE WHEN o.status <> 'canceled' THEN o.total ELSE 0 END), 0) AS total_spent
       FROM customers c
       LEFT JOIN orders o ON o.customer_id = c.id
      GROUP BY c.id, c.name, c.email, c.phone, c.created_at
      ORDER BY c.created_at DESC
      LIMIT 500`
  );
  jsonOk(res, {
    customers: rows.map((c) => ({
      id: String(c.id),
      name: c.name,
      email: c.email,
      phone: c.phone,
      ordersCount: Number(c.orders_count) || 0,
      totalSpent: Number(c.total_spent) || 0,
      createdAt: iso(c.created_at)
    }))
  });
}));

// server/src/routes/webhooks.ts
var import_express5 = require("express");
var import_mercadopago3 = require("mercadopago");
init_db();
init_http();
var webhookRoutes = (0, import_express5.Router)();
var TOLERANCIA_SEGUNDOS = 300;
function tempoDentroDaJanela(ts, agora = Date.now()) {
  if (!/^\d+$/.test(ts)) return false;
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return false;
  const emMs = n > 1e11 ? n : n * 1e3;
  return Math.abs(agora - emMs) / 1e3 <= TOLERANCIA_SEGUNDOS;
}
__name(tempoDentroDaJanela, "tempoDentroDaJanela");
function carimboDaAssinatura(xSignature) {
  const bruto = Array.isArray(xSignature) ? xSignature[0] : xSignature;
  const m = /(?:^|,)\s*ts\s*=\s*([^,\s]+)/.exec(String(bruto ?? ""));
  return m ? m[1] : "";
}
__name(carimboDaAssinatura, "carimboDaAssinatura");
function conferirAssinatura(req, cred, dataId) {
  if (cred.webhookSecret === "") {
    return { ok: false, motivo: "webhookSecret n\xE3o cadastrado em Painel \u2192 Integra\xE7\xF5es" };
  }
  try {
    import_mercadopago3.WebhookSignatureValidator.validate({
      xSignature: req.headers["x-signature"],
      xRequestId: req.headers["x-request-id"],
      dataId,
      secret: cred.webhookSecret
    });
  } catch (e) {
    if (e instanceof import_mercadopago3.InvalidWebhookSignatureError) {
      return { ok: false, motivo: e.reason };
    }
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
  const ts = carimboDaAssinatura(req.headers["x-signature"]);
  if (!tempoDentroDaJanela(ts)) {
    return { ok: false, motivo: `carimbo fora da janela de ${TOLERANCIA_SEGUNDOS}s (ts=${ts})` };
  }
  return { ok: true };
}
__name(conferirAssinatura, "conferirAssinatura");
webhookRoutes.post("/mercadopago", h(async (req, res) => {
  const corpo = req.body ?? {};
  const idQuery = queryStr(req, "data.id", "", 64) || queryStr(req, "id", "", 64);
  const idCorpo = corpo.data?.id === void 0 || corpo.data?.id === null ? "" : String(corpo.data.id);
  const dataId = idQuery || idCorpo;
  const cred = await credenciais();
  if (cred === null) {
    console.error("[queops] webhook do Mercado Pago recebido sem credenciais cadastradas");
    res.status(200).json({ ok: false, ignorado: "sem credenciais" });
    return;
  }
  const assinatura = conferirAssinatura(req, cred, idQuery);
  if (assinatura.ok === false) {
    console.error(
      "[queops] webhook do Mercado Pago com assinatura inv\xE1lida:",
      assinatura.motivo,
      "\xB7 x-request-id:",
      String(req.headers["x-request-id"] ?? "\u2014")
    );
    res.status(401).json({ error: { code: "invalid_signature", message: "Assinatura inv\xE1lida." } });
    return;
  }
  const tipo = String(corpo.type ?? corpo.action ?? "");
  if (dataId === "") {
    res.status(200).json({ ok: true, ignorado: "sem data.id" });
    return;
  }
  const real = await consultarPedido(dataId, cred);
  if (real === null) {
    res.status(500).json({ error: { code: "lookup_failed", message: "N\xE3o foi poss\xEDvel consultar o pagamento." } });
    return;
  }
  let orderId = real.orderId;
  if (orderId === "") {
    const linha = await q.one("SELECT id FROM orders WHERE payment_ref = ?", [dataId]);
    orderId = linha ? String(linha.id) : "";
  }
  if (orderId === "") {
    console.error("[queops] webhook do Mercado Pago sem pedido correspondente:", dataId, tipo);
    res.status(200).json({ ok: true, ignorado: "pedido n\xE3o encontrado" });
    return;
  }
  const aplicado = await aplicarPagamento({
    orderId,
    status: real.status,
    detalhe: real.detalhe,
    provedor: PROVEDOR,
    ref: dataId
  });
  console.log(
    `[queops] webhook ${PROVEDOR}: pedido ${orderId} \u2192 ${real.status} (${real.detalhe})`,
    aplicado.mudou ? "\xB7 aplicado" : "\xB7 sem mudan\xE7a",
    aplicado.estoqueDevolvido ? "\xB7 estoque devolvido" : ""
  );
  res.status(200).json({ ok: true });
}));

// server/src/session.ts
var import_node_crypto4 = require("node:crypto");
init_config();
init_db();
var COOKIE_NAME = "qp_session";
var ROTATE_AFTER_MS = 30 * 60 * 1e3;
var GC_DAYS = 14;
function newId() {
  return (0, import_node_crypto4.randomBytes)(32).toString("hex");
}
__name(newId, "newId");
var Session = class {
  static {
    __name(this, "Session");
  }
  id = null;
  data = {};
  /** Campo declarado à mão (e não como parâmetro do construtor) porque o Node
   *  roda estes arquivos apagando só os tipos, sem transformar parâmetros. */
  res;
  constructor(res) {
    this.res = res;
  }
  setCookie(id) {
    this.res.cookie(COOKIE_NAME, id, {
      path: "/",
      httpOnly: true,
      // inacessível a JavaScript → imune a roubo por XSS
      secure: config.secureCookies,
      // só trafega em HTTPS
      sameSite: "lax"
      // barra envio em requisições cross-site
      // sem maxAge/expires: cookie de sessão, morre ao fechar o navegador
    });
  }
  clearCookie() {
    this.res.clearCookie(COOKIE_NAME, {
      path: "/",
      httpOnly: true,
      secure: config.secureCookies,
      sameSite: "lax"
    });
  }
  /** Carrega a sessão apontada pelo cookie, se ela existir. */
  async load(cookieId) {
    if (!cookieId || !/^[0-9a-f]{64}$/.test(cookieId)) return;
    const row = await q.one("SELECT payload FROM sessions WHERE id = ?", [cookieId]);
    if (row === null) return;
    this.id = cookieId;
    try {
      const parsed = JSON.parse(String(row.payload));
      if (parsed && typeof parsed === "object") this.data = parsed;
    } catch {
      this.data = {};
    }
    if (Date.now() - (this.data.createdAt ?? 0) > ROTATE_AFTER_MS) {
      await this.regenerate();
    }
  }
  /** Grava o estado atual, criando a sessão (e o cookie) se ainda não existir. */
  async save() {
    if (this.id === null) {
      this.id = newId();
      this.data.createdAt ??= Date.now();
      this.setCookie(this.id);
    }
    await q.run(
      `INSERT INTO sessions (id, payload) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = NOW()`,
      [this.id, JSON.stringify(this.data)]
    );
    if (Math.random() < 5e-3) {
      await q.run(`DELETE FROM sessions WHERE updated_at < (NOW() - INTERVAL ${GC_DAYS} DAY)`).catch(() => 0);
    }
  }
  /**
   * Troca o identificador preservando os dados — chamado em todo login e
   * logout, para que um id capturado antes da autenticação não sirva depois.
   */
  async regenerate() {
    const antigo = this.id;
    this.id = newId();
    this.data.createdAt = Date.now();
    this.setCookie(this.id);
    await q.run(
      `INSERT INTO sessions (id, payload) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE payload = VALUES(payload), updated_at = NOW()`,
      [this.id, JSON.stringify(this.data)]
    );
    if (antigo) await q.run("DELETE FROM sessions WHERE id = ?", [antigo]);
  }
  /** Apaga a sessão inteira e o cookie. */
  async destroy() {
    if (this.id) await q.run("DELETE FROM sessions WHERE id = ?", [this.id]);
    this.id = null;
    this.data = {};
    this.clearCookie();
  }
};
function parseCookies(req) {
  const header = req.headers.cookie;
  const out = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq < 1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name !== "") {
      try {
        out[name] = decodeURIComponent(value);
      } catch {
        out[name] = value;
      }
    }
  }
  return out;
}
__name(parseCookies, "parseCookies");
async function sessionMiddleware(req, res, next) {
  const s = new Session(res);
  req.qp = s;
  try {
    await s.load(parseCookies(req)[COOKIE_NAME]);
    next();
  } catch (e) {
    next(e);
  }
}
__name(sessionMiddleware, "sessionMiddleware");

// server/src/app.ts
function createApp() {
  const app = (0, import_express6.default)();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", true);
  app.use((0, import_compression.default)());
  app.use((req, res, next) => {
    const proto = req.get("X-Forwarded-Proto");
    if (config.isProd && proto !== void 0 && proto.split(",")[0].trim() === "http") {
      res.redirect(301, "https://" + req.get("Host") + req.originalUrl);
      return;
    }
    next();
  });
  app.use((req, res, next) => {
    const isApi = req.path === "/api" || req.path.startsWith("/api/");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Content-Security-Policy", isApi ? CSP_API : CSP_LOJA);
    if (!isApi) {
      res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=()");
    }
    if (config.isProd && process.env.HSTS === "true") {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    next();
  });
  const api = import_express6.default.Router();
  api.use(import_express6.default.json({ limit: "1mb" }));
  api.use((err, _req, res, next) => {
    if (err instanceof SyntaxError) {
      jsonOk(res, { error: { code: "invalid_json", message: "Corpo da requisi\xE7\xE3o n\xE3o \xE9 um JSON v\xE1lido." } }, 400);
      return;
    }
    next(err);
  });
  api.use(sessionMiddleware);
  api.use((req, _res, next) => {
    const servidorAServidor = req.path.startsWith("/v1/") || req.path.startsWith("/webhooks/");
    if (!servidorAServidor) requireCsrf(req);
    next();
  });
  api.use("/webhooks", webhookRoutes);
  api.use("/v1", v1Routes);
  api.use("/admin", adminRoutes);
  api.use("/account", accountRoutes);
  api.use("/", publicRoutes);
  api.use((_req, _res, next) => {
    next(new ApiError("Endpoint n\xE3o encontrado.", 404, "not_found"));
  });
  app.use("/api", api);
  const publicDir = import_node_path3.default.resolve(process.cwd(), config.publicDir);
  const indexHtml = import_node_path3.default.join(publicDir, "index.html");
  app.use(
    import_express6.default.static(publicDir, {
      index: false,
      // o fallback abaixo é que decide quem recebe o index.html
      etag: true,
      lastModified: true,
      setHeaders(res, filePath) {
        if (/-[A-Za-z0-9_-]{8,}\.(js|css|woff2?)$/.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
          return;
        }
        if (/\.(png|jpe?g|webp|avif|gif|svg|ico)$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=2592000");
          return;
        }
        if (/\.woff2?$/i.test(filePath)) {
          res.setHeader("Cache-Control", "public, max-age=31536000");
          return;
        }
        res.setHeader("Cache-Control", "no-cache");
      }
    })
  );
  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") {
      next();
      return;
    }
    if (!(0, import_node_fs3.existsSync)(indexHtml)) {
      res.status(500).type("text/plain").send(
        `Front-end n\xE3o encontrado. Rode \`npm run build\` e confirme que a pasta "${config.publicDir}" est\xE1 ao lado do servidor.`
      );
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    res.sendFile(indexHtml);
  });
  app.use((err, req, res, _next) => {
    const isApi = req.path === "/api" || req.path.startsWith("/api/");
    if (err instanceof ApiError) {
      if (isApi) {
        jsonOk(res, { error: { code: err.code, message: err.message } }, err.status);
      } else {
        res.status(err.status).type("text/plain").send(err.message);
      }
      return;
    }
    console.error("[queops]", err);
    const codigoSql = err?.code ?? "";
    if (codigoSql === "ER_BAD_FIELD_ERROR" || codigoSql === "ER_NO_SUCH_TABLE") {
      const aviso = "O banco de dados est\xE1 desatualizado em rela\xE7\xE3o ao c\xF3digo. Rode a migra\xE7\xE3o (`node migrate.js` na pasta da aplica\xE7\xE3o, ou `npm run migrar`) e tente de novo.";
      if (isApi) {
        jsonOk(res, { error: { code: "schema_outdated", message: aviso } }, 500);
      } else {
        res.status(500).type("text/plain").send(aviso);
      }
      return;
    }
    const message = config.isProd ? "Erro interno. Tente novamente em instantes." : err instanceof Error ? err.message : String(err);
    if (isApi) {
      jsonOk(res, { error: { code: "internal_error", message } }, 500);
    } else {
      res.status(500).type("text/plain").send(message);
    }
  });
  return app;
}
__name(createApp, "createApp");

// server/src/index.ts
init_config();
init_db();
async function main() {
  const problemas = configProblems();
  if (problemas.length) {
    console.error("Configura\xE7\xE3o incompleta \u2014 a loja n\xE3o vai subir:");
    for (const p of problemas) console.error("  \xB7 " + p);
    console.error("\nDefina as vari\xE1veis em hPanel \u2192 Avan\xE7ado \u2192 Node.js \u2192 Environment variables");
    console.error("(ou num arquivo .env, em desenvolvimento). Veja o .env.example.");
    process.exit(1);
  }
  try {
    await q.one("SELECT 1 AS ok");
  } catch (e) {
    const err = e;
    console.error("N\xE3o foi poss\xEDvel conectar ao MySQL:", err.code ?? "", err.message ?? err);
    console.error("Confira DB_HOST, DB_NAME, DB_USER e DB_PASS. Na Hostinger, o host \xE9 localhost");
    console.error("e o nome do banco/usu\xE1rio leva o prefixo da conta (ex.: u123456789_queops).");
    process.exit(1);
  }
  if (process.env.AUTO_MIGRAR !== "false") {
    try {
      const { sincronizarEstrutura: sincronizarEstrutura2 } = await Promise.resolve().then(() => (init_schema(), schema_exports));
      const { colunas, indices } = await sincronizarEstrutura2((m) => console.log("[queops]" + m));
      if (colunas > 0 || indices > 0) {
        console.log(`[queops] banco atualizado na subida: ${colunas} coluna(s), ${indices} \xEDndice(s).`);
      }
    } catch (e) {
      const err = e;
      console.error(
        "[queops] n\xE3o consegui conferir a estrutura do banco:",
        err.code ?? "",
        err.message ?? e
      );
      console.error("[queops] rode `node migrate.js` se o checkout reclamar de banco desatualizado.");
    }
  }
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`[queops] no ar em http://${config.host}:${config.port} (${config.env})`);
  });
  const shutdown = /* @__PURE__ */ __name((sinal) => {
    console.log(`[queops] recebi ${sinal}, encerrando\u2026`);
    server.close(() => {
      void closePool().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 8e3).unref();
  }, "shutdown");
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
__name(main, "main");
main().catch((e) => {
  console.error("[queops] falha ao iniciar:", e);
  process.exit(1);
});
//# sourceMappingURL=app.js.map
