/* Rotas movidas de app.ts sem alteração de corpo. Registra direto no app (nunca em Router). */
import type { Express } from "express";
import { Request, Response } from "express";
import { repo } from "../data/index.js";
import { clearLocalTestCollection, checkQuotaExceeded, resetQuotaExceeded } from "../data/firestoreRepo.js";
import { EXTERNAL_API_CONFIG, IS_VERCEL, PUSH_CONFIG, getFirebaseConfig } from "../config.js";
import { AIService } from "../services/aiService.js";
import { PushService } from "../services/pushService.js";
import { OmieService } from "../services/omieService.js";
import { ExcelService } from "../services/excelService.js";
import { internalErrorMessage } from "../errors.js";
import { asyncHandler } from "../http.js";

export function registerSystemRoutes(app: Express): void {
// --- ROTAS DE DIAGNÓSTICO ---
app.get("/api/health", asyncHandler(async (req: Request, res: Response) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    config: { baseUrl: EXTERNAL_API_CONFIG.baseUrl }
  });
}));

app.get("/api/quota-status", asyncHandler(async (req: Request, res: Response) => {
  res.json({ quotaExceeded: checkQuotaExceeded() });
}));

app.post("/api/quota-status/reset", asyncHandler(async (req: Request, res: Response) => {
  resetQuotaExceeded();
  res.json({ status: "success" });
}));

app.get("/api/debug-db", asyncHandler(async (req: Request, res: Response) => {
  try {
    const config = await getFirebaseConfig();
    let docsCount = 0;
    let firstDocId = null;
    let errorMsg = null;
    let isOfflineCacheUsed = false;

    try {
      const snapshot = await repo.getDocs('invoices', 'invoices', true);
      docsCount = snapshot?.docs?.length || 0;
      if (docsCount > 0) {
        firstDocId = snapshot.docs[0].id;
      }
    } catch (e: any) {
      errorMsg = e?.message || String(e);
    }

    res.json({
      environment: {
        IS_VERCEL,
        NODE_ENV: process.env.NODE_ENV,
        VERCEL: process.env.VERCEL,
        VERCEL_ENV: process.env.VERCEL_ENV
      },
      firebaseConfig: {
        hasApiKey: !!config.apiKey
      },
      queryResult: {
        docsCount,
        firstDocId,
        error: errorMsg
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: internalErrorMessage(error, 'debug-db') });
  }
}));

// --- ROTAS EXCEL / GOOGLE SHEETS ---
app.get("/api/excel-sync", asyncHandler(async (req: Request, res: Response) => {
  const SHEET_ID = "1EarQhvZBT65Ptf-LULWnAfS844WSL7i8mryNRmt-qDY";
  try {
    const data = await ExcelService.syncFromGoogleSheets(SHEET_ID);
    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ error: internalErrorMessage(error, 'excel-sync') });
  }
}));

// --- ROTAS AI (GEMINI) ---
app.post("/api/ai/match-dashboard", asyncHandler(async (req: Request, res: Response) => {
  const { spreadsheetNames, shoppingItemNames } = req.body;
  const mapping = await AIService.matchDashboard(spreadsheetNames, shoppingItemNames);
  res.json({ mapping });
}));

app.post("/api/ai/process-document", asyncHandler(async (req: Request, res: Response) => {
  const { fileData, promptText, existingProductNames } = req.body;
  const products = await AIService.processDocument(fileData, promptText, existingProductNames);
  res.json(products);
}));

// --- RESET DE DADOS DO MODO DE TESTE ---
const TEST_MODE_COLLECTIONS = [
  'invoices',
  'xml_spendings',
  'price_increases',
  'product_categories',
  'product_setores',
  'setor_limits',
  'suppliers',
  'authorized_users',
  'categories',
  'setores',
  'delivered_products',
  'reminders',
  'shopping_lists',
  'purchase_orders',
  'pending_list_products',
  'pending_xml_imports',
  'price_settings',
  'push_subscriptions'
];

app.post("/api/test-mode/reset", asyncHandler(async (req: Request, res: Response) => {
  const isTestMode = req.headers['x-test-mode'] === 'true';
  if (!isTestMode) {
    return res.status(400).json({ error: 'Reset só pode ser executado com o Modo de Teste ativo (cabeçalho X-Test-Mode ausente).' });
  }

  const deletedCounts: Record<string, number> = {};

  // Caminho backend-agnóstico (via `repo`): usado no Vercel OU quando o backend
  // de dados é o Supabase/Postgres. O caminho de arquivo JSON local
  // (`clearLocalTestCollection`) só se aplica ao Firestore rodando localmente.
  const useRepoPath = IS_VERCEL || (process.env.DATA_BACKEND || '').toLowerCase() === 'supabase';

  for (const collectionName of TEST_MODE_COLLECTIONS) {
    if (useRepoPath) {
      // No Vercel o Modo de Teste grava na coleção real "test_<nome>" do Firestore
      // (o disco local é efêmero/não compartilhado entre instâncias serverless),
      // então o reset precisa apagar os documentos de lá em vez do arquivo local.
      const snapshot = await repo.getDocs(collectionName, `test-reset/${collectionName}`, true);
      for (const docSnap of snapshot.docs) {
        const docRef = await repo.doc(collectionName, docSnap.id);
        await repo.delete(docRef, `${collectionName}/${docSnap.id}`);
      }
      deletedCounts[collectionName] = snapshot.docs.length;
    } else {
      deletedCounts[collectionName] = clearLocalTestCollection(`test_${collectionName}`);
    }
    repo.invalidateCache(collectionName);
  }

  console.log('[Test Mode Reset] Dados de teste apagados:', deletedCounts);
  res.json({ status: 'ok', deletedCounts });
}));

// --- ROTAS DE NOTIFICAÇÃO ---
app.get("/api/notifications/vapid-key", (req, res) => {
  res.json({ publicKey: PUSH_CONFIG.publicKey });
});

app.post("/api/notifications/subscribe", asyncHandler(async (req: Request, res: Response) => {
  const subscription = req.body;
  const docId = Buffer.from(subscription.endpoint).toString('base64').substring(0, 50);
  await repo.set(repo.doc('push_subscriptions', docId), {
    ...subscription,
    updatedAt: new Date().toISOString()
  });
  res.status(201).json({ status: "subscribed" });
}));

app.post("/api/notifications/broadcast", asyncHandler(async (req: Request, res: Response) => {
  const { title, message, url, excludeEndpoint } = req.body;
  const count = await PushService.broadcast(title || "Aviso", message || "Novidade!", url, excludeEndpoint);
  res.json({ sent_to: count });
}));

// --- ROTAS OMIE / PROXY ---
app.get("/api/omie-direct/products", asyncHandler(async (req: Request, res: Response) => {
  const [productList, stockList] = await Promise.all([
    OmieService.fetchAllPages('/omie/products'),
    OmieService.fetchAllPages('/omie/products/stockQuantity')
  ]);

  const stockMap = new Map<string, number>();
  stockList.forEach((s: any) => {
    const code = String(s.productId || s.product_id || s.id || "");
    if (code) stockMap.set(code, Number(s.quantity || 0));
  });

  const merged = productList.filter(p => p.active !== false).map((p: any) => ({
    id: p.id,
    descricao: p.name || p.descricao,
    unidade: p.unit || 'UN',
    valor_unitario: p.price || 0,
    stock: stockMap.get(String(p.id)) || 0
  }));

  res.json({ data: merged });
}));

app.all("/api/v1/*", asyncHandler(async (req: Request, res: Response) => {
  const subPath = String((req.params as any)[0] || '');
  if (subPath.split('/').some(seg => seg === '..' || seg === '.') || subPath.includes('//') || subPath.includes('\\')) {
    return res.status(400).json({ error: "Caminho inválido" });
  }
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const response = await OmieService.proxyRequest(req.method, subPath, req.body, queryString);
  
  if (response.status >= 400 && typeof response.data === 'string') {
    return res.status(response.status).json({ error: response.data });
  }
  res.status(response.status).send(response.data);
}));
}
