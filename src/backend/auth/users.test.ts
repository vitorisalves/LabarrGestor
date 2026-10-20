import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authorizeUserAction, canViewUsers, isProtectedUser } from './users.js';

const SUPER = 'compras.labarr@gmail.com';
const adm = { role: 'admin', status: 'approved', permissions: [] as string[] };
const user = (permissions: string[] = [], extra: any = {}) => ({ role: 'user', status: 'approved', permissions, ...extra });
const superRec = { role: 'admin', status: 'approved', email: SUPER };

const act = (action: any, caller: any, target: any, callerUid = 'c', targetUid = 't') =>
  authorizeUserAction({ action, callerUid, caller, targetUid, target, superAdminEmail: SUPER });

test('admin supremo não pode ser aprovado, recusado, removido nem ter permissões alteradas', () => {
  for (const a of ['approve', 'deny', 'delete', 'permissions']) {
    assert.equal(act(a, adm, superRec).ok, false, a);
  }
  assert.equal(act('delete', superRec, superRec, 's', 's').ok, false); // nem por ele mesmo
});

test('sem SUPER_ADMIN_EMAIL ninguém é protegido por e-mail', () => {
  assert.equal(isProtectedUser(superRec, undefined), false);
  assert.equal(isProtectedUser(superRec, SUPER.toUpperCase()), true);
});

test('quem só aprova mexe em pendentes, mas não remove aprovado', () => {
  const approver = user(['users.approve']);
  assert.equal(act('approve', approver, { status: 'pending', role: 'user' }).ok, true);
  assert.equal(act('deny', approver, { status: 'pending', role: 'user' }).ok, true);
  assert.equal(act('deny', approver, user()).ok, false);
  assert.equal(act('deny', user(['users.approve', 'users.manage']), user()).ok, true);
});

test('usuário comum não mexe em admin; sem permissão não faz nada', () => {
  assert.equal(act('permissions', user(['users.manage']), { ...adm, email: 'outro@x.com' }).ok, false);
  assert.equal(act('approve', user(), { status: 'pending' }).ok, false);
});

test('cada um pode remover o próprio cadastro; remover outro exige users.manage', () => {
  assert.equal(act('delete', user(), user(), 'a', 'a').ok, true);
  assert.equal(act('delete', user(), user(), 'a', 'b').ok, false);
  assert.equal(act('delete', user(['users.manage']), user(), 'a', 'b').ok, true);
});

test('alvo inexistente: 404 (exceto delete)', () => {
  const r: any = act('permissions', adm, null);
  assert.equal(r.status, 404);
  assert.equal(act('delete', adm, null).ok, true);
});

test('lista de cadastros: só admin ou quem aprova/gerencia', () => {
  assert.equal(canViewUsers(adm), true);
  assert.equal(canViewUsers(user(['users.approve'])), true);
  assert.equal(canViewUsers(user(['users.manage'])), true);
  assert.equal(canViewUsers(user(['lists.edit'])), false);
  assert.equal(canViewUsers(null), false);
});
