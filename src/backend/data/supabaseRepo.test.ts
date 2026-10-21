import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSupabaseRepo, normalizeTimestamps } from './supabaseRepo.ts';

function fakeClient(store: Record<string, { id: string; data: any; updated_at?: string }[]>) {
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
      _rangeFrom: undefined as number | undefined,
      _rangeTo: undefined as number | undefined,
      select() { return q; },
      eq(_c: string, v: string) { q._filterId = v; return q; },
      limit(n: number) { q._limit = n; return q; },
      range(from: number, to: number) { q._rangeFrom = from; q._rangeTo = to; return q; },
      maybeSingle() {
        let data = rows().map(r => ({ id: r.id, data: r.data, updated_at: r.updated_at }));
        if (q._filterId !== undefined) data = data.filter(r => r.id === q._filterId);
        return Promise.resolve({ data: data[0] ?? null, error: null });
      },
      then(resolve: any) {
        let data = rows().map(r => ({ id: r.id, data: r.data, updated_at: r.updated_at }));
        if (q._filterId !== undefined) data = data.filter(r => r.id === q._filterId);
        if (q._limit !== undefined) data = data.slice(0, q._limit);
        if (q._rangeFrom !== undefined) {
          // PostgREST devolve no máximo 1000 linhas por página, mesmo que o
          // range pedido seja maior — o repo pagina até esgotar.
          const end = Math.min(q._rangeFrom + 1000, (q._rangeTo ?? q._rangeFrom) + 1);
          data = data.slice(q._rangeFrom, end);
        }
        return Promise.resolve(resolve({ data, error: null }));
      },
      upsert(row: any) {
        const rs = rows();
        const i = rs.findIndex(r => r.id === row.id);
        if (i >= 0) rs[i] = { id: row.id, data: row.data }; else rs.push({ id: row.id, data: row.data });
        return Promise.resolve({ error: null });
      },
      update(row: any) {
        const filters: Array<[string, string]> = [];
        const chain: any = {
          eq(c: string, v: string) { filters.push([c, v]); return chain; },
          select() {
            const rs = rows();
            const hit = rs.find(r => filters.every(([c, v]) => (c === 'id' ? r.id === v : (r as any)[c] === v)));
            if (!hit) return Promise.resolve({ data: [], error: null });
            hit.data = row.data; hit.updated_at = row.updated_at;
            return Promise.resolve({ data: [{ id: hit.id }], error: null });
          }
        };
        return chain;
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

test('getDocs pagina além de 1000 linhas (PostgREST max-rows)', async () => {
  const many = Array.from({ length: 2350 }, (_, i) => ({ id: `d${i}`, data: { n: i } }));
  const repo = makeSupabaseRepo(fakeClient({ invoices: many }));
  const snap = await repo.getDocs('invoices', 'invoices', true);
  assert.equal(snap.docs.length, 2350);
  assert.equal(snap.docs[0].id, 'd0');
  assert.equal(snap.docs[2349].id, 'd2349');
});

test('getDocsWithLimit respeita o teto sem paginar', async () => {
  const many = Array.from({ length: 1500 }, (_, i) => ({ id: `d${i}`, data: { n: i } }));
  const repo = makeSupabaseRepo(fakeClient({ invoices: many }));
  const snap = await repo.getDocsWithLimit('invoices', 10, true);
  assert.equal(snap.docs.length, 10);
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

test('getPendingReminders retorna só lembretes não notificados e vencidos, com shape callable', async () => {
  const store = {
    reminders: [
      { id: 'r1', data: { notified: false, date: '2020-01-01' } },
      { id: 'r2', data: { notified: true, date: '2020-01-01' } },
      { id: 'r3', data: { notified: false, date: '2999-01-01' } }
    ]
  };
  const repo = makeSupabaseRepo(fakeClient(store));
  const snap = await repo.getPendingReminders('2021-01-01');
  assert.equal(snap.empty, false);
  assert.equal(snap.docs.length, 1);
  assert.equal(snap.docs[0].id, 'r1');
  assert.equal(typeof snap.docs[0].data, 'function');
  assert.equal(snap.docs[0].data().notified, false);
  assert.equal(snap.docs[0].exists(), true);
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

function failingClient() {
  const err = { message: 'boom' };
  const q: any = {
    select() { return q; }, eq() { return q; }, limit() { return q; }, range() { return q; },
    maybeSingle() { return Promise.resolve({ data: null, error: err }); },
    then(resolve: any) { return Promise.resolve(resolve({ data: null, error: err })); },
  };
  const api: any = { schema: () => api, from: () => q };
  return api;
}

test('updateIfVersion: versão certa grava e incrementa', async () => {
  const store: any = { shopping_lists: [{ id: 'l1', data: { items: [], version: 2 }, updated_at: 't1' }] };
  const repo = makeSupabaseRepo(fakeClient(store));
  const r = await repo.updateIfVersion(repo.doc('shopping_lists', 'l1'), { items: [1] }, 2, 'shopping_lists/l1');
  assert.equal(r, 'ok');
  assert.equal(store.shopping_lists[0].data.version, 3);
  assert.deepEqual(store.shopping_lists[0].data.items, [1]);
});

test('updateIfVersion: versão velha dá conflict e não grava', async () => {
  const store: any = { shopping_lists: [{ id: 'l1', data: { items: [], version: 5 }, updated_at: 't1' }] };
  const repo = makeSupabaseRepo(fakeClient(store));
  assert.equal(await repo.updateIfVersion(repo.doc('shopping_lists', 'l1'), { items: [9] }, 4, 'shopping_lists/l1'), 'conflict');
  assert.deepEqual(store.shopping_lists[0].data.items, []);
});

test('updateIfVersion: documento sem version vale 0; inexistente dá not_found', async () => {
  const store: any = { shopping_lists: [{ id: 'l1', data: { items: [] }, updated_at: 't1' }] };
  const repo = makeSupabaseRepo(fakeClient(store));
  assert.equal(await repo.updateIfVersion(repo.doc('shopping_lists', 'l1'), { items: [1] }, 0, 'shopping_lists/l1'), 'ok');
  assert.equal(await repo.updateIfVersion(repo.doc('shopping_lists', 'nao'), { items: [1] }, 0, 'shopping_lists/nao'), 'not_found');
});

test('updateIfVersion: updated_at mudou entre leitura e gravação dá conflict e não grava', async () => {
  const store: any = { shopping_lists: [{ id: 'l1', data: { items: [], version: 1 }, updated_at: 't1' }] };
  const client = fakeClient(store);
  const realFrom = client.from;
  // Simula outra gravação logo depois da leitura (maybeSingle): muda updated_at antes do update.
  client.from = (t: string) => {
    const q = realFrom(t);
    const origMaybe = q.maybeSingle;
    q.maybeSingle = async () => {
      const r = await origMaybe();
      store.shopping_lists[0].updated_at = 't2';
      return r;
    };
    return q;
  };
  const repo = makeSupabaseRepo(client);
  assert.equal(await repo.updateIfVersion(repo.doc('shopping_lists', 'l1'), { items: [7] }, 1, 'shopping_lists/l1'), 'conflict');
  assert.deepEqual(store.shopping_lists[0].data.items, []);
  assert.equal(store.shopping_lists[0].data.version, 1);
});

test('getDocs strict lança quando a leitura falha; sem strict devolve vazio', async () => {
  const repo = makeSupabaseRepo(failingClient());
  await assert.rejects(() => repo.getDocs('strict_a', 'strict_a', true, true), /leitura falhou/);
  const snap = await repo.getDocs('strict_b', 'strict_b', true);
  assert.equal(snap.empty, true);
  assert.equal(snap.docs.length, 0);
});

test('getDoc strict lança quando a leitura falha; sem strict devolve exists false', async () => {
  const repo = makeSupabaseRepo(failingClient());
  const ref = await repo.doc('strict_c', 'x');
  await assert.rejects(() => repo.getDoc(ref, 'strict_c/x', true, true), /leitura falhou/);
  const snap = await repo.getDoc(ref, 'strict_c/x', true);
  assert.equal(snap.exists(), false);
});

test('getDoc strict: documento ausente não é erro', async () => {
  const repo = makeSupabaseRepo(fakeClient({}));
  const ref = await repo.doc('strict_d', 'x');
  const snap = await repo.getDoc(ref, 'strict_d/x', true, true);
  assert.equal(snap.exists(), false);
});
