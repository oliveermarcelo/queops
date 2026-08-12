# Deploy na Hostinger — Quéops Pirâmides

Loja em React + API em PHP 8 + MySQL. Roda em plano compartilhado; não precisa
de VPS, Node no servidor nem Composer.

---

## 1. Banco de dados

hPanel → **Bancos de Dados → Gerenciamento de bancos MySQL**

1. Crie um banco (ex.: `u123456789_queops`) e um usuário com senha forte.
2. Anote **host, nome do banco, usuário e senha** — a Hostinger costuma usar
   `localhost` como host.

---

## 2. Gerar os arquivos

Na sua máquina:

```bash
npm install
npm run sync:midia      # baixa imagens de produtos e banners (uma vez)
npm run seed:catalogo   # gera api/seed/catalog.json
npm run build
npm run empacotar       # cria a pasta deploy/
```

A pasta `deploy/` sai com o site e a API já organizados. O `config.php` fica de
fora de propósito: ele guarda a senha do banco e é criado direto no servidor.

---

## 3. Subir os arquivos

hPanel → **Gerenciador de Arquivos** → pasta `public_html`

1. Envie **todo o conteúdo** de `deploy/` para dentro de `public_html`
   (o `index.html` precisa ficar na raiz, não dentro de uma subpasta).
2. Ative **"Mostrar arquivos ocultos"** e confirme que os dois `.htaccess`
   subiram: `public_html/.htaccess` e `public_html/api/.htaccess`.
   Sem eles, `/admin` dá 404 e a API não responde.

Estrutura final esperada:

```
public_html/
├── .htaccess
├── index.html
├── assets/
├── produtos/
├── banners/
├── robots.txt
├── sitemap.xml
└── api/
    ├── .htaccess
    ├── index.php
    ├── config.php      ← criado no passo 4
    ├── lib/  routes/  seed/
    └── schema.sql
```

---

## 4. Configurar a API

No Gerenciador de Arquivos, copie `api/config.example.php` para
`api/config.php` e edite:

```php
'db' => [
    'host'     => 'localhost',
    'port'     => 3306,
    'name'     => 'u123456789_queops',
    'user'     => 'u123456789_queops',
    'password' => 'a-senha-do-banco',
    'charset'  => 'utf8mb4',
],

// Gere com:  php -r "echo base64_encode(random_bytes(32));"
// Se não tiver PHP à mão, use qualquer gerador de 32 bytes em base64.
'app_key' => 'COLE_AQUI_A_CHAVE_DE_32_BYTES',

'app_url'        => 'https://queopspiramides.com.br',
'secure_cookies' => true,
'env'            => 'production',

// Só para a instalação pelo navegador (passo 5). Apague depois.
'setup_key' => 'uma-frase-longa-e-aleatoria',
```

> **A `app_key` cifra as credenciais das integrações.** Trocá-la depois torna
> ilegíveis os tokens já salvos — guarde-a junto das senhas do projeto.

---

## 5. Criar as tabelas e o administrador

**Com SSH** (planos Business e superiores):

```bash
cd ~/public_html
php api/migrate.php --admin-email=voce@queopspiramides.com.br --admin-pass='SenhaForteAqui'
```

**Sem SSH**, pelo navegador:

```
https://queopspiramides.com.br/api/migrate.php?key=uma-frase-longa-e-aleatoria&admin-email=voce@queopspiramides.com.br&admin-pass=SenhaForteAqui
```

O instalador só roda pela web enquanto não existir nenhum administrador.

**Depois de instalar, apague `api/migrate.php` do servidor** e remova a linha
`setup_key` do `config.php`.

> Para uma apresentação com histórico fictício no dashboard, acrescente `--demo`
> (ou `&demo=1`). Numa loja de verdade, não use.

---

## 6. Conferir

| Item | Onde |
|---|---|
| Loja | `https://queopspiramides.com.br/` |
| Painel | `https://queopspiramides.com.br/admin` |
| API viva | `https://queopspiramides.com.br/api/catalog` (deve devolver JSON) |

Teste o caminho completo: adicione ao carrinho → finalize um pedido → confirme
que ele aparece em **Pedidos** no painel e que o estoque do produto caiu.

---

## 7. Depois de no ar

**Segurança**

- Confirme que o HTTPS está ativo (hPanel → SSL) antes de descomentar a linha
  do HSTS em `public_html/.htaccess`.
- `api/config.php` e `api/schema.sql` já são bloqueados pelo `api/.htaccess`.
  Vale conferir abrindo `https://seudominio.com.br/api/config.php` — deve dar 403.

**Integrações** — cadastre as credenciais em **Painel → Integrações**. Elas
ficam cifradas no banco; o botão "Testar conexão" faz o handshake pelo servidor.

**Recuperação de carrinho automática** (opcional) — hPanel → **Cron Jobs**:

```
0 * * * *  php /home/uXXXXXXX/public_html/api/cron-recuperacao.php
```

*(o gatilho automático ainda não está implementado; hoje o envio é manual pelo
painel, com um clique por carrinho.)*

**Backup** — hPanel → Backups. O que importa preservar: o banco MySQL e o
`api/config.php` (por causa da `app_key`).

---

## Atualizações futuras

```bash
npm run build && npm run empacotar
```

Suba o conteúdo de `deploy/` por cima, **exceto** `api/config.php` (que não é
gerado). Se o `schema.sql` tiver mudado, rode `php api/migrate.php` de novo —
ele é idempotente e não apaga dados.

---

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Página em branco | Build feito para a raiz mas publicado em subpasta — use `npx vite build --base=/subpasta/` |
| `/admin` dá 404 | `public_html/.htaccess` não subiu (arquivo oculto) |
| "Não foi possível conectar ao banco" | Dados errados em `api/config.php` |
| "APP_KEY não configurada" | Falta a `app_key` no `config.php` |
| Erro 419 ao salvar | Sessão expirada — recarregue a página |
| Login do painel não entra | 8 erros de senha bloqueiam o e-mail por 15 minutos |
