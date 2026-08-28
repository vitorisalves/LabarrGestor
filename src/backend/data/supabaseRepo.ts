/**
 * Implementação de `DataRepo` sobre Postgres/Supabase.
 *
 * Espelha a semântica de `firestoreRepo` (cache TTL/versão em memória via
 * `cache.ts`, mesmo formato de retorno), MENOS o circuit-breaker de cota,
 * a persistência em disco e o armazenamento local do Modo de Teste — no
 * Postgres o schema `test` cobre o Modo de Teste.
 *
 * Regras de build: sem top-level await, sem require(), sem import() dinâmico.
 * O módulo é side-effect-free no load: `createClient` só é chamado
 * preguiçosamente dentro de `getClient()`, invocado apenas quando um método
 * do repo realmente roda com `DATA_BACKEND=supabase`.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getCollectionPrefix, isTestModeActive } from '../context.js';
import { IS_VERCEL } from '../config.js';
import {
  CachedDocs,
  g_docsCache,
  g_docCache,
  g_collectionVersions,
  getCollectionTTL,
  getCollectionVersion,
  invalidateCache,
  updateCacheWithDoc,
  deleteCacheDoc
} from './cache.js';
import type { DataRepo, QuerySnapshot, DocRef } from './types.js';

let g_client: SupabaseClient | null = null;

export function getClient(): SupabaseClient {
  if (g_client) return g_client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_URL/SUPABASE_SERVICE_KEY not set');
  }
  g_client = createClient(url, key, { db: { schema: 'public' } });
  return g_client;
}

/**
 * Converte recursivamente Firestore `Timestamp` (`typeof v?.toDate === 'function'`)
 * e `Date` para string ISO. Strings ISO, números e o restante passam intactos.
 * Usado também pelo backfill da Task 8.
 */
export function normalizeTimestamps(obj: any): any {
  if (obj == null) return obj;
  if (obj instanceof Date) return obj.toISOString();
  if (typeof obj?.toDate === 'function') {
    try {
      const d = obj.toDate();
      return d instanceof Date ? d.toISOString() : d;
    } catch {
      return obj;
    }
  }
  if (Array.isArray(obj)) return obj.map(normalizeTimestamps);
  if (typeof obj === 'object') {
    const out: any = {};
    for (const k of Object.keys(obj)) out[k] = normalizeTimestamps(obj[k]);
    return out;
  }
  return obj;
}

export function makeSupabaseRepo(clientOverride?: SupabaseClient): DataRepo {
  const client = (): SupabaseClient => clientOverride ?? getClient();
  const schemaFor = (): 'test' | 'public' => (isTestModeActive() ? 'test' : 'public');
  const table = (coll: string) => (client() as any).schema(schemaFor()).from(coll);

  const realPathOf = (path: string): string => {
    const prefix = getCollectionPrefix();
    return path !== 'unknown' && prefix && !path.startsWith(prefix) ? prefix + path : path;
  };

  async function readSnapshot(coll: string, cacheKey: string, forceNoCache: boolean, limitN?: number): Promise<QuerySnapshot> {
    // Modo de Teste no Vercel: cada instância serverless tem seu próprio cache
    // em memória — uma pode apagar enquanto outra serve dado obsoleto.
    if (isTestModeActive() && IS_VERCEL) forceNoCache = true;

    if (forceNoCache) {
      const clean = cacheKey.split('/')[0];
      g_collectionVersions[clean] = g_collectionVersions[clean] ? g_collectionVersions[clean] + 1 : 2;
    }

    const cached = g_docsCache[cacheKey];
    const now = Date.now();
    const ttl = getCollectionTTL(cacheKey);
    const version = getCollectionVersion(cacheKey.split('/')[0]);
    const isCacheExpired = forceNoCache || !cached || (now - cached.timestamp > ttl) || (cached.version !== version);

    const fromCache = (c: CachedDocs): QuerySnapshot => ({
      docs: c.docs.map((d: any) => ({
        id: d.id,
        data: typeof d.data === 'function' ? d.data : () => d.data,
        exists: () => true,
      })),
      empty: c.docs.length === 0,
    });

    if (!isCacheExpired && cached) {
      return fromCache(cached);
    }

    try {
      let data: any[] | null = null;
      let error: any = null;

      if (typeof limitN === 'number') {
        // Caller pediu um teto explícito (getDocsWithLimit) — uma página basta.
        ({ data, error } = await table(coll).select('id,data').limit(limitN));
      } else {
        // Leitura completa: o PostgREST limita a resposta a `max-rows` (1000 por
        // padrão no Supabase), então paginamos com range() até esgotar. Sem isso
        // coleções com >1000 docs (ex.: invoices) voltariam truncadas em silêncio.
        const PAGE = 1000;
        const acc: any[] = [];
        for (let from = 0; ; from += PAGE) {
          const res = await table(coll).select('id,data').range(from, from + PAGE - 1);
          if (res.error) { error = res.error; break; }
          const page: any[] = res.data ?? [];
          acc.push(...page);
          if (page.length < PAGE) break;
        }
        if (!error) data = acc;
      }

      if (error) {
        console.error(`[SupabaseRepo] Erro ao ler ${cacheKey}:`, error.message ?? error);
        if (cached) return fromCache(cached);
        return { docs: [], empty: true };
      }
      const docs = (data ?? []).map((row: any) => ({
        id: row.id,
        data: () => row.data,
        exists: () => true
      }));
      const cachedDocs: CachedDocs = {
        timestamp: Date.now(),
        docs: docs.map((d: any) => ({ id: d.id, data: d.data() })),
        version
      };
      g_docsCache[cacheKey] = cachedDocs;
      return { docs, empty: docs.length === 0 };
    } catch (err: any) {
      console.error(`[SupabaseRepo] Falha ao ler ${cacheKey}:`, err?.message ?? err);
      if (cached) return fromCache(cached);
      return { docs: [], empty: true };
    }
  }

  const repo: DataRepo = {
    async collection(coll: string) {
      return table(coll);
    },

    async getDocs(coll: string, _path: string = 'unknown', forceNoCache: boolean = false): Promise<QuerySnapshot> {
      const cacheKey = (schemaFor() === 'test' ? 'test_' : '') + coll;
      return readSnapshot(coll, cacheKey, forceNoCache);
    },

    async getDocsWithLimit(coll: string, limitCount: number, forceNoCache: boolean = false): Promise<QuerySnapshot> {
      const cacheKey = (schemaFor() === 'test' ? 'test_' : '') + coll + `_limit_${limitCount}`;
      return readSnapshot(coll, cacheKey, forceNoCache, limitCount);
    },

    async getDoc(refPromise: DocRef | Promise<DocRef>, path: string = 'unknown', forceNoCache: boolean = false) {
      const ref = await refPromise;
      const coll = ref.__coll;
      const id = ref.__id;
      const cacheKey = realPathOf(path);
      const cached = g_docCache[cacheKey];

      const now = Date.now();
      const ttl = getCollectionTTL(cacheKey);
      const isCacheExpired = forceNoCache || !cached || (now - cached.timestamp > ttl);
      if (!isCacheExpired && cached) {
        return { id, data: () => cached.data, exists: () => cached.exists };
      }

      const { data, error } = await table(coll).select('id,data').eq('id', id).maybeSingle();
      if (error) {
        console.error(`[SupabaseRepo] Erro ao ler doc ${cacheKey}:`, error.message ?? error);
        if (cached) return { id, data: () => cached.data, exists: () => cached.exists };
        return { id, data: () => ({}), exists: () => false };
      }
      if (data && cacheKey !== 'unknown') {
        g_docCache[cacheKey] = { timestamp: Date.now(), data: data.data, exists: true };
      }
      return { id, data: () => data?.data ?? {}, exists: () => !!data };
    },

    async doc(coll: string, id: string): Promise<DocRef> {
      return { __coll: coll, __id: id };
    },

    async set(refPromise: DocRef | Promise<DocRef>, data: any, path: string = 'unknown') {
      const ref = await refPromise;
      const realPath = realPathOf(path);
      const payload = { id: ref.__id, data: normalizeTimestamps(data), updated_at: new Date().toISOString() };
      const { error } = await table(ref.__coll).upsert(payload);
      if (error) throw new Error(`[SupabaseRepo] set falhou em ${realPath}: ${error.message ?? error}`);
      updateCacheWithDoc(realPath, data);
    },

    async update(refPromise: DocRef | Promise<DocRef>, patch: any, path: string = 'unknown') {
      const ref = await refPromise;
      const realPath = realPathOf(path);
      const { data: current, error: readErr } = await table(ref.__coll).select('data').eq('id', ref.__id).maybeSingle();
      if (readErr) throw new Error(`[SupabaseRepo] update(read) falhou em ${realPath}: ${readErr.message ?? readErr}`);
      const merged = { ...(current?.data ?? {}), ...normalizeTimestamps(patch) };
      const { error } = await table(ref.__coll).upsert({ id: ref.__id, data: merged, updated_at: new Date().toISOString() });
      if (error) throw new Error(`[SupabaseRepo] update falhou em ${realPath}: ${error.message ?? error}`);
      updateCacheWithDoc(realPath, merged);
    },

    async delete(refPromise: DocRef | Promise<DocRef>, path: string = 'unknown') {
      const ref = await refPromise;
      const realPath = realPathOf(path);
      const { error } = await table(ref.__coll).delete().eq('id', ref.__id);
      if (error) throw new Error(`[SupabaseRepo] delete falhou em ${realPath}: ${error.message ?? error}`);
      deleteCacheDoc(realPath);
    },

    invalidateCache(pathStr: string) {
      const prefix = getCollectionPrefix();
      const realPath = prefix && !pathStr.startsWith(prefix) ? prefix + pathStr : pathStr;
      invalidateCache(realPath);
    },

    getCollectionVersion(pathStr: string) {
      const prefix = getCollectionPrefix();
      const realPath = prefix && !pathStr.startsWith(prefix) ? prefix + pathStr : pathStr;
      return getCollectionVersion(realPath);
    },

    async getPendingReminders(nowIso: string): Promise<QuerySnapshot> {
      const { data } = await (client() as any).schema(schemaFor()).from('reminders').select('id,data');
      const docs = (data ?? [])
        .filter((r: any) => r.data?.notified === false && String(r.data?.date ?? '') <= nowIso)
        .map((r: any) => ({ id: r.id, data: () => r.data, exists: () => true }));
      return { docs, empty: docs.length === 0 };
    }
  };

  return repo;
}

export const supabaseRepo: DataRepo = makeSupabaseRepo();
