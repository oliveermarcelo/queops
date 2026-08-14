# Quéops Pirâmides — loja virtual e painel administrativo

Loja de pirâmides artesanais, cristais, incensos e artigos espirituais, com
painel administrativo próprio.

- **Vitrine** (`/`) — catálogo, busca, filtros, carrinho, checkout em 3 etapas e área do cliente.
- **Painel** (`/admin`) — dashboard, produtos, pedidos, clientes, cupons, frete, carrinhos
  abandonados, integrações e configurações da loja.

| Camada | Tecnologia |
|---|---|
| Front-end | React 19 · TypeScript · Vite 6 · Tailwind 4 |
| Back-end | Node.js 20+ · Express · TypeScript |
| Banco | MySQL 5.7+ / MariaDB 10.3+ |
| Hospedagem | Hostinger Business/Cloud/VPS (gerenciador de Node.js do hPanel) |

Um único processo Node serve a vitrine compilada **e** a API: não há proxy, nem
Apache, nem `.htaccess`. Os cabeçalhos de segurança, o fallback de rota da SPA,
o cache dos assets e o gzip estão em `server/src/app.ts`, cada bloco com o
comentário do que ele reproduz.

---

## Rodando localmente

**Pré-requisitos:** Node.js 20+ (22 recomendado) e MySQL/MariaDB.

```bash
# 1. Dependências
npm install

# 2. Banco de dados
mysql -u root -e "CREATE DATABASE queops CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"

# 3. Variáveis de ambiente
cp .env.example .env
node -e "console.log('APP_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
#   → cole no .env, junto com os dados do banco.
#     Em desenvolvimento: APP_ENV=development, SECURE_COOKIES=false, PUBLIC_DIR=dist

# 4. Catálogo inicial + tabelas + primeiro administrador
npm run seed:catalogo
npm run migrar -- --admin-email=voce@exemplo.com --admin-pass='UmaSenhaBemForte' --demo

# 5. Suba os dois servidores (em terminais separados)
npm run dev:api     # API Node em http://127.0.0.1:8080, com recarga automática
npm run dev         # Vite em http://localhost:3000 (faz proxy de /api)
```

Loja em <http://localhost:3000> · painel em <http://localhost:3000/admin>.

Para ver como fica em produção — um processo só, servindo tudo:

```bash
npm run preview     # build do front + build do servidor + sobe em :8080
```

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
`server/db/catalog.json`, e ignora o que já existe — pode rodar quantas vezes
quiser. Qualquer arquivo pode ser trocado à mão nas pastas acima.

> Rode isto **enquanto o site antigo ainda estiver no ar**: é de lá que as
> imagens vêm.

---

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento do front (porta 3000) |
| `npm run dev:api` | API Node local com recarga automática (porta 8080) |
| `npm run build` | Build completo: front em `dist/` **e** servidor em `.build/` |
| `npm run build:front` | Só o front |
| `npm run build:server` | Só o servidor (`app.js`, `migrate.js`, `diagnostico.js`) |
| `npm start` | Sobe o servidor já compilado |
| `npm run preview` | `build` + `start`, como em produção |
| `npm run lint` | Checagem de tipos do front e do servidor |
| `npm run migrar` | Cria/atualiza as tabelas e carrega o catálogo |
| `npm run seed:catalogo` | Gera `server/db/catalog.json` a partir de `src/data.ts` |
| `npm run sync:midia` | Baixa imagens de produtos e banners para `public/` |
| `npm run gerar:sitemap` | Gera `public/sitemap.xml` a partir do catálogo |
| `npm run empacotar` | Monta a pasta `deploy/` pronta para subir |
| `npm run diagnostico` | Confere ambiente, banco, tabelas e catálogo |
| `npm run teste` | Testes do motor de preços (`node --test`, sem banco) |
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
server/
  src/
    index.ts         entrada: valida o ambiente, testa o banco e sobe o servidor
    app.ts           Express: rotas, headers de segurança, estáticos, SPA, erros
    config.ts        variáveis de ambiente (e a validação delas)
    env.ts           carrega o .env quando o hPanel inicia sem --env-file
    db.ts            pool do MySQL + helpers all/one/run/transaction
    session.ts       sessão em cookie httpOnly, com estado no MySQL
    auth.ts          CSRF, bcrypt, limite de tentativas, chaves de API
    pricing.ts       frete, cupom e desconto Pix — as regras de dinheiro
    store.ts         configurações da loja e conversão banco → front
    crypto.ts        AES-256-GCM das credenciais de integração
    providers.ts     handshake com gateways/WhatsApp/ERP + proteção contra SSRF
    routes/          público, conta do cliente, painel, API v1
    migrate.ts       instalador do banco (linha de comando)
    diagnostico.ts   checagem da instalação, para rodar no servidor
  db/
    schema.sql       esquema do MySQL
    catalog.json     catálogo para a carga inicial
  tests/             testes do motor de preços
src/
  api/client.ts      cliente HTTP (CSRF + sessão)
  catalog/           catálogo da vitrine, vindo da API
  admin/             painel administrativo
  components/        telas da loja
  data.ts            SEMENTE do catálogo (só para a carga inicial)
scripts/             build do servidor, empacotamento, catálogo, imagens
public/              estáticos servidos como estão (imagens, robots, sitemap)
```

**Onde ficam as regras de negócio:** frete, cupom e desconto do Pix vivem em
`server/src/pricing.ts`. O navegador nunca informa preço — manda apenas
`{productId, quantity}`, e o servidor calcula tudo a partir do banco. A mesma
função alimenta a prévia do checkout e a gravação do pedido, esta última dentro
da transação que baixa o estoque.

---

## Segurança

- Senhas em bcrypt (custo 12); sessão em cookie `httpOnly` + `SameSite=Lax`,
  com o estado no MySQL e o identificador trocado a cada login.
- Token CSRF exigido em toda requisição que altera dados.
- Bloqueio após 8 tentativas de login erradas em 15 minutos (por e-mail e por IP).
- Credenciais de integrações (Stripe, Mercado Pago, Z-API, ERP…) cifradas com
  AES-256-GCM no banco e **nunca** enviadas ao navegador — o handshake com cada
  provedor acontece no servidor.
- Todas as consultas usam prepared statements com parâmetros.
- CSP restritiva; `frame-ancestors` e HSTS enviados como header pelo Express.
- URLs de ERP e webhook são recusadas quando apontam para endereços internos
  (loopback, redes privadas, metadados de nuvem) — evita usar o painel para
  varrer a rede do servidor.

**Limitação conhecida:** não há envio de e-mail, então não existe "esqueci minha
senha" nem confirmação de cadastro. Por isso, um e-mail que já comprou como
visitante não pode criar senha sozinho (seria uma forma de assumir a conta
alheia) — o acesso precisa ser liberado manualmente. Ligar um serviço de e-mail
transacional é o próximo passo natural.

---

## Histórico: de PHP para Node

A primeira versão do back-end era PHP 8 puro, escolhido para rodar em qualquer
plano compartilhado. Com o plano Business (que tem o gerenciador de Node.js), o
back-end foi reescrito em Node/Express mantendo **o mesmo contrato de API e o
mesmo esquema de banco** — o front-end não mudou uma linha.

A equivalência foi verificada com `tests/paridade-php-node.mjs`, que aponta as
duas implementações para o mesmo banco e compara as respostas campo por campo,
e rodando as três suítes de ponta a ponta sem alteração contra o servidor Node.

---

## Deploy

Veja [DEPLOY.md](DEPLOY.md) para a Hostinger, passo a passo.

**Em qualquer plataforma que faça build a partir do Git** (Render, Railway,
Coolify, Dokku, Docker…), a sequência convencional já funciona sem configuração
extra:

```bash
npm install
npm run build     # front → dist/  +  servidor → .build/
npm start         # node .build/app.js
```

Duas coisas foram feitas para que isso valha:

- `npm run build` compila o **front e o servidor**. A pasta `.build/` não é
  versionada (é artefato), então um `start` logo depois do clone não encontraria
  o `app.js` — e o erro apareceria como se fosse do código.
- A pasta da vitrine é **detectada**: `public/` no pacote de deploy, `dist/`
  quando se roda o projeto inteiro. `PUBLIC_DIR` continua existindo e tem
  precedência, mas não é mais obrigatório. Errar essa pasta dava página em
  branco sem nenhuma mensagem.

O que a plataforma precisa: Node 20+, as variáveis do `.env.example` e instalar
as `devDependencies` no build (o padrão da maioria).
