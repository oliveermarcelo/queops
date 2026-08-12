# Testes

## Unitários (PHP) — sem dependências

```bash
npm run teste          # ou: php tests/pricing_test.php
```

Cobrem `api/lib/pricing.php`: dedução de UF pelo CEP, prazo de entrega e a
precedência do frete (faixa de CEP → preço por UF → padrão, com frete grátis
sobrepondo tudo). É o código onde um erro cobra do cliente o valor errado.

## Ponta a ponta (Playwright)

Precisam da loja e da API no ar. Com o build pronto:

```bash
npm run build
php -S 127.0.0.1:8080 -t dist scripts/dev-server.php &
npm run teste:e2e
```

| Arquivo | O que verifica |
|---|---|
| `e2e/loja-e-painel.mjs` | Home carrega da API, sacola começa vazia e persiste; `/admin` exige senha válida e não exibe credenciais |
| `e2e/compra-completa.mjs` | Sacola → checkout → cupom → desconto Pix → pedido gravado → pedido visível no painel |
| `e2e/sincronia-painel-vitrine.mjs` | Editar/excluir produto no painel muda a vitrine na hora |

Os testes assumem o administrador criado pelo `migrate.php`. Ajuste e-mail e
senha no topo de cada arquivo se usar outras credenciais.
