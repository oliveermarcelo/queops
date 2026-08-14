# Deploy na Hostinger — Quéops Pirâmides

Loja em React + API em Node/Express + MySQL, num processo só. Precisa de um
plano com o **gerenciador de Node.js** do hPanel: Business, Cloud ou VPS. Nos
planos Premium e inferiores só existe PHP, e esta versão não roda lá.

---

## Antes de tudo: as imagens

O catálogo aponta para `public/produtos/…`, mas os arquivos originais vêm do
site atual do cliente. Se o site novo substituir o WordPress **antes** de as
imagens virem para cá, a vitrine fica sem foto.

```bash
npm run sync:midia      # rode ENQUANTO o site atual ainda está no ar
```

---

## 1. Criar o banco

**hPanel → Bancos de Dados → Gerenciamento de bancos MySQL**

Crie um banco e um usuário com senha forte. Anote os quatro valores:

| Variável | Onde encontrar |
|---|---|
| `DB_HOST` | quase sempre `localhost` |
| `DB_NAME` | o nome mostrado na lista — leva o prefixo da conta (`u123456789_queops`) |
| `DB_USER` | idem, com prefixo |
| `DB_PASS` | a senha que você definiu |

---

## 2. Gerar o pacote na sua máquina

```bash
npm install
npm run sync:midia        # imagens (só funciona com o site antigo no ar)
npm run seed:catalogo     # catálogo a partir de src/data.ts
npm run build             # front em dist/
npm run build:server      # servidor em .build/app.js
npm run empacotar         # monta deploy/
```

Sai uma pasta `deploy/` com esta cara:

```
deploy/
  app.js            o servidor inteiro (entrada da aplicação)
  migrate.js        instalador do banco, rodado uma vez
  diagnostico.js    checagem da instalação, para quando algo não sobe
  package.json      só as 4 dependências de runtime
  public/           a vitrine compilada
  db/               schema.sql e catalog.json
  .env.example      modelo das variáveis de ambiente
```

---

## 3. Criar a aplicação Node

**hPanel → Avançado → Node.js → Create application**

| Campo | Valor |
|---|---|
| Node.js version | 20 ou superior (22 se estiver disponível) |
| Application mode | Production |
| Application root | `queops` (a pasta onde você vai subir os arquivos) |
| Application URL | o domínio da loja, na raiz `/` |
| Application startup file | `app.js` |

O hPanel cria a pasta e um `app.js` de exemplo — ele será sobrescrito no passo
seguinte.

---

## 4. Enviar os arquivos

Há dois caminhos. Escolha **um**.

### a) Deploy por Git (hPanel → Avançado → GIT)

O pacote compilado é versionado justamente para isto: o hPanel só faz
`git clone`, não roda build no servidor. Aponte o repositório e o branch, e a
cada release:

```bash
npm run build && npm run build:server && npm run empacotar
git add deploy/ && git commit -m "release" && git push
```

Depois, no hPanel, clique em **Deploy** e em **Restart**.

> **O build tem de rodar antes do push.** Sem ele, o `deploy/` do repositório
> continua o da versão anterior e é isso que vai para o ar. O `npm run
> empacotar` recusa compilado mais velho que o código-fonte, mas ele só ajuda
> se você o rodar.

Neste modo a raiz da aplicação é a **pasta `deploy/` do repositório clonado** —
ajuste "Application root" no gerenciador de Node para apontar para ela, e use
`app.js` como "Application startup file".

**Se não der para apontar para `deploy/`** (o painel insiste na raiz do
repositório, ou exige um `server.js`), existe o atalho: a raiz tem um
`server.js` que carrega `deploy/app.js` e ajusta o `PUBLIC_DIR` sozinho. Nesse
caso:

| Campo | Valor |
|---|---|
| Application root | a pasta do repositório clonado |
| Application startup file | `server.js` |

O `npm install` da raiz instala mais coisa do que o servidor precisa (Vite,
React, TypeScript), mas funciona: as quatro dependências de runtime estão lá.
Apontar para `deploy/` continua sendo mais enxuto.

### b) Envio manual (Gerenciador de Arquivos ou FTP)

Entre na pasta `queops` e envie **todo o conteúdo** de `deploy/` (não a pasta
`deploy` em si).

O `app.js` precisa ficar na raiz da aplicação, ao lado de `package.json`,
`public/` e `db/`.

> Não suba `node_modules/`. O passo 6 instala as dependências no servidor, na
> versão certa para o Node de lá.

---

## 5. Configurar as variáveis de ambiente

Na tela da aplicação Node, seção **Environment variables**, adicione:

| Nome | Valor |
|---|---|
| `DB_HOST` | `localhost` |
| `DB_NAME` | o nome com prefixo |
| `DB_USER` | o usuário com prefixo |
| `DB_PASS` | a senha do banco |
| `APP_KEY` | gere com o comando abaixo |
| `APP_URL` | `https://queopspiramides.com.br` |
| `APP_ENV` | `production` |
| `SECURE_COOKIES` | `true` |
| `PUBLIC_DIR` | `public` |

```bash
# gera a APP_KEY (32 bytes em base64)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> **Guarde a `APP_KEY` junto das senhas do projeto.** É ela que cifra as
> credenciais das integrações. Trocá-la depois torna ilegíveis os tokens já
> salvos — o painel mostra os campos como vazios e é preciso cadastrar tudo de
> novo.

Alternativa: em vez da interface, suba um arquivo `.env` na raiz da aplicação
(copiado do `.env.example`). O servidor lê os dois; o que está na interface tem
precedência.

---

## 6. Instalar as dependências

Na mesma tela, clique em **Run NPM Install** e espere terminar. Depois,
**Restart**.

A loja já responde neste ponto — mas ainda sem tabelas, então mostra erro de
banco. É o passo seguinte que resolve.

---

## 7. Criar as tabelas e o administrador

Pelo **SSH** (hPanel → Avançado → Acesso SSH), uma vez só:

```bash
cd ~/queops                 # a pasta da aplicação
node migrate.js --admin-email=voce@queopspiramides.com.br --admin-pass='SenhaForte123'
```

Se o `node` do sistema for antigo, use o binário da própria aplicação — o
caminho aparece no topo da tela do Node no hPanel, algo como:

```bash
~/nodevenv/queops/22/bin/node migrate.js --admin-email=... --admin-pass='...'
```

O que ele faz: cria as 20 tabelas, importa as 10 categorias e os produtos de
`db/catalog.json`, grava as configurações padrão, cria os cupons
`BEMVINDO10`/`VOLTA10` e cadastra o primeiro administrador.

Rodar de novo é seguro: ele não duplica nada.

> **Não use `--demo` em produção**: cria 140 pedidos fictícios.

**Sem SSH?** Importe `db/schema.sql` pelo phpMyAdmin (hPanel → Bancos de Dados →
phpMyAdmin → aba Importar) e peça a carga do catálogo e do administrador — mas o
caminho com SSH é o normal em plano Business, e resolve tudo num comando.

---

## 8. Conferir

| O quê | Onde |
|---|---|
| Loja | `/` |
| Painel | `/admin` |
| API viva | `/api/catalog` — deve devolver JSON com 72 produtos |

Teste o caminho inteiro: adicione ao carrinho, finalize um pedido e confirme que
ele aparece em **Pedidos** no painel e que o estoque caiu.

---

## Depois de no ar

- **HTTPS:** confirme o SSL no hPanel. Só então adicione a variável `HSTS=true`
  e reinicie — uma vez enviado, o navegador se recusa a acessar o site por HTTP
  durante um ano.
- **Integrações:** cadastre as credenciais em Painel → Integrações. Ficam
  cifradas; o botão "Testar conexão" faz o handshake pelo servidor.
- **Backup:** hPanel → Backups. O que importa preservar é o banco MySQL e a
  `APP_KEY`.
- **Atualizar depois:**

  ```bash
  npm run build && npm run build:server && npm run empacotar
  ```

  Por Git, commite o `deploy/` e dê push; depois **Deploy** e **Restart** no
  hPanel. No envio manual, suba o conteúdo de `deploy/` por cima. Nos dois
  casos o `.env` do servidor não é sobrescrito, porque não vai no pacote.

  Rode o `migrate.js` de novo se o esquema mudou — ele adiciona as colunas que
  faltarem, sem apagar dados.

---

## Quando algo não funciona: rode o diagnóstico

Pelo SSH, na pasta da aplicação:

```bash
node diagnostico.js
```

Ele confere, em ordem, tudo que precisa estar de pé — versão do Node, cada
variável de ambiente, a APP_KEY, os arquivos do pacote, o `npm install`, a
conexão com o MySQL (mostrando o **erro real** do banco e o que fazer com ele),
as 19 tabelas, os produtos, o administrador e as configurações. Termina com a
contagem de erros e avisos.

Ele funciona mesmo antes do `npm install` — nesse caso avisa que é isso que
falta, em vez de morrer. E não mostra segredo: da senha do banco, informa só o
tamanho.

```
  OK   Conexão com o MySQL          conectou
  OK   Tabelas                      19 presentes
  OK   Produtos                     72 cadastrados (72 ativos)
 ERRO  Conexão com o MySQL          ER_ACCESS_DENIED_ERROR Access denied for user…
AVISO  O que fazer                  Usuário ou senha errados — ou o usuário não está
                                    associado a este banco. Na Hostinger, nome e
                                    usuário levam o prefixo da conta.
```

---

## Problemas comuns

| Sintoma | Causa provável |
|---|---|
| **"We're sorry, but something went wrong"** | erro na inicialização. Veja `~/queops/stderr.log` (ou o botão de log na tela do Node) |
| **"Configuração incompleta"** no log | falta alguma variável de ambiente; o log lista quais |
| **"Não foi possível conectar ao MySQL"** | `DB_NAME`/`DB_USER` sem o prefixo da conta, ou senha errada |
| **`APP_KEY` inválida** | precisa ser exatamente 32 bytes em base64 — gere com o comando do passo 5 |
| **Página em branco** | o `public/` não subiu, ou `PUBLIC_DIR` aponta para outro nome |
| **/admin dá 404** | o `app.js` não é o startup file, ou a aplicação não reiniciou |
| **Loja diz "A loja não respondeu"** | o `migrate.js` ainda não rodou: não há tabelas |
| **"app.js não encontrado" no deploy por Git** | o `deploy/` não foi commitado, ou "Application root" não aponta para ele |
| **Mudança não aparece depois do deploy** | faltou rodar o build antes do push: o `deploy/` do repositório é o antigo |
| **Erro 419 ao salvar** | sessão expirada; recarregue a página |
| **Login do painel não entra** | 8 senhas erradas bloqueiam o e-mail por 15 minutos |
| **"too many connections"** | baixe `DB_POOL` para 5 nas variáveis de ambiente |

Em qualquer um destes casos, comece por `node diagnostico.js` — ele costuma
apontar o item exato.

Para inspecionar o banco sem SSH: hPanel → Bancos de Dados → phpMyAdmin.
`SELECT COUNT(*) FROM products;` deve devolver 72 depois da migração.
