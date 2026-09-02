/**
 * Usuários do painel — teste de ponta a ponta contra o servidor rodando.
 *
 * O teste unitário cobre as regras; este cobre a fiação: sessão, CSRF, hash de
 * senha gravado de verdade e o login funcionando com a senha que o painel
 * definiu. É aqui que apareceria um erro que nenhum teste de função pega — por
 * exemplo, gravar a senha em claro, ou o login recusar a conta recém-criada.
 *
 *   npm run teste:usuarios
 *
 * O teste devolve o estado como encontrou: a senha do dono volta ao valor
 * original no fim, e o usuário que ele cria fica desativado — não dá para
 * apagar conta de painel, e não deveria dar.
 */

const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:8080';
// Mesma convenção dos testes de e2e: a senha vem do ambiente, e o padrão só
// vale para a base de desenvolvimento.
const ADMIN = {
  email: process.env.ADMIN_EMAIL ?? 'admin@queopspiramides.com.br',
  password: process.env.ADMIN_PASS ?? 'DemoQueops2026!',
};

let falhas = 0;
const ok = (cond, nome, extra = '') => {
  console.log(`${cond ? 'ok  ' : 'FALHA'} ${nome}${cond || extra === '' ? '' : ' → ' + extra}`);
  if (!cond) falhas++;
};

/** Cliente com cookie e CSRF, como o navegador faz. */
function cliente() {
  let cookie = '';
  let csrf = '';

  const chamar = async (metodo, caminho, corpo) => {
    const headers = { Accept: 'application/json' };
    if (cookie) headers.Cookie = cookie;
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    if (metodo !== 'GET' && csrf) headers['X-CSRF-Token'] = csrf;

    const res = await fetch(BASE + caminho, {
      method: metodo,
      headers,
      body: corpo === undefined ? undefined : JSON.stringify(corpo),
    });
    const set = res.headers.getSetCookie?.() ?? [];
    for (const c of set) cookie = c.split(';')[0];

    let json = null;
    try {
      json = await res.json();
    } catch {
      /* resposta sem corpo */
    }
    return { status: res.status, json };
  };

  return {
    chamar,
    async sessao() {
      const r = await chamar('GET', '/api/session');
      csrf = r.json?.csrfToken ?? '';
      return r;
    },
  };
}

const dono = cliente();
await dono.sessao();

const login = await dono.chamar('POST', '/api/admin/login', ADMIN);
ok(login.status === 200, 'dono entra no painel', JSON.stringify(login.json));
await dono.sessao(); // a sessão trocou; renova o CSRF

const marca = Date.now();
const novo = {
  name: 'Funcionário de Teste',
  email: `teste-${marca}@exemplo.com`,
  password: 'pedra-vento-forno-mapa',
};

// ---------------------------------------------------------------- criar ----

const curta = await dono.chamar('POST', '/api/admin/users', { ...novo, password: 'curta' });
ok(curta.status === 422, 'senha curta é recusada', String(curta.status));

const semEmail = await dono.chamar('POST', '/api/admin/users', { ...novo, email: 'nao-e-email' });
ok(semEmail.status === 422, 'e-mail inválido é recusado', String(semEmail.status));

const criado = await dono.chamar('POST', '/api/admin/users', novo);
ok(criado.status === 201, 'usuário é criado', JSON.stringify(criado.json));
const id = criado.json?.id;
ok(
  Array.isArray(criado.json?.users) && criado.json.users.some((u) => u.email === novo.email),
  'a resposta já traz a lista com o novo usuário',
);

const repetido = await dono.chamar('POST', '/api/admin/users', novo);
ok(repetido.status === 409, 'e-mail repetido dá conflito, não cria duplicado', String(repetido.status));

// A senha não pode voltar de forma alguma — nem hash, nem mascarada.
const lista = await dono.chamar('GET', '/api/admin/users');
const bruto = JSON.stringify(lista.json);
ok(!bruto.includes(novo.password), 'a senha não aparece na listagem');
ok(!/\$2[aby]\$/.test(bruto), 'o hash da senha não aparece na listagem');

// ----------------------------------------------------- login do criado ----

const funcionario = cliente();
await funcionario.sessao();
const loginNovo = await funcionario.chamar('POST', '/api/admin/login', {
  email: novo.email,
  password: novo.password,
});
ok(loginNovo.status === 200, 'o usuário criado consegue entrar', JSON.stringify(loginNovo.json));
await funcionario.sessao();

const estado = await funcionario.chamar('GET', '/api/admin/state');
ok(estado.status === 200, 'e vê o painel (acesso total, como combinado)');

// ------------------------------------------------ travas de desativação ----

const euMesmo = await dono.chamar('PATCH', '/api/admin/users/1', { active: false });
ok(euMesmo.status === 422, 'o dono não consegue desativar a si mesmo', String(euMesmo.status));
ok(
  String(euMesmo.json?.error?.message ?? '').includes('própria conta'),
  'e a recusa explica o motivo em português',
  JSON.stringify(euMesmo.json),
);

const trocaPropria = await dono.chamar('PATCH', '/api/admin/users/1', { password: 'outra-frase-longa' });
ok(trocaPropria.status === 422, 'trocar a própria senha por esta rota é recusado', String(trocaPropria.status));

// ------------------------------------------- desativar de fato o criado ----

const desativado = await dono.chamar('PATCH', `/api/admin/users/${id}`, { active: false });
ok(desativado.status === 200, 'o dono desativa o funcionário', JSON.stringify(desativado.json));

const depois = await funcionario.chamar('GET', '/api/admin/state');
ok(depois.status === 401, 'a sessão do desativado deixa de valer na hora', String(depois.status));

const loginBloqueado = cliente();
await loginBloqueado.sessao();
const tentativa = await loginBloqueado.chamar('POST', '/api/admin/login', {
  email: novo.email,
  password: novo.password,
});
ok(tentativa.status === 401, 'e ele não consegue mais entrar', String(tentativa.status));

// --------------------------------------------------- trocar minha senha ----

const senhaErrada = await dono.chamar('PUT', '/api/admin/me/password', {
  currentPassword: 'nao-e-a-senha-atual',
  newPassword: 'frase-nova-bem-longa',
});
ok(senhaErrada.status === 401, 'trocar a própria senha exige a atual', String(senhaErrada.status));

const trocada = await dono.chamar('PUT', '/api/admin/me/password', {
  currentPassword: ADMIN.password,
  newPassword: 'frase-nova-bem-longa',
});
ok(trocada.status === 200, 'com a senha atual correta, a troca funciona', JSON.stringify(trocada.json));

const reentrada = cliente();
await reentrada.sessao();
const comNova = await reentrada.chamar('POST', '/api/admin/login', {
  email: ADMIN.email,
  password: 'frase-nova-bem-longa',
});
ok(comNova.status === 200, 'e o login passa a valer com a senha nova');

// Devolve a senha original, para o próximo teste rodar do mesmo ponto.
await reentrada.sessao();
await reentrada.chamar('PUT', '/api/admin/me/password', {
  currentPassword: 'frase-nova-bem-longa',
  newPassword: ADMIN.password,
});

// --------------------------------------------------- sem sessão, nada ----

const anonimo = cliente();
await anonimo.sessao();
const semSessao = await anonimo.chamar('GET', '/api/admin/users');
ok(semSessao.status === 401, 'sem login, a lista de usuários é 401', String(semSessao.status));
const criarSemSessao = await anonimo.chamar('POST', '/api/admin/users', novo);
ok(criarSemSessao.status === 401, 'sem login, ninguém cria usuário', String(criarSemSessao.status));

console.log(falhas === 0 ? '\ntodos os testes passaram' : `\n${falhas} falha(s)`);
process.exit(falhas === 0 ? 0 : 1);
