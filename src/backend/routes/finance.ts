/* Rotas movidas de app.ts sem alteração de corpo. Registra direto no app (nunca em Router). */
import type { Express } from "express";
import { Request, Response } from "express";
import { repo } from "../data/index.js";
import { recordAudit } from "../audit.js";
import { findDuplicateInvoices } from "../services/invoiceDuplicates.js";
import { internalErrorMessage } from "../errors.js";
import { asyncHandler, applyPagination, handleCacheAndEtag, auditActor } from "../http.js";

export function registerFinanceRoutes(app: Express): void {

// Relatório de notas repetidas: só leitura. Nada é apagado por aqui; quem decide é o dono.
app.get("/api/xml/invoices/duplicates", asyncHandler(async (req: Request, res: Response) => {
  const snapshot = await repo.getDocs('invoices', 'invoices', true);
  const invoices = snapshot.docs.map((doc: any) => {
    const d = typeof doc.data === 'function' ? doc.data() : doc.data;
    return { id: doc.id, ...d };
  });
  const groups = findDuplicateInvoices(invoices);
  res.json({ total: invoices.length, groups });
}));

app.get("/api/xml/invoices", handleCacheAndEtag("invoices"), asyncHandler(async (req: Request, res: Response) => {
  console.log("Fetching invoices...");
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await repo.getDocs('invoices', 'invoices', forceNoCache);
    console.log("Got snapshot, found docs:", snapshot?.docs?.length);
    if (!snapshot || !snapshot.docs) {
      throw new Error("Snapshot or snapshot.docs is undefined");
    }

    // Load product category overrides
    let productOverridesMap = new Map<string, { category?: string; deleted?: boolean }>();
    try {
      const pcSnap = await repo.getDocs('product_categories', 'product_categories', forceNoCache);
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
      const psSnap = await repo.getDocs('product_setores', 'product_setores', forceNoCache);
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
              if (over.category && !p.categoryLocked) {
                p.category = over.category;
                p.categoryId = over.category;
              }
              if (over.deleted) {
                p.deleted = true;
              }
            }

            const setorOver = (pCode && setorOverridesMap.get(pCode)) || (pName && setorOverridesMap.get(pName));
            if (setorOver && setorOver.setor && !p.setorLocked) {
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
      message: internalErrorMessage(error, 'invoices')
    });
  }
}));

app.get("/api/xml/spendings", handleCacheAndEtag("xml_spendings"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await repo.getDocs('xml_spendings', 'xml_spendings', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached spendings:", error);
    res.status(500).json({ error: "Error fetching spendings", message: internalErrorMessage(error) });
  }
}));

app.delete("/api/xml/spendings/:id", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id) {
    return res.status(400).json({ status: 'error', error: 'ID not provided' });
  }

  const docRef = await repo.doc('xml_spendings', id);
  const docSnapshot = await repo.getDoc(docRef, 'xml_spendings/' + id);
  const exists = typeof docSnapshot.exists === 'function' ? docSnapshot.exists() : !!docSnapshot.exists;

  if (exists) {
    await repo.delete(docRef, 'xml_spendings/' + id);
    repo.invalidateCache('xml_spendings');
    await recordAudit(repo, { action: 'spending.delete', actor: auditActor(res), target: 'xml_spendings/' + id });
    res.json({ status: 'deleted', id });
  } else {
    res.json({ status: 'not_found', message: `Spending ${id} not found but checked.` });
  }
}));

app.post("/api/xml/cache/invalidate", asyncHandler(async (req: Request, res: Response) => {
  const { collection } = req.body;
  if (collection) {
    repo.invalidateCache(collection);
    console.log(`[Cache Invalidation] Invalidated cache for collection: ${collection}`);
    res.json({ status: 'ok', collection });
  } else {
    res.status(400).json({ error: 'Collection not specified' });
  }
}));

// --- AUXILIAR DE DELEÇÃO DE FATURA ---
const deleteInvoiceHelper = async (id: string, res: Response) => {
  if (!id) {
    return res.status(400).json({ status: 'error', error: 'ID not provided' });
  }
  console.log("Backend deleting invoice ID:", id);

  // Tenta com o ID fornecido direto
  let docRef = await repo.doc('invoices', id);
  let docSnapshot = await repo.getDoc(docRef, 'invoices/' + id);
  let exists = typeof docSnapshot.exists === 'function' ? docSnapshot.exists() : !!docSnapshot.exists;

  // Se não existe e não começa com 'NFe', tenta adicionar o prefixo 'NFe'
  if (!exists && !id.startsWith('NFe')) {
    const alternativeId = 'NFe' + id;
    console.log(`ID ${id} não encontrado. Tentando ID alternativo: ${alternativeId}`);
    docRef = await repo.doc('invoices', alternativeId);
    docSnapshot = await repo.getDoc(docRef, 'invoices/' + alternativeId);
    exists = typeof docSnapshot.exists === 'function' ? docSnapshot.exists() : !!docSnapshot.exists;
  }

  // Se começou com 'NFe' e não encontrou, tenta remover o prefixo 'NFe'
  if (!exists && id.startsWith('NFe')) {
    const alternativeId = id.substring(3);
    console.log(`ID ${id} não encontrado. Tentando ID alternativo sem NFe: ${alternativeId}`);
    docRef = await repo.doc('invoices', alternativeId);
    docSnapshot = await repo.getDoc(docRef, 'invoices/' + alternativeId);
    exists = typeof docSnapshot.exists === 'function' ? docSnapshot.exists() : !!docSnapshot.exists;
  }

  const finalId = docSnapshot.id || id;
  console.log(`Doc exists at final ID ${finalId} before delete:`, exists);

  if (exists) {
    await repo.delete(docRef, 'invoices/' + finalId);
    repo.invalidateCache('xml_spendings'); // Invalida o cache de gastos também
    repo.invalidateCache('invoices'); // Invalida o cache de faturas também
    const inv: any = (typeof docSnapshot.data === 'function' ? docSnapshot.data() : docSnapshot.data) || {};
    await recordAudit(repo, {
      action: 'invoice.delete', actor: auditActor(res), target: 'invoices/' + finalId,
      before: { supplierName: inv.supplierName, vTotTrib: inv.vTotTrib, date: inv.date, produtos: Array.isArray(inv.produtos) ? inv.produtos.length : 0 },
    });
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

// Remove as entradas provisórias vindas das listas de compras (source 'shopping_list')
// dentro do período informado. Notas fiscais reais não são tocadas.
app.post("/api/xml/list-spendings/reset", asyncHandler(async (req: Request, res: Response) => {
  const { start, end } = req.body || {};
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || startMs > endMs) {
    return res.status(400).json({ error: "Período inválido" });
  }
  if (req.body?.confirm !== true) {
    return res.status(400).json({ error: "confirm_required", message: "Confirmação necessária para resetar os gastos das listas." });
  }

  let removed = 0;
  for (const coll of ['invoices', 'xml_spendings']) {
    const snapshot = await repo.getDocs(coll, coll, true);
    for (const docSnap of snapshot.docs) {
      const d: any = typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data;
      if (d?.source !== 'shopping_list') continue;
      const ms = new Date(d.date || d.dhEmi || d.createdAt).getTime();
      if (!Number.isFinite(ms) || ms < startMs || ms > endMs) continue;
      await repo.delete(repo.doc(coll, docSnap.id), `${coll}/${docSnap.id}`);
      if (coll === 'invoices') removed++;
    }
    repo.invalidateCache(coll);
  }
  await recordAudit(repo, { action: 'list_spendings.reset', actor: auditActor(res), target: 'invoices', meta: { start, end, removed } });
  res.json({ status: "success", removed });
}));
}
