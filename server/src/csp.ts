/**
 * Content-Security-Policy da loja — fonte única.
 *
 * A política existia em dois lugares: numa <meta> injetada pelo build (Vite) e
 * num header HTTP enviado pelo Express. Ficar em dois arquivos foi o suficiente
 * para elas divergirem, e uma CSP que difere entre a meta e o header é pior que
 * uma só: o navegador aplica a INTERSEÇÃO das duas, então a mais restritiva
 * bloqueia em silêncio o que a outra libera. Agora as duas leem daqui.
 *
 * Por que cada exceção existe:
 *
 *  - script-src permite o SDK do Mercado Pago. É esse script que recebe o
 *    número do cartão dentro de iframes dele e devolve só um token — é
 *    justamente por causa dele que o cartão NUNCA passa pelo nosso servidor.
 *    Sem essa liberação, o formulário de cartão simplesmente não carrega.
 *
 *  - frame-src permite os iframes do Mercado Pago (os campos do cartão e, num
 *    pagamento que exija, a tela de confirmação do banco / 3-D Secure).
 *
 *  - connect-src permite a tokenização e a consulta de bandeira/parcelas, que o
 *    SDK faz do navegador direto para a API deles.
 *
 *  - img-src permite https: porque o painel aceita colar a URL de uma imagem
 *    externa ao cadastrar produto; `safeImageSrc` já barra os esquemas
 *    perigosos (javascript:, data:text/html, SVG).
 *
 * SE O FORMULÁRIO DE CARTÃO NÃO APARECER, a primeira coisa a olhar é o console
 * do navegador: erro de CSP aparece nomeando a diretiva que bloqueou. Já houve
 * relato de o SDK precisar de `'unsafe-eval'` em versões antigas; não é
 * incluído aqui de propósito — abrir eval para toda a loja é caro, e a decisão
 * deve ser consciente e não preventiva.
 */

/** Domínios do Mercado Pago. Curinga por subdomínio: eles usam vários (sdk, api, www, e regionais .com.br). */
const MP_SCRIPT = 'https://sdk.mercadopago.com https://*.mercadopago.com https://*.mlstatic.com';
const MP_CONEXAO = 'https://*.mercadopago.com https://*.mercadopago.com.br https://*.mlstatic.com';
const MP_IFRAME = 'https://*.mercadopago.com https://*.mercadopago.com.br https://*.mercadolibre.com';

/**
 * Diretivas comuns. `frame-ancestors` fica fora: o navegador IGNORA essa
 * diretiva quando ela vem em <meta>, então ela só é adicionada no header.
 */
const COMUNS = [
  "default-src 'self'",
  `script-src 'self' ${MP_SCRIPT}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' https: data:",
  "font-src 'self' data:",
  `connect-src 'self' ${MP_CONEXAO}`,
  `frame-src ${MP_IFRAME}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  'upgrade-insecure-requests',
];

/** Para a <meta> do index.html (build do Vite). */
export const CSP_META = COMUNS.join('; ');

/** Para o header HTTP das páginas — igual à meta, mais o frame-ancestors. */
export const CSP_LOJA = [...COMUNS, "frame-ancestors 'none'"].join('; ');

/** A API não renderiza nada e não deve ser embutida em iframe. */
export const CSP_API = "default-src 'none'; frame-ancestors 'none'";
