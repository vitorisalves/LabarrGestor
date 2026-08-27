import { getFirestore } from 'firebase/firestore/lite';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirebaseConfig, IS_VERCEL } from './config.js';

/**
 * Compatibilidade temporária: os call sites ainda importam `fsOps` (e alguns
 * helpers de quota / Modo de Teste) de `./firebase.js`. A implementação real
 * mora agora em `./data/firestoreRepo.js` atrás da interface `DataRepo`.
 * A Task 2 migra os call sites para `repo` de `./data` e remove estas linhas.
 */
export {
  fsOps,
  clearLocalTestCollection,
  checkQuotaExceeded,
  resetQuotaExceeded,
  handleFirestoreError,
  OperationType
} from './data/firestoreRepo.js';

let adminDb: any = null;
let clientDb: any = null;
let adminDisabled = true;

/** Indica se o Admin SDK está ativo (usado só para enriquecer logs de erro). */
export const isAdminDbActive = () => !!adminDb;

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
