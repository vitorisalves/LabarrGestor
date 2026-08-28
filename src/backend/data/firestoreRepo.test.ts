import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firestoreRepo } from './firestoreRepo.ts';

test('firestoreRepo expõe a superfície da interface DataRepo', () => {
  for (const m of ['collection','getDocs','getDocsWithLimit','getDoc','doc','set','update','delete','invalidateCache','getCollectionVersion','getPendingReminders']) {
    assert.equal(typeof (firestoreRepo as any)[m], 'function', `faltando método ${m}`);
  }
});

test('firestoreRepo.doc retorna uma Promise de DocRef', async () => {
  const ref = await firestoreRepo.doc('suppliers', 'abc');
  assert.ok(ref);
});
