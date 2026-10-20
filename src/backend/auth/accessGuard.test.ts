import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideAccess, isSuperAdmin } from './accessGuard.js';
import type { Identity } from './identity.js';

const SUPER = 'compras.labarr@gmail.com';
const google = (email: string, extra: Partial<Identity> = {}): Identity =>
  ({ uid: 'u', email, emailVerified: true, provider: 'google.com', ...extra });
const approved = (permissions: string[] = [], role = 'user') => ({ status: 'approved', role, permissions });

const run = (method: string, path: string, identity: Identity | null, stored: any = null, superAdminEmail: string | undefined = SUPER) =>
  decideAccess({ method, path, identity, stored, superAdminEmail });

test('rotas públicas não exigem login', () => {
  assert.equal(run('GET', '/health', null).ok, true);
  assert.equal(run('GET', '/notifications/vapid-key', null).ok, true);
  assert.equal(run('POST', '/health', null).ok, false);
});

test('sem identidade, anônimo, e-mail não verificado ou outro provedor: 401', () => {
  for (const id of [null, { uid: 'a', email: '', emailVerified: false, provider: null } as Identity,
    google('a@x.com', { emailVerified: false }), google('a@x.com', { provider: 'password' })]) {
    const d = run('GET', '/xml/invoices', id, approved());
    assert.equal(d.ok, false);
    assert.equal((d as any).status, 401);
  }
});

test('cadastro ausente, pendente ou negado: 403 até para ler', () => {
  for (const stored of [null, { status: 'pending' }, { status: 'denied' }]) {
    const d = run('GET', '/xml/invoices', google('a@x.com'), stored);
    assert.equal((d as any).status, 403);
  }
});

test('aprovado sem permissão lê, mas não grava', () => {
  assert.equal(run('GET', '/xml/invoices', google('a@x.com'), approved()).ok, true);
  const d = run('POST', '/xml/suppliers', google('a@x.com'), approved());
  assert.equal((d as any).status, 403);
  assert.equal((d as any).permission, 'suppliers.edit');
});

test('aprovado com a permissão da rota grava; outra permissão não serve', () => {
  assert.equal(run('POST', '/xml/suppliers', google('a@x.com'), approved(['suppliers.edit'])).ok, true);
  assert.equal(run('POST', '/xml/suppliers', google('a@x.com'), approved(['lists.edit'])).ok, false);
});

test('rota de escrita sem regra é só de admin', () => {
  assert.equal(run('POST', '/qualquer/coisa', google('a@x.com'), approved(['suppliers.edit'])).ok, false);
  assert.equal(run('POST', '/qualquer/coisa', google('a@x.com'), approved([], 'admin')).ok, true);
});

test('debug-db só para admin', () => {
  assert.equal(run('GET', '/debug-db', google('a@x.com'), approved()).ok, false);
  assert.equal(run('GET', '/debug-db', google('a@x.com'), approved([], 'admin')).ok, true);
});

test('rotas /auth/ passam para qualquer identidade válida (o handler decide)', () => {
  assert.equal(run('POST', '/auth/session', google('a@x.com'), null).ok, true);
  assert.equal(run('GET', '/auth/users', null).ok, false);
});

test('admin supremo passa sem cadastro, em qualquer rota, com caixa diferente', () => {
  assert.equal(run('POST', '/qualquer/coisa', google('Compras.Labarr@Gmail.com'.toLowerCase()), null).ok, true);
  assert.equal(isSuperAdmin(google(SUPER), 'COMPRAS.LABARR@gmail.com'), true);
});

test('admin supremo exige e-mail verificado e provedor Google', () => {
  assert.equal(run('GET', '/xml/invoices', google(SUPER, { emailVerified: false }), null).ok, false);
  assert.equal(run('GET', '/xml/invoices', google(SUPER, { provider: 'password' }), null).ok, false);
});

test('sem a variável ninguém é admin supremo', () => {
  assert.equal(isSuperAdmin(google(SUPER), undefined), false);
  assert.equal(isSuperAdmin(google(SUPER), ''), false);
  assert.equal(run('POST', '/qualquer/coisa', google(SUPER), null, '').ok, false);
});
