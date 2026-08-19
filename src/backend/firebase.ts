import {
  getFirestore,
  collection,
  getDocs,
  doc,
  updateDoc,
  setDoc,
  deleteDoc,
  getDoc,
  query,
  limit
} from 'firebase/firestore/lite';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirebaseConfig, IS_VERCEL } from './config.js';
import { getCollectionPrefix, isTestModeActive } from './context.js';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

/**
 * Tipos de operação para logs
 */
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

let adminDb: any = null;
let clientDb: any = null;
let adminDisabled = true;

/**
 * Inicializa os SDKs do Firebase (Admin e Client)
 */
let initPromise: Promise<void> | null = null;

export const initFirebase = async () => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const firebaseConfig = await getFirebaseConfig();

    // Initialize Admin SDK
    try {
      if (IS_VERCEL) {
        console.log("[Firebase] Vercel environment detected. Skipper Admin SDK init completely to avoid metadata credential hangs.");
        adminDisabled = true;
      } else {
        const { initializeApp: initAdminApp, getApps: getAdminApps } = await import('firebase-admin/app');
        const { getFirestore: getAdminFirestore } = await import('firebase-admin/firestore');

        if (getAdminApps().length === 0) {
          initAdminApp({ projectId: firebaseConfig.projectId });
        }
        const dbId = firebaseConfig.firestoreDatabaseId || '(default)';
        try {
          adminDb = getAdminFirestore(dbId);
        } catch (dbErr) {
          adminDb = getAdminFirestore();
        }

        // Quick health check for Admin SDK
        try {
          await adminDb.collection('_health_check').limit(1).get();
          console.log("[Firebase] Admin SDK verified successfully.");
          adminDisabled = false;
        } catch (healthErr: any) {
          console.log("[Firebase] Admin SDK status: client-only mode active (Server SDK bypassed).");
          adminDisabled = true;
        }
      }
    } catch (e) {
      console.log("[Firebase] Admin SDK status: client-only mode active.");
    }

    // Initialize Client SDK
    if (firebaseConfig.apiKey && firebaseConfig.projectId) {
      try {
        const clientApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
        clientDb = getFirestore(clientApp, firebaseConfig.firestoreDatabaseId || '(default)');
        console.log("[Firebase] Client SDK initialized with Firestore Lite.");
      } catch (err) {
        console.error("[Firebase] Client SDK init failed:", err);
      }
    }
  })();

  return initPromise;
};

/**
 * Retorna a instância ativa do banco (prefere Admin)
 */
export const getDb = async () => {
  if (!adminDb && !clientDb) {
    await initFirebase();
  }
  if (adminDb && !adminDisabled) return adminDb;

  if (!clientDb) {
    console.warn("[Firebase] clientDb está nulo em getDb(), tentando inicialização forçada de recuperação...");
    try {
      const firebaseConfig = await getFirebaseConfig();
      const clientApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      clientDb = getFirestore(clientApp, firebaseConfig.firestoreDatabaseId || '(default)');
      console.log("[Firebase] Recuperação do clientDb por inicialização forçada realizada com sucesso!");
    } catch (e) {
      console.error("[Firebase] Inicialização forçada de recuperação do clientDb falhou:", e);
    }
  }

  if (!clientDb) {
    throw new Error("Erro de conexão com o Banco de Dados: O SDK do Firebase não pôde ser inicializado no servidor.");
  }

  return clientDb;
};

/**
 * Serialização segura para logs
 */
const safeStringify = (obj: any): string => {
  try {
    return JSON.stringify(obj, null, 2);
  } catch (e) {
    return '[Serialization Error]';
  }
};

let g_quotaExceededActive = false;
let g_quotaExceededTime = 0;
const QUOTA_COOLDOWN = 3600000; // 1 hora de cooldown antes de tentar o Firestore novamente

function checkQuotaExceeded(): boolean {
  if (g_quotaExceededActive) {
    if (Date.now() - g_quotaExceededTime > QUOTA_COOLDOWN) {
      g_quotaExceededActive = false;
      try {
        const flagFile = path.join(process.cwd(), 'firestore_quota_exceeded_flag.json');
        if (fs.existsSync(flagFile)) {
          fs.unlinkSync(flagFile);
        }
      } catch (e) {}
      console.log("[FirestoreCache] Cooldown expirado. Tentando restabelecer conexao com o Firestore...");
      return false;
    }
    return true;
  }

  try {
    const flagFile = path.join(process.cwd(), 'firestore_quota_exceeded_flag.json');
    if (fs.existsSync(flagFile)) {
      const content = fs.readFileSync(flagFile, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && parsed.time && (Date.now() - parsed.time < QUOTA_COOLDOWN)) {
        g_quotaExceededActive = true;
        g_quotaExceededTime = parsed.time;
        return true;
      } else {
        fs.unlinkSync(flagFile);
      }
    }
  } catch (e) {}

  return false;
}

function setQuotaExceededActive() {
  if (!g_quotaExceededActive) {
    g_quotaExceededActive = true;
    g_quotaExceededTime = Date.now();
    console.warn("[FirestoreCache] Circuito Aberto: Limite de Cota do Firestore Excedido. Ativando bypass automatico de cache offline.");

    if (!IS_VERCEL) {
      try {
        const flagFile = path.join(process.cwd(), 'firestore_quota_exceeded_flag.json');
        fs.writeFileSync(flagFile, JSON.stringify({ time: g_quotaExceededTime }), 'utf-8');
      } catch (e) {}
    }
  }
}

/**
 * Handler centralizado para erros de Firestore
 */
export const handleFirestoreError = (error: unknown, operationType: OperationType, path: string | null) => {
  const errInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: { userId: "server-context", usingAdmin: !!adminDb },
    operationType,
    path
  };

  const errStr = errInfo.error.toLowerCase();
  const isQuota = errStr.includes('quota') || errStr.includes('resource-exhausted') || errStr.includes('limit') || errStr.includes('permission_denied') || errStr.includes('insufficient permissions');

  if (isQuota) {
    setQuotaExceededActive();
    console.log(`[FirestoreCache] Operacao restrita (${operationType}) em ${path} tratada com bypass offline por limite de cota.`);
    return errInfo;
  }

  // Skip throwing for NOT_FOUND / 404
  if (errStr.includes('not found') || errStr.includes('404')) {
    console.warn('[FirestoreWarn]', safeStringify(errInfo));
    return errInfo;
  }

  console.error('[FirestoreError]', safeStringify(errInfo));
  return errInfo;
};

// Memory Cache structures to prevent quota exhaustion and provide fallback
interface CachedDocs {
  timestamp: number;
  docs: Array<{ id: string; ref?: any; data: () => any }>;
  version?: number;
}

interface CachedDoc {
  timestamp: number;
  exists: boolean;
  data: any;
}

const g_docsCache: Record<string, CachedDocs> = {};
const g_docCache: Record<string, CachedDoc> = {};
const g_pendingPromises: Record<string, Promise<any>> = {};
const g_collectionVersions: Record<string, number> = {};

function getCollectionTTL(key: string): number {
  const clean = key.split('/')[0];
  if (['shopping_lists', 'delivered_products', 'reminders', 'pending_list_products'].includes(clean)) {
    return 10000; // 10 segundos para listas, entregas e lembretes (dados dinâmicos)
  }
  if (['invoices', 'xml_spendings', 'price_increases', 'suppliers'].includes(clean)) {
    return 30000; // 30 segundos para faturas, gastos e fornecedores
  }
  return 60000; // 1 minuto padrão para o restante
}

function getCollectionVersion(key: string): number {
  const clean = key.split('/')[0];
  if (!g_collectionVersions[clean]) {
    g_collectionVersions[clean] = 1;
  }
  return g_collectionVersions[clean];
}

function getCacheFilePath(key: string): string {
  return path.join(process.cwd(), `firestore_cache_${key.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

function saveCacheToDisk(key: string, docs: Array<{ id: string; data: any }>) {
  if (IS_VERCEL) {
    return; // Não grava cache em disco no ambiente do Vercel (sistema de arquivos read-only/efêmero)
  }
  try {
    const filePath = getCacheFilePath(key);
    fs.writeFileSync(filePath, JSON.stringify({
      timestamp: Date.now(),
      docs
    }, null, 2), 'utf-8');
    console.log(`[FirestoreCache] Cache persistido em disco para: ${key}`);
  } catch (err) {
    console.warn(`[FirestoreCache] Erro ao persistir cache em disco para: ${key}`, err);
  }
}

function loadCacheFromDisk(key: string, forceOnVercel: boolean = false): CachedDocs | null {
  if (IS_VERCEL && !forceOnVercel) {
    return null; // Não carrega cache do disco no Vercel por padrão para evitar ler dados estáticos pré-empacotados desatualizados
  }
  try {
    const filePath = getCacheFilePath(key);
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && Array.isArray(parsed.docs)) {
        return {
          timestamp: parsed.timestamp || Date.now(),
          docs: parsed.docs.map((doc: any) => ({
            id: doc.id,
            ref: null,
            data: () => doc.data
          }))
        };
      }
    }
  } catch (err) {
    console.warn(`[FirestoreCache] Erro ao carregar cache do disco para: ${key}`, err);
  }
  return null;
}

const invalidateCache = (pathStr: string) => {
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

function updateCacheWithDoc(pathStr: string, data: any) {
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
    const loaded = loadCacheFromDisk(cleanCollection, true);
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
    saveCacheToDisk(cleanCollection, cachedColl.docs.map((d: any) => ({
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

function deleteCacheDoc(pathStr: string) {
  if (!pathStr || pathStr === 'unknown') return;
  const parts = pathStr.split('/');
  const cleanCollection = parts[0];
  const docId = parts[1];

  if (g_docCache[pathStr]) {
    delete g_docCache[pathStr];
  }

  if (g_docsCache[cleanCollection] && docId) {
    g_docsCache[cleanCollection].docs = g_docsCache[cleanCollection].docs.filter((d: any) => d.id !== docId);
    saveCacheToDisk(cleanCollection, g_docsCache[cleanCollection].docs.map((d: any) => ({
      id: d.id,
      data: typeof d.data === 'function' ? d.data() : d.data
    })));
  }
}

/**
 * Armazenamento 100% local (disco) para o Modo de Teste.
 * Enquanto o Modo de Teste está ativo, nenhuma leitura/escrita toca o Firestore
 * real - tudo fica em arquivos JSON locais, evitando consumir a cota do banco.
 */
interface LocalTestDoc {
  id: string;
  data: any;
}

function getTestDataDir(): string {
  return IS_VERCEL ? path.join(os.tmpdir(), 'test-data') : path.join(process.cwd(), 'test-data');
}

function getTestDataFilePath(realColl: string): string {
  const dir = getTestDataDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return path.join(dir, `${realColl.replace(/[^a-zA-Z0-9_-]/g, '_')}.json`);
}

function loadLocalTestCollection(realColl: string): LocalTestDoc[] {
  try {
    const filePath = getTestDataFilePath(realColl);
    if (fs.existsSync(filePath)) {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      if (Array.isArray(parsed)) return parsed;
    }
  } catch (err) {
    console.warn(`[TestMode] Erro ao ler dados locais de teste para ${realColl}`, err);
  }
  return [];
}

function saveLocalTestCollection(realColl: string, docs: LocalTestDoc[]) {
  try {
    fs.writeFileSync(getTestDataFilePath(realColl), JSON.stringify(docs, null, 2), 'utf-8');
  } catch (err) {
    console.warn(`[TestMode] Erro ao gravar dados locais de teste para ${realColl}`, err);
  }
}

export function clearLocalTestCollection(realColl: string): number {
  const docs = loadLocalTestCollection(realColl);
  try {
    const filePath = getTestDataFilePath(realColl);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn(`[TestMode] Erro ao limpar dados locais de teste para ${realColl}`, err);
  }
  return docs.length;
}

/**
 * Wrapper de operações comuns do Firestore com Cache e Tolerância a Falha (Quota)
 */
export const fsOps = {
  collection: async (coll: string) => {
    const db: any = await getDb();
    const prefix = getCollectionPrefix();
    const realColl = prefix && !coll.startsWith(prefix) ? prefix + coll : coll;
    return db.collection ? db.collection(realColl) : collection(db, realColl);
  },
  getDocsWithLimit: async (coll: string, limitCount: number, forceNoCache: boolean = false) => {
    const prefix = getCollectionPrefix();
    const realColl = prefix && !coll.startsWith(prefix) ? prefix + coll : coll;

    if (isTestModeActive()) {
      const docs = loadLocalTestCollection(realColl).slice(0, limitCount);
      return {
        docs: docs.map(d => ({ id: d.id, data: () => d.data, exists: () => true })),
        empty: docs.length === 0
      };
    }

    const db: any = await getDb();
    const cacheKey = `${realColl}_limit_${limitCount}`;
    let collOrQuery;
    if (db.collection) {
      collOrQuery = db.collection(realColl).limit(limitCount);
    } else {
      collOrQuery = query(collection(db, realColl), limit(limitCount));
    }
    return fsOps.getDocs(collOrQuery, cacheKey, forceNoCache);
  },
  getDocs: async (collOrQuery: any, path: string = 'unknown', forceNoCache: boolean = false) => {
    const prefix = getCollectionPrefix();

    if (isTestModeActive() && typeof collOrQuery === 'string') {
      const realColl = prefix && !collOrQuery.startsWith(prefix) ? prefix + collOrQuery : collOrQuery;
      const docs = loadLocalTestCollection(realColl);
      return {
        docs: docs.map(d => ({ id: d.id, data: () => d.data, exists: () => true })),
        empty: docs.length === 0
      };
    }
    let cacheKey = typeof collOrQuery === 'string' ? collOrQuery : (path.split('/')[0] || 'query');
    if (cacheKey !== 'query' && prefix && !cacheKey.startsWith(prefix)) {
      cacheKey = prefix + cacheKey;
    }

    let realCollOrQuery = collOrQuery;
    if (typeof collOrQuery === 'string') {
      realCollOrQuery = prefix && !collOrQuery.startsWith(prefix) ? prefix + collOrQuery : collOrQuery;
    }

    if (forceNoCache) {
      const clean = cacheKey.split('/')[0];
      if (g_collectionVersions[clean]) {
        g_collectionVersions[clean]++;
      } else {
        g_collectionVersions[clean] = 2;
      }
    }

    let cached = g_docsCache[cacheKey];
    if (!cached) {
      const diskCached = loadCacheFromDisk(cacheKey, checkQuotaExceeded());
      if (diskCached) {
        g_docsCache[cacheKey] = diskCached;
        cached = diskCached;
      }
    }

    if (checkQuotaExceeded()) {
      console.warn(`[FirestoreCache] [Bypass Ativo] Servindo cache local/memória para a coleção: ${cacheKey}`);
      if (cached) {
        return {
          docs: cached.docs,
          empty: cached.docs.length === 0
        };
      }
      return {
        docs: [],
        empty: true
      };
    }

    const now = Date.now();
    const ttl = getCollectionTTL(cacheKey);
    const version = getCollectionVersion(cacheKey.split('/')[0]);
    const isCacheExpired = forceNoCache || !cached || (now - cached.timestamp > ttl) || (cached.version !== version);

    if (!isCacheExpired && cached) {
      return {
        docs: cached.docs,
        empty: cached.docs.length === 0
      };
    }

    try {
      let rawSnap;
      if (typeof window !== 'undefined' && (window as any).__PRERENDER_INJECTED) {
        rawSnap = { docs: [], empty: true };
      } else {
        const db: any = await getDb();
        if (db.collection) {
          if (typeof realCollOrQuery === 'string') rawSnap = await db.collection(realCollOrQuery).get();
          else rawSnap = await realCollOrQuery.get();
        } else {
          if (typeof realCollOrQuery === 'string') rawSnap = await getDocs(collection(db, realCollOrQuery));
          else rawSnap = await getDocs(realCollOrQuery);
        }
      }

      const res = {
        docs: rawSnap.docs.map((doc: any) => {
            const dData = typeof doc.data === 'function' ? doc.data() : (doc.data || {});
            return {
              id: doc.id,
              data: () => dData,
              exists: () => true
            };
        }),
        empty: rawSnap.empty
      };

      const cachedDocs: CachedDocs = {
        timestamp: Date.now(),
        docs: res.docs.map((d: any) => ({ id: d.id, data: d.data() })),
        version
      };
      g_docsCache[cacheKey] = cachedDocs;
      saveCacheToDisk(cacheKey, cachedDocs.docs);

      return res;
    } catch (err: any) {
      handleFirestoreError(err, OperationType.LIST, cacheKey);
      if (cached) {
        console.warn(`[FirestoreCache] Erro ao ler ${cacheKey}, retornando cache de memória como fallback.`);
        return { docs: cached.docs, empty: cached.docs.length === 0 };
      }
      return { docs: [], empty: true };
    }
  },
  update: async (refPromise: any, data: any, path: string = 'unknown') => {
    const ref = await refPromise;
    if (ref && ref.__local) {
      const docs = loadLocalTestCollection(ref.collection);
      const idx = docs.findIndex(d => d.id === ref.id);
      if (idx >= 0) {
        docs[idx] = { id: ref.id, data: { ...docs[idx].data, ...data } };
      } else {
        docs.push({ id: ref.id, data });
      }
      saveLocalTestCollection(ref.collection, docs);
      return;
    }

    const prefix = getCollectionPrefix();
    const realPath = path !== 'unknown' && prefix && !path.startsWith(prefix) ? prefix + path : path;
    const existing = g_docCache[realPath]?.data || {};
    updateCacheWithDoc(realPath, { ...existing, ...data });
    try {
      return ref.update ? await ref.update(data) : await updateDoc(ref, data);
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, realPath);
      if (checkQuotaExceeded()) {
        console.warn(`[FirestoreCache] Operação de atualização em ${realPath} mantida em bypass offline.`);
        return;
      }
      throw err;
    }
  },
  doc: async (coll: string, id: string) => {
    const prefix = getCollectionPrefix();
    const realColl = prefix && !coll.startsWith(prefix) ? prefix + coll : coll;
    if (isTestModeActive()) {
      return { __local: true, collection: realColl, id };
    }
    const db: any = await getDb();
    return db.collection ? db.collection(realColl).doc(id) : doc(db, realColl, id);
  },
  getDoc: async (refPromise: any, path: string = 'unknown', forceNoCache: boolean = false) => {
    const ref = await refPromise;
    if (ref && ref.__local) {
      const docs = loadLocalTestCollection(ref.collection);
      const found = docs.find(d => d.id === ref.id);
      return {
        exists: () => !!found,
        data: () => (found ? found.data : {}),
        id: ref.id
      };
    }

    const prefix = getCollectionPrefix();
    const realPath = path !== 'unknown' && prefix && !path.startsWith(prefix) ? prefix + path : path;
    const cacheKey = realPath;
    const cached = g_docCache[cacheKey];

    if (checkQuotaExceeded()) {
      console.warn(`[FirestoreCache] [Bypass Ativo] Servindo cache offline para o documento: ${cacheKey}`);
      if (cached) {
        return {
          exists: () => cached.exists,
          data: () => cached.data,
          id: cacheKey.split('/').pop() || 'unknown'
        };
      }
      return {
        exists: () => false,
        data: () => ({}),
        id: cacheKey.split('/').pop() || 'unknown'
      };
    }

    const now = Date.now();
    const ttl = getCollectionTTL(cacheKey);
    const isCacheExpired = forceNoCache || !cached || (now - cached.timestamp > ttl);

    if (!isCacheExpired && cached) {
      return {
        exists: () => cached.exists,
        data: () => cached.data,
        id: cacheKey.split('/').pop() || 'unknown'
      };
    }

    try {
      const rawDoc = ref.get ? await ref.get() : await getDoc(ref);

      const existsVal = typeof rawDoc.exists === 'function' ? rawDoc.exists() : !!rawDoc.exists;
      const dData = typeof rawDoc.data === 'function' ? rawDoc.data() : (rawDoc.data || {});
      const res = {
        exists: () => existsVal,
        data: () => dData,
        id: rawDoc.id
      };

      if (res.exists()) {
        g_docCache[cacheKey] = {
          timestamp: Date.now(),
          data: res.data(),
          exists: res.exists()
        };
      }

      return res;
    } catch (err: any) {
      handleFirestoreError(err, OperationType.GET, cacheKey);
      if (cached) {
        return {
          exists: () => cached.exists,
          data: () => cached.data,
          id: cacheKey.split('/').pop() || 'unknown'
        };
      }
      return {
        exists: () => false,
        data: () => ({}),
        id: cacheKey.split('/').pop() || 'unknown'
      };
    }
  },
  set: async (refPromise: any, data: any, path: string = 'unknown') => {
    const ref = await refPromise;
    if (ref && ref.__local) {
      const docs = loadLocalTestCollection(ref.collection);
      const idx = docs.findIndex(d => d.id === ref.id);
      const docItem = { id: ref.id, data };
      if (idx >= 0) {
        docs[idx] = docItem;
      } else {
        docs.push(docItem);
      }
      saveLocalTestCollection(ref.collection, docs);
      return;
    }

    const prefix = getCollectionPrefix();
    const realPath = path !== 'unknown' && prefix && !path.startsWith(prefix) ? prefix + path : path;
    updateCacheWithDoc(realPath, data);
    try {
      return ref.set ? await ref.set(data) : await setDoc(ref, data);
    } catch (err: any) {
      if (typeof err.message === 'string' && (err.message.toLowerCase().includes('not found') || err.message.includes('404'))) {
        console.warn(`[FirestoreWarn] Set operation failed (Not Found) at ${realPath}`);
        return;
      }
      handleFirestoreError(err, OperationType.WRITE, realPath);
      if (checkQuotaExceeded()) {
        console.warn(`[FirestoreCache] Operação de escrita em ${realPath} mantida em bypass offline.`);
        return;
      }
      throw err;
    }
  },
  delete: async (refPromise: any, path: string = 'unknown') => {
    const ref = await refPromise;
    if (ref && ref.__local) {
      const docs = loadLocalTestCollection(ref.collection).filter(d => d.id !== ref.id);
      saveLocalTestCollection(ref.collection, docs);
      return;
    }

    const prefix = getCollectionPrefix();
    const realPath = path !== 'unknown' && prefix && !path.startsWith(prefix) ? prefix + path : path;
    deleteCacheDoc(realPath);
    try {
      console.log(`[Firestore] Deleting doc at path: ${realPath}`);
      const result =  ref.delete ? await ref.delete() : await deleteDoc(ref);
      console.log(`[Firestore] Delete successful for path: ${realPath}`);
      return result;
    } catch (err: any) {
      console.error(`[Firestore] Delete failed for path: ${realPath}`, err);
      if (typeof err.message === 'string' && (err.message.toLowerCase().includes('not found') || err.message.includes('404'))) {
        console.warn(`[FirestoreWarn] Delete operation failed (Not Found) at ${realPath}`);
        return;
      }
      handleFirestoreError(err, OperationType.DELETE, realPath);
      if (checkQuotaExceeded()) {
        console.warn(`[FirestoreCache] Operação de exclusão em ${realPath} mantida em bypass offline.`);
        return;
      }
      throw err;
    }
  },
  invalidateCache: (pathStr: string) => {
    const prefix = getCollectionPrefix();
    const realPath = prefix && !pathStr.startsWith(prefix) ? prefix + pathStr : pathStr;
    invalidateCache(realPath);
  },
  getCollectionVersion: (pathStr: string) => {
    const prefix = getCollectionPrefix();
    const realPath = prefix && !pathStr.startsWith(prefix) ? prefix + pathStr : pathStr;
    return getCollectionVersion(realPath);
  }
};
