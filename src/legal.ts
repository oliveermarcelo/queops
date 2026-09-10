/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Documentos legais da loja: troca, privacidade e termos de uso.
 *
 * O texto fica AQUI, como dado, e não dentro de um componente, por dois
 * motivos. O primeiro é que ele não é copy de marketing: foi escrito para
 * valer juridicamente, e quem o altera é a loja, não quem mexe no layout —
 * separar deixa claro o que se pode reescrever e o que não se pode. O
 * segundo é que os três documentos têm a mesma forma, então um só componente
 * desenha todos, e acrescentar o próximo é acrescentar um item nesta lista.
 *
 * O conteúdo é reproduzido literalmente. Frases de política de troca definem
 * prazo, quem paga o frete e o que a loja se obriga a fazer: "melhorar" o
 * texto muda a obrigação.
 */

export interface LegalSection {
  /** Vazio quando o parágrafo continua a seção anterior, sem novo título. */
  heading: string;
  paragraphs: string[];
}

export interface LegalDoc {
  /** Pedaço da URL: /trocas-e-devolucoes. */
  slug: string;
  /** Como o rodapé chama o documento. */
  navLabel: string;
  title: string;
  /** Razão social a que o documento se refere, como consta nele. */
  entity: string;
  /** A partir de quando vale, com as palavras do próprio documento. */
  validFrom: string;
  sections: LegalSection[];
}

const EMAIL = 'contato@queopspiramides.com.br';

export const TROCAS: LegalDoc = {
  slug: 'trocas-e-devolucoes',
  navLabel: 'Trocas e Devoluções',
  title: 'Política de Troca',
  entity: '20.403.704 ANTONELA BORDON',
  validFrom: 'Esta política de troca é válida a partir de agosto de 2026.',
  sections: [
    {
      heading: '',
      paragraphs: [
        'Caso você não esteja satisfeito com o produto ou tenha se arrependido da compra, você poderá solicitar uma troca ou devolução em até 7 dias contados da data do recebimento do pedido no seu endereço.',
      ],
    },
    {
      heading: 'Condições para efetuar uma troca',
      paragraphs: [
        'Caso queira efetuar uma troca, o produto deverá estar em perfeito estado e sem sinais de uso, ou seja, nas mesmas condições que você o recebeu. Além disso, é indispensável que o item esteja em sua embalagem original.',
      ],
    },
    {
      heading: 'Como solicitar uma troca',
      paragraphs: [
        `Envie um e-mail para ${EMAIL}, informando seu nome completo, número do pedido e motivo da troca. Você receberá o nosso contato com as informações necessárias para efetuar a troca.`,
      ],
    },
    {
      heading: 'Condições para devolução por arrependimento',
      paragraphs: [
        'Caso você se arrependa da compra, também poderá devolver o seu pedido em até 7 dias contados da data do recebimento do pedido no seu endereço.',
      ],
    },
    {
      heading: 'Como solicitar uma devolução por arrependimento',
      paragraphs: [
        `Envie um e-mail para ${EMAIL}, informando seu nome completo e número do pedido. Você receberá o reembolso em até 30 dias contados da data em que recebermos os produtos devolvidos. O valor será reembolsado utilizando o mesmo método de pagamento que você selecionou ao comprar na nossa loja virtual. Não haverá custo adicional para você receber o reembolso.`,
      ],
    },
    {
      heading: 'Produtos com defeito de fabricação',
      paragraphs: [
        'De acordo com a legislação brasileira, no caso de itens com defeito de fabricação, você tem o direito de solicitar a devolução em até 30 dias, contados da data do recebimento do pedido no seu endereço.',
      ],
    },
    {
      heading: 'Como solicitar uma devolução de produtos com defeito',
      paragraphs: [
        `Envie um e-mail para ${EMAIL}, informando seu nome completo, número do pedido e informações sobre o defeito de fabricação (descrição com fotos ou vídeos). Analisaremos o seu caso em até 30 dias contados da data em que recebermos os produtos devolvidos. O valor será reembolsado utilizando o mesmo método de pagamento que você selecionou ao comprar na nossa loja virtual. Não haverá custo adicional para você receber o reembolso.`,
      ],
    },
    {
      heading: 'Como devolver os produtos',
      paragraphs: [
        'Seguindo o estabelecido pelo Direito do Consumidor, os custos de envio da devolução de produtos por direito de arrependimento ou itens com defeito de fabricação serão cobertos pela nossa loja através do processo de logística reversa.',
        'Você receberá um código de autorização de postagem por e-mail após a sua solicitação de troca ou devolução e deverá postar a mercadoria em uma agência dos Correios. Não cobrimos os custos de embalagem, por isso, sugerimos que você utilize a mesma embalagem na qual recebeu a sua compra (caso não esteja danificada) ou uma caixa adequada que preserve as peças durante o transporte.',
      ],
    },
    {
      heading: 'Entre em contato conosco',
      paragraphs: [
        `Caso você tenha qualquer dúvida sobre a nossa política de troca, por favor, entre em contato pelo ${EMAIL}.`,
      ],
    },
  ],
};

/**
 * Os documentos publicados.
 *
 * Privacidade e termos de uso ainda não foram enviados pela loja. Ficam de
 * fora desta lista até chegarem: um link para uma página vazia é pior do que
 * link nenhum, porque promete uma informação que a loja é obrigada a dar.
 */
export const LEGAL_DOCS: LegalDoc[] = [TROCAS];

export function acharDocumentoLegal(caminho: string): LegalDoc | null {
  const slug = caminho.replace(/^\/+|\/+$/g, '');
  return LEGAL_DOCS.find((d) => d.slug === slug) ?? null;
}
