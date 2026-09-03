#!/usr/bin/env python3
"""
Gera o manual de integração Quéops Pirâmides ↔ UNO ERP (PDF).

Todo endpoint, campo e código de erro citado aqui foi lido do código-fonte da
loja (server/src/routes/v1.ts, server/src/auth.ts, server/src/providers.ts,
server/src/store.ts, server/db/schema.sql). O que ainda não existe está marcado
como A CONSTRUIR, em vez de descrito como se existisse — manual que promete
endpoint inexistente custa mais caro que manual nenhum.

    python3 scripts/manual-uno.py
"""

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import (
    BaseDocTemplate, Frame, KeepTogether, NextPageTemplate, PageBreak,
    PageTemplate, Paragraph, Spacer, Table, TableStyle,
)

VERDE = colors.HexColor('#3a5634')
VERDE_ESCURO = colors.HexColor('#2a4125')
COBRE = colors.HexColor('#9c6238')
CINZA = colors.HexColor('#4b5563')
CINZA_CLARO = colors.HexColor('#f3f4f6')
BORDA = colors.HexColor('#d1d5db')
AMBAR = colors.HexColor('#92400e')
AMBAR_FUNDO = colors.HexColor('#fffbeb')

VERSAO = 'Versão 2.4 — 3 de setembro de 2026'
BASE = 'https://queopspiramides.com.br'

ss = getSampleStyleSheet()


def estilo(nome, **kw):
    base = dict(fontName='Helvetica', fontSize=9.5, leading=14, textColor=colors.HexColor('#1f2937'))
    base.update(kw)
    return ParagraphStyle(nome, **base)


P = estilo('corpo', spaceAfter=7)
P_PEQ = estilo('corpo_peq', fontSize=8.5, leading=12.5, textColor=CINZA)
H1 = estilo('h1', fontName='Helvetica-Bold', fontSize=17, leading=21, textColor=VERDE,
            spaceBefore=4, spaceAfter=10)
H2 = estilo('h2', fontName='Helvetica-Bold', fontSize=12, leading=16, textColor=VERDE_ESCURO,
            spaceBefore=12, spaceAfter=6)
H3 = estilo('h3', fontName='Helvetica-Bold', fontSize=10, leading=14, textColor=COBRE,
            spaceBefore=10, spaceAfter=4)
CODIGO = estilo('codigo', fontName='Courier', fontSize=8, leading=11.5,
                textColor=colors.HexColor('#111827'))
CELULA = estilo('celula', fontSize=8.5, leading=12)
CELULA_B = estilo('celula_b', fontName='Helvetica-Bold', fontSize=8.5, leading=12)
CELULA_COD = estilo('celula_cod', fontName='Courier', fontSize=8, leading=11)


def bloco(texto):
    """Bloco de código com fundo e borda."""
    linhas = [Paragraph(l.replace('&', '&amp;').replace('<', '&lt;').replace(' ', '&nbsp;') or '&nbsp;', CODIGO)
              for l in texto.strip('\n').split('\n')]
    t = Table([[l] for l in linhas], colWidths=[165 * mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor('#f8fafc')),
        ('BOX', (0, 0), (-1, -1), 0.5, BORDA),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 1.2),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 1.2),
        ('LINEBEFORE', (0, 0), (0, -1), 2.5, COBRE),
    ]))
    return t


def tabela(cabecalho, linhas, larguras, mono_cols=()):
    dados = [[Paragraph(c, ParagraphStyle('th', parent=CELULA_B, textColor=colors.white))
              for c in cabecalho]]
    for linha in linhas:
        dados.append([
            Paragraph(str(c), CELULA_COD if i in mono_cols else CELULA)
            for i, c in enumerate(linha)
        ])
    t = Table(dados, colWidths=larguras, repeatRows=1)
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), VERDE),
        ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, CINZA_CLARO]),
        ('GRID', (0, 0), (-1, -1), 0.4, BORDA),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 6),
        ('RIGHTPADDING', (0, 0), (-1, -1), 6),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    return t


def aviso(titulo, texto):
    """Caixa de atenção — usada para os pontos que costumam custar tempo."""
    conteudo = [
        Paragraph(f'<b>{titulo}</b>', ParagraphStyle('av_t', parent=CELULA_B, textColor=AMBAR)),
        Spacer(1, 3),
        Paragraph(texto, ParagraphStyle('av', parent=CELULA, textColor=AMBAR)),
    ]
    t = Table([[conteudo]], colWidths=[165 * mm])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), AMBAR_FUNDO),
        ('BOX', (0, 0), (-1, -1), 0.5, colors.HexColor('#fcd34d')),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('RIGHTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 8),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 8),
    ]))
    return t


def endpoint(metodo, caminho, resumo, status='PRONTO'):
    cor = VERDE if status == 'PRONTO' else COBRE
    faixa = Table(
        [[Paragraph(f'<b>{metodo}</b>&nbsp;&nbsp;{caminho}',
                    ParagraphStyle('ep', parent=CELULA_COD, textColor=colors.white, fontSize=9)),
          Paragraph(status, ParagraphStyle('st', parent=CELULA_B, textColor=colors.white,
                                           alignment=2, fontSize=7.5))]],
        colWidths=[135 * mm, 30 * mm],
    )
    faixa.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), cor),
        ('LEFTPADDING', (0, 0), (-1, -1), 8),
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    return [Spacer(1, 8), faixa, Spacer(1, 5), Paragraph(resumo, P)]


# --------------------------------------------------------------- páginas ----

def rodape(canvas, doc):
    canvas.saveState()
    canvas.setFont('Helvetica', 7.5)
    canvas.setFillColor(CINZA)
    canvas.drawString(22 * mm, 12 * mm, 'Quéops Pirâmides ↔ UNO ERP — manual de integração')
    canvas.drawRightString(188 * mm, 12 * mm, f'{doc.page}')
    canvas.setStrokeColor(BORDA)
    canvas.setLineWidth(0.4)
    canvas.line(22 * mm, 15 * mm, 188 * mm, 15 * mm)
    canvas.restoreState()


def capa(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(VERDE)
    canvas.rect(0, 0, A4[0], A4[1], fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor('#f4efe7'))
    canvas.setFont('Helvetica-Bold', 30)
    canvas.drawString(22 * mm, A4[1] - 90 * mm, 'Manual de integração')
    canvas.setFont('Helvetica-Bold', 19)
    canvas.setFillColor(colors.HexColor('#e8c9a8'))
    canvas.drawString(22 * mm, A4[1] - 104 * mm, 'Quéops Pirâmides  ↔  UNO ERP')
    canvas.setStrokeColor(colors.HexColor('#9c6238'))
    canvas.setLineWidth(2)
    canvas.line(22 * mm, A4[1] - 112 * mm, 90 * mm, A4[1] - 112 * mm)
    canvas.setFont('Helvetica', 11)
    canvas.setFillColor(colors.HexColor('#dfe5db'))
    texto = [
        'Documento técnico para a equipe de desenvolvimento do UNO ERP.',
        'Descreve a API pública da loja (v1), os webhooks, o modelo de',
        'sincronização bidirecional e o que ainda precisa ser construído',
        'de cada lado.',
    ]
    y = A4[1] - 126 * mm
    for linha in texto:
        canvas.drawString(22 * mm, y, linha)
        y -= 6 * mm
    canvas.setFont('Helvetica', 9.5)
    canvas.setFillColor(colors.HexColor('#b9c4b4'))
    canvas.drawString(22 * mm, 30 * mm, VERSAO)
    canvas.drawString(22 * mm, 24 * mm, f'Ambiente de produção: {BASE}')
    canvas.restoreState()


def construir(saida='Manual-Integracao-Queops-UNO-ERP.pdf'):
    doc = BaseDocTemplate(
        saida, pagesize=A4,
        leftMargin=22 * mm, rightMargin=22 * mm, topMargin=20 * mm, bottomMargin=20 * mm,
        title='Manual de integração — Quéops Pirâmides ↔ UNO ERP',
        author='Quéops Pirâmides', subject='Integração de e-commerce com ERP',
    )
    quadro = Frame(22 * mm, 20 * mm, 165 * mm, A4[1] - 40 * mm, id='corpo')
    doc.addPageTemplates([
        PageTemplate(id='capa', frames=[quadro], onPage=capa),
        PageTemplate(id='miolo', frames=[quadro], onPage=rodape),
    ])

    s = []          # story
    add = s.append

    add(NextPageTemplate('miolo'))
    add(PageBreak())

    # ------------------------------------------------------ 1. resumo ----
    add(Paragraph('1. O que existe hoje', H1))
    add(Paragraph(
        'A loja é uma aplicação Node/Express com MySQL e expõe uma API REST versionada '
        '(<font face="Courier">/api/v1</font>) mais um mecanismo de webhooks. Leitura e <b>gravação</b> '
        'de produto já funcionam, com a trava por campo que preserva a autonomia do painel — quatro capacidades que a sincronização '
        'bidirecional exige ainda não existem, e estão listadas na seção 7 com o contrato '
        'proposto. Elas são pequenas do lado da loja; o que não dá é descobri-las no meio da '
        'implementação.', P))
    add(Spacer(1, 6))
    add(tabela(
        ['Capacidade', 'Situação', 'Onde'],
        [
            ['Ler catálogo (produtos ativos, preço, estoque, peso)', '<b>Pronto</b>', 'GET /products'],
            ['Ler pedidos com itens, valores e status', '<b>Pronto</b>', 'GET /orders'],
            ['Ler clientes com total gasto', '<b>Pronto</b>', 'GET /customers'],
            ['Atualizar estoque de um produto', '<b>Pronto</b>', 'PATCH /products/:id/stock'],
            ['Mudar status do pedido (faturado, enviado)', '<b>Pronto</b>', 'PATCH /orders/:id'],
            ['Ser avisado de pedido novo por webhook', '<b>Pronto</b>', 'order.created'],
            ['<b>Gravar produto</b> (preço, nome, peso, situação…)', '<b>Pronto</b>', 'PUT /products/:id'],
            ['<b>Criar produto</b> novo pela API', '<b>Pronto</b>', 'PUT /products/:id'],
            ['<b>Enviar até 200 produtos</b> numa chamada', '<b>Pronto</b>', 'POST /products/batch'],
            ['<b>Trava por campo</b>: o que o painel edita o ERP não sobrescreve', '<b>Pronto</b>', 'seção 6'],
            ['Buscar só o que mudou desde X (sincronização incremental)', 'A construir', 'seção 7.1'],
            ['<b>Endereço de entrega e transportadora</b> no pedido', '<b>Pronto</b>', 'GET /orders'],
        ],
        [88 * mm, 27 * mm, 50 * mm],
        mono_cols=(2,),
    ))
    add(Spacer(1, 10))
    add(aviso(
        'A regra de conflito já está implementada — leia a seção 6 antes de codificar',
        '<b>O ERP é a fonte da verdade de preço e estoque</b>, e <b>o painel mantém autonomia</b>. '
        'Os dois requisitos convivem por meio da trava por campo: o que a lojista editar no painel '
        'passa a ser ignorado nos envios do ERP, e a resposta da gravação informa exatamente qual '
        'campo foi recusado (<font face="Courier">ignored</font>). O ERP precisa ler esse campo — '
        'ignorá-lo faz a integração parecer instável, com valores que "não colam".'))

    # ------------------------------------------------- 2. arquitetura ----
    add(PageBreak())
    add(Paragraph('2. Arquitetura e fluxos', H1))
    add(Paragraph(
        'A integração tem dois sentidos, e eles usam caminhos diferentes de propósito: leitura e '
        'escrita partem do UNO (que controla o próprio ciclo de sincronização), e o aviso de '
        'evento parte da loja (que sabe no instante em que o pedido nasce).', P))

    add(Paragraph('2.1 UNO → loja (a cada ciclo de sincronização)', H2))
    add(bloco("""
UNO ERP                                     Loja (queopspiramides.com.br)
   |                                             |
   |  GET  /api/v1/products                      |   catálogo completo
   |-------------------------------------------->|
   |  PATCH /api/v1/products/{id}/stock          |   estoque autoritativo
   |-------------------------------------------->|
   |  PUT  /api/v1/products/{id}                  |   preço / nome / ativo
   |-------------------------------------------->|
   |  GET  /api/v1/orders?status=paid&since=...  |   pedidos a faturar
   |-------------------------------------------->|
   |  PATCH /api/v1/orders/{id}                  |   status: shipped
   |-------------------------------------------->|
"""))
    add(Paragraph('2.2 Loja → UNO (no instante do evento)', H2))
    add(bloco("""
Loja                                        UNO ERP
   |  POST <url cadastrada no painel>            |
   |  X-Queops-Event: order.created              |
   |-------------------------------------------->|   pedido novo, já pago
   |                                             |
   |  X-Queops-Event: order.status_changed       |
   |-------------------------------------------->|   mudança de status
"""))
    add(Paragraph(
        'O webhook é o gatilho, não a fonte: o corpo enviado é enxuto (seção 5) e o UNO deve '
        'buscar o pedido completo em <font face="Courier">GET /api/v1/orders/{id}</font> antes de '
        'faturar. Esse desenho é deliberado — é o mesmo princípio que a loja aplica com o Mercado '
        'Pago, onde o aviso diz apenas "algo mudou" e o valor verdadeiro vem sempre de uma '
        'consulta autenticada.', P))

    add(Paragraph('2.3 Cadência recomendada', H2))
    add(tabela(
        ['Sincronização', 'Frequência', 'Chamada'],
        [
            ['Estoque (ERP → loja)', 'a cada 5–15 min, ou por evento de movimentação',
             'PATCH /products/:id/stock'],
            ['Preço (ERP → loja)', '1× por dia, ou quando a tabela mudar', 'PUT /products/:id · /batch'],
            ['Pedidos a faturar (loja → ERP)', 'webhook + varredura de segurança a cada 30 min',
             'GET /orders?status=paid&amp;since='],
            ['Catálogo completo', '1× por dia (conferência)', 'GET /products'],
        ],
        [46 * mm, 62 * mm, 57 * mm],
        mono_cols=(2,),
    ))
    add(Spacer(1, 8))
    add(Paragraph(
        'A varredura de segurança existe porque o webhook da loja é disparado uma única vez, sem '
        'repetição automática (seção 5.3). Um ERP que confie apenas no webhook perde o pedido cujo '
        'aviso falhou — e perder pedido pago é o pior defeito possível numa integração de ERP.', P))

    # ------------------------------------------------ 3. autenticação ----
    add(PageBreak())
    add(Paragraph('3. Autenticação', H1))
    add(Paragraph(
        'Toda chamada a <font face="Courier">/api/v1</font> exige uma chave gerada no painel da '
        'loja, em <b>Integrações → API</b>. Não há cookie nem token CSRF: é comunicação '
        'servidor-a-servidor.', P))
    add(bloco("""
Authorization: Bearer qp_live_3f8a2c...            # 8 + 40 caracteres hexadecimais
Content-Type: application/json                     # nas chamadas com corpo
"""))
    add(Paragraph('3.1 Ciclo de vida da chave', H2))
    add(tabela(
        ['Característica', 'Comportamento'],
        [
            ['Formato', 'qp_live_ + 40 hex (20 bytes aleatórios)'],
            ['Exibição', 'A chave inteira aparece <b>uma única vez</b>, na criação. Guarde no cofre do UNO.'],
            ['Armazenamento na loja', 'Somente o hash (bcrypt). O prefixo de 16 caracteres é indexado para a busca.'],
            ['Revogação', 'Imediata, pelo painel. Chamadas seguintes recebem 401.'],
            ['Auditoria', 'A loja grava <font face="Courier">last_used_at</font> a cada chamada válida.'],
            ['Escopos', 'Não há: a chave dá acesso a todos os endpoints v1. Uma chave por integração.'],
        ],
        [42 * mm, 123 * mm],
    ))
    add(Spacer(1, 8))
    add(Paragraph('3.2 Teste de credencial', H2))
    add(bloco("""
curl -s https://queopspiramides.com.br/api/v1/products \\
     -H "Authorization: Bearer qp_live_SEU_TOKEN" | head -c 300

# 200 → {"products":[{"id":"...","sku":"...","name":"...", ...}]}
# 401 → {"error":{"code":"invalid_api_key","message":"Envie uma chave válida ..."}}
"""))

    # -------------------------------------------------- 4. endpoints ----
    add(PageBreak())
    add(Paragraph('4. Endpoints disponíveis', H1))
    add(Paragraph(
        f'Base: <font face="Courier">{BASE}/api/v1</font>. Todas as respostas são JSON. '
        'Valores monetários vêm como número em reais (não centavos), com duas casas.', P))

    add(Paragraph('4.1 Categorias: código no ERP, slug na loja', H2))
    add(Paragraph(
        'Os dois sistemas identificam categoria de formas diferentes, e os dois têm razão para '
        'isso. O ERP usa <b>código</b>, porque nome muda. A loja usa <b>slug</b>, porque ele está '
        'na URL pública (<font face="Courier">/?categoria=piramides</font>) e no sitemap já '
        'entregue ao Google — trocá-lo por <font face="Courier">/?categoria=0012</font> quebraria '
        'o que está indexado, para resolver um problema que é de integração.', P))
    add(Paragraph(
        'Então os dois convivem: o ERP manda a lista dele, alguém diz na loja onde cada código '
        'entra, e a partir daí produto vai e volta por código.', P))

    for parte in endpoint('PUT', '/categories', 'Carga das categorias do ERP. Absoluta e idempotente: mande a lista inteira a cada ciclo.'):
        add(parte)
    add(bloco("""
PUT /api/v1/categories
{ "categories": [
    { "code": "0001", "name": "Pirâmides" },
    { "code": "0004", "name": "Pulseiras", "parentCode": "0003" },
    { "code": "0005", "name": "Uso Interno", "active": false } ] }

200 -> { "ok": true, "recebidas": 3, "criadas": 3, "atualizadas": 0,
         "pendentes": 3, "warnings": [],
         "message": "3 categoria(s) ainda sem destino na loja..." }
422 -> invalid_batch (sem lista) | batch_too_large (mais de 2000)
"""))
    add(Paragraph(
        'Item inválido não derruba o lote: ele vai para '
        '<font face="Courier">warnings</font> e os outros são gravados. A carga <b>não apaga</b> o '
        'que sumiu do lote — uma carga truncada por timeout apagaria categorias vivas e, com elas, '
        'a amarração feita à mão. Para aposentar uma categoria, mande '
        '<font face="Courier">active: false</font>.', P))
    add(Spacer(1, 6))
    add(aviso(
        'A amarração é MANUAL, e é ela que libera o produto na vitrine',
        'A loja não casa categoria por nome. Casar "Cristais" do ERP com "cristais" da loja parece '
        'óbvio, mas o mesmo palpite erra em "Pulseiras" quando existem duas, e o resultado é '
        'produto na seção errada da vitrine sem erro nenhum aparecer.<br/><br/>'
        'Enquanto um código estiver pendente, produto enviado com ele é <b>aceito e gravado</b> — '
        'a integração não trava —, mas fica <b>sem categoria e fora da vitrine</b>, e a resposta '
        'do PUT do produto diz isso em <font face="Courier">warnings</font>. Depois que o dono da '
        'loja amarrar (Painel → Categorias do ERP), <b>reenvie o produto</b>: a amarração vale '
        'para as próximas gravações, ela não sai procurando produtos antigos.<br/><br/>'
        '<font face="Courier">GET /categories</font> mostra o que está pendente e quantos produtos '
        'estão parados por isso — dá para monitorar sem depender de alguém avisar.'))

    for parte in endpoint('GET', '/categories', 'A árvore da loja com os códigos amarrados, mais a lista do ERP com o estado de cada um.'):
        add(parte)
    add(bloco("""
200 -> {
  "categories": [                        // a árvore da LOJA
    { "id": "acessorios", "name": "Acessórios", "erpCode": "0003",
      "subcategories": [
        { "id": "pulseiras", "name": "Pulseiras", "erpCode": "0004" } ] } ],
  "erpCategories": [                     // o que o ERP mandou
    { "code": "0004", "name": "Pulseiras", "parentCode": "0003",
      "active": true, "category": "acessorios",
      "subcategory": "pulseiras", "linked": true } ],
  "pending": 2,                          // ativas ainda sem destino
  "productsWithoutCategory": 7           // produtos parados por isso
}
"""))

    for parte in endpoint('PUT', '/categories/{code}/link', 'Amarra pela API, para quem já tem a correspondência pronta e não quer clicar.'):
        add(parte)
    add(bloco("""
PUT /api/v1/categories/0004/link
{ "category": "acessorios", "subcategory": "pulseiras" }

200 -> { "ok": true }
422 -> invalid_link   // slug inexistente, ou subcategoria que não é dessa categoria
"""))
    add(Paragraph(
        '<font face="Courier">{"category": null}</font> desamarra. Esta rota existe por '
        'conveniência; <b>o ciclo de sincronização não deve chamá-la</b> — se o ERP amarrasse '
        'sozinho, a decisão manual perderia o sentido.', P))

    add(PageBreak())
    add(Paragraph('4.2 Produtos', H2))

    for parte in endpoint('GET', '/products', 'Catálogo completo, <b>apenas produtos ativos</b>, ordenados por posição e nome. Sem paginação: hoje devolve tudo numa resposta só.'):
        add(parte)
    add(bloco("""
{
  "products": [
    {
      "id": "piramide-cobre-15cm-1001",     // chave natural, usada em todos os endpoints
      "sku": "PIR-CO-15",                   // código interno; pode casar com o do ERP
      "name": "Pirâmide de Cobre 15cm",
      "category": "piramides",              // slug da loja (está na URL pública)
      "categoryCode": "0001",               // código no ERP, ou null se não amarrado
      "subcategory": "cobre",               // opcional
      "categoryLabel": "Pirâmides",
      "description": "texto curto",
      "longDescription": "texto completo",  // opcional
      "price": 189.9,
      "oldPrice": 219.9,                    // opcional (preço "de")
      "stock": 12,                          // número; aceita fração (12.5)
      "image": "/produtos/piramide-cobre-15cm.jpg",
      "weight": 1.2,                        // número, em QUILOS
      "weightLabel": "Base 15cm · cobre",   // só texto de vitrine; não é peso
      "tag": "mais vendido",                // opcional
      "highlight": true,                    // opcional
      "active": true
    }
  ]
}
"""))
    add(Spacer(1, 6))
    add(aviso(
        'MUDOU NA 2.3: weight é número em quilos, e stock aceita fração',
        'Até a versão 2.2, <font face="Courier">weight</font> era texto livre ("1,2 kg") e '
        '<font face="Courier">stock</font> recusava decimais. Os dois estavam errados, e a mudança '
        '<b>quebra quem lia weight como string</b>.<br/><br/>'
        '<b>weight</b> agora é número, em <b>QUILOS</b> — 0.2 são duzentos gramas. Enviar gramas '
        'por engano multiplica o frete por mil; a loja não recusa (peça de 150 kg existe), mas '
        'devolve aviso em <font face="Courier">warnings</font> com a conta feita. Texto com unidade '
        '("0,2kg") ainda é aceito, convertido e avisado — não conte com isso para sempre.<br/><br/>'
        '<b>weightLabel</b> é o antigo conteúdo de texto: medida da peça, exibida na vitrine. Não '
        'entra em cálculo nenhum. O ERP pode ignorá-lo.<br/><br/>'
        '<b>stock</b> aceita decimal, até 3 casas. Antes, 7,5 era recusado com 422; agora atravessa '
        'inteiro nos dois sentidos. Acima de 3 casas, arredonda e avisa.'))
    add(Spacer(1, 6))
    add(aviso(
        'Sem peso, o frete é cotado com 500 g por item',
        'Peso ausente ou zero não dá erro: a cotação usa 500 g. Isso mantém a loja vendendo quando '
        'falta cadastro, e é a razão de o campo não ser obrigatório — mas para uma peça de 3 kg o '
        'frete cobrado do cliente sai bem abaixo do custo, e a diferença sai do bolso da loja sem '
        'aparecer em relatório nenhum. <b>Se o UNO é a fonte do peso, mandar peso é o que evita '
        'esse prejuízo.</b>'))

    for parte in endpoint('GET', '/products/{id}', 'Um produto. Diferente da listagem, este endpoint devolve o produto <b>mesmo inativo</b> — útil para o ERP conferir um item que saiu da vitrine.'):
        add(parte)
    add(bloco("""
200 → { "product": { ...mesmos campos da listagem... } }
404 → { "error": { "code": "not_found", "message": "Produto não encontrado." } }
"""))

    add(PageBreak())
    for parte in endpoint('PUT', '/products/{id}', 'Grava o produto: cria se não existir, atualiza se existir. <b>Aceita o mesmo formato da leitura</b> — o ERP pode ler um item, mudar um campo e devolver o objeto inteiro.'):
        add(parte)
    add(Paragraph(
        'Só os campos presentes no corpo são tocados. Mandar '
        '<font face="Courier">{"price": 199.9}</font> muda o preço e não zera o resto, o que '
        'permite ao ERP enviar apenas aquilo que ele controla.', P))
    add(bloco("""
PUT /api/v1/products/piramide-cobre-15cm-1001
{ "sku": "PIR-CO-15", "name": "Pirâmide de Cobre 15cm", "price": 199.9,
  "oldPrice": 229.9, "stock": 12.5, "weight": 1.2,
  "categoryCode": "0001", "active": true }

200 (ou 201 quando cria) →
{ "id": "piramide-cobre-15cm-1001",
  "ok": true,
  "criado": false,
  "applied": ["sku","name","price","oldPrice","stock","weight","category",...],
  "ignored": [ { "field": "price", "reason": "locked_in_panel" } ],
  "warnings": [ "campo \\"preco\\" não é gravável e foi ignorado" ] }
"""))
    add(Spacer(1, 4))
    add(tabela(
        ['Campo da resposta', 'O que significa e o que fazer'],
        [
            ['applied', 'Campos gravados. Confira aqui, não no código HTTP.'],
            ['ignored', 'Campos recusados por trava do painel (seção 6). Registre a divergência; '
                        'reenviar não resolve.'],
            ['warnings', 'Gravou, mas algo merece atenção: campo com nome errado, peso não '
                         'reconhecido, categoria inexistente. <b>Trate como erro no seu lado</b> — '
                         'cada aviso aqui é um dado que não chegou como você esperava.'],
            ['criado', 'true quando o produto não existia. Útil para conciliar cadastro.'],
        ],
        [30 * mm, 135 * mm],
        mono_cols=(0,),
    ))
    add(Spacer(1, 6))
    add(aviso(
        'Campo com nome errado não dá erro — dá aviso',
        'Enviar <font face="Courier">"preco"</font> em vez de <font face="Courier">"price"</font> '
        'devolve <b>200</b> com o aviso "campo não é gravável e foi ignorado", e o preço não muda. '
        'Foi uma escolha: recusar a requisição inteira por um campo extra quebraria integrações a '
        'cada campo novo que o ERP passasse a enviar. Em troca, <b>o ERP precisa ler '
        '<font face="Courier">warnings</font></b> — senão um erro de digitação vira preço '
        'desatualizado que ninguém percebe.'))

    add(PageBreak())
    for parte in endpoint('POST', '/products/batch', 'Até 200 produtos numa chamada. Um item inválido não derruba os outros.'):
        add(parte)
    add(bloco("""
POST /api/v1/products/batch
{ "products": [ { "id": "...", "name": "...", "price": 25, "stock": 4.5 },
                { "id": "...", "price": 30 } ] }

200 → { "total": 2, "gravados": 2, "falhas": 0,
        "results": [ { "id": "...", "ok": true,  "applied": [...] },
                     { "id": "...", "ok": false, "error": { "code": "invalid_field",
                                                            "message": "..." } } ] }
422 → batch_too_large (mais de 200) · invalid_batch (lista ausente ou vazia)
"""))
    add(Paragraph(
        'A resposta é sempre 200 quando o lote foi entendido, mesmo com item recusado — '
        '<font face="Courier">falhas</font> e o <font face="Courier">results</font> de cada item '
        'contam o que aconteceu. Abortar o lote inteiro por causa de um produto faria o ERP '
        'reenviar 199 gravações que já tinham dado certo, e a repetição esconderia qual era o item '
        'ruim. Para 1.400 itens: 7 chamadas.', P))

    add(PageBreak())
    for parte in endpoint('PATCH', '/products/{id}/stock', 'Atalho para sincronizar só o estoque. Passa pela mesma regra de travas.'):
        add(parte)
    add(bloco("""
PATCH /api/v1/products/piramide-cobre-15cm-1001/stock
{ "stock": 7 }

200 → { "ok": true, "id": "piramide-cobre-15cm-1001", "stock": 7.5 }
422 → { "error": { "code": "invalid_stock", ... } }   // negativo ou não numérico
404 → { "error": { "code": "not_found", ... } }
"""))
    add(bloco("""
PATCH /api/v1/products/piramide-cobre-15cm-1001/stock
{ "stock": 7.5 }

200 → { "ok": true, "id": "...", "stock": 7.5, "applied": ["stock"],
        "ignored": [], "warnings": [] }
404 → not_found      # este endpoint NÃO cria produto; use PUT para isso
"""))
    add(Paragraph(
        'O valor é absoluto, não incremental: mande o saldo, nunca a variação. Isso torna a chamada '
        'idempotente por natureza — repetir a mesma requisição não muda o resultado, o que importa '
        'quando a rede cai no meio de um ciclo. Se o estoque estiver travado no painel, vem em '
        '<font face="Courier">ignored</font> e o saldo não muda.', P))

    for parte in endpoint('GET', '/orders', 'Pedidos, do mais recente para o mais antigo, com os itens embutidos.'):
        add(parte)
    add(tabela(
        ['Parâmetro', 'Valores', 'Observação'],
        [
            ['status', 'pending · paid · shipped · delivered · canceled',
             'Valor fora da lista é ignorado (não dá erro)'],
            ['since', 'data ISO 8601 — ex.: 2026-08-01T00:00:00Z',
             'Compara com a criação, no fuso de São Paulo'],
        ],
        [24 * mm, 76 * mm, 65 * mm],
        mono_cols=(0,),
    ))
    add(Spacer(1, 6))
    add(bloco("""
GET /api/v1/orders?status=paid&since=2026-08-01T00:00:00Z

{
  "orders": [
    {
      "id": "QP-000142",                    // número do pedido na loja
      "createdAt": "2026-08-30T18:22:41.000Z",
      "customerName": "Maria Oliveira",
      "customerEmail": "maria@exemplo.com",
      "customerPhone": "(11) 98888-7777",
      "customerCpf": "123.456.789-09",       // para NF-e; "" se não informado
      "items": [
        { "productId": "piramide-cobre-15cm-1001",
          "name": "Pirâmide de Cobre 15cm",  // nome no momento da venda
          "quantity": 2,
          "unitPrice": 189.9 }               // preço no momento da venda
      ],
      "subtotal": 379.8,
      "shipping": 26.63,
      "discount": 18.99,
      "total": 387.44,
      "couponCode": "BEMVINDO10",            // ou null
      "status": "paid",
      "payment": "pix",                      // "pix" | "card"
      "channel": "site",
      "shippingAddress": {                   // para nota fiscal e etiqueta
        "cep": "44823-478", "street": "Rua das Flores", "number": "250",
        "complement": "Apto 42", "neighborhood": "Centro",
        "city": "Jacobina", "state": "BA"
      },
      "shippingService": "Jadlog · .Package — até 5 dias úteis",
      "deliveryEta": "2026-09-08",           // ou null
      "trackingCode": "",                    // preenchido pelo painel ou pelo ERP
      "trackingStatus": ""
    }
  ]
}
"""))
    add(Spacer(1, 6))
    add(aviso(
        'Limite de 200 pedidos e ausência de paginação',
        'A resposta é cortada em <b>200 pedidos</b>, sem cursor. Enquanto o volume diário estiver '
        'abaixo disso, sincronizar com <font face="Courier">since</font> a cada 30 minutos resolve. '
        'Acima disso, um ciclo pode perder pedido em silêncio — a seção 7.2 propõe a paginação.'))
    add(Spacer(1, 6))
    add(aviso(
        'O endereço é "shippingAddress", e não "shipping"',
        'A versão 2.0 deste manual propunha o objeto sob o nome '
        '<font face="Courier">shipping</font>. Ele foi implementado como '
        '<font face="Courier">shippingAddress</font> por um motivo: '
        '<font face="Courier">shipping</font> já existe nesta resposta como o <b>valor</b> do frete '
        '(número), e trocar o tipo de um campo publicado quebraria quem já consome a API. '
        'Um campo novo custa uma linha de documentação; um campo que muda de número para objeto '
        'custa uma integração parada. <b>Nenhum campo antigo mudou nesta versão.</b>'))

    add(PageBreak())
    for parte in endpoint('GET', '/orders/{id}', 'Um pedido com seus itens. É a chamada que o UNO deve fazer ao receber um webhook.'):
        add(parte)
    add(bloco("""
200 → { "order": { ...mesma estrutura da listagem... } }
404 → { "error": { "code": "not_found", "message": "Pedido não encontrado." } }
"""))

    for parte in endpoint('PATCH', '/orders/{id}', 'Muda o status do pedido. É por aqui que o ERP confirma faturamento e expedição.'):
        add(parte)
    add(bloco("""
PATCH /api/v1/orders/QP-000142
{ "status": "shipped" }

200 → { "ok": true }
422 → { "error": { "code": "invalid_status", "message": "Status inválido." } }
404 → { "error": { "code": "not_found", ... } }
"""))
    add(Paragraph(
        'Esta chamada <b>dispara o webhook</b> <font face="Courier">order.status_changed</font> para '
        'todas as URLs cadastradas. Se o próprio UNO estiver inscrito nesse evento, ele receberá o '
        'aviso da mudança que ele mesmo fez — trate como eco e ignore, ou o ciclo se realimenta.', P))
    add(Spacer(1, 6))
    add(tabela(
        ['Status', 'Significado na loja', 'Efeito'],
        [
            ['pending', 'Pedido criado; pagamento não confirmado (Pix emitido, cartão em análise)',
             'Estoque já reservado'],
            ['paid', 'Pagamento confirmado pelo provedor', 'Liberado para faturar'],
            ['shipped', 'Despachado', 'Nenhum'],
            ['delivered', 'Entregue', 'Nenhum'],
            ['canceled', 'Cancelado ou pagamento recusado', 'Estoque devolvido (uma única vez)'],
        ],
        [24 * mm, 95 * mm, 46 * mm],
        mono_cols=(0,),
    ))
    add(Spacer(1, 8))
    add(aviso(
        'Não use PATCH para cancelar pedido pago',
        'Mudar o status para <font face="Courier">canceled</font> por esta rota <b>não</b> devolve '
        'estoque nem estorna cobrança — ela só grava o status. O cancelamento com devolução de '
        'estoque acontece no fluxo de pagamento da loja. Cancelamento originado no ERP deve, por '
        'ora, ser combinado por fora; a seção 7.6 propõe o endpoint que faz a coisa completa.'))

    for parte in endpoint('GET', '/customers', 'Clientes com contagem de pedidos e total gasto. Limite de 500, sem paginação.'):
        add(parte)
    add(bloco("""
{
  "customers": [
    { "id": "42", "name": "Maria Oliveira", "email": "maria@exemplo.com",
      "phone": "(11) 98888-7777", "ordersCount": 3, "totalSpent": 1204.7,
      "createdAt": "2026-05-11T14:02:00.000Z" }
  ]
}
"""))
    add(Paragraph(
        '<font face="Courier">totalSpent</font> soma os pedidos não cancelados.', P))
    add(Spacer(1, 4))
    add(aviso(
        'CPF: liberado no pedido, não nesta listagem',
        'A partir da versão 2.2 o CPF do comprador sai em '
        '<font face="Courier">customerCpf</font> no <b>pedido</b> (seção 4.5), liberado a pedido do '
        'dono da loja para o UNO emitir NF-e ao consumidor. Aqui em '
        '<font face="Courier">/customers</font> ele <b>não</b> sai: nota se emite contra a venda, '
        'não contra o cadastro. Vem vazio (<font face="Courier">""</font>) quando o comprador não '
        'informou — nesse caso a nota é sem identificação do destinatário, e o UNO não deve tratar '
        'a ausência como erro de integração. <b>Consequência prática:</b> a chave da API v1 agora '
        'dá acesso a CPF de cliente. Quem tem a chave tem os CPFs — ela pertence ao cofre de '
        'credenciais do UNO, não a arquivo de configuração compartilhado nem a repositório, e o '
        'corpo destas respostas não deve ir para log.'))

    # ---------------------------------------------------- 5. webhooks ----
    add(PageBreak())
    add(Paragraph('5. Webhooks da loja', H1))
    add(Paragraph(
        'Cadastro em <b>Painel → Integrações → Webhooks</b>: uma URL por evento. A loja envia '
        'POST com JSON e o header <font face="Courier">X-Queops-Event</font>.', P))

    add(Paragraph('5.1 order.created', H2))
    add(bloco("""
POST <sua URL>
X-Queops-Event: order.created

{ "orderId": "QP-000142", "total": 387.44,
  "email": "maria@exemplo.com", "status": "aprovado" }
"""))
    add(aviso(
        'Atenção ao vocabulário de status deste evento',
        'Aqui <font face="Courier">status</font> traz o resultado da <b>cobrança</b> '
        '("aprovado" ou "aguardando"), e não o status do pedido ("paid", "pending") usado em todo o '
        'resto da API. São dois vocabulários no mesmo nome de campo — uma inconsistência da loja, '
        'já registrada para correção. Até lá: não compare este campo com os status da seção 4; '
        'busque o pedido em <font face="Courier">GET /orders/{id}</font> e use o status de lá.'))

    add(Paragraph('5.2 order.status_changed', H2))
    add(bloco("""
X-Queops-Event: order.status_changed

# quando a mudança vem do fluxo de pagamento:
{ "orderId": "QP-000142", "status": "paid", "detalhe": "accredited" }

# quando vem de PATCH /api/v1/orders/{id}:
{ "orderId": "QP-000142", "status": "shipped" }
"""))
    add(Paragraph(
        'O campo <font face="Courier">detalhe</font> existe só no primeiro caso. Trate-o como '
        'opcional.', P))

    add(Paragraph('5.3 Entrega: o que a loja garante e o que não garante', H2))
    add(tabela(
        ['Aspecto', 'Hoje'],
        [
            ['Tentativas', '<b>Uma só.</b> Sem repetição automática, sem fila.'],
            ['Timeout', '5 segundos. Responda rápido e processe depois.'],
            ['Resposta esperada', 'Qualquer 2xx. A loja não lê o corpo.'],
            ['Assinatura', '<b>Não há.</b> Não é possível provar que o POST veio da loja.'],
            ['Ordem', 'Não garantida: dois eventos próximos podem chegar fora de ordem.'],
            ['Duplicidade', 'Possível. Trate <font face="Courier">orderId</font> + status como idempotente.'],
        ],
        [40 * mm, 125 * mm],
    ))
    add(Spacer(1, 8))
    add(aviso(
        'Consequência prática para o UNO',
        'Enquanto não houver assinatura e repetição (seção 7.7), o webhook deve ser tratado como '
        '<b>dica</b>, não como verdade: ao recebê-lo, busque o pedido pela API antes de faturar. E '
        'mantenha a varredura periódica com <font face="Courier">since</font> — é ela que recupera '
        'o aviso que se perdeu. Nunca aceite o corpo do webhook como ordem de faturamento: sem '
        'assinatura, qualquer pessoa que descubra a URL pode enviar um.'))

    # -------------------------------------------- 6. fonte da verdade ----
    add(PageBreak())
    add(Paragraph('6. Fonte da verdade: ERP manda, painel mantém autonomia', H1))
    add(Paragraph(
        'A regra do cliente é clara e, tomada ao pé da letra, contraditória: <b>preço e estoque vêm '
        'do ERP</b>, mas <b>o painel precisa poder alterar quando necessário</b>. Sem um mecanismo '
        'explícito, o que acontece é o pior dos dois mundos — a lojista corrige um preço, o próximo '
        'ciclo do ERP o sobrescreve, e a conclusão natural é "o site está com defeito".', P))

    add(Paragraph('6.1 Como funciona a trava por campo (implementado)', H2))
    add(Paragraph(
        'Cada produto tem uma lista de campos travados. Quando alguém salva uma alteração no '
        'painel, <b>os campos que mudaram de valor</b> entram nessa lista e passam a ignorar o ERP. '
        'A comparação é por valor, não por presença: o painel envia o produto inteiro a cada '
        'salvamento, então tratar tudo como edição travaria o cadastro completo no primeiro clique '
        '— e o ERP nunca mais atualizaria nada.', P))
    add(bloco("""
# 1. a lojista muda o preço no painel: 189,90 → 149,90
#    → o campo "price" é travado automaticamente

# 2. o ERP manda preço e estoque no ciclo seguinte
PUT /api/v1/products/piramide-cobre-15cm-1001
{ "price": 210, "stock": 40 }

200 → { "applied": ["stock"],
        "ignored": [ { "field": "price", "reason": "locked_in_panel" } ] }

# 3. estado real: preço 149,90 (do painel) e estoque 40 (do ERP)

# 4. quando a promoção acabar, o painel solta a trava e o ERP volta a mandar:
#    Painel → Produtos → (produto) → "voltar a seguir o ERP"

# o produto também informa as travas na leitura, para o ERP saber antes:
GET /api/v1/products/{id} → { "product": { ..., "lockedFields": ["price"] } }
"""))
    add(Paragraph(
        'O ponto crítico do contrato: campo travado devolve <b>200 com o campo em '
        '<font face="Courier">ignored</font></b>, e não erro. Recusar a requisição inteira faria o '
        'ERP repetir para sempre um envio que nunca vai passar; devolver 200 mudo faria o ERP '
        'acreditar que aplicou. A terceira via — aceitar o que dá e relatar o que não deu — é a '
        'única que permite ao UNO registrar a divergência e seguir. <b>Do lado do UNO, isso precisa '
        'virar log ou alerta</b>: divergência silenciosa entre ERP e loja é o defeito que aparece '
        'no faturamento, semanas depois.', P))

    add(Paragraph('6.2 Matriz de responsabilidade sugerida', H2))
    add(tabela(
        ['Campo', 'Dono', 'Observação'],
        [
            ['stock', 'ERP', 'Absoluto, a cada ciclo. Aceita fração. Travável no painel.'],
            ['categoryCode', 'ERP', 'Código da categoria no ERP. Precisa estar amarrado (seção 4.1).'],
            ['category', 'Loja', 'Slug — está na URL pública. O ERP lê, mas manda categoryCode.'],
            ['price / oldPrice', 'ERP', 'Travável para promoção pontual da loja.'],
            ['sku', 'ERP', 'Chave de conciliação; a loja não deve alterar.'],
            ['name / description', 'ERP com sobrescrita', 'A loja costuma preferir o texto de vitrine ao do ERP.'],
            ['weight', 'ERP', 'Número, em quilos. Alimenta o frete; vazio custa dinheiro (seção 4).'],
            ['weightLabel', 'Painel', 'Medida exibida na vitrine. O ERP pode ignorar.'],
            ['image / longDescription / tag / highlight', 'Loja', 'Conteúdo de vitrine; o ERP não deve enviar.'],
            ['active', 'ERP com sobrescrita', 'ERP inativa por descontinuação; loja, por curadoria.'],
            ['status do pedido', 'Compartilhado', 'Loja até paid; ERP de paid em diante.'],
        ],
        [50 * mm, 33 * mm, 82 * mm],
        mono_cols=(0,),
    ))

    # ----------------------------------------------- 7. a construir ----
    add(PageBreak())
    add(Paragraph('7. O que precisa ser construído', H1))
    add(Paragraph(
        'Itens do lado da <b>loja</b>, com o contrato proposto para o UNO já poder programar '
        'contra ele. Nenhum depende do outro; podem ser feitos na ordem que a integração exigir.', P))

    add(Paragraph('7.1 Sincronização incremental do catálogo', H3))
    add(Paragraph(
        'Com ~1.400 itens, baixar o catálogo inteiro a cada ciclo é desperdício dos dois lados. '
        'Hoje a leitura não filtra por data e a listagem traz só produtos ativos.', P))
    add(bloco("""
GET /api/v1/products?since=2026-08-30T00:00:00Z&includeInactive=1
"""))
    add(Paragraph('7.2 Paginação em /orders e /customers', H3))
    add(Paragraph(
        'Hoje o corte é 200 pedidos e 500 clientes, sem cursor — acima disso um ciclo perde '
        'registro em silêncio.', P))
    add(bloco("""
GET /api/v1/orders?limit=100&cursor=<opaco>
→ { "orders": [...], "nextCursor": "..." }      # ausente na última página
"""))
    add(Paragraph('7.3 Cancelamento completo a partir do ERP', H3))
    add(Paragraph(
        'Mudar o status para <font face="Courier">canceled</font> pela rota atual só grava o status: '
        'não devolve estoque nem estorna. O endpoint abaixo faria a coisa completa.', P))
    add(bloco("""
POST /api/v1/orders/{id}/cancel
{ "reason": "ruptura de estoque" }
→ devolve estoque (uma única vez) e registra o motivo
"""))
    add(Paragraph('7.4 Assinatura e repetição dos webhooks', H3))
    add(Paragraph(
        'Assinatura HMAC-SHA256 do corpo com segredo compartilhado, no padrão que a loja já usa '
        'para o Mercado Pago, mais três tentativas com espera crescente.', P))
    add(bloco("""
X-Queops-Event: order.created
X-Queops-Signature: t=1787061681,v1=<hmac_sha256(segredo, "t.corpo")>
"""))

    # ------------------------------------------------------ 8. erros ----
    add(PageBreak())
    add(Paragraph('8. Erros', H1))
    add(Paragraph(
        'Todo erro sai no mesmo formato, e o <font face="Courier">code</font> é estável — trate por '
        'ele, nunca pela mensagem, que é escrita para gente e muda.', P))
    add(bloco("""
{ "error": { "code": "invalid_stock", "message": "Informe \\"stock\\" como um inteiro não negativo." } }
"""))
    add(Spacer(1, 6))
    add(tabela(
        ['HTTP', 'code', 'Quando acontece', 'O que o UNO deve fazer'],
        [
            ['401', 'invalid_api_key', 'Chave ausente, errada ou revogada', 'Parar o ciclo e alertar; não repetir'],
            ['404', 'not_found', 'Produto ou pedido inexistente', 'Registrar divergência de cadastro'],
            ['422', 'invalid_stock', 'stock negativo ou não inteiro', 'Corrigir o dado na origem'],
            ['422', 'invalid_status', 'Status fora da lista permitida', 'Corrigir o mapeamento'],
            ['422', 'invalid_field', 'Valor recusado na gravação (preço negativo, nome vazio…)',
             'Corrigir o dado; a mensagem nomeia o campo'],
            ['422', 'missing_name', 'Produto novo sem "name"', 'Enviar o nome, ou conferir o id'],
            ['422', 'invalid_batch', 'Lote sem "products" ou vazio', 'Corrigir o corpo'],
            ['422', 'batch_too_large', 'Mais de 200 produtos no lote', 'Dividir em lotes de 200'],
            ['500', 'schema_outdated', 'Banco da loja desatualizado após um deploy',
             'Avisar o responsável: falta rodar a migração'],
            ['500', 'internal_error', 'Falha inesperada', 'Repetir com espera crescente'],
            ['503', 'db_unavailable', 'Banco fora do ar', 'Repetir com espera crescente'],
        ],
        [15 * mm, 33 * mm, 60 * mm, 57 * mm],
        mono_cols=(1,),
    ))
    add(Spacer(1, 8))
    add(Paragraph(
        'Não há limite de requisições (<i>rate limit</i>) nos endpoints v1 hoje. Isso não é convite: '
        'a loja e a API dividem o mesmo processo Node, então um laço agressivo do ERP degrada a '
        'vitrine para os clientes. Cadencie do lado do UNO.', P))

    # ------------------------------------------------- 9. checklist ----
    add(PageBreak())
    add(Paragraph('9. Checklist de homologação', H1))
    add(Paragraph(
        'Sequência mínima para considerar a integração aprovada. Cada passo é verificável e tem um '
        'resultado esperado — se algum falhar, o problema está antes, não depois.', P))
    add(Spacer(1, 4))
    add(tabela(
        ['#', 'Passo', 'Resultado esperado'],
        [
            ['1', 'Gerar a chave no painel e guardá-la no cofre do UNO',
             'A chave aparece uma única vez'],
            ['2', 'GET /products com a chave', '200 e o catálogo; 401 sem a chave'],
            ['3', 'PATCH /products/{id}/stock com um valor conhecido',
             'O painel mostra o novo estoque na hora'],
            ['4', 'PATCH com stock negativo', '422 invalid_stock (a loja recusa dado inválido)'],
            ['5', 'PUT /products/{id} com um produto novo',
             '201 e criado:true; o produto aparece no painel'],
            ['6', 'PUT com um campo escrito errado ("preco")',
             '200 com o aviso em warnings — e o preço NÃO muda'],
            ['7', 'Editar o preço desse produto no painel e repetir o PUT',
             'price vem em ignored; o valor do painel permanece'],
            ['8', 'POST /products/batch com 3 itens, um inválido',
             '200 com gravados:2, falhas:1 e o motivo do item ruim'],
            ['9', 'Fazer uma compra de teste na loja',
             'Webhook order.created chega na URL do UNO'],
            ['10', 'Buscar o pedido por GET /orders/{id} a partir do aviso',
             'Itens, valores e status conferem com a tela'],
            ['10b', 'Conferir shippingAddress e shippingService nesse pedido',
             'Endereço completo e transportadora escolhida pelo cliente'],
            ['11', 'PATCH /orders/{id} para shipped',
             'Painel mostra "enviado"; webhook order.status_changed dispara'],
            ['12', 'Desligar a URL do webhook e fazer outra compra',
             'A varredura por since encontra o pedido — prova o plano B'],
            ['13', 'Revogar a chave no painel e repetir o passo 2',
             '401 imediato'],
        ],
        [8 * mm, 82 * mm, 75 * mm],
    ))
    add(Spacer(1, 10))
    add(Paragraph('9.1 Contato técnico e ambiente', H2))
    add(tabela(
        ['Item', 'Valor'],
        [
            ['Produção', f'{BASE}/api/v1'],
            ['Homologação', 'Não há ambiente separado. Combine uma janela e use produtos de teste '
                            'inativos — assim nada aparece na vitrine.'],
            ['Painel da loja', f'{BASE}/admin → Integrações → API'],
            ['Responsável técnico', 'Marcelo Oliveira — marcelo.oliveira@unosolucoes.com.br'],
            ['Stack da loja', 'Node 20+ · Express · MySQL 8 / MariaDB · React'],
        ],
        [38 * mm, 127 * mm],
    ))
    add(Spacer(1, 12))
    add(Paragraph(
        'Este manual descreve o estado do código na data da capa. As seções 1 e 7 são as que mudam '
        'quando a loja evoluir — confira a versão antes de começar uma implementação nova.',
        ParagraphStyle('fim', parent=P_PEQ, alignment=TA_LEFT)))

    doc.build(s)
    print(f'PDF gerado: {saida}')


if __name__ == '__main__':
    construir()
