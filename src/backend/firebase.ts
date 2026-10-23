import { getFirestore } from 'firebase/firestore/lite';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirebaseConfig } from './config.js';

let clientDb: any = null;

/**
 * Inicializa o SDK cliente do Firebase (Firestore Lite)
 */
let initPromise: Promise<void> | null = null;

export const initFirebase = async () => {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const firebaseConfig = await getFirebaseConfig();

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
 * Retorna a instância ativa do banco
 */
export const getDb = async () => {
  if (!clientDb) {
    await initFirebase();
  }
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
