import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditRecord, recordAudit } from './audit.ts';

const entry = {
  action: 'supplier.delete', actor: { uid: 'u1', email: 'a@x.com', name: 'Ana' },
  target: 'suppliers/s1', before: { name: 'ACME' }, meta: { count: 1 },
};

test('buildAuditRecord monta ID ordenável e guarda quem, quando, ação e alvo', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  const r = buildAuditRecord(entry, now, () => 'r4nd');
  assert.equal(r.id, '2026-10-21T12:00:00.000Z_r4nd');
  assert.equal(r.data.action, 'supplier.delete');
  assert.equal(r.data.target, 'suppliers/s1');
  assert.equal(r.data.at, now.toISOString());
  assert.deepEqual(r.data.actor, entry.actor);
  assert.deepEqual(r.data.before, { name: 'ACME' });
});

test('recordAudit grava via repo.set na coleção audit_log', async () => {
  const calls: any[] = [];
  const repo: any = { doc: async (c: string, id: string) => ({ __coll: c, __id: id }), set: async (ref: any, data: any) => { calls.push({ ref, data }); } };
  await recordAudit(repo, entry);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ref.__coll, 'audit_log');
  assert.equal(calls[0].data.action, 'supplier.delete');
});

test('recordAudit nunca lança, mesmo se a gravação falhar', async () => {
  const repo: any = { doc: async () => ({}), set: async () => { throw new Error('tabela não existe'); } };
  await assert.doesNotReject(() => recordAudit(repo, entry));
});
