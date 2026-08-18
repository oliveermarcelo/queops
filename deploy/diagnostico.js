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

// server/src/diagnostico.ts
var import_node_fs3 = require("node:fs");
var import_node_path3 = __toESM(require("node:path"), 1);
init_config();
var linhas = [];
var ok = /* @__PURE__ */ __name((rotulo, texto) => linhas.push(["ok", rotulo, texto]), "ok");
var erro = /* @__PURE__ */ __name((rotulo, texto) => linhas.push(["erro", rotulo, texto]), "erro");
var aviso = /* @__PURE__ */ __name((rotulo, texto) => linhas.push(["aviso", rotulo, texto]), "aviso");
var TABELAS = [
  "admin_users",
  "login_attempts",
  "sessions",
  "customers",
  "customer_addresses",
  "customer_favorites",
  "categories",
  "subcategories",
  "products",
  "orders",
  "order_items",
  "coupons",
  "abandoned_carts",
  "abandoned_cart_items",
  "integrations",
  "api_keys",
  "webhooks",
  "store_config",
  "counters"
];
async function main() {
  const [maior] = process.versions.node.split(".");
  if (Number(maior) >= 20) {
    ok("Vers\xE3o do Node", process.versions.node);
  } else {
    erro("Vers\xE3o do Node", `${process.versions.node} \u2014 precisa de 20 ou maior. hPanel \u2192 Avan\xE7ado \u2192 Node.js \u2192 Node.js version`);
  }
  ok("Pasta da aplica\xE7\xE3o", process.cwd());
  const problemas = configProblems();
  if (problemas.length === 0) {
    ok("Vari\xE1veis de ambiente", "todas preenchidas");
  } else {
    for (const p of problemas) erro("Vari\xE1vel de ambiente", p);
  }
  const campo = /* @__PURE__ */ __name((rotulo, valor) => valor === "" ? erro(rotulo, "vazio") : ok(rotulo, valor), "campo");
  campo("DB_HOST", config.db.host);
  if (config.db.host.toLowerCase() === "localhost") {
    aviso(
      "DB_HOST",
      'Prefira 127.0.0.1: "localhost" pode chegar ao MySQL como ::1 (IPv6) e ser recusado com senha correta.'
    );
  }
  campo("DB_NAME", config.db.database);
  campo("DB_USER", config.db.user);
  campo("DB_PASS", config.db.password === "" ? "" : `preenchida (${config.db.password.length} caracteres)`);
  if (config.db.database && !/^u\d+_/.test(config.db.database)) {
    aviso("Prefixo do banco", `"${config.db.database}" n\xE3o come\xE7a com o prefixo da conta (tipo u123456789_). Confirme o nome exato em hPanel \u2192 Bancos de Dados.`);
  }
  const chave = Buffer.from(config.appKey, "base64");
  if (config.appKey && chave.length === 32) {
    ok("APP_KEY", "v\xE1lida (32 bytes)");
  } else {
    erro("APP_KEY", `inv\xE1lida \u2014 gere com: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`);
  }
  ok("APP_ENV", config.env);
  ok("SECURE_COOKIES", String(config.secureCookies));
  const publicDir = import_node_path3.default.resolve(process.cwd(), config.publicDir);
  if ((0, import_node_fs3.existsSync)(import_node_path3.default.join(publicDir, "index.html"))) {
    ok(`Vitrine (${config.publicDir}/index.html)`, "presente");
  } else {
    erro(`Vitrine (${config.publicDir}/index.html)`, "AUSENTE \u2014 o conte\xFAdo de deploy/ n\xE3o subiu, ou PUBLIC_DIR aponta para outra pasta");
  }
  for (const arquivo of ["db/schema.sql", "db/catalog.json"]) {
    if ((0, import_node_fs3.existsSync)(import_node_path3.default.resolve(process.cwd(), arquivo))) {
      ok(arquivo, "presente");
    } else {
      aviso(arquivo, "ausente \u2014 necess\xE1rio para rodar o migrate.js");
    }
  }
  if ((0, import_node_fs3.existsSync)(import_node_path3.default.resolve(process.cwd(), "node_modules/express"))) {
    ok("Depend\xEAncias instaladas", "node_modules presente");
  } else {
    erro("Depend\xEAncias instaladas", 'AUSENTES \u2014 clique em "Run NPM Install" no hPanel');
  }
  let db = null;
  try {
    db = await Promise.resolve().then(() => (init_db(), db_exports));
  } catch (e) {
    erro("Driver do MySQL", 'n\xE3o foi poss\xEDvel carregar o pacote mysql2 \u2014 clique em "Run NPM Install" no hPanel e rode este diagn\xF3stico de novo.');
    if (config.env === "development") console.error(e);
  }
  let conectou = false;
  const q2 = db?.q;
  if (q2) try {
    const v = await q2.one("SELECT VERSION() AS v");
    conectou = true;
    ok("Conex\xE3o com o MySQL", "conectou");
    ok("Vers\xE3o do MySQL", String(v?.v ?? "?"));
  } catch (e) {
    const bruto = e.cause ?? e;
    const err = bruto;
    erro("Conex\xE3o com o MySQL", `${err.code ?? ""} ${err.message ?? String(bruto)}`.trim());
    const dicas = {
      ER_ACCESS_DENIED_ERROR: "Usu\xE1rio ou senha errados \u2014 ou o usu\xE1rio n\xE3o est\xE1 associado a este banco. Na Hostinger, nome e usu\xE1rio levam o prefixo da conta (u123456789_queops).",
      ER_BAD_DB_ERROR: "O banco com esse nome n\xE3o existe. Crie em hPanel \u2192 Bancos de Dados \u2192 MySQL e copie o nome exatamente como aparece l\xE1, com o prefixo.",
      ER_DBACCESS_DENIED_ERROR: "O usu\xE1rio existe, mas n\xE3o tem permiss\xE3o neste banco \u2014 ou o nome do banco est\xE1 errado. Em hPanel \u2192 Bancos de Dados, confirme que este usu\xE1rio aparece associado a este banco, e copie os dois nomes exatamente como est\xE3o l\xE1.",
      ECONNREFUSED: "Nada escutando nesse host/porta. Na Hostinger, use DB_HOST=127.0.0.1.",
      ENOTFOUND: "O host n\xE3o existe. Na Hostinger, use DB_HOST=127.0.0.1.",
      ETIMEDOUT: "O host n\xE3o respondeu. Na Hostinger, use DB_HOST=127.0.0.1."
    };
    aviso("O que fazer", dicas[err.code ?? ""] ?? "Confira DB_HOST, DB_NAME, DB_USER e DB_PASS.");
  }
  if (conectou && q2) {
    const existentes = new Set(
      (await q2.all("SHOW TABLES")).map((r) => String(Object.values(r)[0]))
    );
    const faltando = TABELAS.filter((t) => !existentes.has(t));
    if (faltando.length === 0) {
      ok("Tabelas", `${existentes.size} presentes`);
    } else {
      erro("Tabelas", `faltam ${faltando.length} (${faltando.slice(0, 4).join(", ")}\u2026) \u2014 rode: node migrate.js --admin-email=\u2026 --admin-pass=\u2026`);
    }
    if (existentes.has("orders")) {
      const colunas = new Set(
        (await q2.all("SHOW COLUMNS FROM orders")).map((r) => String(r.Field))
      );
      const exigidas = [
        ["payment_provider", "pagamento"],
        ["payment_ref", "pagamento"],
        ["payment_detail", "pagamento"],
        ["paid_at", "pagamento"],
        ["stock_restored", "pagamento"],
        ["tracking_code", "rastreio"],
        ["tracking_status", "rastreio"],
        ["tracking_at", "rastreio"]
      ];
      const ausentes = exigidas.filter(([c]) => !colunas.has(c));
      if (ausentes.length === 0) {
        ok("Colunas de pagamento e rastreio", "todas presentes");
      } else {
        const areas = [...new Set(ausentes.map(([, area]) => area))].join(" e ");
        erro(
          "Banco desatualizado",
          `faltam ${ausentes.length} colunas em orders (${ausentes.map(([c]) => c).join(", ")}). Sem elas, ${areas} falha no meio da compra. Rode: node migrate.js`
        );
      }
    }
    if (existentes.has("products")) {
      const n = Number((await q2.one("SELECT COUNT(*) AS n FROM products"))?.n ?? 0);
      const ativos = Number((await q2.one("SELECT COUNT(*) AS n FROM products WHERE active = 1"))?.n ?? 0);
      if (n > 0) ok("Produtos", `${n} cadastrados (${ativos} ativos)`);
      else erro("Produtos", "0 \u2014 rode o migrate.js para importar o cat\xE1logo");
    }
    if (existentes.has("admin_users")) {
      const n = Number((await q2.one("SELECT COUNT(*) AS n FROM admin_users WHERE active = 1"))?.n ?? 0);
      if (n > 0) ok("Administradores", String(n));
      else erro("Administradores", "nenhum \u2014 rode o migrate.js com --admin-email e --admin-pass");
    }
    if (existentes.has("orders")) {
      const n = Number((await q2.one("SELECT COUNT(*) AS n FROM orders"))?.n ?? 0);
      const demo = Number((await q2.one("SELECT COUNT(*) AS n FROM orders WHERE id LIKE 'QPD-%'"))?.n ?? 0);
      ok("Pedidos", demo > 0 ? `${n} (dos quais ${demo} s\xE3o de DEMONSTRA\xC7\xC3O)` : String(n));
      if (demo > 0 && config.isProd) {
        aviso("Pedidos de demonstra\xE7\xE3o", `h\xE1 ${demo} pedidos fict\xEDcios (QPD-\u2026) num ambiente de produ\xE7\xE3o. Apague-os antes de entregar o painel para a cliente: DELETE FROM orders WHERE id LIKE 'QPD-%';`);
      }
    }
    if (existentes.has("store_config")) {
      const chaves = (await q2.all("SELECT config_key FROM store_config")).map((r) => String(r.config_key));
      const esperadas = ["settings", "shipping", "recovery"];
      const faltam = esperadas.filter((k) => !chaves.includes(k));
      if (faltam.length === 0) ok("Configura\xE7\xF5es da loja", "settings, shipping e recovery gravadas");
      else aviso("Configura\xE7\xF5es da loja", "faltam: " + faltam.join(", "));
    }
  }
  try {
    const catalogo = JSON.parse((0, import_node_fs3.readFileSync)(import_node_path3.default.resolve(process.cwd(), "db/catalog.json"), "utf8"));
    const produtos = catalogo.products ?? [];
    const remotas = produtos.filter((p) => /^https?:\/\//i.test(p.image ?? "")).length;
    if (remotas === 0) {
      ok("Imagens dos produtos", "todas apontam para arquivos locais");
    } else {
      aviso("Imagens dos produtos", `${remotas} de ${produtos.length} ainda apontam para o site antigo. Rode \`npm run sync:midia\` na sua m\xE1quina ENQUANTO ele estiver no ar e suba de novo.`);
    }
  } catch {
  }
  const largura = Math.max(...linhas.map(([, r]) => r.length));
  const falhas = linhas.filter(([e]) => e === "erro").length;
  const avisos = linhas.filter(([e]) => e === "aviso").length;
  console.log("\n  DIAGN\xD3STICO \u2014 Qu\xE9ops Pir\xE2mides\n");
  for (const [estado, rotulo, texto] of linhas) {
    const tag = estado === "ok" ? "  OK  " : estado === "erro" ? " ERRO " : "AVISO ";
    console.log(`${tag} ${rotulo.padEnd(largura)}  ${texto}`);
  }
  console.log("");
  if (falhas === 0 && avisos === 0) {
    console.log("  Nada a corrigir: a loja est\xE1 pronta.\n");
  } else {
    console.log(`  ${falhas} erro(s) e ${avisos} aviso(s). Os erros impedem a loja de funcionar.
`);
  }
  process.exitCode = falhas === 0 ? 0 : 1;
}
__name(main, "main");
main().catch((e) => {
  console.error("[queops] o diagn\xF3stico falhou:", e);
  process.exitCode = 1;
}).finally(() => {
  void Promise.resolve().then(() => (init_db(), db_exports)).then((m) => m.closePool()).catch(() => void 0);
});
//# sourceMappingURL=diagnostico.js.map
