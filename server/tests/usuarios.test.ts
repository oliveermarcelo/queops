/**
 * Usuários do painel — as regras que trancam a porta.
 *
 * O teste que mais importa aqui é o de desativação. Ele cobre o único erro
 * dessa tela que não tem conserto pelo painel: sem nenhuma conta ativa,
 * `adminLogin` recusa todo mundo (filtra por `active = 1`) e voltar exige SSH
 * com o migrate. É um erro de um clique e de recuperação caríssima — o tipo
 * exato que precisa de teste, não de atenção.
 */

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  emailValido, MINIMO_SENHA, motivoParaNaoDesativar, nomeValido, normalizarEmail, problemaNaSenha,
} from '../src/usuarios.ts';

test('ninguém desativa a própria conta', () => {
  const motivo = motivoParaNaoDesativar({ alvoId: 1, atorId: 1, ativasAgora: 5 });
  assert.match(motivo, /sua própria conta/);
});

test('a última conta ativa não pode cair', () => {
  const motivo = motivoParaNaoDesativar({ alvoId: 2, atorId: 1, ativasAgora: 1 });
  assert.match(motivo, /última conta ativa/);
});

test('com duas contas ativas, desativar a outra é permitido', () => {
  assert.equal(motivoParaNaoDesativar({ alvoId: 2, atorId: 1, ativasAgora: 2 }), '');
});

test('e-mail vira minúsculo e sem espaço, para o login casar', () => {
  assert.equal(normalizarEmail('  Joao@Exemplo.COM  '), 'joao@exemplo.com');
});

test('e-mail sem forma de e-mail é recusado', () => {
  assert.ok(emailValido('joao@exemplo.com.br'));
  assert.ok(!emailValido('joao@exemplo'));
  assert.ok(!emailValido('joao exemplo@x.com'));
  assert.ok(!emailValido(''));
  assert.ok(!emailValido('a@' + 'b'.repeat(200) + '.com'));
});

test('senha curta, óbvia ou igual ao e-mail é recusada', () => {
  assert.match(problemaNaSenha('123'), new RegExp(String(MINIMO_SENHA)));
  assert.match(problemaNaSenha('senha123456'), /fácil de adivinhar/);
  assert.match(problemaNaSenha('joao@exemplo.com', 'joao@exemplo.com'), /próprio e-mail/);
  assert.match(problemaNaSenha('joao', 'joao@exemplo.com'), new RegExp(String(MINIMO_SENHA)));
  assert.equal(problemaNaSenha('a piramide fica na bahia', 'joao@exemplo.com'), '');
});

/**
 * Senha só de espaços passa no teste de comprimento sem ser senha.
 *
 * Não é hipótese de laboratório: acontece quando o formulário é preenchido por
 * cima de um autocomplete e alguém segura a barra de espaço.
 */
test('senha só de espaços não conta como senha', () => {
  assert.match(problemaNaSenha('              '), /só espaços/);
});

test('nome é normalizado, e nome vazio ou de uma letra é recusado', () => {
  assert.equal(nomeValido('  João   da   Silva '), 'João da Silva');
  assert.equal(nomeValido('  '), '');
  assert.equal(nomeValido('J'), '');
  assert.equal(nomeValido('x'.repeat(121)), '');
});
