/**
 * Camada de cache em memória com TTL por coleção e versionamento de coleção.
 * Extraído de `src/backend/firebase.ts` sem alteração de lógica.
 *
 * A persistência em disco (`saveCacheToDisk` / `loadCacheFromDisk`) permanece
 * em `firestoreRepo.ts` e é injetada aqui via `registerDiskPersistence`, de modo
 * que `updateCacheWithDoc` / `deleteCacheDoc` mantenham exatamente o mesmo
 * comportamento de antes.
 */

// Memory Cache structures to prevent quota exhaustion and provide fallback
export interface CachedDocs {
  timestamp: number;
  docs: Array<{ id: string; ref?: any; data: () => any }>;
  version?: number;
}

export interface CachedDoc {
  timestamp: number;
  exists: boolean;
  data: any;
}

export const g_docsCache: Record<string, CachedDocs> = {};
export const g_docCache: Record<string, CachedDoc> = {};
export const g_collectionVersions: Record<string, number> = {};

// Hooks de persistência em disco, injetados pelo firestoreRepo.
type DiskSaveFn = (key: string, docs: Array<{ id: string; data: any }>) => void;
type DiskLoadFn = (key: string, forceOnVercel?: boolean) => CachedDocs | null;

let diskSave: DiskSaveFn = () => {};
let diskLoad: DiskLoadFn = () => null;

export function registerDiskPersistence(save: DiskSaveFn, load: DiskLoadFn) {
  diskSave = save;
  diskLoad = load;
}

export function getCollectionTTL(key: string): number {
  const clean = key.split('/')[0];
  if (['shopping_lists', 'delivered_products', 'reminders', 'pending_list_products'].includes(clean)) {
    return 10000; // 10 segundos para listas, entregas e lembretes (dados dinâmicos)
  }
  if (['invoices', 'xml_spendings', 'price_increases', 'suppliers'].includes(clean)) {
    return 30000; // 30 segundos para faturas, gastos e fornecedores
  }
  return 60000; // 1 minuto padrão para o restante
}

export function getCollectionVersion(key: string): number {
  const clean = key.split('/')[0];
  if (!g_collectionVersions[clean]) {
    g_collectionVersions[clean] = 1;
  }
  return g_collectionVersions[clean];
}

export const invalidateCache = (pathStr: string) => {
  const cleanCollection = pathStr.split('/')[0];
  if (g_collectionVersions[cleanCollection]) {
    g_collectionVersions[cleanCollection]++;
  } else {
    g_collectionVersions[cleanCollection] = 2;
  }
  console.log(`[FirestoreCache] Collection version incremented for ${cleanCollection}: ${g_collectionVersions[cleanCollection]}`);

  // Limpa apenas a entrada de doc único individual
  if (g_docCache[pathStr]) {
    delete g_docCache[pathStr];
    console.log(`[FirestoreCache] Invalidated individual doc cache for: ${pathStr}`);
  }
};

export function updateCacheWithDoc(pathStr: string, data: any) {
  if (!pathStr || pathStr === 'unknown') return;
  const parts = pathStr.split('/');
  const cleanCollection = parts[0];
  const docId = parts[1] || (data && data.id);

  if (!cleanCollection) return;

  // 1. Atualiza cache do documento único
  g_docCache[pathStr] = {
    timestamp: Date.now(),
    data,
    exists: true
  };

  // 2. Garante que g_docsCache possua a coleção carregada
  if (!g_docsCache[cleanCollection]) {
    const loaded = diskLoad(cleanCollection, true);
    if (loaded) {
      g_docsCache[cleanCollection] = loaded;
    } else {
      g_docsCache[cleanCollection] = {
        timestamp: Date.now(),
        docs: [],
        version: getCollectionVersion(cleanCollection)
      };
    }
  }

  const cachedColl = g_docsCache[cleanCollection];
  if (cachedColl && Array.isArray(cachedColl.docs)) {
    if (docId) {
      const idx = cachedColl.docs.findIndex((d: any) => d.id === docId);
      const newDocItem = {
        id: docId,
        ref: null,
        data: typeof data === 'function' ? data : () => data
      };
      if (idx >= 0) {
        cachedColl.docs[idx] = newDocItem;
      } else {
        cachedColl.docs.unshift(newDocItem);
      }
    }
    cachedColl.timestamp = Date.now();
    diskSave(cleanCollection, cachedColl.docs.map((d: any) => ({
      id: d.id,
      data: typeof d.data === 'function' ? d.data() : d.data
    })));
  }

  // Atualiza chaves derivadas de limite na memória se existirem
  Object.keys(g_docsCache).forEach(k => {
    if (k.startsWith(cleanCollection + '_limit_')) {
      const pColl = g_docsCache[k];
      if (pColl && Array.isArray(pColl.docs) && docId) {
        const idx = pColl.docs.findIndex((d: any) => d.id === docId);
        const newDocItem = {
          id: docId,
          ref: null,
          data: typeof data === 'function' ? data : () => data
        };
        if (idx >= 0) {
          pColl.docs[idx] = newDocItem;
        } else {
          pColl.docs.unshift(newDocItem);
        }
      }
    }
  });
}

export function deleteCacheDoc(pathStr: string) {
  if (!pathStr || pathStr === 'unknown') return;
  const parts = pathStr.split('/');
  const cleanCollection = parts[0];
  const docId = parts[1];

  if (g_docCache[pathStr]) {
    delete g_docCache[pathStr];
  }

  if (g_docsCache[cleanCollection] && docId) {
    g_docsCache[cleanCollection].docs = g_docsCache[cleanCollection].docs.filter((d: any) => d.id !== docId);
    diskSave(cleanCollection, g_docsCache[cleanCollection].docs.map((d: any) => ({
      id: d.id,
      data: typeof d.data === 'function' ? d.data() : d.data
    })));
  }
}
