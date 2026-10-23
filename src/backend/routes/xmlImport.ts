/* Rotas movidas de app.ts sem alteração de corpo. Registra direto no app (nunca em Router). */
import type { Express } from "express";
import { Request, Response } from "express";
import { repo } from "../data/index.js";
import { PushService } from "../services/pushService.js";
import { XMLService } from "../services/xmlService.js";
import { normalizeParams, validateParams, diffParams } from "../../shared/priceSettings.js";
import { internalErrorMessage } from "../errors.js";
import { isRelevantIncrease } from "../../shared/priceIncrease.js";
import { estimateItems, EstimateRequestItem } from "../services/priceEstimationService.js";
import { asyncHandler, applyPagination, handleCacheAndEtag, actorName, readDocData, priceEstimationEnabled, loadPriceSettings, loadEstimateContext, sendKnownError } from "../http.js";

export function registerXmlImportRoutes(app: Express): void {
// --- ROTAS XML ---
const xmlService = new XMLService();


app.get("/api/xml/price-settings", asyncHandler(async (req: Request, res: Response) => {
  const settings = await loadPriceSettings();
  res.json({ enabled: priceEstimationEnabled(), params: settings.params, history: settings.history });
}));

app.post("/api/xml/price-settings", asyncHandler(async (req: Request, res: Response) => {
  if (!priceEstimationEnabled()) return res.status(404).json({ error: 'disabled', message: 'Recurso desativado.' });
  const rawParams = req.body?.params;
  if (!rawParams || typeof rawParams !== 'object' || Array.isArray(rawParams)) {
    return res.status(400).json({ error: 'invalid_params', message: 'Informe os parâmetros.' });
  }
  const params = normalizeParams(rawParams);
  const errors = validateParams(params);
  if (errors.length > 0) return res.status(400).json({ error: 'invalid_params', message: errors.join(' ') });

  const current = await loadPriceSettings({ strict: true });
  const at = new Date().toISOString();
  const by = actorName(req, res);
  const entries = diffParams(current.params, params).map(c => ({ at, by, ...c }));
  if (entries.length === 0) return res.json({ status: 'success', changed: 0 });

  const history = [...current.history, ...entries].slice(-200);
  await repo.set(repo.doc('price_settings', 'default'), { params, history, updatedAt: at }, 'price_settings/default');
  repo.invalidateCache('price_settings');
  res.json({ status: 'success', changed: entries.length });
}));

app.post("/api/xml/price-estimates", asyncHandler(async (req: Request, res: Response) => {
  if (!priceEstimationEnabled()) return res.status(404).json({ error: 'disabled', message: 'Recurso desativado.' });
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0 || items.length > 200) {
    return res.status(400).json({ error: 'items_required', message: 'Informe de 1 a 200 itens.' });
  }
  if (!items.every((it: any) => it && typeof it === 'object' && typeof it.name === 'string' && typeof it.supplierName === 'string')) {
    return res.status(400).json({ error: 'items_invalid', message: 'Itens inválidos.' });
  }
  try {
    const ctx = await loadEstimateContext(actorName(req, res));
    res.json({ estimates: estimateItems(items as EstimateRequestItem[], ctx) });
  } catch (e) {
    if (sendKnownError(res, e)) return;
    throw e;
  }
}));

app.post("/api/xml/process", asyncHandler(async (req: Request, res: Response) => {
  const { xmlData } = req.body;
  const parsedData = xmlService.parseNFe(xmlData);
  
  // 1. Busca faturas existentes para comparação antes de salvar o novo XML
  let existingInvoices: any[] = [];
  try {
    const snapshot = await repo.getDocs('invoices', 'invoices');
    existingInvoices = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
  } catch (e) {
    console.error("Erro ao buscar faturas anteriores para comparação de preços:", e);
  }

  // 2. Salva no Firestore tanto na coleção invoices quanto em xml_spendings
  const docRef = repo.doc('invoices', parsedData.id);
  const docSnapshot = await repo.getDoc(docRef);
  const exists = typeof docSnapshot.exists === 'function' ? docSnapshot.exists() : !!docSnapshot.exists;
  if (exists) {
    // A nota já foi importada: não regrava (preserva ajustes) nem refaz alertas de preço.
    return res.json({ status: 'duplicate', id: parsedData.id });
  }

  await repo.set(docRef, parsedData, 'invoices/' + parsedData.id);
  
  // Salva também em xml_spendings para persistência simultânea multitabelas
  const spendingRef = repo.doc('xml_spendings', parsedData.id);
  await repo.set(spendingRef, {
    id: parsedData.id,
    supplierName: parsedData.supplierName,
    dhEmi: parsedData.date,
    vTotTrib: parsedData.vTotTrib || 0,
    fileName: `upload_${parsedData.id}.xml`
  }, 'xml_spendings/' + parsedData.id);

  repo.invalidateCache('xml_spendings'); // Invalida o cache de gastos XML
  repo.invalidateCache('invoices'); // Invalida o cache de faturas
  
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

      // Preço subiu! (só vale se o aumento for de pelo menos 0,1%)
      const percentIncrease = newPrice > oldPrice ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;
      if (isRelevantIncrease(percentIncrease)) {
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
          alreadyImported: false,
          createdAt: new Date().toISOString()
        };

        // Salva o alerta de aumento de preço no Firestore
        const piRef = repo.doc('price_increases', increaseId);
        await repo.set(piRef, priceIncreaseDoc, 'price_increases/' + increaseId);
        repo.invalidateCache('price_increases');

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
  
  res.json({ status: 'imported', id: parsedData.id });
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
    const snapshot = await repo.getDocs('invoices', 'invoices');
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
          if (over?.setor) p.setor = over.setor;
          return true;
        });
        // Recalculate invoice total based on remaining products
        parsedData.vTotTrib = parsedData.products.reduce((acc: number, p: any) => acc + (p.vUnCom * p.quantity), 0);
      }
      const currentInvoiceId = parsedData.id;
      const currentInvoiceDate = parsedData.date || new Date().toISOString();
      const currentProducts = parsedData.products || [];

      const docRef = repo.doc('invoices', parsedData.id);
      const docSnapshot = await repo.getDoc(docRef);
      const exists = typeof docSnapshot.exists === 'function' ? docSnapshot.exists() : !!docSnapshot.exists;
      if (exists) {
        results.push({
          id: parsedData.id,
          supplierName: parsedData.supplierName,
          dhEmi: parsedData.date,
          vTotTrib: parsedData.vTotTrib || 0,
          status: 'duplicate'
        });
        continue;
      }

      // Persiste na tabela invoices
      await repo.set(docRef, parsedData, 'invoices/' + parsedData.id);

      // Persiste simultaneamente na tabela xml_spendings
      const spendingRef = repo.doc('xml_spendings', parsedData.id);
      await repo.set(spendingRef, {
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

          const percentIncrease = newPrice > oldPrice ? ((newPrice - oldPrice) / oldPrice) * 100 : 0;
          if (isRelevantIncrease(percentIncrease)) {
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
              alreadyImported: false,
              createdAt: new Date().toISOString()
        };

            const piRef = repo.doc('price_increases', increaseId);
            await repo.set(piRef, priceIncreaseDoc, 'price_increases/' + increaseId);
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
        status: 'imported'
      });
    } catch (err: any) {
      console.error(`Erro ao processar arquivo no lote:`, err);
      results.push({ id: 'unknown', error: err.message || String(err), status: 'error' });
    }
  }

  // Invalida os caches globais UMA ÚNICA VEZ ao término de todo o lote!
  repo.invalidateCache('xml_spendings');
  repo.invalidateCache('invoices');
  repo.invalidateCache('price_increases');

  console.log(`[Batch XML] Lote finalizado com sucesso. Registros processados: ${results.length}`);
  res.json({ results });
}));

app.get("/api/xml/price-increases", handleCacheAndEtag("price_increases"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const snapshot = await repo.getDocs('price_increases', 'price_increases', true);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    }).filter((d: any) => isRelevantIncrease(d.percentIncrease)); // esconde também os registros antigos de 0,0%
    data.sort((a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching price increases:", error);
    res.status(500).json({ error: "Error fetching price increases", message: internalErrorMessage(error) });
  }
}));

app.post("/api/xml/price-increases/delete", asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || ids.length === 0) {
    return res.status(400).json({ error: "Format or list of IDs is invalid" });
  }

  for (const id of ids) {
    const docRef = repo.doc('price_increases', id);
    await repo.delete(docRef, 'price_increases/' + id);
  }
  repo.invalidateCache('price_increases');
  res.json({ status: "success", deletedCount: ids.length });
}));

// --- NOTAS XML PENDENTES (compartilhadas entre Dashboard e Importar XML dos Produtos) ---
// Cada nota enviada fica salva até ser confirmada ou descartada em cada lado.
// Doc id = chave da NF-e (saneada). Cada lado tem seu status: pending | done | dismissed.
type PendingXmlSide = 'dashboard' | 'products';
const isPendingXmlSide = (v: any): v is PendingXmlSide => v === 'dashboard' || v === 'products';
const pendingXmlId = (nfeKey: string) => String(nfeKey).replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 200);

app.get("/api/xml/pending-imports", asyncHandler(async (req: Request, res: Response) => {
  const side = req.query.side;
  if (!isPendingXmlSide(side)) {
    return res.status(400).json({ error: "side deve ser 'dashboard' ou 'products'" });
  }
  const snapshot = await repo.getDocs('pending_xml_imports', 'pending_xml_imports', true);
  const data = snapshot.docs
    .map((doc: any) => ({ id: doc.id, ...readDocData(doc) }))
    .filter((d: any) => d[`${side}Status`] === 'pending' && d.xmlText)
    .sort((a: any, b: any) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  res.json(data);
}));

app.post("/api/xml/pending-imports", asyncHandler(async (req: Request, res: Response) => {
  const { side, nfeKey, fileName, xmlText, supplierName, dhEmi, vTotTrib, productsAlreadyImported } = req.body || {};
  if (!isPendingXmlSide(side) || !nfeKey || typeof xmlText !== 'string' || !xmlText) {
    return res.status(400).json({ error: "side, nfeKey e xmlText são obrigatórios" });
  }
  const id = pendingXmlId(nfeKey);
  const ref = repo.doc('pending_xml_imports', id);
  const existingSnap = await repo.getDoc(ref, 'pending_xml_imports/' + id, true);
  const existsPending = typeof existingSnap.exists === 'function' ? existingSnap.exists() : !!existingSnap.exists;
  const existing: any = existsPending ? readDocData(existingSnap) : {};

  // Lado Dashboard já feito: confirmado antes por aqui, ou nota já existente nos gastos
  // (inclui importações feitas antes deste recurso).
  let dashboardDone = existing.dashboardStatus === 'done';
  if (!dashboardDone && !String(nfeKey).includes('/')) {
    const spendingSnap = await repo.getDoc(repo.doc('xml_spendings', String(nfeKey)), 'xml_spendings/' + nfeKey, true);
    dashboardDone = typeof spendingSnap.exists === 'function' ? spendingSnap.exists() : !!spendingSnap.exists;
  }
  const productsDone = existing.productsStatus === 'done' || productsAlreadyImported === true;

  // O lado que enviou o arquivo sempre fica pendente (reimportar é permitido, com aviso).
  // O outro lado só fica pendente se ainda não foi feito.
  const doc = {
    nfeKey: String(nfeKey),
    fileName: fileName || '',
    xmlText,
    supplierName: supplierName || '',
    dhEmi: dhEmi || '',
    vTotTrib: Number(vTotTrib) || 0,
    createdAt: new Date().toISOString(),
    dashboardStatus: side === 'dashboard' ? 'pending' : (dashboardDone ? 'done' : 'pending'),
    productsStatus: side === 'products' ? 'pending' : (productsDone ? 'done' : 'pending'),
    alreadyImported: { dashboard: dashboardDone, products: productsDone }
  };
  await repo.set(ref, doc, 'pending_xml_imports/' + id);
  repo.invalidateCache('pending_xml_imports');
  res.json({
    status: "success",
    id,
    alreadyImported: doc.alreadyImported,
    dashboardStatus: doc.dashboardStatus,
    productsStatus: doc.productsStatus
  });
}));

app.post("/api/xml/pending-imports/status", asyncHandler(async (req: Request, res: Response) => {
  const { ids, side, status } = req.body || {};
  if (!Array.isArray(ids) || !isPendingXmlSide(side) || (status !== 'done' && status !== 'dismissed')) {
    return res.status(400).json({ error: "ids[], side e status ('done'|'dismissed') são obrigatórios" });
  }
  for (const rawId of ids) {
    const id = pendingXmlId(rawId);
    const ref = repo.doc('pending_xml_imports', id);
    const snap = await repo.getDoc(ref, 'pending_xml_imports/' + id, true);
    const exists = typeof snap.exists === 'function' ? snap.exists() : !!snap.exists;
    if (!exists) continue;
    const doc: any = { ...readDocData(snap), [`${side}Status`]: status };
    // Quando nenhum lado está mais pendente o XML não é mais necessário: guarda só o histórico.
    if (doc.dashboardStatus !== 'pending' && doc.productsStatus !== 'pending') doc.xmlText = '';
    await repo.set(ref, doc, 'pending_xml_imports/' + id);
  }
  repo.invalidateCache('pending_xml_imports');
  res.json({ status: "success" });
}));
}
