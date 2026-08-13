import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { 
  initializeFirestore, 
  persistentLocalCache, 
  persistentMultipleTabManager, 
  getFirestore,
  disableNetwork,
  enableNetwork,
  terminate,
  clearIndexedDbPersistence
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Global singleton for Firestore to prevent multiple initializations in HMR environments
let firestoreDb;

if (getApps().length === 0) {
  const app = initializeApp(firebaseConfig);
  // Default initialization is more stable in current AI Studio environment.
  // Standard streaming (WebSockets) sometimes fails with "Unexpected state" in Firestore 11.2.0.
  // Enabling experimentalForceLongPolling stabilizes the connection in proxy-heavy environments.
  // Using persistentLocalCache to reduce read units on page reloads and allow offline usage.
  firestoreDb = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    experimentalForceLongPolling: true
  }, firebaseConfig.firestoreDatabaseId || '(default)');
} else {
  const app = getApp();
  firestoreDb = getFirestore(app, firebaseConfig.firestoreDatabaseId || '(default)');
}

export const db = firestoreDb;
export { disableNetwork, enableNetwork, terminate, clearIndexedDbPersistence };
export const auth = getAuth(getApp());

export const googleProvider = new GoogleAuthProvider();

export { signInWithPopup, signOut, onAuthStateChanged, signInAnonymously };
