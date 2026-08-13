import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const HARDCODED_FIREBASE_FALLBACK = {
  "projectId": "gen-lang-client-0797058892",
  "appId": "1:537926473295:web:ace7767bebec90f352bc3a",
  "apiKey": "AIzaSyB_aiE9vxewLqthVwg_hKHwOjKXHnS5jB0",
  "authDomain": "gen-lang-client-0797058892.firebaseapp.com",
  "firestoreDatabaseId": "ai-studio-bed5d8c6-de22-4942-9608-255e065ea8fb",
  "storageBucket": "gen-lang-client-0797058892.firebasestorage.app",
  "messagingSenderId": "537926473295",
  "measurementId": ""
};

const getFileFirebaseConfig = (): any => {
  // 1. Procurar em caminhos relativos ao process.cwd()
  try {
    const possiblePaths = [
      path.join(process.cwd(), 'firebase-applet-config.json'),
      path.join(process.cwd(), '..', 'firebase-applet-config.json'),
      path.join(process.cwd(), '../..', 'firebase-applet-config.json')
    ];
    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        return JSON.parse(fs.readFileSync(configPath, 'utf8'));
      }
    }
  } catch (e) {
    console.warn("[Config] Erro ao ler firebase-applet-config.json no cwd:", e);
  }

  // 2. Procurar em caminhos relativos ao arquivo atual (usando import.meta.url)
  try {
    if (typeof import.meta !== 'undefined' && import.meta && import.meta.url) {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.dirname(__filename);
      const resolvingPaths = [
        path.resolve(__dirname, '../../firebase-applet-config.json'),
        path.resolve(__dirname, '../../../firebase-applet-config.json'),
        path.resolve(__dirname, 'firebase-applet-config.json')
      ];
      for (const configPath of resolvingPaths) {
        if (fs.existsSync(configPath)) {
          return JSON.parse(fs.readFileSync(configPath, 'utf8'));
        }
      }
    }
  } catch (e) {
    // Silencioso se der erro no import.meta
  }

  return HARDCODED_FIREBASE_FALLBACK;
};

const firebaseConfigJson = getFileFirebaseConfig();

/**
 * Limpa variáveis de ambiente removendo aspas e espaços extras.
 */
export const sanitizeEnv = (val: string | undefined, fallback: string): string => {
  if (!val) return fallback;
  return val.trim().replace(/^["']|["']$/g, '');
};

/**
 * Configuração do Firebase
 */
export const getFirebaseConfig = async () => {
  let fileConfig: any = { ...firebaseConfigJson };
  
  try {
    const possiblePaths = [
      path.join(process.cwd(), 'firebase-applet-config.json'),
      path.join(process.cwd(), '..', 'firebase-applet-config.json'),
      path.join(process.cwd(), '../..', 'firebase-applet-config.json')
    ];
    for (const configPath of possiblePaths) {
      if (fs.existsSync(configPath)) {
        const fileContent = fs.readFileSync(configPath, 'utf8');
        fileConfig = JSON.parse(fileContent);
        break;
      }
    }
  } catch (e) {
    // Silencioso se falhar
  }

  // Se mesmo assim veio vazio (ou seja, sem projectId/apiKey), mescla com o fallback
  if (!fileConfig.projectId || !fileConfig.apiKey) {
    fileConfig = { ...HARDCODED_FIREBASE_FALLBACK, ...fileConfig };
  }

  let config: any = {
    projectId: process.env.VITE_FIREBASE_PROJECT_ID || fileConfig.projectId || HARDCODED_FIREBASE_FALLBACK.projectId,
    storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || fileConfig.storageBucket || HARDCODED_FIREBASE_FALLBACK.storageBucket,
    apiKey: process.env.VITE_FIREBASE_API_KEY || fileConfig.apiKey || HARDCODED_FIREBASE_FALLBACK.apiKey,
    authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || fileConfig.authDomain || HARDCODED_FIREBASE_FALLBACK.authDomain,
    messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || fileConfig.messagingSenderId || HARDCODED_FIREBASE_FALLBACK.messagingSenderId,
    appId: process.env.VITE_FIREBASE_APP_ID || fileConfig.appId || HARDCODED_FIREBASE_FALLBACK.appId,
    firestoreDatabaseId: process.env.VITE_FIREBASE_DATABASE_ID || fileConfig.firestoreDatabaseId || HARDCODED_FIREBASE_FALLBACK.firestoreDatabaseId
  };

  return config;
};

/**
 * Configuração da API Externa (Omie/Proxy)
 */
export const EXTERNAL_API_CONFIG = {
  baseUrl: sanitizeEnv(process.env.OMIE_BASE_URL || process.env.EXTERNAL_API_URL, "https://production-manager-api.onrender.com/v1").replace(/\/$/, ""),
  appKey: sanitizeEnv(process.env.OMIE_APP_KEY, ""),
  appSecret: sanitizeEnv(process.env.OMIE_APP_SECRET, "")
};

/**
 * Configuração do Gemini AI
 */
export const AI_CONFIG = {
  apiKey: (process.env.G_API_KEY || process.env.GEMINI_API_KEY || "").trim()
};

/**
 * Configuração de Web Push (VAPID)
 */
export const PUSH_CONFIG = {
  publicKey: process.env.VAPID_PUBLIC_KEY || 'BLzFX530XvDT4SYRB5rtIyrBEXIwdIBZ_PdBppRdlHPrOx-iwJtKy1uek7Ah6MmS4dvfilxpt109ILtA0X4N_Ek',
  privateKey: process.env.VAPID_PRIVATE_KEY || 'Xa8catoJrTvxLBpT5nmnS3l2tYh9RWL7-hHYV0M36WE',
  email: 'mailto:vitorisalves1@gmail.com'
};

export const IS_VERCEL = 
  process.env.VERCEL === '1' || 
  process.env.VERCEL_ENV !== undefined || 
  process.env.NOW_REGION !== undefined || 
  process.env.AWS_LAMBDA_FUNCTION_NAME !== undefined;
