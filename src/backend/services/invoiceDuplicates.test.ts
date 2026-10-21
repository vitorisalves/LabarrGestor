import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateInvoices } from './invoiceDuplicates.ts';

const nota = (id: string, extra: Record<string, any> = {}) => ({
  id, supplierName: 'ACME', date: '2026-10-01T10:00:00Z', vTotTrib: 100, products: [{}, {}], ...extra,
});

test('mesma chave com e sem o prefixo NFe é duplicata', () => {
  const r = findDuplicateInvoices([nota('NFe123'), nota('123')]);
  assert.equal(r.length, 1);
  assert.equal(r[0].reason, 'mesma_chave');
  assert.deepEqual([...r[0].ids].sort(), ['123', 'NFe123']);
});

test('IDs diferentes com mesmo fornecedor, dia, total e nº de itens são "mesmo conteúdo"', () => {
  const r = findDuplicateInvoices([nota('A'), nota('B')]);
  assert.equal(r.length, 1);
  assert.equal(r[0].reason, 'mesmo_conteudo');
});

test('notas diferentes não são agrupadas', () => {
  assert.equal(findDuplicateInvoices([nota('A'), nota('B', { vTotTrib: 101 })]).length, 0);
});

test('lançamentos provisórios de lista (source shopping_list) são ignorados', () => {
  assert.equal(findDuplicateInvoices([nota('conf_list_1', { source: 'shopping_list' }), nota('conf_list_2', { source: 'shopping_list' })]).length, 0);
});
