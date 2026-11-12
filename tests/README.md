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

## Frete: Correios e Melhor Envio

```bash
npm run teste     # inclui correios.test.ts e melhorenvio.test.ts
```

Os testes cobrem o que dá para provar sem rede: a leitura da resposta e a
tradução dos erros. É de propósito — é ali que um campo renomeado pela API
viraria **frete R$ 0,00** e um serviço com erro viraria opção "grátis" no
checkout. Nenhum dos dois quebra nada visivelmente; apenas cobra errado.

A conversa com as APIs só se prova com credencial de verdade, e o painel foi
feito para isso: **Integrações → Testar conexão** faz a MESMA chamada do
checkout e mostra o preço que saiu (com o código do serviço) ou o motivo exato
da recusa. No Melhor Envio, a lista de transportadoras vem dessa cotação de
amostra — o que aparece marcável ali é o que o cliente vai ver.

Roteiro manual, depois de cadastrar as credenciais:

1. Integrações → Correios → **Testar conexão**: deve responder com preço e
   código (ex.: `Sedex (03220) R$ 11,15`).
2. Integrações → Melhor Envio → **Testar conexão** e depois marcar as
   transportadoras na lista. Salvar.
3. Checkout com um CEP real: a etapa **Entrega** passa a mostrar "Como você
   prefere receber?" com as opções cotadas, da mais barata para a mais cara.
4. Escolher uma opção mais cara e conferir que o total do resumo acompanha.
5. Fechar o pedido e conferir em Painel → Pedidos que a transportadora escolhida
   ficou gravada.

> Uma trava vale um teste próprio, e ele é automático (`npm run teste:cobranca`):
> mandar um id de frete que não está na cotação devolve **409** e não grava
> pedido. O navegador escolhe entre as opções; o preço é sempre o que o servidor
> cotou.

## Notas fiscais (NF-e) — o que o ERP sobe e o cliente baixa

Precisa da loja no ar.

```bash
npm run teste:notas       # 62 verificações pela HTTP
```

`notas-fiscais.mjs` não persegue "a rota respondeu 200". Persegue o conjunto de
coisas que, se der errado, dá errado em silêncio e caro:

- **reenvio criando duplicata.** O ERP reenvia por retry — sempre. A mesma
  chave tem de responder 200 e continuar sendo uma nota só no banco.
- **URL antiga continuando a funcionar** depois da substituição. Ela já
  circulou por e-mail e por log; se não morrer, a nota "substituída" continua
  baixável para sempre.
- **XML de um comprador baixável por outro**, ou por qualquer um. O XML tem
  CPF, nome e endereço — o teste tenta baixar sem sessão, com a sessão de outro
  cliente, com a do dono e com a chave do ERP, e espera coisa diferente de cada
  um.
- **nota cancelada oferecida ao cliente como válida.** Ela continua no GET do
  pedido (o ERP precisa do histórico) e some da conta do comprador.
- **upload mexendo no status do pedido.** Faturar não é despachar.

Cobre também cada linha da tabela de erros do contrato (404, 422, 413, 415,
409) e, em especial, o XML com `<!DOCTYPE>`/`<!ENTITY>` — a porta de entrada do
XXE, recusada com 415.

## Produtos fora da vitrine — por que cada um está parado

Precisa da loja no ar.

```bash
npm run teste:parados     # 30 verificações pela HTTP
```

O painel sabia contar ("51 produtos estão sem categoria") e mandava amarrar a
categoria correspondente na lista abaixo. Isso é verdade em **um** dos quatro
casos possíveis. Numa loja com 41 categorias do ERP, todas já amarradas, e 51
produtos parados, o aviso mandava fazer algo que não existia para ser feito — e
não havia como descobrir nem quais produtos eram.

`produtos-parados.mjs` monta os quatro casos lado a lado e cobra a distinção,
porque é ela que decide onde a pessoa resolve cada um:

| motivo | o que aconteceu | onde se resolve |
|---|---|---|
| `amarrado` | o código já aponta para uma categoria, e sobraram produtos fora | um clique, ali mesmo |
| `pendente` | o ERP mandou a categoria, falta amarrar | na lista de códigos |
| `orfao` | o código veio no produto e **nunca** veio como categoria | registrar o código, ou pedir a carga ao ERP |
| `sem_codigo` | o produto chegou sem `categoryCode` | um a um, em Produtos |

Verifica também que registrar um código é restrito ao que algum produto está de
fato esperando — sem isso a tela viraria um cadastro livre de categorias do ERP,
e a amarração manual deixaria de ter sentido.

A última parte cobre a **atribuição em massa** (`POST /admin/products/categoria`),
que é o caminho para o caso `sem_codigo`: abrir produto por produto, cinquenta e
uma vezes, é trabalho que ninguém termina. O teste cobra três coisas que só
aparecem quando dá errado — categoria inexistente e subcategoria de outra
categoria são **recusadas** (e não ignoradas em silêncio, o que colocaria dezenas
de produtos num lugar que ninguém pediu), id inexistente no meio do lote não
derruba os outros, e a categoria gravada **não fica travada** contra o ERP: a
arrumação em massa é um desempate provisório, e no dia em que o `categoryCode`
certo chegar ele deve valer.

### A caixa da cotação

A Envia cotava sempre numa caixa de 16 × 11 × 2 cm, o mínimo dos Correios,
porque a loja nunca soube as medidas de nada — só o peso. Um quilo nessa caixa
dá quase 3 g/cm³, mais denso que alumínio: transportadora que confere cubagem
não cota, e a conta voltava com **zero opções e nenhuma explicação**.

A caixa padrão passou a ser um campo do painel, e `tests/envia.mjs` cobra o que
acontece nos extremos — em branco cai no mínimo, menor que o mínimo sobe para
ele (o balcão recusaria), e um zero a mais digitado por engano vira 200 cm em
vez de uma caixa de trinta metros.

## Loja fechada ao público

Precisa da loja no ar.

```bash
npm run teste:loja-fechada
```

Montar uma loja leva semanas, e o endereço está no ar desde o primeiro dia.
Esconder a vitrine no navegador **não fecha loja nenhuma**: o endereço do
checkout continua respondendo, e basta um link antigo, um robô ou uma aba
aberta de ontem para um pedido entrar no meio da montagem — com preço
provisório, estoque errado e frete não configurado.

Por isso o teste cobra as duas metades. A trava: pedido por link direto é
recusado com 503 e a mensagem que a lojista escreveu, e cotar frete também —
é o primeiro passo da compra. A passagem: quem está logado no painel atravessa
tudo, que é como ela confere a própria loja sem reabrir para o público.

E a parte que mais importa: **fechar não apaga nada**. Produtos e pedidos
continuam no painel, e reabrir devolve a vitrine com exatamente os mesmos
produtos. É uma cortina na frente da loja, não uma desmontagem.

## A foto vem junto com o produto do ERP

Precisa da loja no ar. A segunda metade precisa de internet.

```bash
npm run teste:imagem-erp
```

O UNO tem as fotos; a loja não. Antes, `image` com uma URL gravava só o
ENDEREÇO — e isso deixava a vitrine refém do servidor do ERP, não funcionava
com endereço de rede interna, e não garantia que aquilo era imagem. Agora a
loja **baixa** e guarda como arquivo próprio, no mesmo envio do produto.

Buscar uma URL que veio de fora é a definição de SSRF, então metade do arquivo
é sobre as travas: endereço interno, esquema que não é http, redirecionamento
(é por onde se chega em `169.254.169.254`), resposta que não é imagem, arquivo
gigante. Essa parte troca o `fetch` por um de mentira — é a única forma de
fazer um servidor remoto se comportar mal sob encomenda.

A outra metade passa pela API de verdade, com um endereço público de verdade, e
cobra o que o ERP precisa poder confiar: o produto chega com foto num envio só,
o mesmo endereço **não** é baixado de novo no ciclo seguinte (senão mil e
quatrocentos produtos viram mil e quatrocentos downloads por ciclo), falhar na
foto não derruba o produto, e a foto trocada no painel não é sobrescrita.

## Mil fotos sem abrir produto por produto

Precisa da loja no ar.

```bash
npm run teste:fotos-massa
```

`PUT /products/:id` aceita `image`, mas só como URL — quem tem as fotos num
diretório não tem onde publicá-las para a loja poder baixar. Faltava uma rota
que recebesse os BYTES, e sem ela refazer 1.264 fotos significava abrir produto
por produto no painel.

A rota autentica por **chave de API**, e não por senha: carga em massa não é
lugar para a senha de ninguém. O teste cobra o caminho feliz (capa, galeria, a
mesma foto reaproveitando o arquivo) e os quatro jeitos de dar errado — chave
inválida, produto inexistente, corpo sem imagem, e conteúdo que não é imagem
(HTML servido do domínio da loja é XSS).

`scripts/subir-fotos.mjs` é quem usa isso: lê uma pasta, casa cada arquivo com
um produto por SKU ou por nome, e **não grava nada sem `--confirmo`** — casar
foto errada em escala é pior que não ter foto.

## A pasta de conteúdo sobrevive a uma publicação?

```bash
npm run teste:pasta     # sem rede e sem banco
```

A hospedagem publica criando um diretório novo a cada versão
(`.../hbuilds/versions/<id>/nodejs/`) e descartando o anterior inteiro. Com a
pasta de mídia relativa à aplicação, toda publicação começava com a pasta
vazia. Confiar em alguém lembrar de definir `MIDIA_DIR` não é correção: é a
mesma armadilha com um aviso em cima.

O teste cobra que o padrão saia do diretório de versão sozinho, que duas
versões diferentes apontem para a MESMA pasta (senão a foto de ontem some), e
que **fora desse formato nada mude** — uma instalação que está bem não pode
passar a procurar numa pasta vazia.

## Foto que some — o arquivo não está mais no servidor

Precisa da loja no ar.

```bash
npm run teste:midia
```

O banco guarda `/midia/abc.png`. Quando o arquivo sai do disco — e sai, se a
publicação substitui a pasta da aplicação, porque `midia/` fica dentro dela —,
o pedido daquela URL caía no **fallback da SPA**: HTTP 200 com o `index.html`.
O navegador recebia uma página onde esperava um PNG. Nada desenhado, nada no
console, nada na aba de rede. Quem cadastrou conclui que o upload não funciona e
sobe tudo outra vez — o que resolve até a próxima publicação.

O teste sobe uma foto, confere que ela é servida como imagem, **apaga o arquivo**
e cobra duas coisas: a URL passa a responder 404 (e não HTML), e o painel sabe
contar quantas fotos do catálogo estão faltando, quais são e em que pasta elas
eram procuradas — que é o caminho para `MIDIA_DIR`.

## Foto que some — salvar antes de o envio terminar

Precisa da loja no ar e do Chromium.

```bash
node tests/e2e/foto-salvar-cedo.mjs
```

A reclamação era "subo a foto e ela não aparece no produto; se eu excluo e subo
a mesma foto de novo, aí aparece — em alguns casos".

Era uma corrida. O envio é assíncrono e o formulário não sabia disso: dava para
clicar em Salvar antes de a URL chegar, o produto gravava sem a imagem, e a
resposta chegava para um formulário já fechado. Repetir funcionava porque o
nome do arquivo é o **hash do conteúdo** — na segunda vez o arquivo já está no
disco, o servidor responde em milissegundos e não dá tempo de perder a corrida.
Daí o "em alguns casos": dependia do tamanho do arquivo e da conexão.

O teste atrasa a resposta do upload em 4 segundos de propósito e tenta salvar no
meio — inclusive por Enter num campo de texto, que também envia o formulário e
escapava do botão desabilitado.

## Categoria nova no ERP — onde ela entra na loja

Precisa da loja no ar.

```bash
npm run teste:categoria-nova    # 22 verificações pela HTTP
```

A lojista cadastra "Incensos" no ERP. A categoria chega, aparece na lista do
painel, e o seletor de amarração **não oferece nada** — porque ele lista o que a
LOJA tem, e a loja não ganhou prateleira nenhuma. Sobravam duas saídas, as duas
ruins: jogar os produtos numa categoria existente, misturando prateleira, ou
rodar o espelhamento, que apaga a árvore inteira por causa de um item.

O teste cobra a terceira: criar a categoria a partir do nome que veio do ERP, no
lugar que a hierarquia do ERP indica — subcategoria dentro da categoria do pai
quando o pai já está amarrado, primeiro nível quando não —, amarrando o código e
soltando na vitrine os produtos que estavam esperando por ele.

Cobra também o **desfazer**, que é o que separa um botão de uma armadilha: a
tela de vitrine não apaga categoria vinda do ERP e nem sequer lista
subcategorias, então sem isso um clique errado deixaria uma prateleira vazia no
menu para sempre. Desfazer é recusado quando há produto dentro ou quando outro
código do ERP aponta para a mesma prateleira.

## Variações — o grupo morre na vitrine

Precisa da loja no ar.

```bash
npm run teste:variacoes    # 43 verificações pela HTTP
```

A loja passou a ter um "produto pai" montado no painel, que junta produtos do
catálogo numa página só com seletor de tamanho ou cor. A promessa feita ao time
do ERP é que **nada disso vaza para a integração**, e é essa promessa que o
teste cobra:

- `GET /products` continua **plano**, uma entrada por variação, e o grupo não
  aparece nele — ele não é produto e não tem SKU;
- `groupCode`, `groupName` e `options` saem como **leitura**; `groupCode`
  enviado pelo ERP é ignorado, com aviso;
- o pedido carrega o SKU da **variação**, e o código do grupo não aparece em
  campo nenhum. É o modo de falha que mais importa: se o código do grupo
  coincidisse com um produto real no ERP, o pedido importaria o produto errado,
  baixaria o estoque errado e emitiria nota errada **sem alerta**;
- produto criado pelo ERP nasce **retido** (não aparece na vitrine), continua
  visível na API do ERP, e atualização nunca volta a reter;
- as três validações duras — mesmo SKU em dois grupos, combinação repetida,
  variação sem valor num eixo — e a garantia de que seis recusas seguidas não
  deixam o grupo pela metade;
- desfazer o grupo devolve os produtos e **não apaga nenhum**; pedido feito
  antes continua inteiro.

## Envia — cotação, etiqueta e rastreio

```bash
npm run teste:envia       # 25 verificações
```

A Envia é a terceira fonte de frete e a primeira que **gasta dinheiro**: emitir
etiqueta debita o frete do saldo da conta. O teste cobra duas famílias de
coisa, e as duas falham caro e em silêncio quando falham:

- **a tradução da resposta.** Preço sai de `totalPrice` e não de `basePrice`
  (que vem sem as taxas, e cobrar o base faria a loja pagar a diferença em toda
  venda); prazo sai de `deliveryDate.dateDifference` e, na falta dele, do MAIOR
  número do texto "3-4 días" — prometer o prazo mínimo é prometer o melhor
  caso; serviço sem preço vira erro, e não uma opção de R$ 0,00.
- **as travas da etiqueta.** Pedido não pago não emite; pedido que já tem
  etiqueta recusa a segunda emissão; sem sessão de painel ninguém gasta o
  saldo.

Verifica também que o par `transportadora|serviço` que a Envia usa **não vaza
para o ERP**: o `shippingServiceCode` sai limpo (`pac`), porque `correios|pac`
não casa com serviço nenhum do lado de lá.

A rede não é tocada — a cotação real depende de um token que a loja ainda não
tem, e teste que depende de internet não roda.

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
