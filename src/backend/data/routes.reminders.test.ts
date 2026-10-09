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

test('POST /api/auth/users/upsert without token → 401', async () => {
  const res = await fetch(`${base}/api/auth/users/upsert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ uid: 'x', user: {} }) });
  assert.equal(res.status, 401);
});

test('guarda de permissões: gravar sem token → 401, ler continua liberado', async () => {
  delete process.env.DISABLE_PERMISSION_ENFORCEMENT;
  try {
    const write = await fetch(`${base}/api/xml/reminders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productName: 'Teste', date: new Date().toISOString() }),
    });
    assert.equal(write.status, 401);
    const read = await fetch(`${base}/api/xml/setores`);
    assert.notEqual(read.status, 401);
    assert.notEqual(read.status, 403);
  } finally {
    process.env.DISABLE_PERMISSION_ENFORCEMENT = '1';
  }
});
