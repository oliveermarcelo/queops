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
var init_crypto = __esm({
  "server/src/crypto.ts"() {
    "use strict";
    init_config();
    init_errors();
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
  }
});

// server/src/http.ts
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
var init_http = __esm({
  "server/src/http.ts"() {
    "use strict";
    __name(round2, "round2");
    __name(roundTo, "roundTo");
  }
});

// server/src/erp-categorias.ts
var init_erp_categorias = __esm({
  "server/src/erp-categorias.ts"() {
    "use strict";
    init_db();
  }
});

// server/src/store.ts
async function configSet(key, value, exec = q) {
  await exec.run(
    `INSERT INTO store_config (config_key, config_val) VALUES (?, ?)
     ON DUPLICATE KEY UPDATE config_val = VALUES(config_val)`,
    [key, JSON.stringify(value)]
  );
}
var DEFAULT_SETTINGS, DEFAULT_SHIPPING, DEFAULT_RECOVERY, INTEGRATION_IDS;
var init_store = __esm({
  "server/src/store.ts"() {
    "use strict";
    init_crypto();
    init_db();
    init_erp_categorias();
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
    __name(configSet, "configSet");
  }
});

// server/src/migrate.ts
var import_node_fs4 = require("node:fs");
var import_node_path4 = __toESM(require("node:path"), 1);

// server/src/auth.ts
var import_node_crypto = require("node:crypto");
var import_bcryptjs = __toESM(require("bcryptjs"), 1);
init_crypto();
init_db();
init_errors();
init_http();
var ROUNDS_SENHA = 12;
function hashPassword(plain) {
  return import_bcryptjs.default.hash(plain, ROUNDS_SENHA);
}
__name(hashPassword, "hashPassword");
var DUMMY_HASH = import_bcryptjs.default.hashSync("senha-que-nao-existe-" + (0, import_node_crypto.randomBytes)(16).toString("hex"), ROUNDS_SENHA);

// server/src/migrate.ts
init_config();
init_db();
init_http();

// server/src/pricing.ts
init_db();
init_http();
init_store();
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

// server/src/schema.ts
var import_node_fs3 = require("node:fs");
var import_node_path3 = __toESM(require("node:path"), 1);
init_db();
function dbDir() {
  const candidatos2 = [
    import_node_path3.default.resolve(process.cwd(), "server/db"),
    import_node_path3.default.resolve(process.cwd(), "db")
  ];
  for (const c of candidatos2) {
    try {
      (0, import_node_fs3.readFileSync)(import_node_path3.default.join(c, "schema.sql"));
      return c;
    } catch {
    }
  }
  throw new Error(
    "schema.sql n\xE3o encontrado. Rode a migra\xE7\xE3o da raiz do projeto (onde est\xE1 a pasta server/db ou db)."
  );
}
__name(dbDir, "dbDir");
function splitStatements(sql) {
  const noComments = sql.replace(/^[ \t]*--.*$/gm, "");
  const statements = noComments.split(";").map((s) => s.trim()).filter((s) => s !== "");
  return { statements, noComments };
}
__name(splitStatements, "splitStatements");
var TIPOS_SQL = "VARCHAR|VARBINARY|BINARY|CHAR|TINYTEXT|TEXT|MEDIUMTEXT|LONGTEXT|TINYINT|SMALLINT|MEDIUMINT|BIGINT|INT|DECIMAL|NUMERIC|FLOAT|DOUBLE|DATETIME|TIMESTAMP|DATE|TIME|YEAR|ENUM|SET|JSON|BLOB|MEDIUMBLOB|LONGBLOB|BOOLEAN|BOOL";
function tabelaAusente(e) {
  return e?.code === "ER_NO_SUCH_TABLE";
}
__name(tabelaAusente, "tabelaAusente");
async function addMissingColumns(noComments, say2) {
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
        say2(`  + coluna ${tabela}.${coluna}`);
        adicionadas++;
      }
      anterior = coluna;
    }
  }
  return adicionadas;
}
__name(addMissingColumns, "addMissingColumns");
var INDICES = [
  {
    tabela: "orders",
    nome: "uq_order_payment_ref",
    // Único: é por ele que o webhook do provedor encontra o pedido, e o mesmo
    // pagamento não pode acabar vinculado a dois pedidos diferentes.
    definicao: "UNIQUE KEY uq_order_payment_ref (payment_ref)"
  }
];
async function addMissingIndexes(say2) {
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
      say2(`  + \xEDndice ${tabela}.${nome}`);
      criados++;
    } catch (e) {
      if (tabelaAusente(e)) continue;
      const err = e;
      say2(`  ! n\xE3o consegui criar ${tabela}.${nome}: ${err.code ?? ""} ${err.message ?? ""}`.trimEnd());
    }
  }
  return criados;
}
__name(addMissingIndexes, "addMissingIndexes");
var ALARGAMENTOS = [
  {
    tabela: "products",
    coluna: "stock",
    // "int", "int(11)", "int unsigned" — versões diferentes do MySQL relatam
    // de formas diferentes, e todas significam a mesma coluna a converter.
    de: /^(int|integer|smallint|mediumint|bigint)\b/i,
    para: "DECIMAL(10,3) NOT NULL DEFAULT 0"
  }
];
async function widenColumns(say2) {
  let convertidas = 0;
  for (const { tabela, coluna, de, para } of ALARGAMENTOS) {
    let atual;
    try {
      const row = await q.one(
        `SELECT COLUMN_TYPE AS tipo FROM information_schema.columns
          WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ?`,
        [tabela, coluna]
      );
      if (row === null) continue;
      atual = String(row.tipo);
    } catch (e) {
      if (tabelaAusente(e)) continue;
      throw e;
    }
    if (!de.test(atual)) continue;
    try {
      await q.run(`ALTER TABLE \`${tabela}\` MODIFY COLUMN \`${coluna}\` ${para}`);
      say2(`  ~ ${tabela}.${coluna}: ${atual} \u2192 ${para}`);
      convertidas++;
    } catch (e) {
      const err = e;
      say2(`  ! n\xE3o consegui converter ${tabela}.${coluna}: ${err.code ?? ""} ${err.message ?? ""}`.trimEnd());
    }
  }
  return convertidas;
}
__name(widenColumns, "widenColumns");

// server/src/migrate.ts
init_store();
var say = /* @__PURE__ */ __name((m) => console.log(m), "say");
function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    const m = /^--([a-z-]+)(?:=(.*))?$/.exec(arg);
    if (m) out[m[1]] = m[2] ?? "1";
  }
  return out;
}
__name(parseArgs, "parseArgs");
async function importCatalog(dir) {
  let catalog;
  try {
    catalog = JSON.parse((0, import_node_fs4.readFileSync)(import_node_path4.default.join(dir, "catalog.json"), "utf8"));
  } catch {
    say("catalog.json ausente \u2014 pulei a carga do cat\xE1logo.");
    return;
  }
  const descriptions = /* @__PURE__ */ new Map();
  for (const c of catalog.categories ?? []) descriptions.set(c.id, c.description ?? "");
  let pos = 0;
  for (const m of catalog.menu ?? []) {
    await q.run(
      `INSERT INTO categories (id, name, description, icon, featured, position)
       VALUES (?,?,?,?,?,?)
       ON DUPLICATE KEY UPDATE name=VALUES(name), description=VALUES(description),
          icon=VALUES(icon), featured=VALUES(featured), position=VALUES(position)`,
      [m.id, m.name, descriptions.get(m.id) ?? "", m.icon ?? "", m.featured ? 1 : 0, pos++]
    );
    let subPos = 0;
    for (const s of m.subcategories ?? []) {
      await q.run(
        `INSERT INTO subcategories (parent_id, id, name, position) VALUES (?,?,?,?)
         ON DUPLICATE KEY UPDATE name=VALUES(name), position=VALUES(position)`,
        [m.id, s.id, s.name, subPos++]
      );
    }
  }
  say("Categorias importadas.");
  const defaultStock = [12, 8, 25, 4, 7, 18, 33, 6, 15, 9];
  let i = 0;
  for (const p of catalog.products ?? []) {
    await q.run(
      `INSERT INTO products (
          id, sku, name, category, subcategory, category_label, description, long_description,
          price, old_price, stock, image, tag, weight_kg, weight, ingredients,
          highlight, active, position
       ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?)
       ON DUPLICATE KEY UPDATE
          sku=VALUES(sku), name=VALUES(name), category=VALUES(category),
          subcategory=VALUES(subcategory), category_label=VALUES(category_label),
          description=VALUES(description), long_description=VALUES(long_description),
          price=VALUES(price), old_price=VALUES(old_price), image=VALUES(image),
          tag=VALUES(tag), weight_kg=VALUES(weight_kg), weight=VALUES(weight),
          ingredients=VALUES(ingredients),
          highlight=VALUES(highlight), position=VALUES(position)`,
      [
        p.id,
        p.sku ?? "",
        p.name,
        p.category ?? "",
        p.subcategory ?? null,
        p.categoryLabel ?? "",
        p.description ?? "",
        p.longDescription ?? null,
        p.price ?? 0,
        p.oldPrice ?? null,
        p.stock ?? defaultStock[i % defaultStock.length],
        p.image ?? "",
        p.tag ?? null,
        /*
         * Peso em quilos: o número pronto, se o catálogo tiver; senão, o que
         * der para extrair do texto. `pesoEmGramas` devolve -1 quando não acha
         * número nenhum ("Base 15cm · cobre"), e aí fica 0 — sem peso, e a
         * cotação usa o padrão, que é o comportamento de hoje.
         */
        typeof p.weightKg === "number" && p.weightKg > 0 ? Math.round(p.weightKg * 1e3) / 1e3 : Math.max(0, pesoEmGramas(p.weight ?? "", -1)) / 1e3,
        p.weight ?? "",
        p.ingredients ?? null,
        p.highlight ? 1 : 0,
        i
      ]
    );
    i++;
  }
  say(`Produtos importados: ${i}.`);
}
__name(importCatalog, "importCatalog");
async function seedDemoOrders() {
  const existe = await q.one("SELECT COUNT(*) AS n FROM orders WHERE id LIKE 'QPD-%'");
  if (Number(existe?.n ?? 0) > 0) {
    say("Pedidos de demonstra\xE7\xE3o j\xE1 existem \u2014 nada a fazer.");
    return;
  }
  const products = await q.all(
    "SELECT id, name, price FROM products WHERE active = 1 ORDER BY position LIMIT 20"
  );
  if (products.length === 0) {
    say("Sem produtos: pule o --demo at\xE9 importar o cat\xE1logo.");
    return;
  }
  const pool2 = [
    ["Maria Oliveira", "maria.oliveira@email.com"],
    ["Jo\xE3o Santos", "joao.santos@email.com"],
    ["Ana Costa", "ana.costa@email.com"],
    ["Pedro Lima", "pedro.lima@email.com"],
    ["Espa\xE7o Terap\xEAutico Luz Interior", "compras@luzinterior.com.br"],
    ["Carla Mendes", "carla.mendes@email.com"],
    ["Loja Caminho de Cristal", "contato@caminhodecristal.com.br"],
    ["Lucas Ferreira", "lucas.ferreira@email.com"],
    ["Juliana Prado", "juliana.prado@email.com"],
    ["Terapias Harmonia Zen", "pedidos@harmoniazen.com.br"]
  ];
  const statuses = ["paid", "shipped", "delivered", "delivered", "delivered", "pending", "canceled"];
  const payments = ["card", "pix", "boleto"];
  const channels = ["site", "whatsapp", "erp"];
  let seed = 20240601;
  const rng = /* @__PURE__ */ __name(() => {
    seed = seed * 1103515245 + 12345 & 2147483647;
    return seed / 2147483647;
  }, "rng");
  const mysqlDate = /* @__PURE__ */ __name((offsetMs) => new Date(Date.now() + offsetMs - 3 * 36e5).toISOString().slice(0, 19).replace("T", " "), "mysqlDate");
  const comHora = /* @__PURE__ */ __name((offsetMs, hora, minuto) => `${mysqlDate(offsetMs).slice(0, 10)} ${String(hora).padStart(2, "0")}:${String(minuto).padStart(2, "0")}:00`, "comHora");
  await transaction(async (tx) => {
    const customerIds = /* @__PURE__ */ new Map();
    for (const [name, mail] of pool2) {
      const row = await tx.one("SELECT id FROM customers WHERE email = ?", [mail]);
      if (row) {
        customerIds.set(mail, Number(row.id));
      } else {
        await tx.run("INSERT INTO customers (name, email, phone) VALUES (?,?,?)", [name, mail, "11999990000"]);
        customerIds.set(mail, tx.lastId());
      }
    }
    const count = 140;
    for (let n = 0; n < count; n++) {
      const daysAgo = Math.floor(rng() ** 1.6 * 180);
      const horas = Math.floor(rng() * 24);
      const minutos = Math.floor(rng() * 60);
      const quando = comHora(-daysAgo * 864e5, horas, minutos);
      const [name, mail] = pool2[Math.floor(rng() * pool2.length)];
      const orderId = "QPD-" + String(1e3 + n).padStart(6, "0");
      const items = [];
      let subtotal = 0;
      const linhas = 1 + Math.floor(rng() * 3);
      for (let j = 0; j < linhas; j++) {
        const p = products[Math.floor(rng() * products.length)];
        const qty = 1 + Math.floor(rng() * 3);
        items.push([String(p.id), String(p.name), qty, Number(p.price)]);
        subtotal += qty * Number(p.price);
      }
      subtotal = round2(subtotal);
      const ship = subtotal >= 199 ? 0 : 19.9;
      await tx.run(
        `INSERT INTO orders (id, customer_id, customer_name, customer_email, customer_phone,
            subtotal, shipping_cost, discount, total, status, payment, channel, ship_state, created_at)
         VALUES (?,?,?,?,?,?,?,0,?,?,?,?,?,?)`,
        [
          orderId,
          customerIds.get(mail),
          name,
          mail,
          "11999990000",
          subtotal,
          ship,
          round2(subtotal + ship),
          statuses[Math.floor(rng() * statuses.length)],
          payments[Math.floor(rng() * 3)],
          channels[Math.floor(rng() * 3)],
          "SP",
          quando
        ]
      );
      for (const [pid, pname, qty, price] of items) {
        await tx.run(
          "INSERT INTO order_items (order_id, product_id, name, quantity, unit_price) VALUES (?,?,?,?,?)",
          [orderId, pid, pname, qty, price]
        );
      }
    }
    const samples = [
      ["Fernanda Alves", "5511988887777", "fernanda@email.com", 2],
      ["Ricardo Souza", "5511977776666", "ricardo@email.com", 8],
      ["Loja Caminho de Cristal", "5511966665555", "contato@caminhodecristal.com.br", 26],
      ["Juliana Prado", "5511955554444", "juliana@email.com", 50]
    ];
    for (let k = 0; k < samples.length; k++) {
      const [nm, phone, mail, hours] = samples[k];
      const cartId = "ACD-" + String(k + 1).padStart(4, "0");
      const p = products[k % products.length];
      const qty = k % 2 + 1;
      await tx.run(
        `INSERT INTO abandoned_carts (id, customer_name, customer_email, customer_phone, total, abandoned_at)
         VALUES (?,?,?,?,?,?)`,
        [cartId, nm, mail, phone, round2(qty * Number(p.price)), mysqlDate(-hours * 36e5)]
      );
      await tx.run(
        "INSERT INTO abandoned_cart_items (cart_id, product_id, name, quantity, unit_price) VALUES (?,?,?,?,?)",
        [cartId, p.id, p.name, qty, Number(p.price)]
      );
    }
  });
  say("Hist\xF3rico de demonstra\xE7\xE3o criado: 140 pedidos e 4 carrinhos abandonados.");
}
__name(seedDemoOrders, "seedDemoOrders");
async function main() {
  const problemas = configProblems();
  if (problemas.length) {
    console.error("Configura\xE7\xE3o incompleta:");
    for (const p of problemas) console.error("  \xB7 " + p);
    process.exit(1);
  }
  const opts = parseArgs(process.argv.slice(2));
  const dir = dbDir();
  const sql = (0, import_node_fs4.readFileSync)(import_node_path4.default.join(dir, "schema.sql"), "utf8");
  const { statements, noComments } = splitStatements(sql);
  for (const stmt of statements) {
    await q.run(stmt);
  }
  say(`Tabelas criadas/verificadas: ${statements.length} comandos.`);
  const adicionadas = await addMissingColumns(noComments, say);
  say(adicionadas === 0 ? "Nenhuma coluna nova a adicionar." : `Colunas adicionadas: ${adicionadas}.`);
  const indices = await addMissingIndexes(say);
  say(indices === 0 ? "Nenhum \xEDndice novo a adicionar." : `\xCDndices adicionados: ${indices}.`);
  const convertidas = await widenColumns(say);
  say(convertidas === 0 ? "Nenhuma coluna a converter." : `Colunas convertidas: ${convertidas}.`);
  await importCatalog(dir);
  const padroes = [
    ["settings", DEFAULT_SETTINGS],
    ["shipping", DEFAULT_SHIPPING],
    ["recovery", DEFAULT_RECOVERY]
  ];
  for (const [k, v] of padroes) {
    if (await q.one("SELECT config_key FROM store_config WHERE config_key = ?", [k]) === null) {
      await configSet(k, v);
    }
  }
  for (const id of INTEGRATION_IDS) {
    await q.run("INSERT IGNORE INTO integrations (id, enabled) VALUES (?, 0)", [id]);
  }
  await q.run(
    `INSERT IGNORE INTO coupons (id, code, type, value, active, min_order) VALUES
      ('c1','BEMVINDO10','percent',10,1,100),
      ('c2','VOLTA10','percent',10,1,NULL)`
  );
  say("Configura\xE7\xF5es e cupons padr\xE3o prontos.");
  const adminCount = Number((await q.one("SELECT COUNT(*) AS n FROM admin_users"))?.n ?? 0);
  const email = (opts["admin-email"] ?? "").trim();
  const pass = opts["admin-pass"] ?? "";
  if (email !== "" && pass !== "") {
    if (pass.length < 10) {
      say("ERRO: a senha do administrador precisa ter pelo menos 10 caracteres.");
      process.exitCode = 1;
      return;
    }
    await q.run(
      `INSERT INTO admin_users (name, email, password_hash) VALUES (?,?,?)
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), active = 1`,
      ["Administrador", email.toLowerCase(), await hashPassword(pass)]
    );
    say(`Administrador pronto: ${email}`);
  } else if (adminCount === 0) {
    say("AVISO: nenhum administrador cadastrado. Rode de novo com --admin-email e --admin-pass.");
  }
  if (opts.demo) await seedDemoOrders();
  say("Migra\xE7\xE3o conclu\xEDda.");
}
__name(main, "main");
main().catch((e) => {
  console.error("[queops] falha na migra\xE7\xE3o:", e);
  process.exitCode = 1;
}).finally(() => {
  void closePool();
});
//# sourceMappingURL=migrate.js.map
