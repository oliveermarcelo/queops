/**
 * Sobe uma pasta de fotos e amarra cada uma ao produto certo.
 *
 * Existe por causa de um prejuízo: 1.264 produtos ficaram sem foto quando a
 * pasta de mídia foi descartada numa publicação. Refazer isso pelo painel é
 * abrir produto por produto, mil duzentas e sessenta e quatro vezes.
 *
 * COMO ELE DECIDE DE QUEM É CADA FOTO
 *
 * Em ordem, parando no primeiro que acerta:
 *   1. o SKU aparece no nome do arquivo (`3057.jpg`, `foto-3057-frente.png`);
 *   2. o nome do arquivo, sem acento e sem pontuação, é igual ao nome de um
 *      produto ("colar olho de horus.jpg");
 *   3. o nome do arquivo está contido no nome de um produto, ou o contrário, e
 *      isso vale para UM produto só.
 *
 * Quando duas ou mais fotos caem no mesmo produto, a primeira vira capa e as
 * outras vão para a galeria, na ordem do nome do arquivo (`-1`, `-2`, `_a`...).
 *
 * POR QUE ELE NÃO GRAVA NADA SEM `--confirmo`
 *
 * Casar foto errada em escala é pior que não ter foto: a loja passa a mostrar
 * o produto errado com cara de certo, e ninguém revisa mil itens. Por padrão
 * ele só IMPRIME o que faria, e grava um CSV para conferência.
 *
 *   node scripts/subir-fotos.mjs --pasta ./fotos --loja https://sualoja.com.br --chave qp_live_...
 *   node scripts/subir-fotos.mjs ... --confirmo
 *
 * A chave sai de Painel → Integrações → API & Desenvolvedores. Senha de
 * ninguém entra aqui.
 */

import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

// ------------------------------------------------------------ opções ----

function opcoes() {
  const a = process.argv.slice(2);
  const pegar = (nome, padrao = '') => {
    const i = a.indexOf('--' + nome);
    return i === -1 || a[i + 1] === undefined ? padrao : a[i + 1];
  };
  return {
    pasta: pegar('pasta'),
    loja: pegar('loja').replace(/\/+$/, ''),
    chave: pegar('chave', process.env.QUEOPS_CHAVE ?? ''),
    confirmo: a.includes('--confirmo'),
    /** Só estes SKUs/arquivos — para testar com poucos antes de soltar tudo. */
    limite: Number(pegar('limite', '0')) || 0,
    relatorio: pegar('relatorio', 'fotos-casadas.csv'),
  };
}

const o = opcoes();
if (o.pasta === '' || o.loja === '' || o.chave === '') {
  console.error('Uso: node scripts/subir-fotos.mjs --pasta ./fotos --loja https://sualoja.com.br --chave qp_live_...');
  console.error('     acrescente --confirmo para gravar de verdade.');
  process.exit(2);
}

const TIPOS = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif' };
const MAX = 3 * 1024 * 1024;

// ------------------------------------------------------------- texto ----

/** Sem acento, sem pontuação, espaços colapsados — para comparar nomes. */
function normalizar(t) {
  return String(t)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// ------------------------------------------------------------ catálogo ----

async function catalogo() {
  const r = await fetch(`${o.loja}/api/v1/products`, {
    headers: { Authorization: `Bearer ${o.chave}`, Accept: 'application/json' },
  });
  if (!r.ok) {
    console.error(`A loja respondeu HTTP ${r.status} ao listar os produtos.`);
    if (r.status === 401) console.error('A chave de API foi recusada. Gere outra em Integrações → API & Desenvolvedores.');
    process.exit(1);
  }
  const j = await r.json();
  return (j.products ?? []).map((p) => ({
    id: String(p.id),
    sku: String(p.sku ?? ''),
    nome: String(p.name ?? ''),
    normal: normalizar(p.name ?? ''),
    temFoto: String(p.image ?? '') !== '',
  }));
}

// ----------------------------------------------------------- casamento ----

function casar(arquivos, produtos) {
  const porSku = new Map();
  // Compacto (sem espaço) para bater com os pedaços juntados acima.
  for (const p of produtos) if (p.sku !== '') porSku.set(normalizar(p.sku).replace(/ /g, ''), p);

  const resultado = [];
  for (const arquivo of arquivos) {
    const base = path.basename(arquivo, path.extname(arquivo));
    const normal = normalizar(base);
    const pedacos = normal.split(' ').filter((x) => x !== '');

    /*
     * 1. SKU em algum pedaço do nome.
     *
     * Os pedaços vão sozinhos e colados aos vizinhos, porque SKU quase nunca é
     * uma palavra só: "ZZS-100" vira ["zzs", "100"] e nenhum dos dois é o SKU.
     * Juntando até três vizinhos, "zzs100" aparece — e em "ZZS-100-2.jpg" e
     * "foto ZZS-100 frente.png" também.
     *
     * A comparação é por IGUALDADE, nunca "contém": com "contém", o SKU 10
     * casaria com todo arquivo que tivesse 100, 101, 1024…
     */
    let achado = null;
    let motivo = '';
    const candidatos = [];
    for (let i = 0; i < pedacos.length; i++) {
      for (let n = 1; n <= 3 && i + n <= pedacos.length; n++) {
        candidatos.push(pedacos.slice(i, i + n).join(''));
      }
    }
    for (const c of candidatos) {
      const p = porSku.get(c);
      if (p !== undefined) { achado = p; motivo = `SKU ${p.sku} no nome do arquivo`; break; }
    }

    // 2. Nome idêntico.
    if (achado === null) {
      const iguais = produtos.filter((p) => p.normal === normal);
      if (iguais.length === 1) { achado = iguais[0]; motivo = 'nome igual ao do produto'; }
      else if (iguais.length > 1) motivo = `${iguais.length} produtos com este mesmo nome`;
    }

    /*
     * 3. Um contém o outro — e só serve se for UM produto.
     *
     * "piramide" bateria em dezenas: nesse caso é melhor não casar nada e
     * deixar para a conferência à mão do que escolher um ao acaso.
     */
    if (achado === null && motivo === '' && normal.length >= 4) {
      const contidos = produtos.filter((p) => p.normal.includes(normal) || normal.includes(p.normal));
      if (contidos.length === 1) { achado = contidos[0]; motivo = 'nome contido no do produto'; }
      else if (contidos.length > 1) motivo = `${contidos.length} produtos parecidos — ambíguo`;
    }

    resultado.push({
      arquivo,
      base,
      produto: achado,
      motivo: achado === null ? (motivo || 'nenhum produto parecido') : motivo,
    });
  }
  return resultado;
}

// ------------------------------------------------------------- envio ----

async function enviar(produtoId, arquivo, galeria) {
  const bytes = readFileSync(arquivo);
  const tipo = TIPOS[path.extname(arquivo).toLowerCase()];
  const dataUrl = `data:${tipo};base64,${bytes.toString('base64')}`;
  const r = await fetch(
    `${o.loja}/api/v1/products/${encodeURIComponent(produtoId)}/imagem${galeria ? '?galeria=1' : ''}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${o.chave}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ dataUrl }),
    },
  );
  const j = await r.json().catch(() => null);
  if (!r.ok) return { erro: j?.error?.message ?? `HTTP ${r.status}` };
  return { url: j?.url ?? '', reaproveitada: j?.reaproveitada === true };
}

// -------------------------------------------------------------- main ----

const arquivos = readdirSync(o.pasta)
  .map((n) => path.join(o.pasta, n))
  .filter((f) => {
    if (!statSync(f).isFile()) return false;
    return TIPOS[path.extname(f).toLowerCase()] !== undefined;
  })
  .sort();

if (arquivos.length === 0) {
  console.error(`Nenhuma imagem em ${o.pasta} (aceito: ${Object.keys(TIPOS).join(', ')}).`);
  process.exit(1);
}

const grandes = arquivos.filter((f) => statSync(f).size > MAX);
const bons = arquivos.filter((f) => statSync(f).size <= MAX);

const produtos = await catalogo();
console.log(`${arquivos.length} imagem(ns) na pasta · ${produtos.length} produto(s) na loja\n`);

const casados = casar(bons, produtos);
const comDono = casados.filter((c) => c.produto !== null);
const semDono = casados.filter((c) => c.produto === null);

// Agrupa por produto: a primeira é capa, as seguintes vão para a galeria.
const porProduto = new Map();
for (const c of comDono) {
  const lista = porProduto.get(c.produto.id) ?? [];
  lista.push(c);
  porProduto.set(c.produto.id, lista);
}
/*
 * Capa é o arquivo de nome mais curto do grupo.
 *
 * Numa pasta real, "3057.jpg" é a foto principal e "3057-verso.jpg",
 * "3057-detalhe.jpg" são as outras. Ordem alfabética pura colocaria "3057-2"
 * antes de "3057" e a capa sairia errada.
 */
for (const lista of porProduto.values()) {
  lista.sort((a, b) => a.base.length - b.base.length || a.base.localeCompare(b.base));
}

console.log(`CASARAM: ${comDono.length} foto(s) em ${porProduto.size} produto(s)`);
console.log(`NÃO CASARAM: ${semDono.length}`);
if (grandes.length) console.log(`GRANDES DEMAIS (acima de 3 MB): ${grandes.length}`);
console.log('');

const linhas = [['arquivo', 'produto_id', 'sku', 'produto', 'destino', 'motivo'].join(';')];
for (const [, lista] of porProduto) {
  lista.forEach((c, i) => {
    linhas.push([
      path.basename(c.arquivo), c.produto.id, c.produto.sku,
      c.produto.nome.replace(/;/g, ','), i === 0 ? 'capa' : 'galeria', c.motivo,
    ].join(';'));
  });
}
for (const c of semDono) {
  linhas.push([path.basename(c.arquivo), '', '', '', 'NÃO CASOU', c.motivo].join(';'));
}
for (const f of grandes) {
  linhas.push([path.basename(f), '', '', '', 'GRANDE DEMAIS', `${Math.round(statSync(f).size / 1024)} KB`].join(';'));
}
writeFileSync(o.relatorio, '﻿' + linhas.join('\n'), 'utf8');
console.log(`Conferência completa em ${o.relatorio} (abre no Excel).\n`);

// Amostra na tela: ninguém confere mil linhas num terminal.
console.log('Amostra do que seria feito:');
let mostradas = 0;
for (const [, lista] of porProduto) {
  if (mostradas >= 10) break;
  for (const [i, c] of lista.entries()) {
    console.log(`  ${path.basename(c.arquivo)}  →  ${c.produto.sku || c.produto.id} ${c.produto.nome}`
      + `  [${i === 0 ? 'capa' : 'galeria'}] (${c.motivo})`);
  }
  mostradas++;
}
if (semDono.length) {
  console.log('\nPrimeiras que NÃO casaram:');
  for (const c of semDono.slice(0, 10)) {
    console.log(`  ${path.basename(c.arquivo)}  →  ${c.motivo}`);
  }
}

if (!o.confirmo) {
  console.log('\n--- SIMULAÇÃO. Nada foi gravado. ---');
  console.log('Confira o CSV e, quando estiver certo, rode de novo com --confirmo.');
  process.exit(0);
}

console.log('\nEnviando…');
let enviadas = 0; let reaproveitadas = 0; const falhas = [];
let feitos = 0;
for (const [, lista] of porProduto) {
  if (o.limite > 0 && feitos >= o.limite) break;
  for (const [i, c] of lista.entries()) {
    const r = await enviar(c.produto.id, c.arquivo, i > 0);
    if (r.erro !== undefined) {
      falhas.push(`${path.basename(c.arquivo)} → ${c.produto.sku}: ${r.erro}`);
      continue;
    }
    enviadas++;
    if (r.reaproveitada) reaproveitadas++;
    if (enviadas % 25 === 0) console.log(`  ${enviadas} enviadas…`);
  }
  feitos++;
}

console.log(`\n${enviadas} foto(s) enviada(s) em ${feitos} produto(s).`);
if (reaproveitadas) console.log(`${reaproveitadas} já existiam no servidor e não ocuparam disco de novo.`);
if (falhas.length) {
  console.log(`\n${falhas.length} falha(s):`);
  for (const f of falhas.slice(0, 20)) console.log('  ' + f);
}
if (semDono.length) {
  console.log(`\nFaltam ${semDono.length} foto(s) sem dono — estão no CSV, para amarrar à mão.`);
}
