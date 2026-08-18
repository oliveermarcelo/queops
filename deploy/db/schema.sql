-- =====================================================================
--  Quéops Pirâmides — esquema do banco (MySQL 5.7+ / MariaDB 10.3+)
--  Compatível com a Hostinger (utf8mb4, InnoDB, sem recursos exóticos).
--
--  Importe pelo phpMyAdmin ou rode:  npm run migrar
-- =====================================================================

SET NAMES utf8mb4;
SET time_zone = '-03:00';

-- ---------------------------------------------------------------------
-- Usuários do painel administrativo
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(120)  NOT NULL,
  email         VARCHAR(190)  NOT NULL,
  password_hash VARCHAR(255)  NOT NULL,
  role          VARCHAR(20)   NOT NULL DEFAULT 'admin',
  active        TINYINT(1)    NOT NULL DEFAULT 1,
  last_login_at DATETIME      NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admin_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Sessões (cookie httpOnly `qp_session` → estado guardado aqui)
--
-- Fica no banco, e não em memória, porque a aplicação Node é reiniciada a cada
-- deploy e pode rodar em mais de um processo: sessão em memória deslogaria
-- todo mundo no reinício e "sumiria" a cada requisição que caísse no outro
-- processo.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
  id         CHAR(64)   NOT NULL,
  payload    MEDIUMTEXT NOT NULL,
  created_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_session_updated (updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Tentativas de login (rate limiting) — vale para admin e cliente.
CREATE TABLE IF NOT EXISTS login_attempts (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  scope      VARCHAR(20)  NOT NULL,          -- 'admin' | 'customer'
  identifier VARCHAR(190) NOT NULL,          -- e-mail tentado
  ip         VARBINARY(16) NULL,
  success    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_attempt_lookup (scope, identifier, created_at),
  KEY idx_attempt_ip (ip, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Clientes da loja
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(160) NOT NULL,
  email         VARCHAR(190) NOT NULL,
  password_hash VARCHAR(255) NULL,           -- NULL = cadastro só no checkout
  phone         VARCHAR(30)  NOT NULL DEFAULT '',
  cpf           VARCHAR(20)  NOT NULL DEFAULT '',
  created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customer_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_addresses (
  id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id  INT UNSIGNED NOT NULL,
  label        VARCHAR(60)  NOT NULL DEFAULT 'Principal',
  cep          VARCHAR(12)  NOT NULL DEFAULT '',
  street       VARCHAR(160) NOT NULL DEFAULT '',
  number       VARCHAR(20)  NOT NULL DEFAULT '',
  complement   VARCHAR(120) NOT NULL DEFAULT '',
  neighborhood VARCHAR(120) NOT NULL DEFAULT '',
  city         VARCHAR(120) NOT NULL DEFAULT '',
  state        CHAR(2)      NOT NULL DEFAULT 'SP',
  is_default   TINYINT(1)   NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_addr_customer (customer_id),
  CONSTRAINT fk_addr_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS customer_favorites (
  customer_id INT UNSIGNED NOT NULL,
  product_id  VARCHAR(100) NOT NULL,
  created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (customer_id, product_id),
  CONSTRAINT fk_fav_customer FOREIGN KEY (customer_id)
    REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Catálogo
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id          VARCHAR(100) NOT NULL,          -- slug da categoria-mãe
  name        VARCHAR(120) NOT NULL,
  description VARCHAR(255) NOT NULL DEFAULT '',
  icon        VARCHAR(40)  NOT NULL DEFAULT '',
  featured    TINYINT(1)   NOT NULL DEFAULT 0,
  position    INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Subcategorias ficam em tabela própria de propósito: alguns slugs se repetem
-- entre nível-mãe e nível-filho (ex.: "cristais" é categoria E subcategoria).
-- Numa tabela só, com o slug como chave primária, um sobrescreveria o outro.
CREATE TABLE IF NOT EXISTS subcategories (
  parent_id VARCHAR(100) NOT NULL,
  id        VARCHAR(100) NOT NULL,
  name      VARCHAR(120) NOT NULL,
  position  INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (parent_id, id),
  KEY idx_subcat_id (id),
  CONSTRAINT fk_subcat_parent FOREIGN KEY (parent_id)
    REFERENCES categories (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS products (
  id                VARCHAR(100)  NOT NULL,
  sku               VARCHAR(64)   NOT NULL DEFAULT '',
  name              VARCHAR(255)  NOT NULL,
  category          VARCHAR(100)  NOT NULL DEFAULT '',
  subcategory       VARCHAR(100)  NULL,
  category_label    VARCHAR(120)  NOT NULL DEFAULT '',
  description       TEXT          NULL,
  long_description  MEDIUMTEXT    NULL,
  price             DECIMAL(10,2) NOT NULL DEFAULT 0,
  old_price         DECIMAL(10,2) NULL,
  stock             INT           NOT NULL DEFAULT 0,
  image             VARCHAR(500)  NOT NULL DEFAULT '',
  tag               VARCHAR(40)   NULL,
  weight            VARCHAR(120)  NOT NULL DEFAULT '',
  ingredients       TEXT          NULL,
  highlight         TINYINT(1)    NOT NULL DEFAULT 0,
  active            TINYINT(1)    NOT NULL DEFAULT 1,
  position          INT           NOT NULL DEFAULT 0,
  created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_prod_cat (category, subcategory),
  KEY idx_prod_active (active),
  KEY idx_prod_tag (tag)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Pedidos
--
-- Colunas de pagamento:
--   payment_provider  quem processou ('mercadopago')
--   payment_ref       id da cobrança no provedor. ÚNICO de propósito: é por ele
--                     que o webhook encontra o pedido, e um mesmo pagamento não
--                     pode acabar ligado a dois pedidos.
--   payment_detail    o motivo detalhado do provedor (ex.: cc_rejected_high_risk),
--                     que é o que explica para a lojista por que a compra falhou
--   paid_at           quando o dinheiro foi confirmado — só se preenche uma vez
--   stock_restored    trava: o estoque de um pedido cancelado volta UMA vez.
--                     Sem isso, dois avisos do provedor para o mesmo pedido
--                     devolveriam a peça duas vezes e o estoque inflaria sozinho.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id              VARCHAR(24)   NOT NULL,     -- QP-000123
  customer_id     INT UNSIGNED  NULL,
  customer_name   VARCHAR(160)  NOT NULL,
  customer_email  VARCHAR(190)  NOT NULL,
  customer_phone  VARCHAR(30)   NOT NULL DEFAULT '',
  customer_cpf    VARCHAR(20)   NOT NULL DEFAULT '',
  subtotal        DECIMAL(10,2) NOT NULL DEFAULT 0,
  shipping_cost   DECIMAL(10,2) NOT NULL DEFAULT 0,
  discount        DECIMAL(10,2) NOT NULL DEFAULT 0,
  total           DECIMAL(10,2) NOT NULL DEFAULT 0,
  coupon_code     VARCHAR(40)   NULL,
  status          VARCHAR(20)   NOT NULL DEFAULT 'pending',
  payment         VARCHAR(20)   NOT NULL DEFAULT 'pix',
  channel         VARCHAR(20)   NOT NULL DEFAULT 'site',
  ship_cep        VARCHAR(12)   NOT NULL DEFAULT '',
  ship_street     VARCHAR(160)  NOT NULL DEFAULT '',
  ship_number     VARCHAR(20)   NOT NULL DEFAULT '',
  ship_complement VARCHAR(120)  NOT NULL DEFAULT '',
  ship_neighborhood VARCHAR(120) NOT NULL DEFAULT '',
  ship_city       VARCHAR(120)  NOT NULL DEFAULT '',
  ship_state      CHAR(2)       NOT NULL DEFAULT 'SP',
  delivery_eta    DATE          NULL,
  payment_provider VARCHAR(30)  NOT NULL DEFAULT '',
  payment_ref     VARCHAR(64)   NULL,
  payment_detail  VARCHAR(60)   NOT NULL DEFAULT '',
  paid_at         DATETIME      NULL,
  stock_restored  TINYINT(1)    NOT NULL DEFAULT 0,
  -- Rastreio dos Correios: código do objeto (AA123456789BR) e o último status
  -- consultado, guardado para a conta do cliente não bater na API a cada visita.
  tracking_code   VARCHAR(40)   NOT NULL DEFAULT '',
  tracking_status VARCHAR(190)  NOT NULL DEFAULT '',
  tracking_at     DATETIME      NULL,
  created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_customer (customer_id),
  KEY idx_order_created (created_at),
  KEY idx_order_status (status),
  KEY idx_order_email (customer_email),
  UNIQUE KEY uq_order_payment_ref (payment_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_items (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id   VARCHAR(24)   NOT NULL,
  product_id VARCHAR(100)  NOT NULL,
  name       VARCHAR(255)  NOT NULL,
  quantity   INT           NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_item_order (order_id),
  CONSTRAINT fk_item_order FOREIGN KEY (order_id)
    REFERENCES orders (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Cupons
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS coupons (
  id         VARCHAR(40)   NOT NULL,
  code       VARCHAR(40)   NOT NULL,
  type       VARCHAR(10)   NOT NULL DEFAULT 'percent',  -- percent | fixed
  value      DECIMAL(10,2) NOT NULL DEFAULT 0,
  active     TINYINT(1)    NOT NULL DEFAULT 1,
  min_order  DECIMAL(10,2) NULL,
  expires_at DATE          NULL,
  uses       INT           NOT NULL DEFAULT 0,
  max_uses   INT           NULL,
  created_at DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_coupon_code (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Carrinhos abandonados
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS abandoned_carts (
  id             VARCHAR(32)   NOT NULL,
  customer_name  VARCHAR(160)  NOT NULL DEFAULT '',
  customer_email VARCHAR(190)  NOT NULL DEFAULT '',
  customer_phone VARCHAR(30)   NOT NULL DEFAULT '',
  total          DECIMAL(10,2) NOT NULL DEFAULT 0,
  status         VARCHAR(20)   NOT NULL DEFAULT 'open', -- open|recovered|discarded
  reminders_sent INT           NOT NULL DEFAULT 0,
  abandoned_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_cart_status (status, abandoned_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS abandoned_cart_items (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  cart_id    VARCHAR(32)   NOT NULL,
  product_id VARCHAR(100)  NOT NULL,
  name       VARCHAR(255)  NOT NULL,
  quantity   INT           NOT NULL DEFAULT 1,
  unit_price DECIMAL(10,2) NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_acitem_cart (cart_id),
  CONSTRAINT fk_acitem_cart FOREIGN KEY (cart_id)
    REFERENCES abandoned_carts (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Integrações (credenciais cifradas com AES-256-GCM)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS integrations (
  id              VARCHAR(40) NOT NULL,
  enabled         TINYINT(1)  NOT NULL DEFAULT 0,
  fields_enc      MEDIUMTEXT  NULL,           -- payload cifrado
  last_status     VARCHAR(20) NOT NULL DEFAULT 'unknown',
  last_checked_at DATETIME    NULL,
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- API pública e webhooks
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_keys (
  id           VARCHAR(40)  NOT NULL,
  name         VARCHAR(120) NOT NULL,
  token_prefix VARCHAR(24)  NOT NULL,         -- parte visível: qp_live_abcd…
  token_hash   VARCHAR(255) NOT NULL,         -- hash do token completo
  revoked      TINYINT(1)   NOT NULL DEFAULT 0,
  last_used_at DATETIME     NULL,
  created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_key_prefix (token_prefix)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS webhooks (
  id         VARCHAR(40)  NOT NULL,
  url        VARCHAR(500) NOT NULL,
  event      VARCHAR(60)  NOT NULL,
  active     TINYINT(1)   NOT NULL DEFAULT 1,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_wh_event (event, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Configurações da loja (chave → JSON)
--   settings | shipping | recovery
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS store_config (
  config_key VARCHAR(40) NOT NULL,
  config_val MEDIUMTEXT  NOT NULL,
  updated_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (config_key)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Contador de pedidos (evita corrida ao gerar o código QP-XXXXXX)
CREATE TABLE IF NOT EXISTS counters (
  name  VARCHAR(40)  NOT NULL,
  value BIGINT       NOT NULL DEFAULT 0,
  PRIMARY KEY (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
