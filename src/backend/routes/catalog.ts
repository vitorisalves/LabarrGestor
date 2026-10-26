/* Rotas movidas de app.ts sem alteração de corpo. Registra direto no app (nunca em Router). */
import type { Express } from "express";
import { Request, Response } from "express";
import { repo } from "../data/index.js";
import { recordAudit } from "../audit.js";
import { Identity } from "../auth/identity.js";
import { mergeSuppliersAddOnly } from "../../shared/supplierMerge.js";
import { parsePrice, validateItems } from "../validation.js";
import { stripCategory, stripCategoryFromSupplier, LEGACY_DEFAULT_CATEGORY } from "../services/categoryCleanup.js";
import { internalErrorMessage } from "../errors.js";
import { asyncHandler, applyPagination, handleCacheAndEtag, auditActor } from "../http.js";

export function registerCatalogRoutes(app: Express): void {

app.get("/api/xml/suppliers", handleCacheAndEtag("suppliers"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await repo.getDocs('suppliers', 'suppliers', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached suppliers:", error);
    res.status(500).json({ error: "Error fetching suppliers", message: internalErrorMessage(error) });
  }
}));

app.post("/api/xml/suppliers", asyncHandler(async (req: Request, res: Response) => {
  const supplier = req.body;
  if (!supplier || !supplier.id) {
    return res.status(400).json({ error: "Fornecedor inválido: id ausente." });
  }
  const { id, ...rest } = supplier;
  const docRef = repo.doc('suppliers', id);
  await repo.set(docRef, rest, 'suppliers/' + id);
  repo.invalidateCache('suppliers');
  res.json({ status: "success" });
}));

// Importação de planilha: grava vários fornecedores de uma vez. Tem rota (e permissão) própria
// para que "importar" possa ser bloqueado sem impedir a edição normal de fornecedores.
app.post("/api/xml/suppliers/import", asyncHandler(async (req: Request, res: Response) => {
  const { suppliers } = req.body || {};
  if (!Array.isArray(suppliers) || suppliers.length === 0) {
    return res.status(400).json({ error: "Nenhum fornecedor enviado." });
  }
  for (const s of suppliers) { if (s && Array.isArray(s.products)) validateItems(s.products, 'Produto'); }
  const snapshot = await repo.getDocs('suppliers', 'suppliers', true, true);
  const existing = snapshot.docs.map((d: any) => ({ id: d.id, ...(typeof d.data === 'function' ? d.data() : d.data) }));
  const result = mergeSuppliersAddOnly(
    existing as any,
    suppliers,
    () => `imp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );
  for (const supplier of result.toSave) {
    const { id, ...rest } = supplier;
    await repo.set(repo.doc('suppliers', id as string), rest, 'suppliers/' + id);
  }
  repo.invalidateCache('suppliers');
  res.json({
    status: "success",
    addedSuppliers: result.addedSuppliers,
    addedProducts: result.addedProducts,
    skippedProducts: result.skippedProducts,
  });
}));

app.post("/api/xml/suppliers/delete", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "id ausente." });
  }
  const docRef = repo.doc('suppliers', id);
  let supplierName: string | undefined;
  try {
    const snap: any = await repo.getDoc(docRef, 'suppliers/' + id);
    const sd = typeof snap?.data === 'function' ? snap.data() : snap?.data;
    supplierName = sd?.name;
  } catch { /* nome é só para auditoria */ }
  await repo.delete(docRef, 'suppliers/' + id);
  repo.invalidateCache('suppliers');
  await recordAudit(repo, { action: 'supplier.delete', actor: auditActor(res), target: 'suppliers/' + id, before: { name: supplierName } });
  res.json({ status: "success" });
}));

app.post("/api/xml/suppliers/delete-all", asyncHandler(async (req: Request, res: Response) => {
  const snapshot = await repo.getDocs('suppliers', 'suppliers', true);
  const deletable = snapshot.docs.filter((docSnap: any) => {
    const d = typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data;
    const name = String(d?.name || '').trim().toUpperCase();
    return name !== 'MERCADO' && name !== 'MATERIAIS';
  });
  if (Number(req.body?.confirmCount) !== deletable.length) {
    return res.status(409).json({
      error: "confirm_count_mismatch",
      expected: deletable.length,
      message: `Confirmação necessária: isto apagaria ${deletable.length} fornecedores. Recarregue a tela e confirme de novo.`
    });
  }
  let count = 0;
  for (const docSnap of deletable) {
    await repo.delete(repo.doc('suppliers', docSnap.id), 'suppliers/' + docSnap.id);
    count++;
  }
  repo.invalidateCache('suppliers');
  await recordAudit(repo, { action: 'supplier.delete_all', actor: auditActor(res), target: 'suppliers', meta: { count } });
  res.json({ status: "success", count });
}));

app.get("/api/xml/categories", handleCacheAndEtag("categories"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await repo.getDocs('categories', 'categories', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached categories:", error);
    res.status(500).json({ error: "Error fetching categories", message: internalErrorMessage(error) });
  }
}));

app.get("/api/xml/setores", handleCacheAndEtag("setores"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await repo.getDocs('setores', 'setores', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached setores:", error);
    res.status(500).json({ error: "Error fetching setores", message: internalErrorMessage(error) });
  }
}));

app.post("/api/xml/setores", asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Nome do setor é obrigatório" });
  }
  const trimmed = String(name).trim();
  const id = trimmed.toLowerCase().replace(/\s+/g, "_");
  await repo.set(repo.doc('setores', id), { name: trimmed }, 'setores/' + id);
  repo.invalidateCache('setores');
  res.json({ status: "success" });
}));

app.post("/api/xml/setores/delete", asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Nome do setor é obrigatório" });
  }
  const snapshot = await repo.getDocs('setores', 'setores', true);
  const matches = snapshot.docs.filter((doc: any) => {
    const d = typeof doc.data === 'function' ? doc.data() : doc.data;
    return d?.name === name;
  });
  for (const doc of matches) {
    await repo.delete(repo.doc('setores', doc.id), 'setores/' + doc.id);
  }
  repo.invalidateCache('setores');
  res.json({ status: "success", deletedCount: matches.length });
}));

app.post("/api/xml/categories", asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: "Nome da categoria é obrigatório" });
  }
  const trimmed = String(name).trim();
  const id = trimmed.toLowerCase().replace(/\s+/g, "_");
  await repo.set(repo.doc('categories', id), { name: trimmed }, 'categories/' + id);
  repo.invalidateCache('categories');
  res.json({ status: "success" });
}));

app.post("/api/xml/categories/delete", asyncHandler(async (req: Request, res: Response) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Nome da categoria é obrigatório" });
  }
  const snapshot = await repo.getDocs('categories', 'categories', true);
  const matches = snapshot.docs.filter((doc: any) => {
    const d = typeof doc.data === 'function' ? doc.data() : doc.data;
    return d?.name === name;
  });
  for (const doc of matches) {
    await repo.delete(repo.doc('categories', doc.id), 'categories/' + doc.id);
  }
  repo.invalidateCache('categories');
  res.json({ status: "success", deletedCount: matches.length });
}));

app.get("/api/xml/delivered_products", handleCacheAndEtag("delivered_products"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await repo.getDocs('delivered_products', 'delivered_products', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached delivered_products:", error);
    res.status(500).json({ error: "Error fetching delivered products", message: internalErrorMessage(error) });
  }
}));

app.post("/api/xml/delivered_products", asyncHandler(async (req: Request, res: Response) => {
  const product = req.body;
  if (!product || !product.id) {
    return res.status(400).json({ error: "Produto entregue inválido: id ausente." });
  }
  const { id, ...rest } = product;
  await repo.set(repo.doc('delivered_products', id), rest, 'delivered_products/' + id);
  repo.invalidateCache('delivered_products');
  res.json({ status: "success" });
}));

app.post("/api/xml/delivered_products/delete", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: "id ausente." });
  }
  await repo.delete(repo.doc('delivered_products', id), 'delivered_products/' + id);
  repo.invalidateCache('delivered_products');
  res.json({ status: "success" });
}));

app.get("/api/xml/reminders", handleCacheAndEtag("reminders"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await repo.getDocs('reminders', 'reminders', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached reminders:", error);
    res.status(500).json({ error: "Error fetching reminders", message: internalErrorMessage(error) });
  }
}));

app.post("/api/xml/reminders", asyncHandler(async (req: Request, res: Response) => {
  const { id, productName, date, ...rest } = req.body;
  if (!productName || !date) return res.status(400).json({ error: "productName e date são obrigatórios" });
  const remId = id || `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await repo.set(repo.doc('reminders', remId), { productName, date, notified: false, ...rest }, 'reminders/' + remId);
  repo.invalidateCache('reminders');
  res.json({ status: "success", id: remId });
}));

app.post("/api/xml/reminders/update", asyncHandler(async (req: Request, res: Response) => {
  const { id, ...patch } = req.body;
  if (!id) return res.status(400).json({ error: "id ausente." });
  await repo.update(repo.doc('reminders', id), patch, 'reminders/' + id);
  repo.invalidateCache('reminders');
  res.json({ status: "success" });
}));

app.post("/api/xml/reminders/delete", asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "id ausente." });
  await repo.delete(repo.doc('reminders', id), 'reminders/' + id);
  repo.invalidateCache('reminders');
  res.json({ status: "success" });
}));

// Altera só UMA compra (um item de uma nota), sem mexer nas outras compras do mesmo produto.
// O item fica marcado (lockField) para a leitura das notas não reaplicar a troca feita por produto.
async function updateSingleInvoiceItem(invKey: string, productIndex: number, identity: { code: string; name: string }, patch: Record<string, any>, lockField: string): Promise<boolean> {
  const normStr = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const invSnapshot = await repo.getDocs('invoices', 'invoices', true);
  for (const doc of invSnapshot.docs) {
    const d: any = typeof doc.data === 'function' ? doc.data() : doc.data;
    const inv: any = { id: doc.id, ...d };
    const currentKey = inv.chNFe || inv.nfeKey || inv.id;
    if (inv.id !== invKey && currentKey !== invKey) continue;
    if (!Array.isArray(inv.products) || !Number.isInteger(productIndex) || productIndex < 0 || productIndex >= inv.products.length) return false;
    const p = inv.products[productIndex];
    const pCode = String(p.code !== undefined && p.code !== null && p.code !== "" ? p.code : (p.cProd !== undefined && p.cProd !== null ? p.cProd : "")).trim();
    const pName = normStr(p.name || p.xProd || "");
    // Confere se o item naquela posição é mesmo o produto pedido (evita alterar o item errado).
    const sameItem = (identity.code && pCode && identity.code === pCode) || (pName && pName === normStr(identity.name));
    if (!sameItem) return false;
    inv.products[productIndex] = { ...p, ...patch, [lockField]: true };
    await repo.set(repo.doc('invoices', inv.id), inv, 'invoices/' + inv.id);
    repo.invalidateCache('invoices');
    return true;
  }
  return false;
}

// Manutenção (só admin): tira o antigo padrão "Ingredientes" dos produtos dos fornecedores e dos itens
// pendentes, que passam a ficar sem categoria. Sem "apply: true" só conta o que mudaria.
// Não mexe se "Ingredientes" for uma categoria cadastrada nas Configurações.
app.post("/api/xml/maintenance/clear-default-category", asyncHandler(async (req: Request, res: Response) => {
  const apply = req.body?.apply === true;
  const catSnap = await repo.getDocs('categories', 'categories', true);
  const registered = catSnap.docs.some((doc: any) => {
    const d = typeof doc.data === 'function' ? doc.data() : doc.data;
    return String(d?.name ?? '').trim().toLowerCase() === LEGACY_DEFAULT_CATEGORY.toLowerCase();
  });
  if (registered) {
    return res.json({ status: "skipped", reason: `"${LEGACY_DEFAULT_CATEGORY}" é uma categoria cadastrada nas Configurações.`, applied: false });
  }

  let supplierProducts = 0;
  const suppSnap = await repo.getDocs('suppliers', 'suppliers', true);
  for (const doc of suppSnap.docs) {
    const d: any = typeof doc.data === 'function' ? doc.data() : doc.data;
    const { supplier, changed } = stripCategoryFromSupplier({ id: doc.id, ...d }, LEGACY_DEFAULT_CATEGORY);
    if (!changed) continue;
    supplierProducts += changed;
    if (apply) {
      const { id: _id, ...rest } = supplier;
      await repo.set(repo.doc('suppliers', doc.id), rest, 'suppliers/' + doc.id);
    }
  }

  let pendingItems = 0;
  const pendSnap = await repo.getDocs('pending_list_products', 'pending_list_products', true);
  for (const doc of pendSnap.docs) {
    const d: any = typeof doc.data === 'function' ? doc.data() : doc.data;
    const stripped = stripCategory(d, LEGACY_DEFAULT_CATEGORY);
    if (!stripped) continue;
    pendingItems++;
    if (apply) await repo.set(repo.doc('pending_list_products', doc.id), stripped, 'pending_list_products/' + doc.id);
  }

  if (apply) {
    repo.invalidateCache('suppliers');
    repo.invalidateCache('pending_list_products');
    await recordAudit(repo, { action: 'category.clear_default', actor: auditActor(res), target: 'suppliers', meta: { supplierProducts, pendingItems } });
  }
  res.json({ status: "success", applied: apply, supplierProducts, pendingItems });
}));

app.post("/api/xml/products/update-category", asyncHandler(async (req: Request, res: Response) => {
  const { code, name, category } = req.body;
  if (!category) {
    return res.status(400).json({ error: "Categoria é obrigatória" });
  }

  if (req.body.invKey !== undefined) {
    const ok = await updateSingleInvoiceItem(String(req.body.invKey), Number(req.body.productIndex), { code: String(code || "").trim(), name: String(name || "") }, { categoryId: category, category }, 'categoryLocked');
    if (!ok) return res.status(404).json({ error: "Item da compra não encontrado" });
    return res.json({ status: "success", scope: "single" });
  }

  const normStr = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const targetCode = String(code || "").trim();
  const targetName = normStr(name);

  // 1. Save override mapping in product_categories collection
  try {
    const pcId = targetCode ? `code_${targetCode}` : `name_${targetName.replace(/\s+/g, "_")}`;
    if (pcId) {
      const pcRef = repo.doc('product_categories', pcId);
      await repo.set(pcRef, {
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
    const invSnapshot = await repo.getDocs('invoices', 'invoices', true);
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
          const { categoryLocked: _unlock, ...rest } = p;
          return { ...rest, categoryId: category, category: category };
        }
        return p;
      });

      if (invChanged && inv.id) {
        const docRef = repo.doc('invoices', inv.id);
        await repo.set(docRef, inv, 'invoices/' + inv.id);
      }
    }
  } catch (err) {
    console.error("Erro ao atualizar categoria em invoices:", err);
  }

  // 3. Update Suppliers
  try {
    const suppSnapshot = await repo.getDocs('suppliers', 'suppliers', true);
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
        const docRef = repo.doc('suppliers', supp.id);
        await repo.set(docRef, supp, 'suppliers/' + supp.id);
      }
    }
  } catch (err) {
    console.error("Erro ao atualizar categoria em suppliers:", err);
  }

  // 4. Register Category if new
  try {
    const catId = category.toLowerCase().replace(/\s+/g, "_");
    const catRef = repo.doc('categories', catId);
    await repo.set(catRef, { name: category }, 'categories/' + catId);
  } catch (err) {
    console.error("Erro ao salvar categoria:", err);
  }

  // 5. Invalidate caches
  repo.invalidateCache('invoices');
  repo.invalidateCache('suppliers');
  repo.invalidateCache('categories');
  repo.invalidateCache('product_categories');

  res.json({ status: "success" });
}));

app.post("/api/xml/products/update-setor", asyncHandler(async (req: Request, res: Response) => {
  const { code, name, setor } = req.body;
  if (!setor) {
    return res.status(400).json({ error: "Setor e obrigatorio" });
  }

  if (req.body.invKey !== undefined) {
    const ok = await updateSingleInvoiceItem(String(req.body.invKey), Number(req.body.productIndex), { code: String(code || "").trim(), name: String(name || "") }, { setor }, 'setorLocked');
    if (!ok) return res.status(404).json({ error: "Item da compra não encontrado" });
    return res.json({ status: "success", scope: "single" });
  }

  const normStr = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
  const targetCode = String(code || "").trim();
  const targetName = normStr(name);

  // 1. Save override mapping in product_setores collection
  try {
    const psId = targetCode ? `code_${targetCode}` : `name_${targetName.replace(/\s+/g, "_")}`;
    if (psId) {
      const psRef = repo.doc('product_setores', psId);
      await repo.set(psRef, {
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
    const invSnapshot = await repo.getDocs('invoices', 'invoices', true);
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
          const { setorLocked: _unlock, ...rest } = p;
          return { ...rest, setor };
        }
        return p;
      });

      if (invChanged && inv.id) {
        const docRef = repo.doc('invoices', inv.id);
        await repo.set(docRef, inv, 'invoices/' + inv.id);
      }
    }
  } catch (err) {
    console.error("Erro ao atualizar setor em invoices:", err);
  }

  // 3. Register Setor if new
  try {
    const setId = setor.toLowerCase().replace(/\s+/g, "_");
    const setRef = repo.doc('setores', setId);
    await repo.set(setRef, { name: setor }, 'setores/' + setId);
  } catch (err) {
    console.error("Erro ao salvar setor:", err);
  }

  // 4. Invalidate caches
  repo.invalidateCache('invoices');
  repo.invalidateCache('setores');
  repo.invalidateCache('product_setores');

  res.json({ status: "success" });
}));

app.get("/api/xml/setor-limits", handleCacheAndEtag("setor_limits"), asyncHandler(async (req: Request, res: Response) => {
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await repo.getDocs('setor_limits', 'setor_limits', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching setor_limits:", error);
    res.status(500).json({ error: "Error fetching setor_limits", message: internalErrorMessage(error) });
  }
}));

app.post("/api/xml/setor-limits", asyncHandler(async (req: Request, res: Response) => {
  const { setor, monthlyLimit } = req.body;
  if (!setor) {
    return res.status(400).json({ error: "Setor e obrigatorio" });
  }
  const limitId = setor.toLowerCase().replace(/\s+/g, "_");
  const limitRef = repo.doc('setor_limits', limitId);
  await repo.set(limitRef, {
    setor,
    monthlyLimit: parsePrice(monthlyLimit, 'Limite mensal'),
    updatedAt: new Date().toISOString()
  }, 'setor_limits/' + limitId);
  repo.invalidateCache('setor_limits');
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
      const pcRef = repo.doc('product_categories', pcId);
      await repo.set(pcRef, {
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
    const invSnapshot = await repo.getDocs('invoices', 'invoices', true);
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
        const docRef = repo.doc('invoices', inv.id);
        await repo.set(docRef, inv, 'invoices/' + inv.id);
      }
    }
  } catch (err) {
    console.error("Erro ao deletar produto em invoices:", err);
  }

  // 3. Remove from Suppliers
  try {
    const suppSnapshot = await repo.getDocs('suppliers', 'suppliers', true);
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
        const docRef = repo.doc('suppliers', supp.id);
        await repo.set(docRef, supp, 'suppliers/' + supp.id);
      }
    }
  } catch (err) {
    console.error("Erro ao deletar produto em suppliers:", err);
  }

  // 4. Invalidate caches
  repo.invalidateCache('invoices');
  repo.invalidateCache('suppliers');
  repo.invalidateCache('product_categories');

  await recordAudit(repo, { action: 'product.delete', actor: auditActor(res), target: 'products', meta: { code: targetCode, name } });
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
    const invSnapshot = await repo.getDocs('invoices', 'invoices', true);
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
          const docRef = repo.doc('invoices', inv.id);
          await repo.set(docRef, inv, 'invoices/' + inv.id);
        }
      }
    }
    repo.invalidateCache('invoices');
    await recordAudit(repo, { action: 'product.delete_item', actor: auditActor(res), target: 'invoices/' + invKey, meta: { productIndex, code, name } });
    res.json({ status: "success" });
  } catch (err: any) {
    console.error("Erro ao deletar item especifico de invoice:", err);
    res.status(500).json({ error: "Erro ao deletar produto", message: internalErrorMessage(err) });
  }
}));
}
