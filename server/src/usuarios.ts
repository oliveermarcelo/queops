/**
 * Usuários do painel — as regras, separadas das rotas.
 *
 * Estão aqui, e não dentro de routes/admin.ts, por um motivo prático: são as
 * regras que trancam ou destrancam a porta da loja. Fora do Express elas rodam
 * em teste unitário, sem banco e sem HTTP, e é lá que se descobre que a última
 * conta ativa podia se desativar — não em produção, com o painel inacessível e
 * o conserto dependendo de SSH.
 */

/** Formato mínimo de e-mail. Não valida se existe; valida se dá para logar. */
const FORMATO_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizarEmail(bruto: string): string {
  return bruto.trim().toLowerCase();
}

export function emailValido(email: string): boolean {
  return email.length <= 190 && FORMATO_EMAIL.test(email);
}

/**
 * Tamanho mínimo da senha: 10 caracteres.
 *
 * Sem exigência de maiúscula, número e símbolo de propósito. Essa exigência
 * produz "Senha@123" — que todo dicionário de ataque já tem — e empurra a
 * pessoa para o papelzinho embaixo do teclado. O que encarece o ataque é
 * comprimento. Dez caracteres é um piso baixo; a tela sugere frase.
 */
export const MINIMO_SENHA = 10;

/**
 * Senhas que não passam nem com 10 caracteres.
 *
 * Lista curta e sem pretensão de ser completa: ela existe para o caso real de
 * alguém digitar o óbvio na pressa de criar o acesso de um funcionário, não
 * para simular um dicionário de ataque.
 */
const SENHAS_OBVIAS = [
  'senha123456', '1234567890', 'senhasenha', 'queops1234', 'piramide123',
  'admin12345', 'abcdefghij', '0123456789', 'qwertyuiop',
];

/**
 * Devolve o problema da senha em português, ou string vazia se estiver ok.
 *
 * Recebe o e-mail porque senha igual ao e-mail (ou ao nome antes do @) é o
 * atalho mais comum de quem está criando conta para outra pessoa.
 */
export function problemaNaSenha(senha: string, email = ''): string {
  if (senha.length < MINIMO_SENHA) {
    return `A senha precisa de pelo menos ${MINIMO_SENHA} caracteres.`;
  }
  if (senha.length > 200) {
    return 'A senha é longa demais (máximo de 200 caracteres).';
  }
  if (senha.trim() === '') {
    return 'A senha não pode ser só espaços.';
  }
  const s = senha.toLowerCase();
  if (SENHAS_OBVIAS.includes(s)) {
    return 'Essa senha é fácil de adivinhar. Use uma frase que só você saiba.';
  }
  const alvo = normalizarEmail(email);
  if (alvo !== '' && (s === alvo || s === alvo.split('@')[0])) {
    return 'A senha não pode ser o próprio e-mail.';
  }
  return '';
}

export interface PedidoDeDesativacao {
  /** Quem está sendo desativado. */
  alvoId: number;
  /** Quem clicou. */
  atorId: number;
  /** Quantas contas ativas existem AGORA, incluindo o alvo. */
  ativasAgora: number;
}

/**
 * Pode desativar? Devolve o motivo da recusa, ou string vazia se pode.
 *
 * Duas recusas, e as duas são sobre não perder a chave de casa:
 *
 * 1. Ninguém se desativa. O clique tiraria a pessoa do painel no meio da
 *    própria sessão, e o desfazer exigiria outra conta ativa — que talvez não
 *    exista. Quem quer sair usa "Sair"; quem quer perder o acesso pede a outro
 *    usuário.
 * 2. A última conta ativa não cai. Sem nenhuma ativa, `adminLogin` recusa todo
 *    mundo (ele filtra por `active = 1`) e o painel só volta por SSH, rodando
 *    o migrate de novo. É uma porta que tranca por fora.
 */
export function motivoParaNaoDesativar(p: PedidoDeDesativacao): string {
  if (p.alvoId === p.atorId) {
    return 'Você não pode desativar a sua própria conta. Peça a outro usuário do painel.';
  }
  if (p.ativasAgora <= 1) {
    return 'Esta é a última conta ativa do painel. Desativá-la deixaria a loja sem acesso.';
  }
  return '';
}

/** Nome exibido: sem espaço sobrando, e nunca vazio. */
export function nomeValido(bruto: string): string {
  const nome = bruto.replace(/\s+/g, ' ').trim();
  return nome.length >= 2 && nome.length <= 120 ? nome : '';
}
