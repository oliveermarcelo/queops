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

/**
 * Um pedaço de seção: ou um parágrafo, ou uma lista.
 *
 * A política de privacidade intercala os dois dentro da mesma seção — texto,
 * lista, texto, lista —, então não bastava um vetor de parágrafos. E a lista
 * precisa ser lista de verdade: são as finalidades do tratamento e os direitos
 * do titular, itens que a pessoa confere um a um. Espremidos num parágrafo
 * corrido, viram parede de texto justamente onde ela precisa achar o seu caso.
 *
 * O formato evita união discriminada de propósito: o tsconfig da raiz compila
 * sem `strict`, e o projeto já usa "vazio significa ausente" (como `erro: ''`).
 * Lista vazia é parágrafo; texto vazio é lista.
 */
export interface LegalBlock {
  text: string;
  items: string[];
}

export const p = (text: string): LegalBlock => ({ text, items: [] });
export const ul = (...items: string[]): LegalBlock => ({ text: '', items });

export interface LegalSection {
  /** Vazio quando o trecho continua a seção anterior, sem novo título. */
  heading: string;
  blocks: LegalBlock[];
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
      blocks: [
        p('Caso você não esteja satisfeito com o produto ou tenha se arrependido da compra, você poderá solicitar uma troca ou devolução em até 7 dias contados da data do recebimento do pedido no seu endereço.'),
      ],
    },
    {
      heading: 'Condições para efetuar uma troca',
      blocks: [
        p('Caso queira efetuar uma troca, o produto deverá estar em perfeito estado e sem sinais de uso, ou seja, nas mesmas condições que você o recebeu. Além disso, é indispensável que o item esteja em sua embalagem original.'),
      ],
    },
    {
      heading: 'Como solicitar uma troca',
      blocks: [
        p(`Envie um e-mail para ${EMAIL}, informando seu nome completo, número do pedido e motivo da troca. Você receberá o nosso contato com as informações necessárias para efetuar a troca.`),
      ],
    },
    {
      heading: 'Condições para devolução por arrependimento',
      blocks: [
        p('Caso você se arrependa da compra, também poderá devolver o seu pedido em até 7 dias contados da data do recebimento do pedido no seu endereço.'),
      ],
    },
    {
      heading: 'Como solicitar uma devolução por arrependimento',
      blocks: [
        p(`Envie um e-mail para ${EMAIL}, informando seu nome completo e número do pedido. Você receberá o reembolso em até 30 dias contados da data em que recebermos os produtos devolvidos. O valor será reembolsado utilizando o mesmo método de pagamento que você selecionou ao comprar na nossa loja virtual. Não haverá custo adicional para você receber o reembolso.`),
      ],
    },
    {
      heading: 'Produtos com defeito de fabricação',
      blocks: [
        p('De acordo com a legislação brasileira, no caso de itens com defeito de fabricação, você tem o direito de solicitar a devolução em até 30 dias, contados da data do recebimento do pedido no seu endereço.'),
      ],
    },
    {
      heading: 'Como solicitar uma devolução de produtos com defeito',
      blocks: [
        p(`Envie um e-mail para ${EMAIL}, informando seu nome completo, número do pedido e informações sobre o defeito de fabricação (descrição com fotos ou vídeos). Analisaremos o seu caso em até 30 dias contados da data em que recebermos os produtos devolvidos. O valor será reembolsado utilizando o mesmo método de pagamento que você selecionou ao comprar na nossa loja virtual. Não haverá custo adicional para você receber o reembolso.`),
      ],
    },
    {
      heading: 'Como devolver os produtos',
      blocks: [
        p('Seguindo o estabelecido pelo Direito do Consumidor, os custos de envio da devolução de produtos por direito de arrependimento ou itens com defeito de fabricação serão cobertos pela nossa loja através do processo de logística reversa.'),
        p('Você receberá um código de autorização de postagem por e-mail após a sua solicitação de troca ou devolução e deverá postar a mercadoria em uma agência dos Correios. Não cobrimos os custos de embalagem, por isso, sugerimos que você utilize a mesma embalagem na qual recebeu a sua compra (caso não esteja danificada) ou uma caixa adequada que preserve as peças durante o transporte.'),
      ],
    },
    {
      heading: 'Entre em contato conosco',
      blocks: [
        p(`Caso você tenha qualquer dúvida sobre a nossa política de troca, por favor, entre em contato pelo ${EMAIL}.`),
      ],
    },
  ],
};

export const TERMOS: LegalDoc = {
  slug: 'termos-de-uso',
  navLabel: 'Termos de Uso',
  title: 'Termos de Uso',
  entity: 'Antonela Bordon',
  validFrom: 'Esta política de termos de uso é válida a partir de agosto de 2026.',
  sections: [
    {
      heading: '',
      blocks: [
        p('Antonela Bordon, pessoa jurídica de direito privado, descreve, através deste documento, as regras de uso do site queopspiramides.com.br e qualquer outro site, loja ou aplicativo operado pelo proprietário.'),
        p('Ao navegar neste website, consideramos que você está de acordo com os Termos de Uso abaixo.'),
        p('Caso você não esteja de acordo com as condições deste contrato, pedimos que não faça mais uso deste website, muito menos cadastre-se ou envie os seus dados pessoais.'),
        p('Se modificarmos nossos Termos de Uso, publicaremos o novo texto neste website, com a data de revisão atualizada. Podemos alterar este documento a qualquer momento. Caso haja alteração significativa nos termos deste contrato, podemos informá-lo por meio das informações de contato que tivermos em nosso banco de dados ou por meio de notificações.'),
        p('A utilização deste website após as alterações significa que você aceitou os Termos de Uso revisados. Caso, após a leitura da versão revisada, você não esteja de acordo com seus termos, favor encerrar o seu acesso.'),
      ],
    },
    {
      heading: 'Seção 1 — Usuário',
      blocks: [
        p('A utilização deste website atribui de forma automática a condição de Usuário e implica a plena aceitação de todas as diretrizes e condições incluídas nestes Termos.'),
      ],
    },
    {
      heading: 'Seção 2 — Adesão em conjunto com a Política de Privacidade',
      blocks: [
        p('A utilização deste website acarreta a adesão aos presentes Termos de Uso e a versão mais atualizada da Política de Privacidade de Antonela Bordon.'),
      ],
    },
    {
      heading: 'Seção 3 — Condições de acesso',
      blocks: [
        p('Em geral, o acesso ao website da Antonela Bordon possui caráter gratuito e não exige prévia inscrição ou registro.'),
        p('Contudo, para usufruir de algumas funcionalidades, o usuário poderá precisar efetuar um cadastro, criando uma conta de usuário com login e senha próprios para acesso.'),
        p('É de total responsabilidade do usuário fornecer apenas informações corretas, autênticas, válidas, completas e atualizadas, bem como não divulgar o seu login e senha para terceiros.'),
        p('Partes deste website oferecem ao usuário a opção de publicar comentários em determinadas áreas. Antonela Bordon não consente com a publicação de conteúdos que tenham natureza discriminatória, ofensiva ou ilícita, ou ainda infrinjam direitos de autor ou quaisquer outros direitos de terceiros.'),
        p('A publicação de quaisquer conteúdos pelo usuário deste website, incluindo mensagens e comentários, implica em licença não-exclusiva, irrevogável e irretratável, para sua utilização, reprodução e publicação pela Antonela Bordon no seu website, plataformas e aplicações de internet, ou ainda em outras plataformas, sem qualquer restrição ou limitação.'),
      ],
    },
    {
      heading: 'Seção 4 — Cookies',
      blocks: [
        p('Informações sobre o seu uso neste website podem ser coletadas a partir de cookies. Cookies são informações armazenadas diretamente no computador que você está utilizando. Os cookies permitem a coleta de informações tais como o tipo de navegador, o tempo despendido no website, as páginas visitadas, as preferências de idioma, e outros dados de tráfego anônimos. Nós e nossos prestadores de serviços utilizamos informações para proteção de segurança, para facilitar a navegação, exibir informações de modo mais eficiente, e personalizar sua experiência ao utilizar este website, assim como para rastreamento online. Também coletamos informações estatísticas sobre o uso do website para aprimoramento contínuo do nosso design e funcionalidade, para entender como o website é utilizado e para auxiliá-lo a solucionar questões relevantes.'),
        p('Caso não deseje que suas informações sejam coletadas por meio de cookies, há um procedimento simples na maior parte dos navegadores que permite que os cookies sejam automaticamente rejeitados, ou oferece a opção de aceitar ou rejeitar a transferência de um cookie (ou cookies) específico(s) de um site determinado para o seu computador. Entretanto, isso pode gerar inconvenientes no uso do website.'),
        p('As definições que escolher podem afetar a sua experiência de navegação e o funcionamento que exige a utilização de cookies. Neste sentido, rejeitamos qualquer responsabilidade pelas consequências resultantes do funcionamento limitado deste website provocado pela desativação de cookies no seu dispositivo (incapacidade de definir ou ler um cookie).'),
      ],
    },
    {
      heading: 'Seção 5 — Propriedade Intelectual',
      blocks: [
        p('Todos os elementos de Antonela Bordon são de propriedade intelectual da mesma ou de seus licenciados. Estes Termos ou a utilização do website não concede a você qualquer licença ou direito de uso dos direitos de propriedade intelectual da Antonela Bordon ou de terceiros.'),
      ],
    },
    {
      heading: 'Seção 6 — Links para sites de terceiros',
      blocks: [
        p('Este website poderá, de tempos a tempos, conter links de hipertexto que redirecionará você para sites das redes dos nossos parceiros, anunciantes, fornecedores etc. Se você clicar em um desses links para qualquer um desses sites, lembre-se que cada site possui as suas próprias práticas de privacidade e que não somos responsáveis por essas políticas. Consulte as referidas políticas antes de enviar quaisquer Dados Pessoais para esses sites.'),
        p('Não nos responsabilizamos pelas políticas e práticas de coleta, uso e divulgação (incluindo práticas de proteção de dados) de outras organizações, tais como Facebook, Apple, Google, Microsoft, ou de qualquer outro desenvolvedor de software ou provedor de aplicativo, loja de mídia social, sistema operacional, prestador de serviços de internet sem fio ou fabricante de dispositivos, incluindo todos os Dados Pessoais que divulgar para outras organizações por meio dos aplicativos, relacionadas a tais aplicativos, ou publicadas em nossas páginas em mídias sociais. Nós recomendamos que você se informe sobre a política de privacidade e termos de uso de cada site visitado ou de cada prestador de serviço utilizado.'),
      ],
    },
    {
      heading: 'Seção 7 — Prazos e alterações',
      blocks: [
        p('O funcionamento deste website se dá por prazo indeterminado.'),
        p('O website no todo ou em cada uma das suas seções, pode ser encerrado, suspenso ou interrompido unilateralmente por Antonela Bordon, a qualquer momento e sem necessidade de prévio aviso.'),
      ],
    },
    {
      heading: 'Seção 8 — Dados pessoais',
      blocks: [
        p('Durante a utilização deste website, certos dados pessoais serão coletados e tratados por Antonela Bordon e/ou pelos Parceiros. As regras relacionadas ao tratamento de dados pessoais de Antonela Bordon estão estipuladas na Política de Privacidade.'),
      ],
    },
    {
      heading: 'Seção 9 — Contato',
      blocks: [
        p(`Caso você tenha qualquer dúvida sobre os Termos de Uso, por favor, entre em contato pelo e-mail ${EMAIL}.`),
      ],
    },
  ],
};

export const PRIVACIDADE: LegalDoc = {
  slug: 'politica-de-privacidade',
  navLabel: 'Política de Privacidade',
  title: 'Política de Privacidade',
  entity: '20.403.704 ANTONELA BORDON — CNPJ 20.403.704/0001-12',
  validFrom: 'Esta política de privacidade é válida a partir de agosto de 2026.',
  sections: [
    {
      heading: '',
      blocks: [
        p('A 20.403.704 ANTONELA BORDON, pessoa jurídica de direito privado, com sede na Estrada Dr. Celso Charuri, 270, inscrita no CNPJ/MF sob o nº 20.403.704/0001-12 (“Lojista” ou “nós”) leva a sua privacidade a sério e zela pela segurança e proteção de dados de todos os seus clientes, parceiros, fornecedores e usuários (“Usuários” ou “você”) do site https://queopspiramides.com.br/ e qualquer outro site, Loja, aplicativo operado pelo Lojista (aqui designados, simplesmente, “Loja”).'),
        p('Esta Política de Privacidade (“Política de Privacidade”) destina-se a informá-lo sobre o modo como nós utilizamos e divulgamos informações coletadas em suas visitas à nossa Loja e em mensagens que trocamos com você (“Comunicações”).'),
        p('AO ACESSAR A LOJA, ENVIAR COMUNICAÇÕES OU FORNECER QUALQUER TIPO DE DADO PESSOAL, VOCÊ DECLARA ESTAR CIENTE E DE ACORDO COM ESTA POLÍTICA DE PRIVACIDADE, A QUAL DESCREVE AS FINALIDADES E FORMAS DE TRATAMENTO DE SEUS DADOS PESSOAIS QUE VOCÊ DISPONIBILIZAR NA LOJA.'),
        p(`Esta Política de Privacidade fornece uma visão geral de nossas práticas de privacidade e das escolhas que você pode fazer, bem como direitos que você pode exercer em relação aos Dados Pessoais tratados por nós. Se você tiver alguma dúvida sobre o uso de Dados Pessoais, entre em contato com ${EMAIL}.`),
        p('Além disso, a Política de Privacidade não se aplica a quaisquer aplicativos, produtos, serviços, site ou recursos de mídia social de terceiros que possam ser oferecidos ou acessados por meio da Loja. O acesso a esses links fará com que você deixe a Loja e possa resultar na coleta ou compartilhamento de informações sobre você por terceiros. Nós não controlamos, endossamos ou fazemos quaisquer representações sobre esses sites de terceiros ou suas práticas de privacidade, que podem ser diferentes das nossas. Recomendamos que você revise a política de privacidade de qualquer site com o qual você interaja antes de permitir a coleta e o uso de seus Dados Pessoais.'),
        p('Caso você nos envie Dados Pessoais referentes a outras pessoas físicas, você declara ter a competência para fazê-lo e declara ter obtido o consentimento necessário para autorizar o uso de tais informações nos termos desta Política de Privacidade.'),
      ],
    },
    {
      heading: 'Definições',
      blocks: [
        p('Para os fins desta Política de Privacidade:'),
        ul(
          '“Dados Pessoais” significa qualquer informação que, direta ou indiretamente, identifique ou possa identificar uma pessoa natural, como por exemplo, nome, CPF, data de nascimento, endereço IP, dentre outros;',
          '“Dados Pessoais Sensíveis” significa qualquer informação que revele, em relação a uma pessoa natural, origem racial ou étnica, convicção religiosa, opinião política, filiação a sindicato ou a organização de caráter religioso, filosófico ou político, dado referente à saúde ou à vida sexual, dado genético ou biométrico;',
          '“Tratamento de Dados Pessoais” significa qualquer operação efetuada no âmbito dos Dados Pessoais, por meio de meios automáticos ou não, tal como a recolha, gravação, organização, estruturação, armazenamento, adaptação ou alteração, recuperação, consulta, utilização, divulgação por transmissão, disseminação ou, alternativamente, disponibilização, harmonização ou associação, restrição, eliminação ou destruição. Também é considerado Tratamento de Dados Pessoais qualquer outra operação prevista nos termos da legislação aplicável;',
          '“Leis de Proteção de Dados” significa todas as disposições legais que regulem o Tratamento de Dados Pessoais, incluindo, porém sem se limitar, a Lei nº 13.709/18, Lei Geral de Proteção de Dados Pessoais (“LGPD”).',
        ),
      ],
    },
    {
      heading: 'Uso de Dados Pessoais',
      blocks: [
        p('Coletamos e usamos Dados Pessoais para gerenciar seu relacionamento conosco e melhor atendê-lo quando você estiver adquirindo produtos e/ou serviços na Loja, personalizando e melhorando sua experiência. Exemplos de como usamos os dados incluem:'),
        ul(
          'Viabilizar que você adquira produtos e/ou serviços na Loja;',
          'Para confirmar ou corrigir as informações que temos sobre você;',
          'Para enviar informações que acreditamos ser do seu interesse;',
          'Para personalizar sua experiência de uso da Loja;',
          'Para personalizar o envio de publicidades para você, baseada em seu interesse em nossa Loja; e',
          'Para entrarmos em contato por um número de telefone e/ou endereço de e-mail fornecido. Podemos entrar em contato com você pessoalmente, por mensagem de voz, através de equipamentos de discagem automática, por mensagens de texto (SMS), por e-mail, ou por qualquer outro meio de comunicação que seu dispositivo seja capaz de receber, nos termos da lei e para fins comerciais razoáveis.',
        ),
        p('Além disso, os Dados Pessoais fornecidos também podem ser utilizados na forma que julgarmos necessária ou adequada: (a) nos termos das Leis de Proteção de Dados; (b) para atender exigências de processo judicial; (c) para cumprir decisão judicial, decisão regulatória ou decisão de autoridades competentes, incluindo autoridades fora do país de residência; (d) para proteger nossas operações; (e) para proteger direitos, privacidade, segurança nossos, seus ou de terceiros; (f) para detectar e prevenir fraude; (g) permitir-nos usar as ações disponíveis ou limitar danos que venhamos a sofrer; (h) de outros modos permitidos por lei.'),
        p('A NOSSA LOJA NÃO SE DESTINA A PESSOAS COM MENOS DE 18 (DEZOITO) ANOS E PEDIMOS QUE TAIS PESSOAS NÃO NOS FORNEÇAM QUALQUER DADO PESSOAL.'),
      ],
    },
    {
      heading: 'Não fornecimento de Dados Pessoais',
      blocks: [
        p('Você não é obrigado a compartilhar os Dados Pessoais que solicitamos, no entanto, se você optar por não os compartilhar, em alguns casos, não poderemos fornecer a você acesso completo à Loja, alguns recursos especializados ou ser capaz de prestar a assistência necessária ou, ainda, viabilizar a entrega do produto ou prestar o serviço contratado por você.'),
      ],
    },
    {
      heading: 'Dados coletados',
      blocks: [
        p('O público em geral poderá navegar na Loja sem necessidade de qualquer cadastro e envio de Dados Pessoais. No entanto, algumas das funcionalidades da Loja poderão depender de cadastro e envio de Dados Pessoais como concluir a compra/contratação do serviço e/ou a viabilizar a entrega do produto/prestação do serviço por nós.'),
        p('No contato a Loja, nós podemos coletar:'),
        ul(
          'Dados de contato. Nome, sobrenome, número de telefone, cidade, Estado e endereço de e-mail; e',
          'Informações que você envia. Informações que você envia via formulário (dúvidas, reclamações, sugestões, críticas, elogios etc.).',
        ),
        p('Na navegação geral na Loja, nós poderemos coletar:'),
        ul(
          'Dados de localização. Dados de geolocalização quando você acessa a Loja;',
          'Preferências. Informações sobre suas preferências e interesses em relação aos produtos/serviços (quando você nos diz o que eles são ou quando os deduzimos do que sabemos sobre você);',
          'Dados de navegação na Loja. Informações sobre suas visitas e atividades na Loja, incluindo o conteúdo (e quaisquer anúncios) com os quais você visualiza e interage, informações sobre o navegador e o dispositivo que você está usando, seu endereço IP, sua localização, o endereço do site a partir do qual você chegou. Algumas dessas informações são coletadas usando nossas Ferramentas de Coleta Automática de Dados, que incluem cookies, web beacons e links da web incorporados. Para saber mais, leia como nós usamos Ferramentas de Coleta Automática de Dados na seção “Forma de coleta automática de Dados Pessoais”, abaixo;',
          'Dados anônimos ou agregados. Respostas anônimas para pesquisas ou informações anônimas e agregadas sobre como a Loja é usufruída. Durante nossas operações, em certos casos, aplicamos um processo de desidentificação ou pseudonimização aos seus dados para que seja razoavelmente improvável que você seja identificado através do uso desses dados com a tecnologia disponível; e',
          'Outras informações que podemos coletar. Outras informações que não revelem especificamente a sua identidade ou que não são diretamente relacionadas a um indivíduo, tais como informações sobre navegador e dispositivo; dados de uso da Loja; e informações coletadas por meio de cookies, pixel tags e outras tecnologias.',
        ),
        p('Ao menos que você informe em algum formulário livre preenchido por você, nós não coletamos Dados Pessoais Sensíveis.'),
      ],
    },
    {
      heading: 'Compartilhamento de Dados Pessoais com terceiros',
      blocks: [
        p('Nós poderemos compartilhar seus Dados Pessoais:'),
        ul(
          'Com a(s) empresa(s) parceira(s) que você selecionar ou optar em enviar os seus dados, dúvidas, perguntas etc., bem como com provedores de serviços ou parceiros para gerenciar ou suportar certos aspectos de nossas operações comerciais em nosso nome. Esses provedores de serviços ou parceiros podem estar localizados nos Estados Unidos, na Argentina, no Brasil ou em outros locais globais, incluindo servidores para homologação e produção, e prestadores de serviços de hospedagem e armazenamento de dados, gerenciamento de fraudes, suporte ao cliente, vendas em nosso nome, atendimento de pedidos, personalização de conteúdo, atividades de publicidade e marketing (incluindo publicidade digital e personalizada) e serviços de TI, por exemplo;',
          'Com terceiros, com o objetivo de nos ajudar a gerenciar a Loja; e',
          'Com terceiros, caso ocorra qualquer reorganização, fusão, venda, joint venture, cessão, transmissão ou transferência de toda ou parte da nossa empresa, ativo ou capital (incluindo os relativos à falência ou processos semelhantes).',
        ),
      ],
    },
    {
      heading: 'Transferências internacionais de Dados',
      blocks: [
        p('Dados Pessoais e informações de outras naturezas coletadas por nós podem ser transferidos ou acessados por entidades pertencentes ao grupo corporativo das empresas parceiras em todo o mundo de acordo com esta Política de Privacidade.'),
      ],
    },
    {
      heading: 'Forma de coleta automática de Dados Pessoais',
      blocks: [
        p('Quando você visita a Loja, ela pode armazenar ou recuperar informações em seu navegador, seja na forma de cookies e de outras tecnologias semelhantes. Essas informações podem ser sobre você, suas preferências ou seu dispositivo e são usadas principalmente para que a Loja funcione como você espera. As informações geralmente não o identificam diretamente, mas podem oferecer uma experiência na internet mais personalizada.'),
        p('De acordo com esta Política de Privacidade, nós e nossos prestadores de serviços terceirizados podemos coletar seus Dados Pessoais de diversas formas, incluindo, entre outros:'),
        ul(
          'Por meio do navegador ou do dispositivo: Algumas informações são coletadas pela maior parte dos navegadores ou automaticamente por meio de dispositivos de acesso à internet, como o tipo de computador, resolução da tela, nome e versão do sistema operacional, modelo e fabricante do dispositivo, idioma, tipo e versão do navegador de Internet que está utilizando. Podemos utilizar essas informações para assegurar que a Loja funcione adequadamente.',
          'Uso de cookies: Os cookies permitem a coleta de informações tais como o tipo de navegador, o tempo dispendido na Loja, as páginas visitadas, as preferências de idioma, e outros dados de tráfego anônimos. Nós e nossos prestadores de serviços podemos utilizar essas informações para, dentre outros, personalizar sua experiência ao utilizar a Loja, assim como para direcionar publicidade para você, de acordo com os seus interesses. Também coletamos informações estatísticas sobre o uso da Loja para aprimoramento contínuo do nosso design e funcionalidade.',
          'Uso de pixel tags e outras tecnologias similares: Pixel tags (também conhecidos como Web beacons e GIFs invisíveis) podem ser utilizados para rastrear ações de usuários da Loja (incluindo destinatários de e-mails), medir o sucesso das nossas campanhas de marketing e coletar dados estatísticos sobre o uso da Loja e taxas de resposta. Em caso de ter ativa a personalização de anúncios em ferramentas como Facebook, Google ou Bing, a informação pode ser usada para mostrar anúncios em seus serviços.',
        ),
        p('Caso não deseje que suas informações sejam coletadas por meio de cookies, você pode configurar os cookies no menu “opções” ou “preferências” do seu navegador. Os navegadores mais usados — Google Chrome, Mozilla Firefox, Safari, Internet Explorer, Microsoft Edge e Opera — trazem essa configuração na própria central de ajuda, assim como Facebook, Google e Bing explicam, em suas centrais de privacidade, como desativar os anúncios personalizados e o rastreamento.'),
        p('Podemos contratar empresas de publicidade comportamental, para obter relatórios sobre os anúncios da Loja em toda a internet. Para isso, essas empresas utilizam cookies, pixel tags e outras tecnologias para coletar informações sobre a sua utilização, ou sobre a utilização de outros usuários, da nossa Loja e de site de terceiros. Nós não somos responsáveis por pixel tags, cookies e outras tecnologias similares utilizadas por terceiros. Você pode configurar suas preferências no menu do seu navegador. Esteja ciente de que se você mudar de computador ou navegador, ou usar vários computadores ou navegadores, você precisará repetir este processo para cada computador e cada navegador.'),
      ],
    },
    {
      heading: 'Direitos do Usuário',
      blocks: [
        p('Você pode, a qualquer momento, requerer:'),
        ul(
          'confirmação de que seus Dados Pessoais estão sendo tratados;',
          'acesso aos seus Dados Pessoais;',
          'correções a dados incompletos, inexatos ou desatualizados;',
          'anonimização, bloqueio ou eliminação de dados desnecessários, excessivos ou tratados em desconformidade com o disposto em lei;',
          'portabilidade de Dados Pessoais a outro prestador de serviços, contanto que isso não afete nossos segredos industriais e comerciais;',
          'eliminação de Dados Pessoais tratados com seu consentimento, na medida do permitido em lei;',
          'informações sobre as entidades às quais seus Dados Pessoais tenham sido compartilhados;',
          'informações sobre a possibilidade de não fornecer o consentimento e sobre as consequências da negativa; e',
          'revogação do consentimento.',
        ),
        p('Os seus pedidos serão tratados com especial cuidado de forma a que possamos assegurar a eficácia dos seus direitos. Poderá lhe ser pedido que faça prova da sua identidade de modo a assegurar que a partilha dos Dados Pessoais é apenas feita com o seu titular.'),
        p('Você deverá ter em mente que, em certos casos (por exemplo, devido a requisitos legais), o seu pedido poderá não ser imediatamente satisfeito, além de que nós poderemos não conseguir atendê-lo por conta de cumprimento de obrigações legais.'),
      ],
    },
    {
      heading: 'Segurança dos Dados Pessoais',
      blocks: [
        p('Buscamos adotar as medidas técnicas e organizacionais previstas pelas Leis de Proteção de Dados adequadas para proteção dos Dados Pessoais na nossa organização. Infelizmente, nenhuma transmissão ou sistema de armazenamento de dados tem a garantia de serem 100% seguros. Caso tenha motivos para acreditar que sua interação conosco tenha deixado de ser segura (por exemplo, caso acredite que a segurança de qualquer uma de suas contas foi comprometida), favor nos notificar imediatamente.'),
      ],
    },
    {
      heading: 'Links de hipertexto para outros sites e redes sociais',
      blocks: [
        p('A Loja poderá, de tempos a tempos, conter links de hipertexto que redirecionará você para sites das redes dos nossos parceiros, anunciantes, fornecedores etc. Se você clicar em um desses links para qualquer um desses sites, lembramos que cada site possui as suas próprias práticas de privacidade e que não somos responsáveis por essas políticas. Consulte as referidas políticas antes de enviar quaisquer Dados Pessoais para esses sites.'),
        p('Não nos responsabilizamos pelas políticas e práticas de coleta, uso e divulgação (incluindo práticas de proteção de dados) de outras organizações, tais como Facebook, Apple, Google, Microsoft, ou de qualquer outro desenvolvedor de software ou provedor de aplicativo, Loja de mídia social, sistema operacional, prestador de serviços de internet sem fio ou fabricante de dispositivos, incluindo todos os Dados Pessoais que divulgar para outras organizações por meio dos aplicativos, relacionadas a tais aplicativos, ou publicadas em nossas páginas em mídias sociais. Nós recomendamos que você se informe sobre a política de privacidade de cada site visitado ou de cada prestador de serviço utilizado.'),
      ],
    },
    {
      heading: 'Atualizações desta Política de Privacidade',
      blocks: [
        p('Se modificarmos nossa Política de Privacidade, publicaremos o novo texto na Loja, com a data de revisão atualizada. Podemos alterar esta Política de Privacidade a qualquer momento. Caso haja alteração significativa nos termos dessa Política de Privacidade, podemos informá-lo por meio das informações de contato que tivermos em nosso banco de dados ou por meio de notificação em nossa Loja.'),
        p('Recordamos que nós temos como compromisso não tratar os seus Dados Pessoais de forma incompatível com os objetivos descritos acima, exceto se de outra forma requerido por lei ou ordem judicial.'),
        p('Sua utilização da Loja após as alterações significa que aceitou as Políticas de Privacidade revisadas. Caso, após a leitura da versão revisada, você não esteja de acordo com seus termos, favor encerrar o acesso à Loja.'),
      ],
    },
    {
      heading: 'Pessoa responsável do tratamento dos Dados Pessoais',
      blocks: [
        p(`Caso pretenda exercer qualquer um dos direitos previstos nesta Política de Privacidade e/ou nas Leis de Proteção de Dados, ou resolver quaisquer dúvidas relacionadas ao Tratamento de seus Dados Pessoais, favor contatar-nos através do e-mail ${EMAIL}.`),
      ],
    },
  ],
};

/**
 * Os documentos publicados, na ordem em que aparecem no rodapé.
 *
 * Os três se citam entre si — os Termos remetem à Política de Privacidade nas
 * seções 2 e 8, e a Privacidade remete às práticas de cookies dos Termos —, o
 * que só faz sentido com os três no ar. Publicar um que aponta para outro
 * inexistente deixa o cliente sem a informação que o próprio documento diz que
 * ele tem direito de ler.
 */
export const LEGAL_DOCS: LegalDoc[] = [PRIVACIDADE, TERMOS, TROCAS];

export function acharDocumentoLegal(caminho: string): LegalDoc | null {
  const slug = caminho.replace(/^\/+|\/+$/g, '');
  return LEGAL_DOCS.find((d) => d.slug === slug) ?? null;
}
