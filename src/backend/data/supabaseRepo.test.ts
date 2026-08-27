import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSupabaseRepo, normalizeTimestamps } from './supabaseRepo.ts';

function fakeClient(store: Record<string, { id: string; data: any }[]>) {
  const api = {
    schema: () => api,
    from: (t: string) => tableApi(t)
  } as any;
  return api;

  function tableApi(t: string) {
    const rows = () => (store[t] ||= []);
    const q: any = {
      _filterId: undefined as string | undefined,
      _limit: undefined as number | undefined,
      select() { return q; },
      eq(_c: string, v: string) { q._filterId = v; return q; },
      limit(n: number) { q._limit = n; return q; },
      maybeSingle() {
        let data = rows().map(r => ({ id: r.id, data: r.data }));
        if (q._filterId !== undefined) data = data.filter(r => r.id === q._filterId);
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
      then(resolve: any) {
        let data = rows().map(r => ({ id: r.id, data: r.data }));
        if (q._filterId !== undefined) data = data.filter(r => r.id === q._filterId);
        if (q._limit !== undefined) data = data.slice(0, q._limit);
        return Promise.resolve(resolve({ data, error: null }));
      },
      upsert(row: any) {
        const rs = rows();
        const i = rs.findIndex(r => r.id === row.id);
        if (i >= 0) rs[i] = { id: row.id, data: row.data }; else rs.push({ id: row.id, data: row.data });
        return Promise.resolve({ error: null });
      },
      delete() {
        return { eq: (_c: string, v: string) => { store[t] = rows().filter(r => r.id !== v); return Promise.resolve({ error: null }); } };
      }
    };
    return q;
  }
}

test('getDocs devolve {docs:[{id,data(),exists()}],empty}', async () => {
  const store = { suppliers: [{ id: 's1', data: { name: 'ACME' } }] };
  const repo = makeSupabaseRepo(fakeClient(store));
  const snap = await repo.getDocs('suppliers', 'suppliers', true);
  assert.equal(snap.empty, false);
  assert.equal(snap.docs[0].id, 's1');
  assert.equal(snap.docs[0].data().name, 'ACME');
  assert.equal(snap.docs[0].exists(), true);
});

test('getDocs de coleção vazia → empty true', async () => {
  const repo = makeSupabaseRepo(fakeClient({}));
  const snap = await repo.getDocs('vazia', 'vazia', true);
  assert.equal(snap.empty, true);
  assert.deepEqual(snap.docs, []);
});

test('set faz upsert e getDoc lê de volta', async () => {
  const store: any = { suppliers: [] };
  const repo = makeSupabaseRepo(fakeClient(store));
  await repo.set(await repo.doc('suppliers', 's2'), { name: 'Beta' }, 'suppliers/s2');
  const d = await repo.getDoc(await repo.doc('suppliers', 's2'), 'suppliers/s2', true);
  assert.equal(d.exists(), true);
  assert.equal(d.data().name, 'Beta');
});

test('update faz merge raso', async () => {
  const store: any = { suppliers: [{ id: 's4', data: { name: 'A', ativo: true } }] };
  const repo = makeSupabaseRepo(fakeClient(store));
  await repo.update(await repo.doc('suppliers', 's4'), { name: 'B' }, 'suppliers/s4');
  const d = await repo.getDoc(await repo.doc('suppliers', 's4'), 'suppliers/s4', true);
  assert.equal(d.data().name, 'B');
  assert.equal(d.data().ativo, true);
});

test('delete remove o registro', async () => {
  const store: any = { suppliers: [{ id: 's3', data: { name: 'X' } }] };
  const repo = makeSupabaseRepo(fakeClient(store));
  await repo.delete(await repo.doc('suppliers', 's3'), 'suppliers/s3');
  const d = await repo.getDoc(await repo.doc('suppliers', 's3'), 'suppliers/s3', true);
  assert.equal(d.exists(), false);
});

test('normalizeTimestamps converte Timestamp e Date, preserva o resto', () => {
  const out = normalizeTimestamps({
    ts: { toDate: () => new Date('2020-01-01T00:00:00Z') },
    d: new Date('2021-06-15T12:30:00Z'),
    iso: 'already-iso',
    n: 42,
    nested: { d2: new Date('2022-01-01T00:00:00Z') }
  });
  assert.equal(out.ts, '2020-01-01T00:00:00.000Z');
  assert.equal(out.d, '2021-06-15T12:30:00.000Z');
  assert.equal(out.iso, 'already-iso');
  assert.equal(out.n, 42);
  assert.equal(out.nested.d2, '2022-01-01T00:00:00.000Z');
});
