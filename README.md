# Quéops Pirâmides — loja virtual e painel administrativo

Loja de pirâmides artesanais, cristais, incensos e artigos espirituais, com
painel administrativo próprio.

- **Vitrine** (`/`) — catálogo, busca, filtros, carrinho, checkout em 3 etapas e área do cliente.
- **Painel** (`/admin`) — dashboard, produtos, pedidos, clientes, cupons, frete, carrinhos
  abandonados, integrações e configurações da loja.

| Camada | Tecnologia |
|---|---|
| Front-end | React 19 · TypeScript · Vite 6 · Tailwind 4 |
| Back-end | PHP 8 (sem framework, sem Composer) |
| Banco | MySQL 5.7+ / MariaDB 10.3+ |
| Hospedagem | Qualquer plano com PHP + MySQL (testado para Hostinger compartilhada) |

O back-end é PHP puro de propósito: roda em qualquer plano da Hostinger,
inclusive o mais barato, e o deploy continua sendo upload de arquivos.

---

## Rodando localmente

**Pré-requisitos:** Node.js 20+, PHP 8.1+ com `pdo_mysql` e `openssl`, MySQL/MariaDB.

```bash
# 1. Dependências do front
npm install

# 2. Banco de dados
mysql -u root -e "CREATE DATABASE queops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

# 3. Configuração da API
cp api/config.example.php api/config.php
php -r "echo 'APP_KEY: ', base64_encode(random_bytes(32)), PHP_EOL;"
#   → edite api/config.php com os dados do banco e a APP_KEY gerada

# 4. Catálogo inicial + tabelas + primeiro administrador
npm run seed:catalogo
php api/migrate.php --admin-email=voce@exemplo.com --admin-pass='UmaSenhaBemForte' --demo

# 5. Suba os dois servidores (em terminais separados)
npm run dev:api     # PHP em http://127.0.0.1:8000
npm run dev         # Vite em http://localhost:3000 (faz proxy de /api)
```

Loja em <http://localhost:3000> · painel em <http://localhost:3000/admin>.

> A flag `--demo` cria 140 pedidos fictícios para o dashboard ter histórico.
> **Não use em produção.**

---

## Imagens

O catálogo e os banners apontam para arquivos locais (`public/produtos/` e
`public/banners/`). Para baixar os originais do site atual do cliente:

```bash
npm run sync:midia
```

O script salva cada imagem, reescreve os caminhos em `src/data.ts` e em
`api/seed/catalog.json`, e ignora o que já existe — pode rodar quantas vezes
quiser. Qualquer arquivo pode ser trocado à mão nas pastas acima.

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento do front (porta 3000) |
| `npm run dev:api` | API PHP local (porta 8000) |
| `npm run build` | Build de produção em `dist/` |
| `npm run lint` | Checagem de tipos (`tsc --noEmit`) |
| `npm run migrar` | Cria/atualiza as tabelas e carrega o catálogo |
| `npm run seed:catalogo` | Gera `api/seed/catalog.json` a partir de `src/data.ts` |
| `npm run sync:midia` | Baixa imagens de produtos e banners para `public/` |
| `npm run gerar:sitemap` | Gera `public/sitemap.xml` a partir do catálogo |
| `npm run empacotar` | Monta a pasta `deploy/` pronta para subir |
| `npm run teste` | Testes do motor de preços (PHP, sem dependências) |
| `npm run teste:e2e` | Testes de ponta a ponta no navegador (Playwright) |

---

## API pública (v1)

Para ERP e automações (n8n, Make, Zapier). Gere uma chave em
**Painel → Integrações → API** e envie no header:

```bash
curl -H "Authorization: Bearer qp_live_..." \
     https://queopspiramides.com.br/api/v1/products
```

| Método | Rota | O que faz |
|---|---|---|
| GET | `/api/v1/products` | Catálogo ativo |
| GET | `/api/v1/products/:id` | Um produto |
| PATCH | `/api/v1/products/:id/stock` | Sincroniza estoque |
| GET | `/api/v1/orders?status=&since=` | Pedidos |
| GET | `/api/v1/orders/:id` | Um pedido |
| PATCH | `/api/v1/orders/:id` | Muda o status |
| GET | `/api/v1/customers` | Clientes |

O servidor guarda apenas o hash do token: ele aparece uma única vez, na
criação. Webhooks (`order.created`, `order.status_changed`) são configurados na
mesma tela.

---

## Estrutura

```
api/                 API PHP
  index.php          front controller (roteador)
  config.php         credenciais — NÃO versionado
  lib/               db, auth, cripto, preços, provedores
  routes/            público, conta do cliente, painel
  schema.sql         esquema do MySQL
  migrate.php        instalador (apague do servidor após usar)
src/
  api/client.ts      cliente HTTP (CSRF + sessão)
  catalog/           catálogo da vitrine, vindo da API
  admin/             painel administrativo
  components/        telas da loja
  data.ts            SEMENTE do catálogo (só para a carga inicial)
scripts/             utilitários de build e migração
public/              estáticos servidos como estão (.htaccess, imagens, robots)
```

**Onde ficam as regras de negócio:** frete, cupom e desconto do Pix vivem em
`api/lib/pricing.php`. O navegador nunca informa preço — manda apenas
`{productId, quantity}`, e o servidor calcula tudo a partir do banco. A mesma
função alimenta a prévia do checkout e a gravação do pedido.

---

## Segurança

- Senhas com `password_hash` (bcrypt); sessão em cookie `httpOnly` + `SameSite=Lax`.
- Token CSRF exigido em toda requisição que altera dados.
- Bloqueio após 8 tentativas de login erradas em 15 minutos (por e-mail e por IP).
- Credenciais de integrações (Stripe, Mercado Pago, Z-API, ERP…) cifradas com
  AES-256-GCM no banco e **nunca** enviadas ao navegador — o handshake com cada
  provedor acontece no servidor.
- Todas as consultas usam prepared statements.
- CSP restritiva no build de produção; `frame-ancestors` e HSTS no `.htaccess`.
- URLs de ERP e webhook são recusadas quando apontam para endereços internos
  (loopback, redes privadas, metadados de nuvem) — evita usar o painel para
  varrer a rede do servidor.

**Limitação conhecida:** não há envio de e-mail, então não existe "esqueci minha
senha" nem confirmação de cadastro. Por isso, um e-mail que já comprou como
visitante não pode criar senha sozinho (seria uma forma de assumir a conta
alheia) — o acesso precisa ser liberado manualmente. Ligar um serviço de e-mail
transacional é o próximo passo natural.

---

## Deploy

Veja [DEPLOY.md](DEPLOY.md).
