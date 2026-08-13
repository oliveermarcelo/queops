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

## Ponta a ponta (Playwright)

Precisam da loja no ar. Com o build pronto:

```bash
npm run build
npm run build:server
npm start &                 # sobe em http://127.0.0.1:8080 (ver .env)
npm run teste:e2e
```

| Arquivo | O que verifica |
|---|---|
| `e2e/loja-e-painel.mjs` | Home carrega da API, sacola começa vazia e persiste; `/admin` exige senha válida e não exibe credenciais |
| `e2e/compra-completa.mjs` | Sacola → checkout → cupom → desconto Pix → pedido gravado → pedido visível no painel |
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
npm start &
node tests/paridade-php-node.mjs
```

O arquivo fica no repositório como registro de como a equivalência foi
verificada — e como ponto de partida caso um dia seja preciso comparar a API
com outra implementação.
