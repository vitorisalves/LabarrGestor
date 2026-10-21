import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../app.ts';

let server: http.Server; let base: string;
// O guarda de permissões exige login real (token do Firebase); estes testes de rota ficam sem ele.
before(async () => {
  process.env.DISABLE_PERMISSION_ENFORCEMENT = '1';
  server = app.listen(0); base = `http://localhost:${(server.address() as any).port}`;
});
after(() => server.close());

test('POST /api/xml/reminders cria e retorna id', async () => {
  const res = await fetch(`${base}/api/xml/reminders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productName: 'Teste', date: new Date().toISOString() }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, 'success');
  assert.ok(body.id);
  // limpeza
  await fetch(`${base}/api/xml/reminders/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: body.id }) });
});

test('POST /api/auth/session sem token → 401', async () => {
  delete process.env.DISABLE_PERMISSION_ENFORCEMENT;
  try {
    const res = await fetch(`${base}/api/auth/session`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(res.status, 401);
  } finally {
    process.env.DISABLE_PERMISSION_ENFORCEMENT = '1';
  }
});

test('guarda de acesso: sem token, gravar e ler dão 401; só /health e a chave do push são públicos', async () => {
  delete process.env.DISABLE_PERMISSION_ENFORCEMENT;
  try {
    const write = await fetch(`${base}/api/xml/reminders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName: 'Teste', date: new Date().toISOString() }),
    });
    assert.equal(write.status, 401);
    for (const path of ['/api/xml/setores', '/api/xml/invoices', '/api/auth/users', '/api/auth/users/me', '/api/debug-db', '/api/omie-direct/products', '/api/excel-sync']) {
      const read = await fetch(`${base}${path}`);
      assert.equal(read.status, 401, path);
    }
    assert.equal((await fetch(`${base}/api/health`)).status, 200);
    assert.equal((await fetch(`${base}/api/notifications/vapid-key`)).status, 200);
  } finally {
    process.env.DISABLE_PERMISSION_ENFORCEMENT = '1';
  }
});

test('valores inválidos são recusados com 400 antes de gravar', async () => {
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const confirmRes = await post('/api/xml/pending-list-products/confirm', { items: [{ id: 'x', productName: 'Arroz', price: -5, quantity: 1 }] });
  assert.equal(confirmRes.status, 400);
  assert.match((await confirmRes.json()).message, /Preço/);
  assert.equal((await post('/api/xml/shopping_lists/update-items', { listId: 'nao-existe', items: [{ name: 'a', price: 1, quantity: 0 }] })).status, 400);
  assert.equal((await post('/api/xml/setor-limits', { setor: 'Cozinha', monthlyLimit: -10 })).status, 400);
  assert.equal((await post('/api/xml/purchase_orders', { items: [{ name: 'a', price: 1, quantity: 1e9 }] })).status, 400);
});
