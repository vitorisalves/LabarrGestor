import express, { Request, Response, NextFunction } from "express";
import { initFirebase, fsOps, clearLocalTestCollection } from "./firebase.js";
import { EXTERNAL_API_CONFIG, IS_VERCEL, PUSH_CONFIG, getFirebaseConfig } from "./config.js";
import { AIService } from "./services/aiService.js";
import { PushService } from "./services/pushService.js";
import { OmieService } from "./services/omieService.js";
import { ExcelService } from "./services/excelService.js";
import { XMLService } from "./services/xmlService.js";
import { startBackgroundReminderWorker } from "./reminderWorker.js";
import { requestContext } from "./context.js";

const app = express();

const applyPagination = (req: Request, res: Response, data: any[]) => {
  if (req.query.limit) {
    const limit = parseInt(req.query.limit as string, 10);
    const page = parseInt(req.query.page as string, 10) || 1;
    const startIndex = (page - 1) * limit;
    res.setHeader('X-Total-Count', data.length.toString());
    res.setHeader('X-Total-Pages', Math.ceil(data.length / limit).toString());
    res.setHeader('X-Current-Page', page.toString());
    res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count, X-Total-Pages, X-Current-Page');
    return data.slice(startIndex, startIndex + limit);
  }
  return data;
};
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));

app.use((req, res, next) => {
  const isTestMode = req.headers['x-test-mode'] === 'true';
  requestContext.run({ isTestMode }, () => {
    next();
  });
});

// --- INICIALIZAÇÃO ---
PushService.init();

async function cleanupManualInvoices() {
  try {
    console.log("[Cleanup] Starting manual-inv- deletion...");
    const snapshot = await fsOps.getDocs('invoices', 'invoices', true);
    if (snapshot && snapshot.docs) {
      const manualInvoices = snapshot.docs.filter((doc: any) => doc.id.startsWith('manual-inv-'));
      console.log(`[Cleanup] Found ${manualInvoices.length} manual invoices to delete.`);
      for (const docObj of manualInvoices) {
        const docRef = fsOps.doc('invoices', docObj.id);
        await fsOps.delete(docRef, `invoices/${docObj.id}`);
      }
      if (manualInvoices.length > 0) {
        fsOps.invalidateCache('invoices');
        console.log("[Cleanup] Finished deleting manual invoices and invalidated cache.");
      }
    }
  } catch (err) {
    console.error("[Cleanup] Error cleaning up manual invoices:", err);
  }
}

initFirebase().then(() => {
  if (!IS_VERCEL) {
    cleanupManualInvoices();
    startBackgroundReminderWorker();
  }
}).catch(err => console.error("[App] Erro na inicialização:", err));

/**
 * Wrapper para rotas assíncronas capturarem erros.
 */
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(`[AsyncHandler Error] ${req.method} ${req.url}:`, err);
    next(err);
  });
};

const handleCacheAndEtag = (collectionName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Disable in-memory ETag logic as it breaks on distributed environments (like Vercel)
    // where different instances have different memory states, causing them to incorrectly
    // return 304 Not Modified forever when another instance updates the database.
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  };
};

// --- ROTAS DE DIAGNÓSTICO ---
app.get("/api/health", asyncHandler(async (req: Request, res: Response) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    config: { baseUrl: EXTERNAL_API_CONFIG.baseUrl }
  });
}));

app.get("/api/debug-db", asyncHandler(async (req: Request, res: Response) => {
  try {
    const config = await getFirebaseConfig();
    let docsCount = 0;
    let firstDocId = null;
    let errorMsg = null;
    let isOfflineCacheUsed = false;

    try {
      const snapshot = await fsOps.getDocs('invoices', 'invoices', true);
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
        projectId: config.projectId,
        firestoreDatabaseId: config.firestoreDatabaseId,
        hasApiKey: !!config.apiKey
      },
      queryResult: {
        docsCount,
        firstDocId,
        error: errorMsg
      }
    });
  } catch (error: any) {
    res.status(500).json({ error: error?.message || String(error) });
  }
}));

// --- ROTAS EXCEL / GOOGLE SHEETS ---
app.get("/api/excel-sync", asyncHandler(async (req: Request, res: Response) => {
  const SHEET_ID = "1EarQhvZBT65Ptf-LULWnAfS844WSL7i8mryNRmt-qDY";
  try {
    const data = await ExcelService.syncFromGoogleSheets(SHEET_ID);
    res.json({ data });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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

// --- ROTAS XML ---
const xmlService = new XMLService();

app.post("/api/xml/process", asyncHandler(async (req: Request, res: Response) => {
  const { xmlData } = req.body;
  const parsedData = xmlService.parseNFe(xmlData);
  
  // 1. Busca faturas existentes para comparação antes de salvar o novo XML
  let existingInvoices: any[] = [];
  try {
    const snapshot = await fsOps.getDocs('invoices', 'invoices');
    existingInvoices = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
  } catch (e) {
    console.error("Erro ao buscar faturas anteriores para comparação de preços:", e);
  }

  // 2. Salva no Firestore tanto na coleção invoices quanto em xml_spendings
  const docRef = fsOps.doc('invoices', parsedData.id);
  const docSnapshot = await fsOps.getDoc(docRef);
  const exists = typeof docSnapshot.exists === 'function' ? docSnapshot.exists() : !!docSnapshot.exists;
  
  await fsOps.set(docRef, parsedData, 'invoices/' + parsedData.id);
  
  // Salva também em xml_spendings para persistência simultânea multitabelas
  const spendingRef = fsOps.doc('xml_spendings', parsedData.id);
  await fsOps.set(spendingRef, {
    id: parsedData.id,
    supplierName: parsedData.supplierName,
    dhEmi: parsedData.date,
    vTotTrib: parsedData.vTotTrib || 0,
    fileName: `upload_${parsedData.id}.xml`
  }, 'xml_spendings/' + parsedData.id);

  fsOps.invalidateCache('xml_spendings'); // Invalida o cache de gastos XML
  fsOps.invalidateCache('invoices'); // Invalida o cache de faturas
  
  // 3. Comparação de preços dos produtos da nota atual com as compras anteriores
  const currentInvoiceId = parsedData.id;
  const currentInvoiceDate = parsedData.date || new Date().toISOString();
  const currentProducts = parsedData.products || [];

  for (const prod of currentProducts) {
    if (!prod.name || prod.name === 'N/A') continue;

    const normName = prod.name.trim().toLowerCase();
    const prodCode = prod.code || 'N/A';

    // Procura por compras anteriores do mesmo produto
    const previousPurchases: { date: string; price: number; supplierName: string }[] = [];

    existingInvoices.forEach(inv => {
      if (inv.id === currentInvoiceId) return; // ignora a nota atual
      if (!Array.isArray(inv.products)) return;

      inv.products.forEach((p: any) => {
        if (!p.name || p.name === 'N/A') return;
        const otherNormName = p.name.trim().toLowerCase();
        const otherCode = p.code || 'N/A';

        const isMatch = (prodCode !== 'N/A' && prodCode === otherCode) || (normName === otherNormName);
        if (isMatch) {
          const price = Number(p.vUnCom || p.price || p.vUnTrib || 0);
          if (price > 0) {
            previousPurchases.push({
              date: inv.date || '2026-06-19T00:00:00Z',
              price,
              supplierName: inv.supplierName || 'Desconhecido'
            });
          }
        }
      });
    });

    if (previousPurchases.length > 0) {
      // Ordena de forma cronológica crescente para pegar a última compra anterior
      previousPurchases.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const lastPrevious = previousPurchases[previousPurchases.length - 1];

      const oldPrice = lastPrevious.price;
      const newPrice = Number(prod.vUnCom || prod.price || prod.vUnTrib || 0);

      if (newPrice > oldPrice) {
        // Preço subiu!
        const percentIncrease = ((newPrice - oldPrice) / oldPrice) * 100;
        const increaseId = `${currentInvoiceId}_${prodCode !== 'N/A' ? prodCode : prod.name.replace(/[^a-zA-Z0-9]/g, '_')}`;

        const priceIncreaseDoc = {
          id: increaseId,
          productName: prod.name,
          productCode: prodCode,
          supplierName: parsedData.supplierName || 'Desconhecido',
          oldPrice,
          newPrice,
          percentIncrease,
          invoiceId: currentInvoiceId,
          invoiceDate: currentInvoiceDate,
          alreadyImported: exists, // marca se a nota já foi importada anteriormente
          createdAt: new Date().toISOString()
        };

        // Salva o alerta de aumento de preço no Firestore
        const piRef = fsOps.doc('price_increases', increaseId);
        await fsOps.set(piRef, priceIncreaseDoc, 'price_increases/' + increaseId);
        fsOps.invalidateCache('price_increases');

        // Gera e dispara uma notificação push informando o aumento
        try {
          const formattedOld = oldPrice.toFixed(2);
          const formattedNew = newPrice.toFixed(2);
          const formattedPercent = percentIncrease.toFixed(1);
          await PushService.broadcast(
            "Alerta de Aumento de Preço",
            `O produto "${prod.name}" subiu de R$ ${formattedOld} para R$ ${formattedNew} (+${formattedPercent}%)!`,
            "/dashboard"
          );
        } catch (pushErr) {
          console.warn("Erro ao enviar notificação de aumento de preço:", pushErr);
        }
      }
    }
  }
  
  res.json({ status: exists ? 'updated' : 'imported', id: parsedData.id });
}));

app.post("/api/xml/process-batch", asyncHandler(async (req: Request, res: Response) => {
  const { xmls, payloads } = req.body;
  const items = payloads || (xmls ? xmls.map((x: string) => ({ xmlText: x, overrides: {} })) : []);
  
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Formato inválido. Nenhum XML enviado." });
  }

  console.log(`[Batch XML] Iniciando processamento de lote com ${items.length} arquivos.`);

  // 1. Busca faturas existentes exatamente uma vez para o lote inteiro
  let existingInvoices: any[] = [];
  try {
    const snapshot = await fsOps.getDocs('invoices', 'invoices');
    existingInvoices = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
  } catch (e) {
    console.error("Erro ao buscar faturas anteriores para lote:", e);
  }

  const results = [];

  for (const item of items) {
    try {
      const parsedData = xmlService.parseNFe(item.xmlText);
      
      // Apply product overrides (category, delete)
      if (item.overrides) {
        parsedData.products = parsedData.products.filter((p: any) => {
          const over = item.overrides[p.code];
          if (over?.deleted) return false;
          if (over?.categoryId) p.categoryId = over.categoryId;
          return true;
        });
        // Recalculate invoice total based on remaining products
        parsedData.vTotTrib = parsedData.products.reduce((acc: number, p: any) => acc + (p.vUnCom * p.quantity), 0);
      }
      const currentInvoiceId = parsedData.id;
      const currentInvoiceDate = parsedData.date || new Date().toISOString();
      const currentProducts = parsedData.products || [];

      const docRef = fsOps.doc('invoices', parsedData.id);
      const docSnapshot = await fsOps.getDoc(docRef);
      const exists = typeof docSnapshot.exists === 'function' ? docSnapshot.exists() : !!docSnapshot.exists;

      // Persiste na tabela invoices
      await fsOps.set(docRef, parsedData, 'invoices/' + parsedData.id);

      // Persiste simultaneamente na tabela xml_spendings
      const spendingRef = fsOps.doc('xml_spendings', parsedData.id);
      await fsOps.set(spendingRef, {
        id: parsedData.id,
        supplierName: parsedData.supplierName,
        dhEmi: parsedData.date,
        vTotTrib: parsedData.vTotTrib || 0,
        fileName: `upload_${parsedData.id}.xml`
      }, 'xml_spendings/' + parsedData.id);

      // Compara preços dos produtos
      for (const prod of currentProducts) {
        if (!prod.name || prod.name === 'N/A') continue;

        const normName = prod.name.trim().toLowerCase();
        const prodCode = prod.code || 'N/A';

        const previousPurchases: { date: string; price: number; supplierName: string }[] = [];

        existingInvoices.forEach(inv => {
          if (inv.id === currentInvoiceId) return;
          if (!Array.isArray(inv.products)) return;

          inv.products.forEach((p: any) => {
            if (!p.name || p.name === 'N/A') return;
            const otherNormName = p.name.trim().toLowerCase();
            const otherCode = p.code || 'N/A';

            const isMatch = (prodCode !== 'N/A' && prodCode === otherCode) || (normName === otherNormName);
            if (isMatch) {
              const price = Number(p.vUnCom || p.price || p.vUnTrib || 0);
              if (price > 0) {
                previousPurchases.push({
                  date: inv.date || '2026-06-19T00:00:00Z',
                  price,
                  supplierName: inv.supplierName || 'Desconhecido'
                });
              }
            }
          });
        });

        if (previousPurchases.length > 0) {
          previousPurchases.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
          const lastPrevious = previousPurchases[previousPurchases.length - 1];
          const oldPrice = lastPrevious.price;
          const newPrice = Number(prod.vUnCom || prod.price || prod.vUnTrib || 0);

          if (newPrice > oldPrice) {
            const percentIncrease = ((newPrice - oldPrice) / oldPrice) * 100;
            const increaseId = `${currentInvoiceId}_${prodCode !== 'N/A' ? prodCode : prod.name.replace(/[^a-zA-Z0-9]/g, '_')}`;

            const priceIncreaseDoc = {
              id: increaseId,
              productName: prod.name,
              productCode: prodCode,
              supplierName: parsedData.supplierName || 'Desconhecido',
              oldPrice,
              newPrice,
              percentIncrease,
              invoiceId: currentInvoiceId,
              invoiceDate: currentInvoiceDate,
              alreadyImported: exists,
              createdAt: new Date().toISOString()
        };

            const piRef = fsOps.doc('price_increases', increaseId);
            await fsOps.set(piRef, priceIncreaseDoc, 'price_increases/' + increaseId);
          }
        }
      }

      // Adiciona o parsedData no existingInvoices local para comparação em cascata
      existingInvoices.push(parsedData);

      results.push({
        id: parsedData.id,
        supplierName: parsedData.supplierName,
        dhEmi: parsedData.date,
        vTotTrib: parsedData.vTotTrib || 0,
        status: exists ? 'updated' : 'imported'
      });
    } catch (err: any) {
      console.error(`Erro ao processar arquivo no lote:`, err);
      results.push({ id: 'unknown', error: err.message || String(err), status: 'error' });
    }
  }

  // Invalida os caches globais UMA ÚNICA VEZ ao término de todo o lote!
  fsOps.invalidateCache('xml_spendings');
  fsOps.invalidateCache('invoices');
  fsOps.invalidateCache('price_increases');

  console.log(`[Batch XML] Lote finalizado com sucesso. Registros processados: ${results.length}`);
  res.json({ results });
}));

app.get("/api/xml/price-increases", handleCacheAndEtag("price_increases"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const snapshot = await fsOps.getDocs('price_increases', 'price_increases', true);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    data.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching price increases:", error);
    res.status(500).json({ error: "Error fetching price increases", message: error.message });
  }
}));

app.post("/api/xml/price-increases/delete", asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Format or list of IDs is invalid" });
  }

  for (const id of ids) {
    const docRef = fsOps.doc('price_increases', id);
    await fsOps.delete(docRef, 'price_increases/' + id);
  }
  fsOps.invalidateCache('price_increases');
  res.json({ status: "success", deletedCount: ids.length });
}));

app.get("/api/xml/invoices", handleCacheAndEtag("invoices"), asyncHandler(async (req: Request, res: Response) => {
  console.log("Fetching invoices...");
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await fsOps.getDocs('invoices', 'invoices', forceNoCache);
    console.log("Got snapshot, found docs:", snapshot?.docs?.length);
    if (!snapshot || !snapshot.docs) {
      throw new Error("Snapshot or snapshot.docs is undefined");
    }

    // Load product category overrides
    let productOverridesMap = new Map<string, { category?: string; deleted?: boolean }>();
    try {
      const pcSnap = await fsOps.getDocs('product_categories', 'product_categories', forceNoCache);
      if (pcSnap && pcSnap.docs) {
        pcSnap.docs.forEach((d: any) => {
          const data = typeof d.data === 'function' ? d.data() : d.data;
          if (data) {
            if (data.code) productOverridesMap.set(String(data.code).trim(), data);
            if (data.name) {
              const normN = String(data.name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
              if (normN) productOverridesMap.set(normN, data);
            }
          }
        });
      }
    } catch (pcErr) {
      console.warn("Nenhum mapa de categorias de produtos carregado:", pcErr);
    }

    // Load product setor overrides
    let setorOverridesMap = new Map<string, { setor?: string }>();
    try {
      const psSnap = await fsOps.getDocs('product_setores', 'product_setores', forceNoCache);
      if (psSnap && psSnap.docs) {
        psSnap.docs.forEach((d: any) => {
          const data = typeof d.data === 'function' ? d.data() : d.data;
          if (data) {
            if (data.code) setorOverridesMap.set(String(data.code).trim(), data);
            if (data.name) {
              const normN = String(data.name).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
              if (normN) setorOverridesMap.set(normN, data);
            }
          }
        });
      }
    } catch (psErr) {
      console.warn("Nenhum mapa de setores de produtos carregado:", psErr);
    }

    const normStr = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();

    const data = snapshot.docs
      .map((doc: any) => {
        const d = typeof doc.data === 'function' ? doc.data() : doc.data;
        const invObj = { id: doc.id, ...d };
        if (Array.isArray(invObj.products) && (productOverridesMap.size > 0 || setorOverridesMap.size > 0)) {
          invObj.products = invObj.products.map((p: any) => {
            const pCode = String(p.code !== undefined && p.code !== null && p.code !== "" ? p.code : (p.cProd !== undefined && p.cProd !== null ? p.cProd : "")).trim();
            const pName = normStr(p.name || p.xProd || "");

            const over = (pCode && productOverridesMap.get(pCode)) || (pName && productOverridesMap.get(pName));
            if (over) {
              if (over.category) {
                p.category = over.category;
                p.categoryId = over.category;
              }
              if (over.deleted) {
                p.deleted = true;
              }
            }

            const setorOver = (pCode && setorOverridesMap.get(pCode)) || (pName && setorOverridesMap.get(pName));
            if (setorOver && setorOver.setor) {
              p.setor = setorOver.setor;
            }
            return p;
          });
        }
        return invObj;
      })
      .filter((inv: any) => !inv.id.startsWith('manual-inv-'));
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching invoices:", error);
    res.status(500).json({
      error: "Error fetching invoices",
      message: error?.message || String(error),
      code: error?.code || "",
      stack: error?.stack || ""
    });
  }
}));

app.get("/api/xml/suppliers", handleCacheAndEtag("suppliers"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await fsOps.getDocs('suppliers', 'suppliers', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached suppliers:", error);
    res.status(500).json({ error: "Error fetching suppliers", message: error.message });
  }
}));

app.get("/api/xml/authorized_users", handleCacheAndEtag("authorized_users"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await fsOps.getDocs('authorized_users', 'authorized_users', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached authorized_users:", error);
    res.status(500).json({ error: "Error fetching authorized users", message: error.message });
  }
}));

app.get("/api/xml/spendings", handleCacheAndEtag("xml_spendings"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await fsOps.getDocs('xml_spendings', 'xml_spendings', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached spendings:", error);
    res.status(500).json({ error: "Error fetching spendings", message: error.message });
  }
}));

app.delete("/api/xml/spendings/:id", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ status: 'error', error: 'ID not provided' });
  }

  const docRef = await fsOps.doc('xml_spendings', id);
  const docSnapshot = await fsOps.getDoc(docRef, 'xml_spendings/' + id);
  const exists = typeof docSnapshot.exists === 'function' ? docSnapshot.exists() : !!docSnapshot.exists;

  if (exists) {
    await fsOps.delete(docRef, 'xml_spendings/' + id);
    fsOps.invalidateCache('xml_spendings');
    res.json({ status: 'deleted', id });
  } else {
    res.json({ status: 'not_found', message: `Spending ${id} not found but checked.` });
  }
}));

app.get("/api/xml/categories", handleCacheAndEtag("categories"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await fsOps.getDocs('categories', 'categories', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached categories:", error);
    res.status(500).json({ error: "Error fetching categories", message: error.message });
  }
}));

app.get("/api/xml/setores", handleCacheAndEtag("setores"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await fsOps.getDocs('setores', 'setores', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached setores:", error);
    res.status(500).json({ error: "Error fetching setores", message: error.message });
  }
}));

app.post("/api/xml/setores", asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Nome do setor é obrigatório" });
  }
  const trimmed = String(name).trim();
  const id = trimmed.toLowerCase().replace(/\s+/g, "_");
  await fsOps.set(fsOps.doc('setores', id), { name: trimmed }, 'setores/' + id);
  fsOps.invalidateCache('setores');
  res.json({ status: "success" });
}));

app.post("/api/xml/setores/delete", asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Nome do setor é obrigatório" });
  }
  const snapshot = await fsOps.getDocs('setores', 'setores', true);
  const matches = snapshot.docs.filter((doc: any) => {
    const d = typeof doc.data === 'function' ? doc.data() : doc.data;
    return d?.name === name;
  });
  for (const doc of matches) {
    await fsOps.delete(fsOps.doc('setores', doc.id), 'setores/' + doc.id);
  }
  fsOps.invalidateCache('setores');
  res.json({ status: "success", deletedCount: matches.length });
}));

app.post("/api/xml/categories", asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Nome da categoria é obrigatório" });
  }
  const trimmed = String(name).trim();
  const id = trimmed.toLowerCase().replace(/\s+/g, "_");
  await fsOps.set(fsOps.doc('categories', id), { name: trimmed }, 'categories/' + id);
  fsOps.invalidateCache('categories');
  res.json({ status: "success" });
}));

app.post("/api/xml/categories/delete", asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Nome da categoria é obrigatório" });
  }
  const snapshot = await fsOps.getDocs('categories', 'categories', true);
  const matches = snapshot.docs.filter((doc: any) => {
    const d = typeof doc.data === 'function' ? doc.data() : doc.data;
    return d?.name === name;
  });
  for (const doc of matches) {
    await fsOps.delete(fsOps.doc('categories', doc.id), 'categories/' + doc.id);
  }
  fsOps.invalidateCache('categories');
  res.json({ status: "success", deletedCount: matches.length });
}));

app.get("/api/xml/delivered_products", handleCacheAndEtag("delivered_products"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await fsOps.getDocs('delivered_products', 'delivered_products', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached delivered_products:", error);
    res.status(500).json({ error: "Error fetching delivered products", message: error.message });
  }
}));

app.get("/api/xml/reminders", handleCacheAndEtag("reminders"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await fsOps.getDocs('reminders', 'reminders', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached reminders:", error);
    res.status(500).json({ error: "Error fetching reminders", message: error.message });
  }
}));

app.get("/api/xml/shopping_lists", handleCacheAndEtag("shopping_lists"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await fsOps.getDocs('shopping_lists', 'shopping_lists', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached shopping_lists:", error);
    res.status(500).json({ error: "Error fetching shopping lists", message: error.message });
  }
}));

app.post("/api/xml/shopping_lists/update-items", asyncHandler(async (req: Request, res: Response) => {
  const { listId, items } = req.body;
  if (!listId || !Array.isArray(items)) {
    return res.status(400).json({ error: "listId e items são obrigatórios" });
  }
  await fsOps.update(fsOps.doc('shopping_lists', listId), { items }, 'shopping_lists/' + listId);
  fsOps.invalidateCache('shopping_lists');
  res.json({ status: "success" });
}));

app.get("/api/xml/purchase_orders", handleCacheAndEtag("purchase_orders"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await fsOps.getDocs('purchase_orders', 'purchase_orders', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching purchase_orders:", error);
    res.status(500).json({ error: "Error fetching purchase orders", message: error.message });
  }
}));

app.post("/api/xml/purchase_orders", asyncHandler(async (req: Request, res: Response) => {
  const { name, items, total, shippingFee, createdBy } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Itens são obrigatórios" });
  }
  const id = `po_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const order = {
    id,
    name: name || 'Lista de Compras',
    date: new Date().toISOString(),
    items,
    total: Number(total) || 0,
    shippingFee: Number(shippingFee) || 0,
    createdBy: createdBy || '',
    status: 'pending'
  };
  await fsOps.set(fsOps.doc('purchase_orders', id), order, 'purchase_orders/' + id);
  fsOps.invalidateCache('purchase_orders');
  res.json({ status: "success", order });
}));

app.post("/api/xml/purchase_orders/approve-requisition", asyncHandler(async (req: Request, res: Response) => {
  const { id, approvedBy, observacao } = req.body;
  if (!id) return res.status(400).json({ error: "ID é obrigatório" });
  await fsOps.update(fsOps.doc('purchase_orders', id), {
    status: 'requisition_approved',
    requisitionApprovedBy: approvedBy || '',
    requisitionApprovedAt: new Date().toISOString(),
    observacao: observacao || ''
  }, 'purchase_orders/' + id);
  fsOps.invalidateCache('purchase_orders');
  res.json({ status: "success" });
}));

app.post("/api/xml/purchase_orders/approve", asyncHandler(async (req: Request, res: Response) => {
  const { id, approvedBy, observacao } = req.body;
  if (!id) return res.status(400).json({ error: "ID é obrigatório" });
  await fsOps.update(fsOps.doc('purchase_orders', id), {
    status: 'approved',
    approvedBy: approvedBy || '',
    approvedAt: new Date().toISOString(),
    observacao: observacao || ''
  }, 'purchase_orders/' + id);
  fsOps.invalidateCache('purchase_orders');
  res.json({ status: "success" });
}));

app.post("/api/xml/purchase_orders/reject", asyncHandler(async (req: Request, res: Response) => {
  const { id, rejectedBy, observacao } = req.body;
  if (!id) return res.status(400).json({ error: "ID é obrigatório" });
  await fsOps.update(fsOps.doc('purchase_orders', id), {
    status: 'rejected',
    rejectedBy: rejectedBy || '',
    rejectedAt: new Date().toISOString(),
    observacao: observacao || ''
  }, 'purchase_orders/' + id);
  fsOps.invalidateCache('purchase_orders');
  res.json({ status: "success" });
}));

app.post("/api/xml/purchase_orders/observacao", asyncHandler(async (req: Request, res: Response) => {
  const { id, observacao } = req.body;
  if (!id) return res.status(400).json({ error: "ID é obrigatório" });
  await fsOps.update(fsOps.doc('purchase_orders', id), {
    observacao: observacao || ''
  }, 'purchase_orders/' + id);
  fsOps.invalidateCache('purchase_orders');
  res.json({ status: "success" });
}));

app.post("/api/xml/purchase_orders/send", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "ID é obrigatório" });

  const docSnap = await fsOps.getDoc(fsOps.doc('purchase_orders', id), 'purchase_orders/' + id);
  const exists = typeof docSnap.exists === 'function' ? docSnap.exists() : !!docSnap.exists;
  if (!exists) {
    return res.status(404).json({ error: "Ordem de compra não encontrada" });
  }
  const order: any = typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data;

  const listId = `list_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const listData = {
    name: order.name,
    date: new Date().toISOString(),
    items: order.items,
    total: order.total,
    shippingFee: order.shippingFee,
    createdBy: order.createdBy,
    approvedBy: order.approvedBy || ''
  };
  await fsOps.set(fsOps.doc('shopping_lists', listId), listData, 'shopping_lists/' + listId);
  await fsOps.delete(fsOps.doc('purchase_orders', id), 'purchase_orders/' + id);

  fsOps.invalidateCache('shopping_lists');
  fsOps.invalidateCache('purchase_orders');
  res.json({ status: "success", listId });
}));

app.post("/api/xml/purchase_orders/delete", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "ID é obrigatório" });
  await fsOps.delete(fsOps.doc('purchase_orders', id), 'purchase_orders/' + id);
  fsOps.invalidateCache('purchase_orders');
  res.json({ status: "success" });
}));

app.post("/api/xml/cache/invalidate", asyncHandler(async (req: Request, res: Response) => {
  const { collection } = req.body;
  if (collection) {
    fsOps.invalidateCache(collection);
    console.log(`[Cache Invalidation] Invalidated cache for collection: ${collection}`);
    res.json({ status: 'ok', collection });
  } else {
    res.status(400).json({ error: 'Collection not specified' });
  }
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
  'push_subscriptions'
];

app.post("/api/test-mode/reset", asyncHandler(async (req: Request, res: Response) => {
  const isTestMode = req.headers['x-test-mode'] === 'true';
  if (!isTestMode) {
    return res.status(400).json({ error: 'Reset só pode ser executado com o Modo de Teste ativo (cabeçalho X-Test-Mode ausente).' });
  }

  const deletedCounts: Record<string, number> = {};

  for (const collectionName of TEST_MODE_COLLECTIONS) {
    if (IS_VERCEL) {
      // No Vercel o Modo de Teste grava na coleção real "test_<nome>" do Firestore
      // (o disco local é efêmero/não compartilhado entre instâncias serverless),
      // então o reset precisa apagar os documentos de lá em vez do arquivo local.
      const snapshot = await fsOps.getDocs(collectionName, `test-reset/${collectionName}`, true);
      for (const docSnap of snapshot.docs) {
        const docRef = await fsOps.doc(collectionName, docSnap.id);
        await fsOps.delete(docRef, `${collectionName}/${docSnap.id}`);
      }
      deletedCounts[collectionName] = snapshot.docs.length;
    } else {
      deletedCounts[collectionName] = clearLocalTestCollection(`test_${collectionName}`);
    }
    fsOps.invalidateCache(collectionName);
  }

  console.log('[Test Mode Reset] Dados de teste apagados:', deletedCounts);
  res.json({ status: 'ok', deletedCounts });
}));

// --- AUXILIAR DE DELEÇÃO DE FATURA ---
const deleteInvoiceHelper = async (id: string, res: Response) => {
  if (!id) {
    return res.status(400).json({ status: 'error', error: 'ID not provided' });
  }
  console.log("Backend deleting invoice ID:", id);

  // Tenta com o ID fornecido direto
  let docRef = await fsOps.doc('invoices', id);
  let docSnapshot = await fsOps.getDoc(docRef, 'invoices/' + id);
  let exists = typeof docSnapshot.exists === 'function' ? docSnapshot.exists() : !!docSnapshot.exists;

  // Se não existe e não começa com 'NFe', tenta adicionar o prefixo 'NFe'
  if (!exists && !id.startsWith('NFe')) {
    const alternativeId = 'NFe' + id;
    console.log(`ID ${id} não encontrado. Tentando ID alternativo: ${alternativeId}`);
    docRef = await fsOps.doc('invoices', alternativeId);
    docSnapshot = await fsOps.getDoc(docRef, 'invoices/' + alternativeId);
    exists = typeof docSnapshot.exists === 'function' ? docSnapshot.exists() : !!docSnapshot.exists;
  }

  // Se começou com 'NFe' e não encontrou, tenta remover o prefixo 'NFe'
  if (!exists && id.startsWith('NFe')) {
    const alternativeId = id.substring(3);
    console.log(`ID ${id} não encontrado. Tentando ID alternativo sem NFe: ${alternativeId}`);
    docRef = await fsOps.doc('invoices', alternativeId);
    docSnapshot = await fsOps.getDoc(docRef, 'invoices/' + alternativeId);
    exists = typeof docSnapshot.exists === 'function' ? docSnapshot.exists() : !!docSnapshot.exists;
  }

  const finalId = docSnapshot.id || id;
  console.log(`Doc exists at final ID ${finalId} before delete:`, exists);

  if (exists) {
    await fsOps.delete(docRef, 'invoices/' + finalId);
    fsOps.invalidateCache('xml_spendings'); // Invalida o cache de gastos também
    fsOps.invalidateCache('invoices'); // Invalida o cache de faturas também
    res.json({ status: 'deleted', id: finalId });
  } else {
    // Retornamos 200/sucesso mesmo se não encontrar para evitar quebrar o fluxo do frontend de forma destrutiva
    res.json({ status: 'not_found', message: `Invoice ${id} not found but checked.` });
  }
};

app.post("/api/xml/invoices/delete", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.body;
  await deleteInvoiceHelper(id, res);
}));

app.delete("/api/xml/invoices/:id", asyncHandler(async (req: Request, res: Response) => {
  const id = req.params.id;
  await deleteInvoiceHelper(id, res);
}));

app.post("/api/xml/products/update-category", asyncHandler(async (req: Request, res: Response) => {
  const { code, name, category } = req.body;
  if (!category) {
    return res.status(400).json({ error: "Categoria é obrigatória" });
  }

  const normStr = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const targetCode = String(code || "").trim();
  const targetName = normStr(name);

  // 1. Save override mapping in product_categories collection
  try {
    const pcId = targetCode ? `code_${targetCode}` : `name_${targetName.replace(/\s+/g, "_")}`;
    if (pcId) {
      const pcRef = fsOps.doc('product_categories', pcId);
      await fsOps.set(pcRef, {
        code: targetCode,
        name: targetName,
        category,
        updatedAt: new Date().toISOString()
      }, 'product_categories/' + pcId);
    }
  } catch (pcErr) {
    console.error("Erro ao salvar product_categories override:", pcErr);
  }

  // 2. Update Invoices
  try {
    const invSnapshot = await fsOps.getDocs('invoices', 'invoices', true);
    const invoices = invSnapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });

    for (const inv of invoices) {
      if (!Array.isArray(inv.products)) continue;
      let invChanged = false;
      inv.products = inv.products.map((p: any) => {
        const pCode = String(p.code !== undefined && p.code !== null && p.code !== "" ? p.code : (p.cProd !== undefined && p.cProd !== null ? p.cProd : "")).trim();
        const pName = normStr(p.name || p.xProd || "");
        const codeMatches = targetCode && pCode && targetCode === pCode;
        const nameMatches = targetName && pName && (targetName === pName || targetName.includes(pName) || pName.includes(targetName));

        if (codeMatches || nameMatches) {
          invChanged = true;
          return { ...p, categoryId: category, category: category };
        }
        return p;
      });

      if (invChanged && inv.id) {
        const docRef = fsOps.doc('invoices', inv.id);
        await fsOps.set(docRef, inv, 'invoices/' + inv.id);
      }
    }
  } catch (err) {
    console.error("Erro ao atualizar categoria em invoices:", err);
  }

  // 3. Update Suppliers
  try {
    const suppSnapshot = await fsOps.getDocs('suppliers', 'suppliers', true);
    const suppliers = suppSnapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });

    for (const supp of suppliers) {
      if (!Array.isArray(supp.products)) continue;
      let suppChanged = false;
      supp.products = supp.products.map((p: any) => {
        const pCode = String(p.code !== undefined && p.code !== null && p.code !== "" ? p.code : (p.cProd !== undefined && p.cProd !== null ? p.cProd : "")).trim();
        const pName = normStr(p.name || "");
        const codeMatches = targetCode && pCode && targetCode === pCode;
        const nameMatches = targetName && pName && (targetName === pName || targetName.includes(pName) || pName.includes(targetName));

        if (codeMatches || nameMatches) {
          suppChanged = true;
          return { ...p, category: category };
        }
        return p;
      });

      if (suppChanged && supp.id) {
        const docRef = fsOps.doc('suppliers', supp.id);
        await fsOps.set(docRef, supp, 'suppliers/' + supp.id);
      }
    }
  } catch (err) {
    console.error("Erro ao atualizar categoria em suppliers:", err);
  }

  // 4. Register Category if new
  try {
    const catId = category.toLowerCase().replace(/\s+/g, "_");
    const catRef = fsOps.doc('categories', catId);
    await fsOps.set(catRef, { name: category }, 'categories/' + catId);
  } catch (err) {
    console.error("Erro ao salvar categoria:", err);
  }

  // 5. Invalidate caches
  fsOps.invalidateCache('invoices');
  fsOps.invalidateCache('suppliers');
  fsOps.invalidateCache('categories');
  fsOps.invalidateCache('product_categories');

  res.json({ status: "success" });
}));

app.post("/api/xml/products/update-setor", asyncHandler(async (req: Request, res: Response) => {
  const { code, name, setor } = req.body;
  if (!setor) {
    return res.status(400).json({ error: "Setor e obrigatorio" });
  }

  const normStr = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
  const targetCode = String(code || "").trim();
  const targetName = normStr(name);

  // 1. Save override mapping in product_setores collection
  try {
    const psId = targetCode ? `code_${targetCode}` : `name_${targetName.replace(/\s+/g, "_")}`;
    if (psId) {
      const psRef = fsOps.doc('product_setores', psId);
      await fsOps.set(psRef, {
        code: targetCode,
        name: targetName,
        setor,
        updatedAt: new Date().toISOString()
      }, 'product_setores/' + psId);
    }
  } catch (psErr) {
    console.error("Erro ao salvar product_setores override:", psErr);
  }

  // 2. Update Invoices
  try {
    const invSnapshot = await fsOps.getDocs('invoices', 'invoices', true);
    const invoices = invSnapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });

    for (const inv of invoices) {
      if (!Array.isArray(inv.products)) continue;
      let invChanged = false;
      inv.products = inv.products.map((p: any) => {
        const pCode = String(p.code !== undefined && p.code !== null && p.code !== "" ? p.code : (p.cProd !== undefined && p.cProd !== null ? p.cProd : "")).trim();
        const pName = normStr(p.name || p.xProd || "");
        const codeMatches = targetCode && pCode && targetCode === pCode;
        const nameMatches = targetName && pName && (targetName === pName || targetName.includes(pName) || pName.includes(targetName));

        if (codeMatches || nameMatches) {
          invChanged = true;
          return { ...p, setor };
        }
        return p;
      });

      if (invChanged && inv.id) {
        const docRef = fsOps.doc('invoices', inv.id);
        await fsOps.set(docRef, inv, 'invoices/' + inv.id);
      }
    }
  } catch (err) {
    console.error("Erro ao atualizar setor em invoices:", err);
  }

  // 3. Register Setor if new
  try {
    const setId = setor.toLowerCase().replace(/\s+/g, "_");
    const setRef = fsOps.doc('setores', setId);
    await fsOps.set(setRef, { name: setor }, 'setores/' + setId);
  } catch (err) {
    console.error("Erro ao salvar setor:", err);
  }

  // 4. Invalidate caches
  fsOps.invalidateCache('invoices');
  fsOps.invalidateCache('setores');
  fsOps.invalidateCache('product_setores');

  res.json({ status: "success" });
}));

app.get("/api/xml/setor-limits", handleCacheAndEtag("setor_limits"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await fsOps.getDocs('setor_limits', 'setor_limits', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching setor_limits:", error);
    res.status(500).json({ error: "Error fetching setor_limits", message: error.message });
  }
}));

app.post("/api/xml/setor-limits", asyncHandler(async (req: Request, res: Response) => {
  const { setor, monthlyLimit } = req.body;
  if (!setor) {
    return res.status(400).json({ error: "Setor e obrigatorio" });
  }
  const limitId = setor.toLowerCase().replace(/\s+/g, "_");
  const limitRef = fsOps.doc('setor_limits', limitId);
  await fsOps.set(limitRef, {
    setor,
    monthlyLimit: Number(monthlyLimit) || 0,
    updatedAt: new Date().toISOString()
  }, 'setor_limits/' + limitId);
  fsOps.invalidateCache('setor_limits');
  res.json({ status: "success" });
}));

app.post("/api/xml/products/delete", asyncHandler(async (req: Request, res: Response) => {
  const { code, name } = req.body;

  const normStr = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const targetCode = String(code || "").trim();
  const targetName = normStr(name);

  // 1. Save delete override mapping in product_categories collection
  try {
    const pcId = targetCode ? `code_${targetCode}` : `name_${targetName.replace(/\s+/g, "_")}`;
    if (pcId) {
      const pcRef = fsOps.doc('product_categories', pcId);
      await fsOps.set(pcRef, {
        code: targetCode,
        name: targetName,
        deleted: true,
        updatedAt: new Date().toISOString()
      }, 'product_categories/' + pcId);
    }
  } catch (pcErr) {
    console.error("Erro ao salvar exclusao em product_categories:", pcErr);
  }

  // 2. Mark deleted in Invoices
  try {
    const invSnapshot = await fsOps.getDocs('invoices', 'invoices', true);
    const invoices = invSnapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });

    for (const inv of invoices) {
      if (!Array.isArray(inv.products)) continue;
      let invChanged = false;
      inv.products = inv.products.map((p: any) => {
        const pCode = String(p.code !== undefined && p.code !== null && p.code !== "" ? p.code : (p.cProd !== undefined && p.cProd !== null ? p.cProd : "")).trim();
        const pName = normStr(p.name || p.xProd || "");
        const codeMatches = targetCode && pCode && targetCode === pCode;
        const nameMatches = targetName && pName && (targetName === pName || targetName.includes(pName) || pName.includes(targetName));

        if (codeMatches || nameMatches) {
          invChanged = true;
          return { ...p, deleted: true };
        }
        return p;
      });

      if (invChanged && inv.id) {
        const docRef = fsOps.doc('invoices', inv.id);
        await fsOps.set(docRef, inv, 'invoices/' + inv.id);
      }
    }
  } catch (err) {
    console.error("Erro ao deletar produto em invoices:", err);
  }

  // 3. Remove from Suppliers
  try {
    const suppSnapshot = await fsOps.getDocs('suppliers', 'suppliers', true);
    const suppliers = suppSnapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });

    for (const supp of suppliers) {
      if (!Array.isArray(supp.products)) continue;
      let suppChanged = false;
      const filteredProds = supp.products.filter((p: any) => {
        const pCode = String(p.code !== undefined && p.code !== null && p.code !== "" ? p.code : (p.cProd !== undefined && p.cProd !== null ? p.cProd : "")).trim();
        const pName = normStr(p.name || "");
        const codeMatches = targetCode && pCode && targetCode === pCode;
        const nameMatches = targetName && pName && (targetName === pName || targetName.includes(pName) || pName.includes(targetName));

        if (codeMatches || nameMatches) {
          suppChanged = true;
          return false;
        }
        return true;
      });

      if (suppChanged && supp.id) {
        supp.products = filteredProds;
        const docRef = fsOps.doc('suppliers', supp.id);
        await fsOps.set(docRef, supp, 'suppliers/' + supp.id);
      }
    }
  } catch (err) {
    console.error("Erro ao deletar produto em suppliers:", err);
  }

  // 4. Invalidate caches
  fsOps.invalidateCache('invoices');
  fsOps.invalidateCache('suppliers');
  fsOps.invalidateCache('product_categories');

  res.json({ status: "success" });
}));

app.post("/api/xml/products/delete-item", asyncHandler(async (req: Request, res: Response) => {
  const { invKey, productIndex, code, name } = req.body;
  if (!invKey) {
    return res.status(400).json({ error: "invKey é obrigatório" });
  }

  const normStr = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const targetCode = String(code || "").trim();
  const targetName = normStr(name);

  try {
    const invSnapshot = await fsOps.getDocs('invoices', 'invoices', true);
    const invoices = invSnapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });

    for (const inv of invoices) {
      const currentKey = inv.chNFe || inv.nfeKey || inv.id;
      if (currentKey === invKey || inv.id === invKey || (invKey && currentKey && String(currentKey).includes(invKey))) {
        if (!Array.isArray(inv.products)) continue;
        let invChanged = false;
        inv.products = inv.products.map((p: any, idx: number) => {
          const pCode = String(p.code !== undefined && p.code !== null && p.code !== "" ? p.code : (p.cProd !== undefined && p.cProd !== null ? p.cProd : "")).trim();
          const pName = normStr(p.name || p.xProd || "");

          const matchesIdx = productIndex !== undefined && idx === productIndex;
          const matchesIdentity = (targetCode && pCode && targetCode === pCode) || (targetName && pName && targetName === pName);

          if (matchesIdx || matchesIdentity) {
            invChanged = true;
            return { ...p, deleted: true };
          }
          return p;
        });

        if (invChanged && inv.id) {
          const docRef = fsOps.doc('invoices', inv.id);
          await fsOps.set(docRef, inv, 'invoices/' + inv.id);
        }
      }
    }
    fsOps.invalidateCache('invoices');
    res.json({ status: "success" });
  } catch (err: any) {
    console.error("Erro ao deletar item especifico de invoice:", err);
    res.status(500).json({ error: "Erro ao deletar produto", message: err.message });
  }
}));

// --- ROTAS DE PRODUTOS PENDENTES DE LISTAS DE COMPRAS ---
app.get("/api/xml/pending-list-products", handleCacheAndEtag("pending_list_products"), asyncHandler(async (req: Request, res: Response) => {
  const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache';
  const snapshot = await fsOps.getDocs('pending_list_products', 'pending_list_products', forceNoCache);
  const data = snapshot.docs.map((doc: any) => {
    const d = typeof doc.data === 'function' ? doc.data() : doc.data;
    return { id: doc.id, ...d };
  });
  res.json(data);
}));

app.post("/api/xml/pending-list-products", asyncHandler(async (req: Request, res: Response) => {
  const { item, items } = req.body;
  const listToSave = Array.isArray(items) ? items : (item ? [item] : []);
  
  for (const it of listToSave) {
    if (!it || !it.id) continue;
    const docRef = fsOps.doc('pending_list_products', it.id);
    await fsOps.set(docRef, {
      ...it,
      updatedAt: new Date().toISOString()
    }, 'pending_list_products/' + it.id);
  }
  
  fsOps.invalidateCache('pending_list_products');
  res.json({ status: "success", count: listToSave.length });
}));

app.post("/api/xml/pending-list-products/delete", asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (Array.isArray(ids)) {
    for (const id of ids) {
      if (!id) continue;
      const docRef = fsOps.doc('pending_list_products', id);
      await fsOps.delete(docRef, 'pending_list_products/' + id);
    }
  }
  fsOps.invalidateCache('pending_list_products');
  res.json({ status: "success" });
}));

app.post("/api/xml/pending-list-products/confirm", asyncHandler(async (req: Request, res: Response) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Nenhum item enviado para confirmação" });
  }

  const now = new Date();
  let confirmedCount = 0;

  for (const it of items) {
    if (!it) continue;
    const itemPrice = Number(it.price || 0);
    const itemQty = Number(it.quantity || 1);
    const totalVal = itemPrice * itemQty;
    const dateStr = it.date || now.toISOString();
    const spendingId = `conf_list_${it.id || Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    const spendingPayload = {
      id: spendingId,
      dhEmi: dateStr,
      date: dateStr,
      createdAt: dateStr,
      supplierName: it.supplierName || 'Lista de Compras',
      vTotTrib: totalVal,
      vNF: totalVal,
      total: totalVal,
      source: 'shopping_list',
      hasNF: it.hasNF === true,
      listName: it.listName || 'Minhas Listas',
      products: [{
        code: `LIST_${String(it.productName || 'PROD').toUpperCase()}`,
        cProd: `LIST_${String(it.productName || 'PROD').toUpperCase()}`,
        name: it.productName || 'Produto sem nome',
        xProd: it.productName || 'Produto sem nome',
        vUnCom: itemPrice,
        price: itemPrice,
        quantity: itemQty,
        vProd: totalVal,
        category: it.category || 'Outros',
        categoryId: it.category || 'Outros',
        setor: it.setor || ''
      }]
    };

    // Save into xml_spendings
    const spendingRef = fsOps.doc('xml_spendings', spendingId);
    await fsOps.set(spendingRef, spendingPayload, 'xml_spendings/' + spendingId);

    // Also save into invoices so rangeProducts and other invoice searches pick it up
    const invoiceRef = fsOps.doc('invoices', spendingId);
    await fsOps.set(invoiceRef, spendingPayload, 'invoices/' + spendingId);

    // Delete from pending_list_products if it was pending
    if (it.id) {
      const pendingRef = fsOps.doc('pending_list_products', it.id);
      await fsOps.delete(pendingRef, 'pending_list_products/' + it.id);
    }

    confirmedCount++;
  }

  // Invalidate caches
  fsOps.invalidateCache('xml_spendings');
  fsOps.invalidateCache('invoices');
  fsOps.invalidateCache('pending_list_products');

  res.json({ status: "success", confirmedCount });
}));

// --- ROTAS DE NOTIFICAÇÃO ---
app.get("/api/notifications/vapid-key", (req, res) => {
  res.json({ publicKey: PUSH_CONFIG.publicKey });
});

app.post("/api/notifications/subscribe", asyncHandler(async (req: Request, res: Response) => {
  const subscription = req.body;
  const docId = Buffer.from(subscription.endpoint).toString('base64').substring(0, 50);
  await fsOps.set(fsOps.doc('push_subscriptions', docId), {
    ...subscription,
    updatedAt: new Date().toISOString()
  });
  res.status(201).json({ status: "subscribed" });
}));

app.post("/api/notifications/broadcast", asyncHandler(async (req: Request, res: Response) => {
  const { title, message, url } = req.body;
  const count = await PushService.broadcast(title || "Aviso", message || "Novidade!", url);
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
  const subPath = (req.params as any)[0];
  const queryString = req.url.includes('?') ? req.url.substring(req.url.indexOf('?')) : '';
  const response = await OmieService.proxyRequest(req.method, subPath, req.body, queryString);
  
  if (response.status >= 400 && typeof response.data === 'string') {
    return res.status(response.status).json({ error: response.data });
  }
  res.status(response.status).send(response.data);
}));

// --- TRATAMENTO DE ERROS ---
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[ErrorHandler]', err.message);
  
  // Se for erro de timeout ou conexão do axios/ai
  if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
    return res.status(504).json({
      error: 'Timeout na requisição',
      message: 'O servidor demorou muito para responder. Tente novamente com um arquivo menor.'
    });
  }

  res.status(err.status || 500).json({ 
    error: err.name || 'Erro no servidor',
    message: err.message || 'Ocorreu um erro inesperado.'
  });
});

export default app;
