/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Constantes comerciais da vitrine que não vêm do painel.
 *
 * Existe um único lugar para elas de propósito: a página do produto anunciava
 * "3x sem juros" e o checkout, "em até 6x" — números diferentes cravados em
 * arquivos diferentes.
 */

/**
 * Número máximo de parcelas sem juros no cartão.
 *
 * ATENÇÃO: o servidor tem o seu próprio limite, em `server/src/routes/public.ts`
 * (`INSTALLMENTS_MAX`), e é ELE que decide o que o Mercado Pago aceita. Os dois
 * precisam andar juntos: se a vitrine anunciar mais do que o servidor permite,
 * o cliente escolhe uma parcela que o pagamento recusa. Há um teste que compara
 * os dois valores justamente para isso não passar despercebido.
 */
export const INSTALLMENTS = 10;

/**
 * Contato da loja.
 *
 * Ficam aqui porque o telefone aparecia escrito à mão em três formatos
 * diferentes — no topo, no rodapé e no link do WhatsApp, este último ainda com
 * o número de exemplo `5511000000000`, que não chamava ninguém.
 */
export const LOJA = {
  /** Como o número é lido por uma pessoa. */
  telefone: '(11) 99867-0049',
  /** O mesmo número no formato que o `tel:` exige. */
  telefoneLink: 'tel:+5511998670049',
  /** E no formato do WhatsApp: código do país, DDD e número, sem sinais. */
  whatsapp: 'https://wa.me/5511998670049',
  email: 'contato@queopspiramides.com.br',
  horario: 'Seg a Dom, 9h às 19h30',
  endereco: 'Estrada Dr. Celso Charuri, 270 — próximo ao Clube Pró Vida',
  cidade: 'Jundiaquara, Araçoiaba da Serra · SP — CEP 18193-444',
  /*
   * Razão social e CNPJ, como constam nos documentos legais da loja.
   *
   * O rodapé trazia "Quéops Pirâmides Ltda. · CNPJ 00.000.000/0000-00", que
   * era exemplo — e errado duas vezes, porque a empresa nem é uma Ltda. Numa
   * loja virtual isso não é detalhe: é a identificação do fornecedor que o
   * Código de Defesa do Consumidor exige, e é por ela que o cliente sabe de
   * quem está comprando.
   */
  razaoSocial: '20.403.704 ANTONELA BORDON',
  cnpj: 'CNPJ 20.403.704/0001-12',
} as const;
