# DashboardView.tsx Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `src/frontend/components/DashboardView.tsx` (3047 lines, ~8 independent features) into focused component/hook files, and fix its 3 direct-Firestore-from-browser calls so they go through the backend API instead — with zero visible behavior change.

**Architecture:** `DashboardView.tsx` becomes an orchestrating shell. Each functional area gets its own file(s) under `src/frontend/components/dashboard/` (presentation) and `src/frontend/hooks/` (data). Extraction is pure move-and-wrap: existing logic is copied verbatim into the new file and wrapped in a typed component/hook signature — no rewriting of business logic, so behavior cannot silently drift. The one behavior-changing task (Task 7) is done last and in isolation.

**Tech Stack:** React 18 + TypeScript, Vite, Tailwind, Express backend (`src/backend/app.ts`), Firestore via `fsOps` wrapper (`src/backend/firebase.ts`).

**Spec:** `docs/superpowers/specs/2026-08-19-dashboardview-refactor-design.md`

## Global Constraints

- No visible behavior or UX change in Tasks 1–6 (pure reorganization).
- Never access Firestore directly from frontend code in new/modified files — always go through the backend API (`fetch('/api/...')`), per the spec's fix for `DashboardView.tsx`.
- Do not touch `useCart.ts`, `useSuppliers.ts`, `useDeliveredProducts.ts`, `useReminders.ts`, `useAuth.ts` — out of scope per spec.
- Do not change any collection name, document shape, or existing API endpoint's behavior.
- After every task: run `npx tsc --noEmit` (must be clean) and manually verify the affected flow in the browser with the dev server running before committing.
- The dev server (`npm run dev`, `tsx src/backend/server.ts`) does not hot-reload on backend file changes — restart it after backend edits (Task 7) before verifying.
- Copy JSX/logic **verbatim** from the cited line ranges — do not retype or "clean up" logic while moving it. Line numbers given below are as of commit `4bafa68`; if earlier tasks in this plan have already shifted them, re-locate the block by its content/comment marker (cited alongside line numbers) before cutting.

---

### Task 1: Extract `DashboardStatsCards` and `SystemLogsPanel`

**Files:**
- Create: `src/frontend/components/dashboard/DashboardStatsCards.tsx`
- Create: `src/frontend/components/dashboard/SystemLogsPanel.tsx`
- Modify: `src/frontend/components/DashboardView.tsx` (remove extracted JSX at the "Stats Cards" block, `{/* Stats Cards */}` comment around line 1816–1858, and the "Painel de Logs do Sistema" block, `{/* Painel de Logs do Sistema */}` comment around line 2529–2572; add imports and replace with `<DashboardStatsCards .../>` / `<SystemLogsPanel .../>`)

**Interfaces:**
- `DashboardStatsCards` produces: `React.FC<{ totalExpense: number; activeInvoicesCount: number; averageInvoiceValue: number }>` — pure presentational, no internal state.
- `SystemLogsPanel` produces: `React.FC<{ systemLogs: Array<{ id: string; timestamp: string; type: 'category' | 'delete' | 'info'; message: string }> }>` — pure presentational, no internal state.
- Both consume nothing from other new modules in this plan.

- [ ] **Step 1: Read the current source blocks**

Read `src/frontend/components/DashboardView.tsx` lines 1816–1858 (Stats Cards) and 2529–2572 (System Logs Panel), plus the `systemLogs` state declaration at line 183, `totalExpense` (line 1438), `activeInvoicesCount` (line 1442), `averageInvoiceValue` (line 1454).

- [ ] **Step 2: Create `DashboardStatsCards.tsx`**

Create the file with a named export `DashboardStatsCards`, props typed exactly as in the Interfaces section above. Paste the JSX from the Stats Cards block verbatim into the component's `return`, replacing references to the outer component's variables (`totalExpense`, `activeInvoicesCount`, `averageInvoiceValue`) with the destructured props of the same names. Add the license header used by other files in `src/frontend/components/` (copy from `Header.tsx` lines 1–4).

- [ ] **Step 3: Create `SystemLogsPanel.tsx`**

Same approach: named export `SystemLogsPanel`, prop `systemLogs` typed as above, JSX pasted verbatim from the System Logs block.

- [ ] **Step 4: Wire both into `DashboardView.tsx`**

Add imports:
```typescript
import { DashboardStatsCards } from './dashboard/DashboardStatsCards';
import { SystemLogsPanel } from './dashboard/SystemLogsPanel';
```
Replace the Stats Cards JSX block with `<DashboardStatsCards totalExpense={totalExpense} activeInvoicesCount={activeInvoicesCount} averageInvoiceValue={averageInvoiceValue} />`. Replace the System Logs Panel JSX block with `<SystemLogsPanel systemLogs={systemLogs} />`. Delete the now-unused inline JSX (do not leave the old block commented out).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Manual verification**

Start the dev server if not running (`npm run dev`), open the Dashboard in the browser, and confirm: the 3 stats cards at the top show the same numbers as before, and the System Logs panel shows the same log entries as before (trigger a category edit or deletion first if the log is empty, to confirm entries still appear).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/components/dashboard/DashboardStatsCards.tsx src/frontend/components/dashboard/SystemLogsPanel.tsx src/frontend/components/DashboardView.tsx
git commit -m "refactor(dashboard): extract DashboardStatsCards and SystemLogsPanel"
```

---

### Task 2: Extract `MonthlySpendChart` and `CategoryPieChart`

**Files:**
- Create: `src/frontend/components/dashboard/MonthlySpendChart.tsx`
- Create: `src/frontend/components/dashboard/CategoryPieChart.tsx`
- Modify: `src/frontend/components/DashboardView.tsx` (remove extracted JSX at `{/* Chart 1: Area Chart (Gasto Mensal Real XML) */}` around line 2183–2267, and `{/* Chart 2: Pie Chart (Gastos por Categoria) */}` around line 2268–2389; add imports and replace with the new components)

**Interfaces:**
- `MonthlySpendChart` produces: `React.FC<{ expenseData: any[] }>` where `expenseData` is the exact shape produced by the `expenseData` `useMemo` at line 942 (do not redefine its shape — pass it through as-is; type it `any[]` to avoid guessing an incorrect shape).
- `CategoryPieChart` produces: `React.FC<{ categoryPieData: any[]; selectedChartCategory: string; setSelectedChartCategory: (v: string) => void }>`, mirroring `categoryPieData` (`useMemo` at line 1050) and the existing `selectedChartCategory` state (line 120).
- Both consume nothing from other new modules in this plan.

- [ ] **Step 1: Read the current source blocks**

Read lines 2183–2267 and 2268–2389 of `DashboardView.tsx`, plus the `expenseData` memo (line 942) and `categoryPieData` memo (line 1050) to confirm exactly which local variables each JSX block references (they stay in `DashboardView.tsx`; only the JSX and any purely-local rendering helpers move).

- [ ] **Step 2: Create `MonthlySpendChart.tsx`**

Named export `MonthlySpendChart`, prop `expenseData: any[]`. Paste the Area Chart JSX verbatim, replacing the outer `expenseData` reference with the prop.

- [ ] **Step 3: Create `CategoryPieChart.tsx`**

Named export `CategoryPieChart`, props as specified above. Paste the Pie Chart JSX verbatim (the legend-and-chart block only — leave the category editor panel that follows it, at line 2390 onward, for Task 6). Replace references to `categoryPieData`, `selectedChartCategory`, `setSelectedChartCategory` with the props.

- [ ] **Step 4: Wire both into `DashboardView.tsx`**

Add imports and replace the two JSX blocks with `<MonthlySpendChart expenseData={expenseData} />` and `<CategoryPieChart categoryPieData={categoryPieData} selectedChartCategory={selectedChartCategory} setSelectedChartCategory={setSelectedChartCategory} />`.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Manual verification**

In the browser, confirm the monthly spend area chart renders identically (same shape/values), and the category pie chart renders with the same segments; click a category segment/legend entry and confirm `selectedChartCategory` still updates (whatever UI behavior that drove before, e.g. highlighting or filtering below).

- [ ] **Step 7: Commit**

```bash
git add src/frontend/components/dashboard/MonthlySpendChart.tsx src/frontend/components/dashboard/CategoryPieChart.tsx src/frontend/components/DashboardView.tsx
git commit -m "refactor(dashboard): extract MonthlySpendChart and CategoryPieChart"
```

---

### Task 3: Extract `BatchImportPreviewModal`

**Files:**
- Create: `src/frontend/components/dashboard/BatchImportPreviewModal.tsx`
- Modify: `src/frontend/components/DashboardView.tsx` (remove the modal JSX block, `{/* Batch Import Preview Modal */}` at lines 1564–1738; add import and replace with `<BatchImportPreviewModal .../>`)

**Interfaces:**
- `BatchImportPreviewModal` produces: `React.FC<{ isOpen: boolean; batchPreview: any[]; onClose: () => void; onProductCategoryChange: (invoiceIdx: number, productIdx: number, categoryId: string) => void; onToggleProductDeletion: (invoiceIdx: number, productIdx: number) => void; onBulkCategorize: () => void; onBulkDelete: () => void; onConfirm: () => Promise<void>; categories: any[] }>`.
- The handlers (`handleProductCategoryChange`, `handleToggleProductDeletion`, `handleBulkCategorize`, `handleBulkDelete`, `handleConfirmBatchImport` — lines 786–916) **stay in `DashboardView.tsx`** and are passed down as props; only the modal's JSX moves.

- [ ] **Step 1: Read the current source block**

Read lines 1564–1738 of `DashboardView.tsx`, and the handler signatures at lines 786, 802, 810, 831, 858 to confirm exact parameter names/types to match in the props interface above.

- [ ] **Step 2: Create `BatchImportPreviewModal.tsx`**

Named export `BatchImportPreviewModal`, props as specified. Paste the modal JSX verbatim; replace `isPreviewModalOpen` with `isOpen`, `setIsPreviewModalOpen(false)` calls with `onClose()`, and each handler reference with its corresponding prop.

- [ ] **Step 3: Wire into `DashboardView.tsx`**

Add import and replace the modal JSX block with:
```tsx
<BatchImportPreviewModal
  isOpen={isPreviewModalOpen}
  batchPreview={batchPreview}
  onClose={() => setIsPreviewModalOpen(false)}
  onProductCategoryChange={handleProductCategoryChange}
  onToggleProductDeletion={handleToggleProductDeletion}
  onBulkCategorize={handleBulkCategorize}
  onBulkDelete={handleBulkDelete}
  onConfirm={handleConfirmBatchImport}
  categories={normalizedCategories}
/>
```
(Confirm `normalizedCategories`, defined at line 133, is the correct categories source the original block used — if the original block referenced a differently-named categories variable, use that one instead.)

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Manual verification**

In the browser, upload a batch of XML files to trigger the preview modal. Confirm: the modal opens with the same preview table, changing a product's category in the modal still works, toggling a product for deletion still works, bulk categorize/bulk delete buttons still work, and confirming the import still saves data and closes the modal.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/components/dashboard/BatchImportPreviewModal.tsx src/frontend/components/DashboardView.tsx
git commit -m "refactor(dashboard): extract BatchImportPreviewModal"
```

---

### Task 4: Extract `PriceIncreasesTable` and `PriceAnalysisPanel`

**Files:**
- Create: `src/frontend/components/dashboard/PriceIncreasesTable.tsx`
- Create: `src/frontend/components/dashboard/PriceAnalysisPanel.tsx`
- Modify: `src/frontend/components/DashboardView.tsx` (remove `{/* Tabela Temporária de Produtos com Aumento de Preço */}` block around line 2573–2713, and `{/* Painel de Análise de Preços de Produtos */}` block around line 2714–2945+; add imports and replace)

**Interfaces:**
- `PriceIncreasesTable` produces: `React.FC<{ priceIncreases: any[]; isPriceIncreasesLoading: boolean; selectedIncreases: string[]; onToggleSelectAll: () => void; onToggleSelect: (id: string) => void; onDeleteIncrease: (id: string) => Promise<void>; onBulkDeleteIncreases: () => Promise<void> }>`, matching `fetchPriceIncreases`/`handleDeleteIncrease`/`handleBulkDeleteIncreases`/`handleToggleSelectAll`/`handleToggleSelect` at lines 199–267 (these handlers stay in `DashboardView.tsx`).
- `PriceAnalysisPanel` produces: `React.FC<{ priceAnalysis: any; priceSearchQuery: string; setPriceSearchQuery: (v: string) => void; priceSearchYear: string; setPriceSearchYear: (v: string) => void; selectedProduct: any | null; setSelectedProduct: (p: any | null) => void; showSearchDropdown: boolean; setShowSearchDropdown: (v: boolean) => void; parsedSearchSuggestions: any[]; availableYears: any[] }>`, matching the state at lines 176–180, 195, and the memos `priceAnalysis` (line 1542), `availableYears` (line 1530), `parsedSearchSuggestions` (line 1554).

- [ ] **Step 1: Read the current source blocks**

Read lines 2573–2713 and 2714–2945+ (find the exact end of the Price Analysis Panel block — search for the next top-level `{/* ... */}` comment after line 2945 to bound it) of `DashboardView.tsx`.

- [ ] **Step 2: Create `PriceIncreasesTable.tsx`**

Named export `PriceIncreasesTable`, props as specified. Paste the table JSX verbatim, replacing state/handler references with the matching props.

- [ ] **Step 3: Create `PriceAnalysisPanel.tsx`**

Named export `PriceAnalysisPanel`, props as specified. Paste the panel JSX verbatim (including the "TOP 10 MAIORES AUMENTOS" and "SISTEMA DE PESQUISA E CONSULTA HISTÓRICA" sub-sections — both stay together in this one component per the spec's grouping), replacing state/memo references with the matching props.

- [ ] **Step 4: Wire both into `DashboardView.tsx`**

Add imports and replace both JSX blocks with the corresponding components, passing all props listed in the Interfaces section from the existing local state/memos/handlers (do not rename any of them — pass through by the same name).

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Manual verification**

In the browser: confirm the price increases table still lists the same rows, selecting rows and bulk-deleting still works, deleting a single row still works. In the price analysis panel: confirm the "top 10 maiores aumentos" list matches before/after, search for a product by name and confirm the dropdown suggestions and the "last 5 purchases" table still populate correctly, and the year filter still filters results.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/components/dashboard/PriceIncreasesTable.tsx src/frontend/components/dashboard/PriceAnalysisPanel.tsx src/frontend/components/DashboardView.tsx
git commit -m "refactor(dashboard): extract PriceIncreasesTable and PriceAnalysisPanel"
```

---

### Task 5: Extract `CategoryEditorPanel`

**Files:**
- Create: `src/frontend/components/dashboard/CategoryEditorPanel.tsx`
- Modify: `src/frontend/components/DashboardView.tsx` (remove `{/* Painel Integrado de Busca e Edição de Categorias de Produtos */}` block, originally around line 2390–2528 but shifted by prior tasks — relocate by this comment marker; add import and replace)

**Interfaces:**
- `CategoryEditorPanel` produces: `React.FC<{ pieSearchQuery: string; setPieSearchQuery: (v: string) => void; pieCategoryFilter: string; setPieCategoryFilter: (v: string) => void; showPieProductList: boolean; setShowPieProductList: (v: boolean) => void; filteredPieProducts: any[]; normalizedCategories: any[]; selectedProducts: string[]; setSelectedProducts: (ids: string[]) => void; bulkCategory: string; setBulkCategory: (v: string) => void; uncategorizedCount: number; onUpdateProductCategory: (code: string, name: string, newCategory: string) => Promise<void>; onDeleteProduct: (code: string, name: string) => Promise<void>; deleteProductConfirmModal: any; setDeleteProductConfirmModal: (v: any) => void }>`, matching state at lines 116–123, 273, memos `filteredPieProducts` (line 1184), `normalizedCategories` (line 133), `uncategorizedCount` (line 1180), and handlers `handleUpdateProductCategory` (line 1212), `handleDeleteProduct` (line 1323) which stay in `DashboardView.tsx`.

- [ ] **Step 1: Read the current source block**

Re-locate the "Painel Integrado de Busca e Edição de Categorias de Produtos" block in the current state of `DashboardView.tsx` (search for that exact comment string, since line numbers have shifted from Tasks 1–4) and read it fully, along with the `deleteProductConfirmModal` state (originally line 273) and its confirmation modal usage (per agents.md rule 11, this delete already has a confirmation flow — keep it exactly as-is).

- [ ] **Step 2: Create `CategoryEditorPanel.tsx`**

Named export `CategoryEditorPanel`, props as specified. Paste the panel JSX verbatim (including its delete-confirmation modal, if it is rendered inline in this block — if the confirmation modal JSX lives elsewhere in the file, leave it in `DashboardView.tsx` and only wire `deleteProductConfirmModal`/`setDeleteProductConfirmModal` through as props).

- [ ] **Step 3: Wire into `DashboardView.tsx`**

Add import and replace the JSX block with `<CategoryEditorPanel ... />` passing every prop from the Interfaces section by its existing name.

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Manual verification**

In the browser: search for a product in the category editor, filter by category, select multiple products and apply a bulk category change, confirm it persists (reload the page and check it stuck). Delete a single product from a category and confirm the confirmation dialog still appears before deletion (per rule 11) and that cancelling it does not delete anything.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/components/dashboard/CategoryEditorPanel.tsx src/frontend/components/DashboardView.tsx
git commit -m "refactor(dashboard): extract CategoryEditorPanel"
```

---

### Task 6: Extract `PendingListProductsPanel` and `usePendingListProductsPanel`

**Files:**
- Create: `src/frontend/hooks/usePendingListProductsPanel.ts`
- Create: `src/frontend/components/dashboard/PendingListProductsPanel.tsx`
- Modify: `src/frontend/components/DashboardView.tsx` (remove the state at lines 262–273 that is fully local to this feature, the effect(s) that call `fetchPendingListProducts`, the handlers at lines 348–540, and the JSX block `{/* SEÇÃO: PRODUTOS PENDENTES DAS LISTAS DE COMPRAS */}` originally at line 1859–2079 plus its delete-confirmation modal at line 2079–2115 — relocate both by their comment markers since line numbers have shifted; add import and replace with the new component)

**Interfaces:**
- `usePendingListProductsPanel` produces:
```typescript
function usePendingListProductsPanel(): {
  pendingListProducts: any[];
  isPendingLoading: boolean;
  selectedPendingIds: string[];
  bulkPendingCategory: string;
  setBulkPendingCategory: (v: string) => void;
  bulkPendingPrice: string;
  setBulkPendingPrice: (v: string) => void;
  deletePendingConfirmModal: any;
  fetchPendingListProducts: (force?: boolean) => Promise<void>;
  handlePendingPriceChange: (id: string, newPrice: number) => Promise<void>;
  handlePendingQuantityChange: (id: string, newQuantity: number) => Promise<void>;
  handlePendingCategoryChange: (id: string, newCategory: string) => Promise<void>;
  handleToggleSelectAllPending: () => void;
  handleToggleSelectPending: (id: string) => void;
  handleApplyBulkPendingCategory: () => Promise<void>;
  handleApplyBulkPendingPrice: () => Promise<void>;
  handlePromptDeletePending: (id: string) => void;
  handlePromptBulkDeletePending: () => void;
  handleConfirmPendingProducts: () => Promise<void>;
  setDeletePendingConfirmModal: (v: any) => void;
}
```
This is a verbatim move of the state (lines 262–273) and handlers (lines 348–540) into a custom hook — no logic changes.
- `PendingListProductsPanel` produces: `React.FC` with props matching every value returned by `usePendingListProductsPanel` above, plus `normalizedCategories: any[]` (from `DashboardView.tsx`, since bulk-category actions need the category list).
- `DashboardView.tsx` consumes: calls `const pendingPanel = usePendingListProductsPanel();` and spreads/passes its fields into `<PendingListProductsPanel {...pendingPanel} normalizedCategories={normalizedCategories} />`.

- [ ] **Step 1: Read the current source blocks**

Re-locate and read (by content, since line numbers shifted): the pending-products state block (originally lines 262–273), the `fetchPendingListProducts` effect trigger, all handlers listed in the hook interface above (originally lines 348–540), and the JSX section (originally lines 1859–2115, including its delete confirmation modal).

- [ ] **Step 2: Create `usePendingListProductsPanel.ts`**

Create the hook with the exact return shape specified above. Move the `useState` declarations and handler functions verbatim into the hook body; keep every internal call (e.g., handlers calling `fetchPendingListProducts` after a mutation) intact since they only reference things that are now local to this hook.

- [ ] **Step 3: Create `PendingListProductsPanel.tsx`**

Named export `PendingListProductsPanel`, props as specified. Paste the JSX verbatim (both the panel and its delete-confirmation modal), replacing state/handler references with props of the same names.

- [ ] **Step 4: Wire into `DashboardView.tsx`**

Add imports for both new files. Remove the moved state declarations, the moved handlers, and the moved JSX block from `DashboardView.tsx`. Add `const pendingPanel = usePendingListProductsPanel();` near the top of the component body (where the removed state used to be), and render `<PendingListProductsPanel {...pendingPanel} normalizedCategories={normalizedCategories} />` where the JSX block used to be. If any `useEffect` in `DashboardView.tsx` (outside the moved block) still references `fetchPendingListProducts` or `pendingListProducts`, update it to call `pendingPanel.fetchPendingListProducts` / read `pendingPanel.pendingListProducts` instead.

- [ ] **Step 5: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 6: Manual verification**

In the browser: confirm pending list products still load, edit a pending product's price/quantity/category individually and confirm it saves, select multiple and apply bulk category/price changes, delete a single pending product (confirm the confirmation modal still appears per rule 11), bulk-delete selected ones, and confirm the "confirm products" action (moving pending products into the main flow) still works end-to-end.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/hooks/usePendingListProductsPanel.ts src/frontend/components/dashboard/PendingListProductsPanel.tsx src/frontend/components/DashboardView.tsx
git commit -m "refactor(dashboard): extract PendingListProductsPanel into its own hook and component"
```

---

### Task 7: Add `DELETE /api/xml/spendings/:id` backend endpoint

**Files:**
- Modify: `src/backend/app.ts` (add new route near the existing `app.get("/api/xml/spendings", ...)` at line 567)

**Interfaces:**
- Produces: `DELETE /api/xml/spendings/:id` → on success `{ status: 'deleted', id: string }` (200), if the document does not exist `{ status: 'not_found', message: string }` (200, matching the existing `deleteInvoiceHelper` convention of returning 200 for not-found to avoid breaking frontend flows), on unexpected error the `asyncHandler` wrapper forwards it to Express's error handler as usual.
- Consumes: `fsOps.doc`, `fsOps.getDoc`, `fsOps.delete`, `fsOps.invalidateCache` from `src/backend/firebase.ts` (already imported in `app.ts`).

- [ ] **Step 1: Read the existing pattern to follow**

Read `deleteInvoiceHelper` in `src/backend/app.ts` (around line 654–695) as the template for structure (existence check via `fsOps.getDoc`, then `fsOps.delete`, then `fsOps.invalidateCache`, then respond).

- [ ] **Step 2: Add the route**

Add this route directly after the existing `app.get("/api/xml/spendings", ...)` block:

```typescript
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
```

- [ ] **Step 3: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 4: Restart the dev server and verify with curl**

The dev server does not hot-reload backend changes. Restart it (`npm run dev`), then:
```bash
curl -s -i -X POST http://localhost:3000/api/test-mode/reset -H "X-Test-Mode: true"
```
(resets test data first for a clean slate), then create a test spending via the UI in Test Mode, note its id from the network tab or the `pending-list-products`/dashboard UI, then:
```bash
curl -s -i -X DELETE http://localhost:3000/api/xml/spendings/<id> -H "X-Test-Mode: true"
```
Expected: `200 OK` with `{"status":"deleted","id":"<id>"}`. Run it again with the same id.
Expected: `200 OK` with `{"status":"not_found", ...}`.

- [ ] **Step 5: Commit**

```bash
git add src/backend/app.ts
git commit -m "feat(backend): add DELETE /api/xml/spendings/:id endpoint"
```

---

### Task 8: Create `useXmlSpendings` hook and fix `DashboardView.tsx`'s direct Firestore access

**Files:**
- Create: `src/frontend/hooks/useXmlSpendings.ts`
- Modify: `src/frontend/components/DashboardView.tsx` (remove the direct Firestore calls and the `xmlSpendings`/related state and the `fetchSpendings`/`fetchPricingData`/`handleDeleteXmlSpending` logic that performs them; replace with the new hook)

**Interfaces:**
- `useXmlSpendings` produces:
```typescript
function useXmlSpendings(): {
  xmlSpendings: any[];
  suppliers: any[];
  invoices: any[];
  isLoading: boolean;
  isPriceLoading: boolean;
  fetchSpendings: (force?: boolean) => Promise<void>;
  fetchPricingData: (force?: boolean) => Promise<void>;
  handleDeleteXmlSpending: (id: string) => Promise<void>;
  setXmlSpendings: React.Dispatch<React.SetStateAction<any[]>>;
  setInvoices: React.Dispatch<React.SetStateAction<any[]>>;
}
```
- Consumes: `GET /api/xml/suppliers` (existing, line 537 of `app.ts`), `GET /api/xml/spendings` (existing, line 567), `DELETE /api/xml/spendings/:id` (new, from Task 7), `DELETE /api/xml/invoices/:id` (existing, line 702 — keep this call in `handleDeleteXmlSpending`, it is already correct and needed alongside the new spendings delete).

- [ ] **Step 1: Read the current source**

Read the current `DashboardView.tsx`: the `xmlSpendings` state (originally line 93), `invoices` state (originally line 158), `suppliers` state (originally line 167), `isLoading`/`isPriceLoading` state (originally lines 101, 176), `fetchPricingData` (originally lines 541–599, containing the `getDocs(collection(db, 'suppliers'))` call at line 569), `fetchSpendings` (originally lines 600–785, containing the `getDocs(collection(db, 'xml_spendings'))` call at lines 619–621), and `handleDeleteXmlSpending` (originally lines 917–941, containing the `deleteDoc(doc(db, 'xml_spendings', id))` call at line 921 guarded by `if (!isTestMode)`).

- [ ] **Step 2: Create `useXmlSpendings.ts`**

Create the hook with the state and functions moved verbatim, with these two behavior fixes (the only intentional behavior changes in this whole plan):

In `fetchPricingData`, replace:
```typescript
const suppSnap = await getDocs(collection(db, 'suppliers'));
```
with a fetch to the existing backend endpoint, following the same pattern already used elsewhere in this codebase (e.g. `src/frontend/hooks/usePurchaseForecastNotifications.ts` line 75, `fetch('/api/xml/invoices?t=' + Date.now())`):
```typescript
const suppRes = await fetch('/api/xml/suppliers?t=' + Date.now());
const suppData = await suppRes.json();
```
Then adapt the rest of `fetchPricingData`'s logic that consumed `suppSnap.docs` (mapping over `{ id: doc.id, data: () => doc.data() }` shapes) to instead map over `suppData` (an array of `{ id, ...fields }` objects, matching the shape returned by `GET /api/xml/suppliers` — read that route in `app.ts` around line 537 to confirm the exact response shape before writing the mapping) — do not change what the resulting `suppliers` state array looks like to consumers, only how it's fetched.

In `fetchSpendings`, replace:
```typescript
const q = collection(db, 'xml_spendings');
const snapshot = await getDocs(q);
```
with:
```typescript
const spendingsRes = await fetch('/api/xml/spendings?t=' + Date.now());
const spendingsData = await spendingsRes.json();
```
and adapt the rest of the function analogously (confirm `GET /api/xml/spendings`'s response shape in `app.ts` around line 567 first).

In `handleDeleteXmlSpending`, replace:
```typescript
if (!isTestMode) {
  await deleteDoc(doc(db, 'xml_spendings', id));
  try {
    await fetch(`/api/xml/invoices/${id}`, { method: 'DELETE' });
  } catch (apiErr) {
    console.error("Erro ao deletar fatura do banco de preços central:", apiErr);
  }
}
```
with:
```typescript
await fetch(`/api/xml/spendings/${id}`, { method: 'DELETE' });
try {
  await fetch(`/api/xml/invoices/${id}`, { method: 'DELETE' });
} catch (apiErr) {
  console.error("Erro ao deletar fatura do banco de preços central:", apiErr);
}
```
(dropping the `if (!isTestMode)` guard entirely — the fetch interceptor in `TestModeContext.tsx` already adds the `X-Test-Mode` header automatically whenever Test Mode is on, so the new endpoint respects test isolation without any manual check here).

Remove the now-unused imports `collection, onSnapshot, doc, setDoc, deleteDoc, getDocs` and `db` from this hook file if `onSnapshot`/`setDoc` are not used by any of the moved code (check first — if `onSnapshot` or `setDoc` on `xml_spendings` appear anywhere else in the moved logic, keep the needed imports and only drop the ones that truly become unused).

- [ ] **Step 3: Wire into `DashboardView.tsx`**

Add `import { useXmlSpendings } from '../hooks/useXmlSpendings';`. Remove the moved state and functions. Add `const xmlSpendingsData = useXmlSpendings();` near the top of the component body. Update every remaining reference to `xmlSpendings`, `suppliers`, `invoices`, `isLoading`, `isPriceLoading`, `fetchSpendings`, `fetchPricingData`, `handleDeleteXmlSpending`, `setXmlSpendings`, `setInvoices` elsewhere in `DashboardView.tsx` (including inside the components wired up in Tasks 1–6, if any still receive these as props from `DashboardView.tsx`) to read from `xmlSpendingsData.*` instead. Remove the `collection, onSnapshot, doc, setDoc, deleteDoc, getDocs` import from `firebase/firestore` and the `db` import from `../firebase` at the top of `DashboardView.tsx` if nothing else in the file still uses them (check first — `App.tsx`'s `db` import pattern in line 47 of the original file may be used by other still-inline code; only remove what's truly unused).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Manual verification (production mode)**

With Test Mode **off**: reload the Dashboard, confirm suppliers-derived data and the monthly/pie charts still populate with real data identical to before this task. Delete one real `xml_spendings` entry you don't mind losing (or create a throwaway one first via a real XML import, then delete it) and confirm it disappears from the dashboard and does not reappear on reload.

- [ ] **Step 6: Manual verification (test mode)**

Turn Test Mode **on**. Import a batch of XML files (creates test data). Confirm the dashboard reflects the test data (not production data). Delete one of the test spendings using the dashboard's delete action, then use the "RESETAR TESTE" button and confirm no errors occur and the dashboard returns to an empty test state. This confirms the fix: previously, this delete never actually reached the `test_xml_spendings` local test-mode store.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/hooks/useXmlSpendings.ts src/frontend/components/DashboardView.tsx
git commit -m "refactor(dashboard): move xml_spendings/suppliers data into useXmlSpendings hook, routed through backend API instead of direct Firestore"
```

---

### Task 9: Final full-file review

**Files:**
- Review: `src/frontend/components/DashboardView.tsx`

- [ ] **Step 1: Confirm the file shrank as expected**

Run: `wc -l src/frontend/components/DashboardView.tsx`
Expected: well under 1000 lines (down from 3047), containing only: shared state (date filters, `normalizedCategories`, `categories`), the hook calls added in Tasks 6 and 8, and the composition JSX rendering each extracted component.

- [ ] **Step 2: Search for leftover direct Firestore imports**

Run: `grep -n "firebase/firestore" src/frontend/components/DashboardView.tsx`
Expected: no output (or, if any import remains, confirm it is not `getDocs`/`setDoc`/`deleteDoc`/`onSnapshot`/`collection`/`doc` used for `suppliers` or `xml_spendings` — those must be gone).

- [ ] **Step 3: Full regression pass in the browser**

With the dev server running, click through every section of the Dashboard once more end-to-end (stats cards, system logs, monthly chart, category pie chart, category editor, batch import, price increases table, price analysis search, pending list products) to confirm nothing regressed across the whole sequence of tasks.

- [ ] **Step 4: Final type-check**

Run: `npx tsc --noEmit -p .`
Expected: no errors.

- [ ] **Step 5: Commit (only if Step 1–2 required any cleanup)**

If no cleanup was needed, skip this commit. Otherwise:
```bash
git add src/frontend/components/DashboardView.tsx
git commit -m "refactor(dashboard): final cleanup pass after DashboardView split"
```
