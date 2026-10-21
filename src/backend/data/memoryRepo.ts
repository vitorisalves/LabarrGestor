/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DataRepo, DocData, DocRef, DocSnapshot, QuerySnapshot } from './types.js';
import { versionOf } from './version.js';

/** Repositório em memória para testes (guardado por DATA_BACKEND=memory; proibido em produção). */
export function makeMemoryRepo(): DataRepo {
  const store = new Map<string, Map<string, DocData>>();
  const versions = new Map<string, number>();
  const table = (c: string) => { let t = store.get(c); if (!t) { t = new Map(); store.set(c, t); } return t; };
  const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)); // como o jsonb: sem undefined/Date
  const snap = (id: string, data: DocData | undefined): DocSnapshot => ({
    id, data: () => clone(data ?? {}), exists: () => data !== undefined,
  });
  const qs = (docs: DocSnapshot[]): QuerySnapshot => ({ docs, empty: docs.length === 0 });
  const bump = (c: string) => versions.set(c, (versions.get(c) ?? 0) + 1);
  const refOf = async (r: DocRef | Promise<DocRef>): Promise<DocRef> => await r;

  const repo: DataRepo = {
    async collection(c: string) { return table(c); },
    async getDocs(c: string) { return qs([...table(c)].map(([id, d]) => snap(id, d))); },
    async getDocsWithLimit(c: string, n: number) { return qs([...table(c)].slice(0, n).map(([id, d]) => snap(id, d))); },
    async getDoc(ref) { const r = await refOf(ref); return snap(r.__id, table(r.__coll).get(r.__id)); },
    async doc(c: string, id: string) { return { __coll: c, __id: id }; },
    async set(ref, data) { const r = await refOf(ref); table(r.__coll).set(r.__id, clone(data)); bump(r.__coll); },
    async update(ref, data) {
      const r = await refOf(ref);
      table(r.__coll).set(r.__id, { ...(table(r.__coll).get(r.__id) ?? {}), ...clone(data) }); bump(r.__coll);
    },
    async updateIfVersion(ref, patch, expectedVersion) {
      const r = await refOf(ref);
      const cur = table(r.__coll).get(r.__id);
      if (!cur) return 'not_found';
      if (versionOf(cur) !== expectedVersion) return 'conflict';
      table(r.__coll).set(r.__id, { ...cur, ...clone(patch), version: expectedVersion + 1 }); bump(r.__coll);
      return 'ok';
    },
    async delete(ref) { const r = await refOf(ref); table(r.__coll).delete(r.__id); bump(r.__coll); },
    invalidateCache() { /* sem cache */ },
    getCollectionVersion(c: string) { return versions.get(c) ?? 0; },
    async getPendingReminders(nowIso: string) {
      // mesma regra do supabaseRepo.getPendingReminders
      return qs([...table('reminders')]
        .filter(([, d]) => d?.notified === false && String(d?.date ?? '') <= nowIso)
        .map(([id, d]) => snap(id, d)));
    },
  };
  return repo;
}
