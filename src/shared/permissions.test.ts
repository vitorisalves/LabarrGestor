import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredPermission, userCan, isReadOnlyUser, PERMISSION_IDS } from './permissions.ts';

test('toda regra de rota aponta para uma permissão existente', () => {
  const samples = ['/xml/suppliers', '/xml/products/update-setor', '/xml/shopping_lists/delete', '/xml/purchase_orders/approve',
    '/xml/delivered_products', '/xml/reminders/update', '/xml/process-batch', '/xml/pending-imports/status',
    '/xml/pending-list-products/confirm', '/xml/list-spendings/reset', '/xml/setores', '/xml/categories/delete', '/ai/process-document'];
  for (const path of samples) {
    const rule = requiredPermission(path);
    assert.ok(typeof rule === 'string' && rule !== 'admin' && PERMISSION_IDS.has(rule), `${path} -> ${rule}`);
  }
});

test('escrita sem regra exige admin; algumas rotas liberam qualquer aprovado', () => {
  assert.equal(requiredPermission('/test-mode/reset'), 'admin');
  assert.equal(requiredPermission('/xml/suppliers/delete-all'), 'admin');
  assert.equal(requiredPermission('/notifications/broadcast'), 'admin');
  assert.equal(requiredPermission('/notifications/subscribe'), null);
  assert.equal(requiredPermission('/xml/cache/invalidate'), null);
  assert.equal(requiredPermission('/xml/purchase_orders/approve-requisition'), 'orders.approve');
  assert.equal(requiredPermission('/xml/purchase_orders'), 'lists.edit');
});

test('aprovado sem permissões só lê; admin faz tudo; pendente não faz nada', () => {
  const viewer = { role: 'user', status: 'approved', permissions: [] as string[] };
  assert.equal(userCan(viewer, 'suppliers.edit'), false);
  assert.equal(isReadOnlyUser(viewer), true);

  const editor = { role: 'user', status: 'approved', permissions: ['suppliers.edit'] };
  assert.equal(userCan(editor, 'suppliers.edit'), true);
  assert.equal(userCan(editor, 'lists.edit'), false);
  assert.equal(isReadOnlyUser(editor), false);

  assert.equal(userCan({ role: 'admin', status: 'approved' }, 'qualquer.coisa'), true);
  assert.equal(userCan({ role: 'user', status: 'pending', permissions: ['suppliers.edit'] }, 'suppliers.edit'), false);
  assert.equal(userCan(null, 'suppliers.edit'), false);
});
