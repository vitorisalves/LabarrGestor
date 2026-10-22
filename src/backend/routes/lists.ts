/* Rotas movidas de app.ts sem alteração de corpo. Registra direto no app (nunca em Router). */
import type { Express } from "express";
import { Request, Response } from "express";
import { repo } from "../data/index.js";
import { versionOf } from "../data/version.js";
import { buildConfirmedSpending } from "../services/confirmedSpending.js";
import { applyUnbilledPurchase, findSupplierByName } from "../services/supplierProductSync.js";
import { parsePrice, validateItems } from "../validation.js";
import { internalErrorMessage } from "../errors.js";
import { estimateItems, EstimateRequestItem } from "../services/priceEstimationService.js";
import { buildOrderDoc, applyRequisitionApproval, buildListFromOrder } from "../services/orderEstimates.js";
import { asyncHandler, applyPagination, handleCacheAndEtag, actorName, priceEstimationEnabled, loadEstimateContext, sendKnownError } from "../http.js";

export function registerListsRoutes(app: Express): void {
app.get("/api/xml/shopping_lists", handleCacheAndEtag("shopping_lists"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await repo.getDocs('shopping_lists', 'shopping_lists', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached shopping_lists:", error);
    res.status(500).json({ error: "Error fetching shopping lists", message: internalErrorMessage(error) });
  }
}));

app.post("/api/xml/shopping_lists/update-items", asyncHandler(async (req: Request, res: Response) => {
  const { listId, items, total, date, baseVersion } = req.body;
  if (!listId || !Array.isArray(items)) {
    return res.status(400).json({ error: "listId e items são obrigatórios" });
  }
  validateItems(items);
  const updates: any = { items };
  if (typeof total === 'number') updates.total = parsePrice(total, 'Total');
  if (typeof date === 'string') updates.date = date;
  const ref = repo.doc('shopping_lists', listId);
  const path = 'shopping_lists/' + listId;

  if (baseVersion === undefined || baseVersion === null) {
    // Tela antiga (sem versão): grava como antes, mas sempre avança a versão.
    const current = await repo.getDoc(ref, path, true, true);
    const exists = typeof current.exists === 'function' ? current.exists() : !!current.exists;
    const version = (exists ? versionOf(current.data()) : 0) + 1;
    await repo.update(ref, { ...updates, version }, path);
    repo.invalidateCache('shopping_lists');
    return res.json({ status: "success", version });
  }

  const expected = Number(baseVersion);
  if (!Number.isInteger(expected) || expected < 0) {
    return res.status(400).json({ error: "baseVersion inválido" });
  }
  const outcome = await repo.updateIfVersion(ref, updates, expected, path);
  if (outcome === 'not_found') return res.status(404).json({ error: "not_found", message: "Lista não encontrada." });
  if (outcome === 'conflict') {
    return res.status(409).json({ error: "version_conflict", message: "Esta lista foi alterada por outra pessoa. Recarregue a tela e tente de novo." });
  }
  repo.invalidateCache('shopping_lists');
  res.json({ status: "success", version: expected + 1 });
}));

app.post("/api/xml/shopping_lists", asyncHandler(async (req: Request, res: Response) => {
  const { id, ...listData } = req.body;
  if (Array.isArray(listData.items)) validateItems(listData.items);
  const listId = id || `list_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const ref = repo.doc('shopping_lists', listId);
  const path = 'shopping_lists/' + listId;
  // Mantém a contagem de versões: regravar a lista inteira também avança a versão.
  const existing = await repo.getDoc(ref, path, true, true);
  const exists = typeof existing.exists === 'function' ? existing.exists() : !!existing.exists;
  const version = (exists ? versionOf(existing.data()) : 0) + 1;
  await repo.set(ref, { ...listData, version }, path);
  repo.invalidateCache('shopping_lists');
  res.json({ status: "success", id: listId, version });
}));

app.post("/api/xml/shopping_lists/delete", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "id ausente." });
  }
  await repo.delete(repo.doc('shopping_lists', id), 'shopping_lists/' + id);
  repo.invalidateCache('shopping_lists');
  res.json({ status: "success" });
}));

app.get("/api/xml/purchase_orders", handleCacheAndEtag("purchase_orders"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await repo.getDocs('purchase_orders', 'purchase_orders', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching purchase_orders:", error);
    res.status(500).json({ error: "Error fetching purchase orders", message: internalErrorMessage(error) });
  }
}));

app.post("/api/xml/purchase_orders", asyncHandler(async (req: Request, res: Response) => {
  const { name, items, total, shippingFee, createdBy } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Itens são obrigatórios" });
  }
  validateItems(items);
  parsePrice(shippingFee, 'Frete');
  const id = `po_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  if (priceEstimationEnabled()) {
    if (items.length > 200) {
      return res.status(400).json({ error: 'items_required', message: 'Informe de 1 a 200 itens.' });
    }
    if (!items.every((it: any) => it && typeof it === 'object' && typeof it.name === 'string' && typeof it.supplierName === 'string')) {
      return res.status(400).json({ error: 'items_invalid', message: 'Itens inválidos.' });
    }
    try {
      const creator = String(res.locals.authUser?.name || createdBy || actorName(req, res));
      const ctx = await loadEstimateContext(creator);
      const estimates = estimateItems(items as EstimateRequestItem[], ctx);
      const order = buildOrderDoc({
        id, name, items, estimates, shippingFee, createdBy: creator, now: new Date().toISOString(),
      });
      await repo.set(repo.doc('purchase_orders', id), order, 'purchase_orders/' + id);
      repo.invalidateCache('purchase_orders');
      return res.json({ status: "success", order });
    } catch (e) {
      if (sendKnownError(res, e)) return;
      throw e;
    }
  }

  const order = {
    id,
    name: name || 'Lista de Compras',
    date: new Date().toISOString(),
    items,
    total: parsePrice(total, 'Total'),
    shippingFee: parsePrice(shippingFee, 'Frete'),
    createdBy: createdBy || '',
    status: 'pending'
  };
  await repo.set(repo.doc('purchase_orders', id), order, 'purchase_orders/' + id);
  repo.invalidateCache('purchase_orders');
  res.json({ status: "success", order });
}));

app.post("/api/xml/purchase_orders/approve-requisition", asyncHandler(async (req: Request, res: Response) => {
  const { id, approvedBy, observacao, approvedLimit, limitReason } = req.body;
  if (!id) return res.status(400).json({ error: "ID é obrigatório" });

  if (priceEstimationEnabled()) {
    const ref = repo.doc('purchase_orders', id);
    const snap = await repo.getDoc(ref, 'purchase_orders/' + id, true);
    const exists = typeof snap.exists === 'function' ? snap.exists() : !!snap.exists;
    if (!exists) return res.status(404).json({ error: "Ordem de compra não encontrada" });
    const order: any = typeof snap.data === 'function' ? snap.data() : snap.data;
    try {
      const patch = applyRequisitionApproval(order, {
        approvedBy: String(res.locals.authUser?.name || approvedBy || actorName(req, res)),
        observacao,
        approvedLimit,
        limitReason,
        now: new Date().toISOString(),
      });
      await repo.update(ref, patch, 'purchase_orders/' + id);
    } catch (e) {
      if (sendKnownError(res, e)) return;
      throw e;
    }
    repo.invalidateCache('purchase_orders');
    return res.json({ status: "success" });
  }

  await repo.update(repo.doc('purchase_orders', id), {
    status: 'requisition_approved',
    requisitionApprovedBy: approvedBy || '',
    requisitionApprovedAt: new Date().toISOString(),
    observacao: observacao || ''
  }, 'purchase_orders/' + id);
  repo.invalidateCache('purchase_orders');
  res.json({ status: "success" });
}));

app.post("/api/xml/purchase_orders/approve", asyncHandler(async (req: Request, res: Response) => {
  const { id, approvedBy, observacao } = req.body;
  if (!id) return res.status(400).json({ error: "ID é obrigatório" });
  await repo.update(repo.doc('purchase_orders', id), {
    status: 'approved',
    approvedBy: approvedBy || '',
    approvedAt: new Date().toISOString(),
    observacao: observacao || ''
  }, 'purchase_orders/' + id);
  repo.invalidateCache('purchase_orders');
  res.json({ status: "success" });
}));

app.post("/api/xml/purchase_orders/reject", asyncHandler(async (req: Request, res: Response) => {
  const { id, rejectedBy, observacao } = req.body;
  if (!id) return res.status(400).json({ error: "ID é obrigatório" });
  await repo.update(repo.doc('purchase_orders', id), {
    status: 'rejected',
    rejectedBy: rejectedBy || '',
    rejectedAt: new Date().toISOString(),
    observacao: observacao || ''
  }, 'purchase_orders/' + id);
  repo.invalidateCache('purchase_orders');
  res.json({ status: "success" });
}));

app.post("/api/xml/purchase_orders/observacao", asyncHandler(async (req: Request, res: Response) => {
  const { id, observacao } = req.body;
  if (!id) return res.status(400).json({ error: "ID é obrigatório" });
  await repo.update(repo.doc('purchase_orders', id), {
    observacao: observacao || ''
  }, 'purchase_orders/' + id);
  repo.invalidateCache('purchase_orders');
  res.json({ status: "success" });
}));

app.post("/api/xml/purchase_orders/send", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "ID é obrigatório" });

  const docSnap = await repo.getDoc(repo.doc('purchase_orders', id), 'purchase_orders/' + id);
  const exists = typeof docSnap.exists === 'function' ? docSnap.exists() : !!docSnap.exists;
  if (!exists) {
    return res.status(404).json({ error: "Ordem de compra não encontrada" });
  }
  const order: any = typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data;

  const listId = `list_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
  const listData = buildListFromOrder(order, new Date().toISOString());
  await repo.set(repo.doc('shopping_lists', listId), listData, 'shopping_lists/' + listId);
  await repo.delete(repo.doc('purchase_orders', id), 'purchase_orders/' + id);

  repo.invalidateCache('shopping_lists');
  repo.invalidateCache('purchase_orders');
  res.json({ status: "success", listId });
}));

app.post("/api/xml/purchase_orders/delete", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "ID é obrigatório" });
  await repo.delete(repo.doc('purchase_orders', id), 'purchase_orders/' + id);
  repo.invalidateCache('purchase_orders');
  res.json({ status: "success" });
}));

// --- ROTAS DE PRODUTOS PENDENTES DE LISTAS DE COMPRAS ---
app.get("/api/xml/pending-list-products", handleCacheAndEtag("pending_list_products"), asyncHandler(async (req: Request, res: Response) => {
  const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache';
  const snapshot = await repo.getDocs('pending_list_products', 'pending_list_products', forceNoCache);
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
    const docRef = repo.doc('pending_list_products', it.id);
    await repo.set(docRef, {
      ...it,
      updatedAt: new Date().toISOString()
    }, 'pending_list_products/' + it.id);
  }
  
  repo.invalidateCache('pending_list_products');
  res.json({ status: "success", count: listToSave.length });
}));

app.post("/api/xml/pending-list-products/delete", asyncHandler(async (req: Request, res: Response) => {
  const { ids } = req.body;
  if (Array.isArray(ids)) {
    for (const id of ids) {
      if (!id) continue;
      const docRef = repo.doc('pending_list_products', id);
      await repo.delete(docRef, 'pending_list_products/' + id);
    }
  }
  repo.invalidateCache('pending_list_products');
  res.json({ status: "success" });
}));

app.post("/api/xml/pending-list-products/confirm", asyncHandler(async (req: Request, res: Response) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Nenhum item enviado para confirmação" });
  }

  const now = new Date();
  const valid = items.filter((it: any) => it);
  // Monta tudo antes de gravar: um item inválido recusa o pedido inteiro, sem gravação parcial.
  const payloads = valid.map((it: any) => ({ it, spending: buildConfirmedSpending(it, now) }));

  for (const { it, spending } of payloads) {
    // O ID é derivado do item: repetir a confirmação regrava os mesmos registros (nada duplica).
    await repo.set(repo.doc('xml_spendings', spending.id), spending, 'xml_spendings/' + spending.id);
    // Também em invoices, para as buscas por período enxergarem o gasto.
    await repo.set(repo.doc('invoices', spending.id), spending, 'invoices/' + spending.id);
    if (it.id) {
      await repo.delete(repo.doc('pending_list_products', it.id), 'pending_list_products/' + it.id);
    }
  }
  const confirmedCount = payloads.length;

  // Concluídos "Sem NF" nunca terão nota: os dados passam para o produto do fornecedor
  // (a data da última compra fica como está). Falha aqui não desfaz a confirmação.
  let productsUpdated = 0;
  try {
    const unbilled = payloads.filter(({ it }) => it.hasNF === true);
    if (unbilled.length > 0) {
      const snap = await repo.getDocs('suppliers', 'suppliers', true, true);
      const suppliers: any[] = snap.docs.map((d: any) => ({ id: d.id, ...(typeof d.data === 'function' ? d.data() : d.data) }));
      for (const { it } of unbilled) {
        const supplier = findSupplierByName(suppliers, it.supplierName);
        if (!supplier) continue;
        const updated = applyUnbilledPurchase(supplier, it);
        if (!updated) continue;
        const { id, ...rest } = updated;
        await repo.set(repo.doc('suppliers', id), rest, 'suppliers/' + id);
        suppliers[suppliers.indexOf(supplier)] = updated;
        productsUpdated++;
      }
      if (productsUpdated > 0) repo.invalidateCache('suppliers');
    }
  } catch (err) {
    console.error("Erro ao atualizar produtos dos fornecedores após conclusão sem NF:", err);
  }

  // Invalidate caches
  repo.invalidateCache('xml_spendings');
  repo.invalidateCache('invoices');
  repo.invalidateCache('pending_list_products');

  res.json({ status: "success", confirmedCount, productsUpdated });
}));
}
