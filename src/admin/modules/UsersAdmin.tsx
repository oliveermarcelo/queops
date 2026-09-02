/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Usuários do painel.
 *
 * Antes desta tela, dar acesso a alguém exigia SSH e linha de comando — o que
 * na prática significava que a loja tinha uma conta só e que a senha dela
 * circulava. Circular é o problema: não se remove o acesso de uma pessoa sem
 * trocar a senha de todas.
 */

import React, { useState } from 'react';
import {
  UserCog, Plus, KeyRound, Pencil, UserX, UserCheck, ShieldAlert, Check, X, Dice5,
} from 'lucide-react';
import { useAdmin } from '../AdminContext';
import { PanelUser } from '../types';
import { Card, Btn, Field, inputCls, fmtDate, ConfirmDialog } from '../ui';

/** Piso do servidor (server/src/usuarios.ts). Repetido aqui só para avisar antes. */
const MINIMO_SENHA = 10;

/**
 * Palavras para sugerir uma senha em frase.
 *
 * Quatro palavras sorteadas dão uma senha longa que a pessoa consegue receber
 * por telefone e digitar sem errar. A alternativa realista não é uma senha
 * aleatória forte — é "queops2026", porque foi o dono quem teve que inventar a
 * senha de outra pessoa, na pressa.
 */
const PALAVRAS = [
  'pedra', 'vento', 'forno', 'mapa', 'cobre', 'areia', 'noite', 'chave', 'barco',
  'folha', 'prata', 'campo', 'porta', 'nuvem', 'trilho', 'janela', 'pilha', 'canto',
  'fogo', 'lago', 'muro', 'ramo', 'selo', 'vidro', 'linha', 'monte', 'praia', 'ponte',
];

function sugerirSenha(): string {
  const n = new Uint32Array(4);
  crypto.getRandomValues(n);
  return Array.from(n, (x) => PALAVRAS[x % PALAVRAS.length]).join('-');
}

const msgDoErro = (e: unknown) =>
  e instanceof Error ? e.message : 'Não foi possível concluir. Tente de novo.';

function Aviso({ texto, tipo }: { texto: string; tipo: 'erro' | 'ok' }) {
  const cls = tipo === 'erro'
    ? 'bg-red-50 border-red-200 text-red-700'
    : 'bg-emerald-50 border-emerald-200 text-emerald-700';
  return <p className={`text-xs font-medium rounded-lg border px-3 py-2 ${cls}`}>{texto}</p>;
}

/** Formulário de criação. Some depois de criar, com a lista já atualizada. */
function FormNovoUsuario({ onFechar }: { onFechar: () => void }) {
  const { createPanelUser } = useAdmin();
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState(false);

  const salvar = async () => {
    setErro('');
    setSalvando(true);
    try {
      await createPanelUser({ name: nome, email, password: senha });
      onFechar();
    } catch (e) {
      setErro(msgDoErro(e));
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Card className="p-5 border-primary-blue/30 space-y-4">
      <h3 className="font-bold text-gray-800">Novo usuário do painel</h3>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Nome">
          <input
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: João da Silva"
            className={inputCls}
          />
        </Field>
        <Field label="E-mail (é com ele que a pessoa entra)">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="joao@queopspiramides.com.br"
            className={inputCls}
          />
        </Field>
      </div>

      <Field label={`Senha inicial (mínimo de ${MINIMO_SENHA} caracteres)`}>
        <div className="flex gap-2">
          <input
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder="uma frase que a pessoa consiga digitar"
            className={inputCls}
          />
          <Btn variant="ghost" onClick={() => setSenha(sugerirSenha())}>
            <Dice5 size={15} /> Sugerir
          </Btn>
        </div>
      </Field>

      <p className="text-[11px] text-gray-400 leading-relaxed">
        A senha aparece aqui só enquanto você digita — depois de salvar, nem o painel nem o servidor
        conseguem mostrá-la de novo (fica guardada cifrada). Passe-a para a pessoa por um canal que
        você confia e peça que ela troque no primeiro acesso, em <b>Trocar minha senha</b>.
      </p>

      {erro !== '' && <Aviso texto={erro} tipo="erro" />}

      <div className="flex gap-2">
        <Btn onClick={salvar} disabled={salvando}>
          {salvando ? 'Criando…' : 'Criar usuário'}
        </Btn>
        <Btn variant="ghost" onClick={onFechar} disabled={salvando}>Cancelar</Btn>
      </div>
    </Card>
  );
}

/** Uma linha da lista, com edição de nome/e-mail e troca de senha embutidas. */
function LinhaUsuario({ u }: { u: PanelUser; key?: React.Key }) {
  const { renamePanelUser, setPanelUserActive, resetPanelUserPassword } = useAdmin();
  const [editando, setEditando] = useState(false);
  const [nome, setNome] = useState(u.name);
  const [email, setEmail] = useState(u.email);
  const [novaSenha, setNovaSenha] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [confirmando, setConfirmando] = useState(false);

  const rodar = async (fn: () => Promise<void>, sucesso: string) => {
    setErro('');
    setOk('');
    try {
      await fn();
      setOk(sucesso);
      setTimeout(() => setOk(''), 4000);
    } catch (e) {
      setErro(msgDoErro(e));
    }
  };

  return (
    <div className={`p-4 rounded-lg border ${u.active ? 'border-gray-150' : 'border-gray-150 bg-gray-50/60'}`}>
      <div className="flex items-start gap-3 flex-wrap">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
          u.active ? 'bg-primary-blue text-white' : 'bg-gray-300 text-white'
        }`}>
          {u.name.charAt(0).toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          {editando ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <input value={nome} onChange={(e) => setNome(e.target.value)} className={inputCls} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              <Btn onClick={() => rodar(
                async () => {
                  await renamePanelUser(u.id, { name: nome, email });
                  setEditando(false);
                },
                'Dados atualizados.',
              )}>
                <Check size={15} />
              </Btn>
              <Btn variant="ghost" onClick={() => { setEditando(false); setNome(u.name); setEmail(u.email); }}>
                <X size={15} />
              </Btn>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-gray-800">{u.name}</p>
                {u.isYou && (
                  <span className="text-[10px] font-bold bg-primary-blue/10 text-primary-blue px-2 py-0.5 rounded-full">
                    você
                  </span>
                )}
                {!u.active && (
                  <span className="text-[10px] font-bold bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">
                    desativado
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500">{u.email}</p>
              <p className="text-[11px] text-gray-400 mt-0.5">
                {u.lastLoginAt
                  ? `Último acesso em ${fmtDate(u.lastLoginAt)}`
                  : 'Nunca entrou'} · criado em {fmtDate(u.createdAt)}
              </p>
            </>
          )}
        </div>

        {!editando && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setEditando(true)}
              className="p-2 text-gray-400 hover:text-primary-blue rounded-lg hover:bg-gray-100"
              title="Editar nome e e-mail"
            >
              <Pencil size={15} />
            </button>

            {/* Só faz sentido definir a senha de outra pessoa: a sua exige a atual. */}
            {!u.isYou && (
              <button
                onClick={() => setNovaSenha(novaSenha === null ? '' : null)}
                className="p-2 text-gray-400 hover:text-primary-blue rounded-lg hover:bg-gray-100"
                title="Definir nova senha para esta pessoa"
              >
                <KeyRound size={15} />
              </button>
            )}

            {u.active ? (
              <button
                onClick={() => setConfirmando(true)}
                disabled={u.isYou}
                className="p-2 text-gray-400 hover:text-brand-red rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:hover:text-gray-400 disabled:hover:bg-transparent"
                title={u.isYou ? 'Você não pode desativar a sua própria conta' : 'Desativar o acesso'}
              >
                <UserX size={15} />
              </button>
            ) : (
              <button
                onClick={() => rodar(() => setPanelUserActive(u.id, true), 'Acesso reativado.')}
                className="p-2 text-gray-400 hover:text-emerald-600 rounded-lg hover:bg-gray-100"
                title="Reativar o acesso"
              >
                <UserCheck size={15} />
              </button>
            )}
          </div>
        )}
      </div>

      {novaSenha !== null && (
        <div className="mt-3 pt-3 border-t border-gray-100 flex flex-col sm:flex-row gap-2">
          <input
            autoFocus
            value={novaSenha}
            onChange={(e) => setNovaSenha(e.target.value)}
            placeholder={`Nova senha de ${u.name.split(' ')[0]} (mínimo ${MINIMO_SENHA})`}
            className={inputCls}
          />
          <Btn variant="ghost" onClick={() => setNovaSenha(sugerirSenha())}>
            <Dice5 size={15} /> Sugerir
          </Btn>
          <Btn onClick={() => rodar(
            async () => {
              await resetPanelUserPassword(u.id, novaSenha);
              setNovaSenha(null);
            },
            'Senha trocada. Passe a nova senha para a pessoa.',
          )}>
            Salvar
          </Btn>
        </div>
      )}

      {(erro !== '' || ok !== '') && (
        <div className="mt-3">
          {erro !== '' ? <Aviso texto={erro} tipo="erro" /> : <Aviso texto={ok} tipo="ok" />}
        </div>
      )}

      {confirmando && (
        <ConfirmDialog
          title={`Desativar ${u.name}?`}
          message={
            'A pessoa perde o acesso ao painel na próxima ação que fizer. Nada do que ela cadastrou '
            + 'é apagado, e você pode reativar depois.'
          }
          confirmLabel="Desativar"
          onCancel={() => setConfirmando(false)}
          onConfirm={() => {
            setConfirmando(false);
            void rodar(() => setPanelUserActive(u.id, false), 'Acesso desativado.');
          }}
        />
      )}
    </div>
  );
}

/** Trocar a própria senha: exige a atual, mesmo com a sessão aberta. */
function MinhaSenha() {
  const { changeOwnPassword } = useAdmin();
  const [aberto, setAberto] = useState(false);
  const [atual, setAtual] = useState('');
  const [nova, setNova] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState(false);

  const salvar = async () => {
    setErro('');
    try {
      await changeOwnPassword(atual, nova);
      setOk(true);
      setAtual('');
      setNova('');
      setAberto(false);
      setTimeout(() => setOk(false), 5000);
    } catch (e) {
      setErro(msgDoErro(e));
    }
  };

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-primary-blue" />
          <div>
            <h3 className="font-bold text-gray-800">Trocar minha senha</h3>
            <p className="text-xs text-gray-400">Pede a senha atual — a sessão aberta não basta.</p>
          </div>
        </div>
        {!aberto && <Btn variant="ghost" onClick={() => setAberto(true)}>Trocar</Btn>}
      </div>

      {ok && <div className="mt-3"><Aviso texto="Senha trocada." tipo="ok" /></div>}

      {aberto && (
        <div className="mt-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Senha atual">
              <input
                autoFocus
                type="password"
                value={atual}
                onChange={(e) => setAtual(e.target.value)}
                className={inputCls}
              />
            </Field>
            <Field label={`Nova senha (mínimo de ${MINIMO_SENHA} caracteres)`}>
              <input
                type="password"
                value={nova}
                onChange={(e) => setNova(e.target.value)}
                className={inputCls}
              />
            </Field>
          </div>
          {erro !== '' && <Aviso texto={erro} tipo="erro" />}
          <div className="flex gap-2">
            <Btn onClick={salvar}>Salvar nova senha</Btn>
            <Btn variant="ghost" onClick={() => { setAberto(false); setErro(''); setAtual(''); setNova(''); }}>
              Cancelar
            </Btn>
          </div>
        </div>
      )}
    </Card>
  );
}

export default function UsersAdmin() {
  const { state } = useAdmin();
  const [criando, setCriando] = useState(false);

  const ativos = state.users.filter((u) => u.active).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gray-900/5 text-gray-700 flex items-center justify-center">
            <UserCog size={17} />
          </div>
          <div>
            <h2 className="font-bold text-gray-800">Usuários do painel</h2>
            <p className="text-xs text-gray-400">
              {ativos} {ativos === 1 ? 'pessoa com acesso' : 'pessoas com acesso'}
              {state.users.length > ativos && ` · ${state.users.length - ativos} desativado(s)`}
            </p>
          </div>
        </div>
        {!criando && (
          <Btn onClick={() => setCriando(true)}><Plus size={15} /> Novo usuário</Btn>
        )}
      </div>

      {/*
        Este aviso não é decoração. Todo usuário criado aqui tem acesso total —
        inclusive às credenciais das integrações e à chave de API, que hoje dá
        acesso a CPF de cliente. Quem lê a tela precisa saber disso ANTES de
        criar o acesso, não depois.
      */}
      <div className="flex gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200">
        <ShieldAlert size={18} className="text-amber-700 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-900 leading-relaxed">
          <b>Todo usuário criado aqui tem acesso total ao painel</b>, igual ao seu: preços, pedidos,
          credenciais das integrações, chaves de API — que dão acesso a CPF de cliente — e a
          criação de novos usuários. É acesso de sócio, não de funcionário. Para quem só precisa
          despachar pedido, o certo é um nível com menos poder; dá para fazer quando você quiser.
        </div>
      </div>

      {criando && <FormNovoUsuario onFechar={() => setCriando(false)} />}

      <Card className="p-5">
        <div className="space-y-2">
          {state.users.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-6">
              Nenhum usuário carregado.
            </p>
          )}
          {state.users.map((u) => <LinhaUsuario key={u.id} u={u} />)}
        </div>
      </Card>

      <MinhaSenha />
    </div>
  );
}
