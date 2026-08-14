/**
 * Segredos das integrações.
 *
 *   npm run teste
 *
 * Um campo de senha que não está em INTEGRATION_SECRET_FIELDS falha de duas
 * formas silenciosas: o valor volta em claro para o navegador, e o próximo
 * save o apaga — porque o input de senha manda '' e nada preserva o que
 * estava lá.
 *
 * Foi o que aconteceu com `accessCode` (Correios): o campo salvava, sumia no
 * salvamento seguinte, e a tela pedia a credencial de novo sem explicar por
 * quê. Este teste lê os campos de senha declarados no painel e cobra que cada
 * um esteja na lista do servidor.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { INTEGRATION_SECRET_FIELDS } from '../src/store.ts';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** Chaves declaradas com `type: 'password'` no catálogo do painel. */
function camposDeSenhaDoPainel(): string[] {
  const txt = readFileSync(path.join(raiz, 'src/admin/integrations.ts'), 'utf8');
  const achados = new Set<string>();
  // key vem antes de type dentro do mesmo objeto de campo.
  const re = /key:\s*'([^']+)'[^}]*?type:\s*'password'/g;
  for (const m of txt.matchAll(re)) achados.add(m[1]);
  return [...achados];
}

test('todo campo de senha do painel é tratado como segredo', () => {
  const doPainel = camposDeSenhaDoPainel();

  // Se a extração parar de achar nada, o teste vira decorativo — falha antes.
  assert.ok(doPainel.length >= 5, `esperava vários campos de senha, achei ${doPainel.length}`);

  const fora = doPainel.filter((k) => !INTEGRATION_SECRET_FIELDS.includes(k));
  assert.deepEqual(
    fora,
    [],
    `campos de senha fora de INTEGRATION_SECRET_FIELDS: ${fora.join(', ')}. `
      + 'Sem isso o valor vaza para o navegador e some no próximo save.',
  );
});

test('accessCode dos Correios está entre os segredos', () => {
  // Regressão específica: o campo foi criado com a integração dos Correios e
  // ficou de fora da lista.
  assert.ok(INTEGRATION_SECRET_FIELDS.includes('accessCode'));
});
