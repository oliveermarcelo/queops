# Variações (grade) no B2C Quéops — resposta e especificação do que foi feito

Para: equipe de desenvolvimento do UNO ERP
De: Quéops Pirâmides (loja B2C)
Data: 13 de outubro de 2026 — **manual de integração na versão 3.3**

> **Nota antes de tudo:** a solicitação cita "manual hoje v3.0". A versão atual é a **3.3**. A
> 3.1 trouxe o contrato completo do pedido (endereço, transportadora, eixos de status, CPF sem
> máscara), a **3.2 trouxe o capítulo de nota fiscal** — `POST /orders/{id}/invoices` já está em
> produção — e a 3.3 é esta, com o capítulo 4.7 de variações. Vale conferir se vocês estão
> lendo o PDF atualizado; ele acompanha este documento.

**Resumo:** o pedido foi aceito como desenhado e **está implementado**. O contrato de escrita
não mudou em nada. O `GET /products` ganhou três campos de leitura, como vocês pediram. A única
mudança de comportamento que vocês sentem é a retenção de produto novo (seção 5 da solicitação),
que foi implementada na opção 1, a preferência de vocês.

---

## 1. Alguma regra da seção 8 conflita com a arquitetura atual?

**Nenhuma.** Todas as seis já eram verdade aqui ou foram implementadas sem atrito:

| Regra | Situação |
|---|---|
| 1. O grupo não é comprável | Garantido no código: o botão de comprar do card, num grupo, abre a página em vez de adicionar à sacola. Não existe caminho que ponha o id do grupo no carrinho. |
| 2. Estoque sempre por variação | O grupo não tem coluna de estoque. O card soma apenas para decidir se mostra "esgotado"; quem libera a venda de uma opção é o saldo **dela**. |
| 3. O item carrega `sku` e `productId` da variação | Já era assim desde a v3.1: `order_items` grava `product_id` **e** `sku` copiados no momento da venda. Nada mudou. |
| 4. `GET /products` não esconde variação nem devolve grupo | A lista continua plana. O grupo **não aparece** nela — ele não é produto, não tem SKU. Testado. |
| 5. Agrupar/desagrupar não altera estoque, preço nem pedido | O grupo guarda só conteúdo de vitrine mais o vínculo. Desfazer um grupo não toca em produto nenhum. |
| 6. Produto sem grupo se comporta como hoje | Nenhum caminho novo passa por ele. A exceção é a retenção da seção 5, que é o que vocês pediram — e é desligável. |

## 2. Seção 5 — produto novo que chega sem grupo

**Implementada a opção 1**, com um ajuste que vale explicar.

Produto **criado** pela API entra com `pendingReview: true` e **não aparece na vitrine** até a
lojista conferir, em Painel → Variações, se é peça solta ou variação de um grupo. Ela resolve de
duas formas: "publicar solto" (vira card normal) ou adicionar ao grupo (salvar o grupo já libera
a retenção).

O que isso **não** muda do lado de vocês:

- a gravação responde **201** normalmente, e o produto existe;
- ele aparece no `GET /products` — a reconciliação de vínculo de vocês continua encontrando cada
  SKU. Esconder ali faria o UNO concluir que o produto que acabou de criar não existe;
- a resposta traz o aviso em `warnings`, explicando o que aconteceu e onde se resolve;
- **atualização não retém.** Produto que já estava publicado nunca sai da vitrine por causa de um
  envio de vocês. Só o `INSERT` marca.

A retenção mora numa coluna da loja (`pending_group`), e **não** em `active`. Isso é deliberado:
`active` é de vocês, e vocês o reenviam a cada ciclo — se a retenção morasse ali, o envio
seguinte publicaria o produto sozinho e a conferência não teria valido nada.

**O ajuste:** a retenção é um interruptor em Painel → Configurações, **ligado por padrão**. O
custo dela é real e precisa ser dito: com ela ligada, nenhum produto novo entra na loja sozinho,
inclusive os que nunca terão variação — e a esmagadora maioria do catálogo é assim. Quem vende só
produto simples desliga e volta ao comportamento de sempre; a fila de conferência continua
existindo, só não segura mais ninguém. Sem esse interruptor, a escolha de vocês viraria uma
armadilha que só se desfaz com um deploy.

## 3. Seção 6 — o item do pedido

**Confirmado, e é regra dura aqui também.** O item do pedido carrega `sku` e `productId` da
**variação escolhida**. Nenhum campo do pedido passa a carregar o código do grupo: nem como item,
nem como campo do pedido, nem como pai do item. Um pedido com duas variações do mesmo grupo são
duas linhas independentes, exatamente como hoje.

Concordamos com o motivo e ele está escrito no código, no teste e no manual: o caso ruim — código
do grupo coincidir com um produto real no ERP, importar o produto errado, baixar o estoque errado
e emitir nota errada **sem alerta** — é o tipo de falha que não se descobre olhando a tela.

Há teste automatizado que falha se o código do grupo aparecer em qualquer campo do pedido.

**`variantLabel` (6.4):** não implementado, como vocês autorizaram. O `name` do item já vem do
produto de vocês e já descreve a variação ("Pirâmide de cobre 20cm"). Se quiserem depois, é uma
linha.

## 4. Casos de borda da seção 9

| Caso | Resposta |
|---|---|
| Variação que o UNO desativa (`active: false`) | **Sai do seletor.** Inativo é "saiu de linha", não "esgotado" — e mostrar desabilitado para sempre uma opção que não volta é promessa falsa. Esgotado (`stock: 0`) é diferente: continua visível e desabilitado. |
| E se for a última ativa | O grupo **some da vitrine**. Sem variação viva não há o que vender, e o card levaria a uma página sem nada. |
| SKU removido do grupo no painel | **Volta a ser card solto**, com o nome e a descrição que vocês mandam. Ou seja: volta a se comportar exatamente como antes de ter sido agrupado. |
| Grupo que ficou sem nenhuma variação | Continua existindo no painel (a lojista pode estar montando), marcado com "sem variação", e **não aparece na vitrine**. |
| Grupo com uma única variação | **Produto simples, sem seletor** — a preferência de vocês, e pelo mesmo motivo: um seletor de uma opção é um clique a mais para concluir que não há o que decidir. |
| Pedido em aberto cuja variação foi desagrupada ou desativada | **Continua válido.** O `order_items` guarda cópia própria de nome, SKU e preço do dia da compra. Isso já era assim antes das variações. |
| Carrinho com duas variações do mesmo grupo | **Duas linhas distintas.** Confirmado — o carrinho é indexado por id de produto. |
| Variações com preços diferentes | O card mostra o **menor** preço entre as variações **ativas e com estoque**. Sem nenhuma com estoque, cai para o menor entre as ativas: o card continua mostrando um preço de verdade e a página explica que está esgotado. |
| Lojista tenta adicionar um SKU que o ERP nunca enviou | Ele não existe no catálogo, então não aparece na busca e a gravação recusa com `422 invalid_group`. |

## 5. `groupCode` / `groupName` / `options` no `GET /products`

**Feito**, como vocês pediram, em `GET /products` e também em `GET /products/{id}`:

```jsonc
{
  "id": "PIR-COBRE-20",  "sku": "PIR-COBRE-20",
  "price": 240.00,       "stock": 2,
  "groupCode": "GRP-PIRAMIDE-DE-COBRE",   // null se não agrupado
  "groupName": "Pirâmide de cobre",
  "options": [ { "name": "Tamanho", "value": "20cm", "position": 0 } ],
  "pendingReview": false
}
```

Três decisões no formato:

- `groupCode` vem **`null`** e `options` vem **`[]`** no produto sem grupo, nunca ausentes. "O
  campo não veio" e "não está agrupado" precisam ser a mesma coisa do lado de vocês — senão uma
  loja desatualizada seria lida como catálogo inteiro agrupado.
- **Escrita é ignorada.** Se o UNO mandar `groupCode` numa gravação, o campo não é aplicado e a
  resposta diz isso em `warnings`. A forma da lista não muda.
- Incluímos de brinde o `pendingReview`, que responde sozinho a pergunta "criei o produto, por que
  ele não está na loja?" sem ninguém precisar abrir o painel.

## 6. Como o grupo foi modelado

**Entidade nova**, não um produto marcado como pai. Marcar um produto como pai obrigaria todo
caminho que lê produto — carrinho, checkout, estoque, pedido, nota — a saber que existe um tipo de
produto que não se compra; bastaria um deles esquecer para o código do grupo acabar num pedido,
que é exatamente o modo de falha silencioso da seção 6.3.

```
product_groups          conteúdo de vitrine do grupo (nome, texto, foto, categoria, slug, code)
product_group_axes      eixos ("Tamanho"), com posição
product_group_options   opções de cada eixo ("20cm"), com posição
product_group_values    o valor de cada eixo para cada variação  (PK: produto + eixo)

products.group_id       o vínculo  ← coluna do PRODUTO, não tabela de ligação
products.group_position ordem da variação dentro do grupo
products.pending_group  retenção da seção 5
```

Duas escolhas que merecem nota:

- **O vínculo é uma coluna do produto.** É o que torna "o mesmo SKU não pode estar em dois grupos"
  impossível por construção, em vez de depender de uma checagem que um dia alguém esquece.
- **N eixos, não dois.** O limite é 4 por grupo, 60 opções por eixo e 400 variações — números de
  guarda, não de modelo.
- `PK (produto, eixo)` em `product_group_values` garante um valor por eixo por variação no banco.
  "Variação sem valor em algum eixo" não dá para um índice resolver (depende de contar os eixos do
  grupo) e é checado na gravação.

**Seção 10 (evolução futura):** o modelo não bloqueia. `groupCode` e `options` vindos do envio de
produto poderiam, depois, pré-preencher o agrupamento, com precedência configurável no mesmo
espírito do `lockedFields` — a coluna de vínculo não presume origem.

## 7. Prazo e especificação antes do código

A especificação **é este documento**, e ela vem com o código pronto e testado em vez de antes
dele. O desenho de vocês estava fechado o suficiente para isso: as regras duras não conflitavam
com nada daqui, e descrever por escrito algo que já funciona é mais honesto do que descrever algo
que ainda não existe. Se alguma decisão abaixo divergir do que vocês esperavam, mudar agora é
barato — nada disso está em uso ainda.

---

## O que NÃO foi entregue, e por quê

**1. Ambiente de QA (entregável 3).** Não entregue. É uma segunda aplicação e um segundo banco na
hospedagem, com custo mensal e domínio próprio — decisão comercial do dono da loja, não técnica.
O pedido é legítimo e foi encaminhado a ele. Enquanto isso, a sugestão é a de sempre: produtos de
teste com SKU marcado, em janela combinada.

**2. URL com `?sku=` (seção 4).** Não entregue, e aqui a razão é uma lacuna anterior: **a loja não
abre produto por URL hoje**. O `sitemap.xml` publica `/?produto=<id>`, mas nada lê esse parâmetro
— o link cai na home. O slug do grupo existe (é o id dele), então a peça que falta é o
roteamento por URL do produto, que é trabalho independente de variações e vale fazer por si. Está
anotado como próximo passo.

**3. Galeria curada do grupo.** Entregue em forma diferente: o grupo tem **uma foto de capa**
enviada no painel, e a galeria da página é essa capa mais as fotos **da variação selecionada**,
que trocam junto com o seletor — que é o que a seção 4 pede ("a imagem da variação deve poder
aparecer ao selecioná-la"). Uma galeria curada à parte duplicaria fotos que já vêm de vocês e
envelheceria sozinha. Se fizer falta, é incremental.

**4. OpenAPI.** O projeto não tem arquivo OpenAPI: a documentação da API é o PDF do manual, que
foi atualizado para a 3.3 com o capítulo 4.7. Se vocês quiserem um `openapi.yaml` para gerar
cliente, é um pedido à parte e dá para fazer.

---

## Como conferir do lado de vocês

1. `GET /products` — a lista continua plana; cada variação traz `groupCode`, `groupName` e
   `options`; o grupo não aparece.
2. `PUT /products/{id}` com `groupCode` — responde 200, **não** agrupa, e avisa em `warnings`.
3. Criar um produto — responde 201 com `pendingReview: true` e o aviso da retenção.
4. Fazer uma compra de duas variações do mesmo grupo e ler `GET /orders/{id}` — duas linhas, com
   o SKU de cada variação, e o código do grupo em lugar nenhum.
5. `PATCH /products/{id}/stock` numa variação — só ela muda; o seletor da página desabilita a
   opção quando o saldo zera.

**Confirmação que vocês pediram (entregável 4):** o catálogo atual, todo sem grupo, continua
funcionando sem nenhuma mudança do lado de vocês. A única diferença que o UNO percebe é o produto
**novo** nascer retido — e isso é desligável na loja.
