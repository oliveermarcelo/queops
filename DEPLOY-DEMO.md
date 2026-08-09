# Demo estática — Quéops Pirâmides

Versão completa da loja **+ painel administrativo**, pronta para subir na Hostinger.
Roda inteiramente no navegador: **não precisa de banco de dados, PHP nem Node no servidor.**

---

## O que subir

Arquivo: **`queops-demo-hostinger.zip`** (~341 KB), na raiz do projeto.

### Passo a passo na Hostinger

1. hPanel → **Gerenciador de Arquivos**
2. Entre na pasta **`public_html`** (ou `public_html/demo` se quiser em subpasta — veja a nota abaixo)
3. **Upload** do `queops-demo-hostinger.zip`
4. Clique com o botão direito no arquivo → **Extrair**
5. Apague o `.zip` depois de extrair

O conteúdo já está na raiz do ZIP — extraindo dentro de `public_html`, o `index.html`
fica no lugar certo. Não crie uma pasta `dist` no servidor.

> **Importante:** o `.htaccess` está incluído no ZIP, mas é um arquivo oculto.
> No Gerenciador de Arquivos, ative **"Mostrar arquivos ocultos"** para confirmar
> que ele foi extraído. É ele que faz a rota `/admin` funcionar — sem ele, o
> painel dá **404**.

---

## Como acessar

| | Endereço |
|---|---|
| **Loja** | `https://seudominio.com.br/` |
| **Admin** | `https://seudominio.com.br/admin` |

### Credenciais do painel

```
E-mail: admin@queopspiramides.com.br
Senha:  admin123
```

As credenciais também aparecem escritas na própria tela de login, para facilitar
a apresentação.

---

## O que dá para mostrar

**Loja:** vitrine com carrossel, navegação por categorias e subcategorias, busca,
filtros, página de produto, carrinho lateral, checkout em 3 etapas (identificação,
entrega, pagamento) com Pix/cartão/boleto, área do cliente.

**Admin:** dashboard com faturamento e gráficos, produtos (criar/editar/excluir),
pedidos, carrinhos abandonados, clientes, cupons, frete por estado/CEP,
integrações e configurações da loja.

---

## Comportamento da demo (importante saber antes de apresentar)

- **Os dados ficam no navegador de quem acessa** (`localStorage`). Cada visitante
  vê a mesma base inicial de demonstração, e as alterações que ele fizer valem só
  para ele — não afetam os outros nem o seu navegador.
- **Alterações são reversíveis:** limpar os dados do site no navegador devolve a
  demo ao estado original.
- **O login é apenas de demonstração**, validado no próprio navegador. Ele serve
  para mostrar o fluxo, **não protege nada de verdade** — qualquer pessoa com o
  endereço `/admin` e a senha entra. Enquanto a demo estiver no ar publicamente,
  trate o painel como conteúdo público.
- **As fotos dos produtos** são carregadas do site atual do cliente
  (`queopspiramides.com.br`). Se aquele site sair do ar, as imagens da demo somem.
- Na aba **Integrações**, os botões de "testar conexão" realmente tentam falar com
  os serviços externos — sem credenciais válidas eles apenas retornam erro, sem
  quebrar a demo.

---

## Para virar loja de verdade

O que falta é um **backend**: banco de dados, login real com senha criptografada,
gateway de pagamento e emissão fiscal. A camada de dados do painel está isolada em
[src/admin/store.ts](src/admin/store.ts) — é o ponto onde as chamadas de API entram,
sem precisar refazer as telas.

---

## Gerar o pacote de novo

```bash
npm install
npm run build     # gera a pasta dist/
```

Depois compacte **o conteúdo** de `dist/` (não a pasta em si), incluindo o
`.htaccess` oculto.

### Se for hospedar em subpasta

Para publicar em `seudominio.com.br/demo`, faça o build com o caminho base:

```bash
npx vite build --base=/demo/
```

Sem isso, a página abre em branco na subpasta, porque os arquivos CSS/JS são
procurados na raiz do domínio.
