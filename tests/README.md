# Testes

## Unitários — sem banco, sem servidor

```bash
npm run teste          # node --test server/tests/**/*.test.ts
```

Cobrem `server/src/pricing.ts`: dedução de UF pelo CEP, prazo de entrega, a
precedência do frete (faixa de CEP → preço por UF → padrão, com frete grátis
sobrepondo tudo) e o arredondamento monetário. É o código onde um erro cobra do
cliente o valor errado.

São os mesmos casos que existiam na versão PHP (`tests/pricing_test.php`, hoje
removido), um a um — de propósito: é o que mostra que a troca de runtime não
mexeu em nenhuma regra de cobrança.

## Pagamento — as travas que protegem dinheiro

```bash
npm run teste             # inclui server/tests/pagamento.test.ts (19 casos)
npm run teste:pagamento   # 25 verificações contra um MySQL de verdade
npm run start:build &     # a loja precisa estar no ar para o próximo
npm run teste:cobranca    # 9 verificações pela HTTP, na porta de entrada real
```

`server/tests/pagamento.test.ts` cobre o que não depende de rede: a tradução dos
status (um status desconhecido **nunca** vira "aprovado"), as mensagens de recusa
e a assinatura do webhook — assinatura forjada, de outro segredo, de outro
pedido e antiga demais, todas recusadas.

`tests/pagamento-banco.mjs` cobre o que só se prova com banco no meio: pedido
pago não volta atrás quando chega uma recusa atrasada, estoque devolvido uma
única vez (inclusive com três avisos simultâneos, de propósito), Pix pendente
segurando estoque e Pix expirado devolvendo.

`tests/cobranca-http.mjs` fecha o cerco pela porta de entrada: com a integração
desligada, `POST /api/orders` responde 503 e **não grava pedido nem baixa
estoque**; com uma credencial que o provedor recusa, o pedido gravado termina
`canceled`, sem `paid_at`, e com o estoque de volta. Ele cadastra uma credencial
falsa, roda e restaura a integração ao estado anterior — inclusive se falhar no
meio.

### Roteiro manual com os cartões de teste

O que os testes automáticos não cobrem é a conversa com o Mercado Pago:
tokenização no navegador, parcelas, recusa real e o QR do Pix. Isso se faz uma
vez, à mão, com as credenciais **de teste**.

1. No painel do Mercado Pago → *Suas integrações* → sua aplicação → *Credenciais
   de teste*, copie a **Public Key** e o **Access Token** (começam com `TEST-`).
2. Em *Webhooks → Configurar notificações*, aponte para
   `https://SEU-DOMINIO/api/webhooks/mercadopago` e copie a **chave secreta**.
3. No painel da loja → *Integrações* → Mercado Pago, cole os três campos e ligue
   a integração. A tela de pagamento passa a mostrar "Ambiente de teste".
4. Compre com os cartões abaixo. **O resultado é decidido pelo NOME do titular**,
   não pelo número: qualquer cartão da tabela combinado com o nome da segunda
   tabela produz aquele desfecho. Use CPF `123.456.789-09`, validade `11/30`,
   CVV `123` (Amex: `1234`).

| Bandeira | Número |
|---|---|
| Mastercard | 5480 8328 0103 3311 |
| Visa | 4235 6477 2802 5682 |
| American Express | 3753 651535 56885 |
| Elo (débito) | 5067 7667 8388 8311 |

| Nome do titular | O que deve acontecer na loja |
|---|---|
| `APRO` | "Pagamento aprovado", "Total pago", pedido `paid` no painel |
| `OTHE` | Recusa genérica; pedido `canceled` e **estoque devolvido** |
| `FUND` | Mensagem sobre limite; pedido cancelado |
| `SECU` | Mensagem sobre o código de segurança (CVV) |
| `EXPI` | Mensagem sobre a validade |
| `CALL` | Mensagem pedindo contato com o banco |
| `CONT` | Pendente: "Pagamento em análise", **nunca** "Total pago" |

5. Confira no painel, a cada tentativa: o `status` do pedido, e que o estoque do
   produto voltou ao valor anterior em toda recusa. Repetir a mesma recusa duas
   vezes não pode inflar o estoque.
6. Pix: escolha Pix, confira que aparece "Aguardando o pagamento" com QR code e
   relógio, e que **em nenhum momento** a tela diz "Total pago" antes de o
   dinheiro entrar. O QR de teste não é pagável — para ver a confirmação
   automática, use o webhook (passo 2) ou aprove pela API com o Access Token de
   teste.

> Se o formulário de cartão não aparecer, olhe o console do navegador: erro de
> CSP nomeia a diretiva bloqueada. A política está em `server/src/csp.ts`, num
> lugar só, e vale igual para a `<meta>` e para o header.

Fontes das tabelas: [Cartões de teste — Mercado Pago Developers](https://www.mercadopago.com.br/developers/pt/docs/your-integrations/test/cards).

## Ponta a ponta (Playwright)

Precisam da loja no ar. Com o build pronto:

```bash
npm run build
npm run build:server
npm run start:build &       # sobe em http://127.0.0.1:8080 (ver .env)
npm run teste:e2e
```

| Arquivo | O que verifica |
|---|---|
| `e2e/loja-e-painel.mjs` | Home carrega da API, sacola começa vazia e persiste; `/admin` exige senha válida e não exibe credenciais |
| `e2e/compra-completa.mjs` | Sacola → checkout → cupom → desconto Pix → **cobrança**. Sem credencial do Mercado Pago, verifica que a loja recusa e avisa, sem gravar pedido nem dizer "Total pago"; com credencial `TEST-`, segue até o QR do Pix e o pedido no painel |
| `e2e/sincronia-painel-vitrine.mjs` | Editar/excluir produto no painel muda a vitrine na hora |

Os testes assumem o administrador criado pelo `npm run migrar`. Ajuste com as
variáveis `ADMIN_EMAIL` e `ADMIN_PASS`, e o endereço com `BASE_URL`.

## Paridade PHP → Node

`paridade-php-node.mjs` foi o teste que autorizou apagar o back-end PHP: aponta
as duas implementações para o **mesmo banco** e compara as respostas JSON campo
por campo, em 27 cenários — leitura de catálogo, cotações com cupom e Pix, e os
erros de validação com seus códigos e status.

Ele não roda mais como está, porque a pasta `api/` (o PHP) foi removida. Para
reproduzir, traga de volta a última revisão que ainda a tinha:

```bash
git log --oneline -- api/          # ache o commit anterior à remoção
git worktree add /tmp/queops-php <commit>
# aponte /tmp/queops-php/api/config.php para o mesmo banco do .env
php -S 127.0.0.1:8000 -t dist /tmp/queops-php/scripts/dev-server.php &
npm run start:build &
node tests/paridade-php-node.mjs
```

O arquivo fica no repositório como registro de como a equivalência foi
verificada — e como ponto de partida caso um dia seja preciso comparar a API
com outra implementação.
