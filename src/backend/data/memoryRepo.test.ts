import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeMemoryRepo } from './memoryRepo.ts';
import { pickRepo } from './index.ts';

test('set/getDoc/getDocs/delete funcionam e copiam os dados (sem aliasing)', async () => {
  const repo = makeMemoryRepo();
  const data = { name: 'ACME', n: 1 };
  await repo.set(repo.doc('suppliers', 's1'), data, 'suppliers/s1');
  data.name = 'mudou depois';
  const snap = await repo.getDoc(repo.doc('suppliers', 's1'));
  assert.equal(snap.exists(), true);
  assert.equal(snap.data().name, 'ACME');
  const all = await repo.getDocs('suppliers');
  assert.equal(all.docs.length, 1);
  await repo.delete(repo.doc('suppliers', 's1'));
  assert.equal((await repo.getDoc(repo.doc('suppliers', 's1'))).exists(), false);
  assert.equal((await repo.getDocs('suppliers')).empty, true);
});

test('update mescla campos; getDoc de documento inexistente devolve exists() falso', async () => {
  const repo = makeMemoryRepo();
  await repo.set(repo.doc('c', 'a'), { x: 1, y: 2 });
  await repo.update(repo.doc('c', 'a'), { y: 3, z: 4 });
  assert.deepEqual((await repo.getDoc(repo.doc('c', 'a'))).data(), { x: 1, y: 3, z: 4 });
  assert.equal((await repo.getDoc(repo.doc('c', 'nao'))).exists(), false);
});

test('updateIfVersion: ok, conflict e not_found', async () => {
  const repo = makeMemoryRepo();
  await repo.set(repo.doc('l', 'a'), { items: [], version: 2 });
  assert.equal(await repo.updateIfVersion(repo.doc('l', 'a'), { items: [1] }, 2), 'ok');
  assert.equal((await repo.getDoc(repo.doc('l', 'a'))).data().version, 3);
  assert.equal(await repo.updateIfVersion(repo.doc('l', 'a'), { items: [2] }, 2), 'conflict');
  assert.equal(await repo.updateIfVersion(repo.doc('l', 'nao'), { items: [] }, 0), 'not_found');
});

test('getDocsWithLimit respeita o limite', async () => {
  const repo = makeMemoryRepo();
  for (let i = 0; i < 5; i++) await repo.set(repo.doc('c', `d${i}`), { i });
  assert.equal((await repo.getDocsWithLimit('c', 2)).docs.length, 2);
});

test('getPendingReminders: só não notificados com data vencida', async () => {
  const repo = makeMemoryRepo();
  await repo.set(repo.doc('reminders', 'a'), { notified: false, date: '2026-01-01T00:00:00.000Z' });
  await repo.set(repo.doc('reminders', 'b'), { notified: true, date: '2026-01-01T00:00:00.000Z' });
  await repo.set(repo.doc('reminders', 'c'), { notified: false, date: '2027-01-01T00:00:00.000Z' });
  await repo.set(repo.doc('reminders', 'd'), { date: '2026-01-01T00:00:00.000Z' });
  const pend = await repo.getPendingReminders('2026-06-01T00:00:00.000Z');
  assert.deepEqual(pend.docs.map(d => d.id), ['a']);
});

test('pickRepo: backend memory é recusado na Vercel e em produção', () => {
  assert.throws(() => pickRepo({ DATA_BACKEND: 'memory' }, true), /não é permitido em produção/);
  assert.throws(() => pickRepo({ DATA_BACKEND: 'memory', NODE_ENV: 'production' }, false), /não é permitido em produção/);
  const ok = pickRepo({ DATA_BACKEND: 'memory', NODE_ENV: 'test' }, false);
  assert.equal(typeof ok.updateIfVersion, 'function');
});
