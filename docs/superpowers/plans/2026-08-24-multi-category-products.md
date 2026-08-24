# Categorias Múltiplas por Produto + Aba Produtos Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a product belong to more than one category at once, let the user pick the purchase category per cart/list item independently of the product's own categories, and replace the Mercado/Materiais/Fornecedores sidebar split with 3 tabs (Fornecedores, Produtos, Importar XML) where Produtos is a unified, searchable, category-filterable catalog of every product from every supplier.

**Architecture:** `Product.category: string` becomes `Product.categories: string[]` everywhere the product's own classification is read or written. This is a lazy, read-time migration only — `useSuppliers.ts` normalizes any document still using the old single `category` field into `categories: [category]` right after fetching, and every write path from then on only writes `categories`. Cart/list items get their own independent `category: string` field, chosen at "Adicionar" time from the full system category list (not restricted to the product's categories). A new `useProductCatalog` hook flattens all suppliers' products into one list and exposes `updateProductCategories`, reusing the existing `saveSupplier` — no new backend routes are needed anywhere in this plan.

**Tech Stack:** React 18 + TypeScript (frontend), Express + Firestore via `fsOps` (backend, untouched by this plan), no test runner — verification is `npx tsc --noEmit`, `npm run build`, and manual checks in Modo de Teste (isolated local JSON storage, safe to use without touching production data).

**Spec:** `docs/superpowers/specs/2026-08-24-multi-category-products-design.md`

## Global Constraints

- No backend route changes and no Firestore migration script — normalization of old `category` docs happens only in memory, in `useSuppliers.ts`, on read.
- The Dashboard/DRE `product_categories` mapping (`src/backend/app.ts`, `CategoryEditorPanel.tsx`) is explicitly out of scope — do not touch it.
- Every task must end with `npx tsc --noEmit` passing clean before moving to the next task.
- All manual verification happens in Modo de Teste (toggle in the header) — never test destructive flows against real production data.
- Follow the existing pattern in this repo of confirming any delete action with `ConfirmationModal` (already used throughout) — do not introduce native `window.confirm`.

---

## File Structure

- Modify `src/frontend/types.ts` — `Product.categories: string[]`, add `category: string` (singular) to `CartItem` and to the item type inside `SavedList.items`.
- Modify `src/frontend/hooks/useSuppliers.ts` — normalize legacy `category` → `categories` on read.
- Create `src/frontend/utils/productCategories.ts` — small shared helpers: `getProductCategories(product)`, `formatCategories(categories)`.
- Modify `src/frontend/hooks/useSupplierForm.ts` — product form state carries `productCategories: string[]`.
- Modify `src/frontend/components/modals/SupplierModal.tsx` — category select becomes a checklist multi-select.
- Modify `src/frontend/components/SuppliersView.tsx` — category badges become chip lists; search matches any category; Mercado/Materiais tabs removed; Produtos tab wired in.
- Create `src/frontend/components/products/CategoryMultiSelect.tsx` — reusable checklist dropdown used by SupplierModal, the Produtos tab inline editor, and the XML import row.
- Create `src/frontend/hooks/useProductCatalog.ts` — flattens `suppliers` into product rows, exposes `updateProductCategories`.
- Create `src/frontend/components/products/ProductsTab.tsx` — the new unified Produtos tab (search, category filter, inline category editor, add-to-cart with purchase-category picker).
- Create `src/frontend/components/products/PurchaseCategoryPicker.tsx` — small inline select (all system categories) shown next to a quantity selector before "Adicionar".
- Modify `src/frontend/hooks/useCart.ts` — `addToCart`/`addItemToList` take a `category: string` argument and store it on the item.
- Modify `src/frontend/components/ShoppingView.tsx` — groups by `product.categories` (a product can appear in multiple groups); "Adicionar" now goes through `PurchaseCategoryPicker`.
- Modify `src/frontend/hooks/useXmlImport.ts` and `src/frontend/components/suppliers/XmlImportTab.tsx` — `targetCategory: string` → `targetCategories: string[]`.
- Modify `src/frontend/hooks/useExcel.ts` — "Categoria" column serializes/deserializes as a comma-separated list.
- Modify `src/frontend/components/AIView.tsx` — `selectedCategory: string` → `selectedCategories: string[]`.
- Modify `src/frontend/App.tsx` — wire the new tab, pass `categories` and the new `addToCart`/`addItemToList` signature through.

---

### Task 1: Data model — `Product.categories` + read-time normalization

**Files:**
- Modify: `src/frontend/types.ts`
- Modify: `src/frontend/hooks/useSuppliers.ts`
- Create: `src/frontend/utils/productCategories.ts`

**Interfaces:**
- Produces: `Product.categories: string[]`; `getProductCategories(product: Product): string[]`; `formatCategories(categories: string[]): string` (joins for display, e.g. `"Insumo Loja, Insumo Produção"`).

- [ ] **Step 1: Update `Product` in `types.ts`**

Replace the `category` field:

```typescript
export interface Product {
  code: string;
  name: string;
  price: number;
  categories: string[];
  lastPurchaseDate?: string;
  paymentMethod?: string;
}
```

- [ ] **Step 2: Create the shared helper**

```typescript
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product } from '../types';

export const getProductCategories = (product: Product | (Product & { category?: string })): string[] => {
  if (Array.isArray(product.categories) && product.categories.length > 0) {
    return product.categories;
  }
  const legacy = (product as any).category;
  return legacy ? [legacy] : [];
};

export const formatCategories = (categories: string[] | undefined): string => {
  if (!categories || categories.length === 0) return 'Sem Categoria';
  return categories.join(', ');
};
```

- [ ] **Step 3: Normalize on read in `useSuppliers.ts`**

Right after `suppliersData` is assigned in both the backend-success branch and the client-SDK-fallback branch of `loadData` (the two places that build `suppliersData` from raw docs), add a normalization pass before `setSuppliers(suppliersData)`:

```typescript
const normalizeSuppliers = (list: Supplier[]): Supplier[] =>
  list.map(s => ({
    ...s,
    products: (s.products || []).map(p => {
      const legacy = (p as any).category;
      if (Array.isArray(p.categories) && p.categories.length > 0) return p;
      const { category, ...rest } = p as any;
      return { ...rest, categories: legacy ? [legacy] : [] };
    })
  }));
```

Call `suppliersData = normalizeSuppliers(suppliersData);` immediately before `setSuppliers(suppliersData);` (single call site covers both branches since they converge there).

- [ ] **Step 4: Verify types compile**

Run: `npx tsc --noEmit -p .`
Expected: FAILS — every remaining consumer of `product.category` (SupplierModal, SuppliersView, ShoppingView, useSupplierForm, useXmlImport, XmlImportTab, useExcel, AIView, HistoryView) now shows a type error. This is expected; each is fixed in a later task. Confirm the error list only touches those known files (no unexpected ones), then continue.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/types.ts src/frontend/hooks/useSuppliers.ts src/frontend/utils/productCategories.ts
git commit -m "feat(products): switch Product.category to Product.categories with read-time migration"
```

---

### Task 2: Multi-select categories in the supplier/product form

**Files:**
- Create: `src/frontend/components/products/CategoryMultiSelect.tsx`
- Modify: `src/frontend/hooks/useSupplierForm.ts`
- Modify: `src/frontend/components/modals/SupplierModal.tsx`
- Modify: `src/frontend/App.tsx:769-780` (props passed into `SupplierModal`)

**Interfaces:**
- Consumes: `getProductCategories` from Task 1.
- Produces: `<CategoryMultiSelect value={string[]} onChange={(next: string[]) => void} options={string[]} />`, reused in Tasks 4 and 7.

- [ ] **Step 1: Build the reusable multi-select**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';

interface CategoryMultiSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  options: string[];
  className?: string;
}

export const CategoryMultiSelect: React.FC<CategoryMultiSelectProps> = ({ value, onChange, options, className }) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggle = (cat: string) => {
    if (value.includes(cat)) {
      onChange(value.filter(c => c !== cat));
    } else {
      onChange([...value, cat]);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all font-medium text-sm flex items-center justify-between text-left"
      >
        <span className="truncate">{value.length > 0 ? value.join(', ') : 'Categorias'}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg p-2 space-y-1">
          {options.length === 0 && (
            <p className="text-xs text-slate-400 px-2 py-1">Nenhuma categoria cadastrada</p>
          )}
          {options.map(cat => (
            <label key={cat} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={value.includes(cat)}
                onChange={() => toggle(cat)}
                className="w-4 h-4 accent-indigo-600"
              />
              {cat}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Update `useSupplierForm.ts` form state**

Rename every `productCategory: string` occurrence to `productCategories: string[]` in `formState` (initial state, `resetForm`, `addProduct`, `handleEditProduct`, `removeProduct`, `onAddSupplier`, `onEditSupplier`). Concretely:

- Initial `useState` and `resetForm`: `productCategories: [] as string[]` instead of `productCategory: ''`.
- In `addProduct` and `onAddSupplier`, replace `category: formState.productCategory.trim() || 'Fornecedor'` with `categories: formState.productCategories.length > 0 ? formState.productCategories : ['Fornecedor']`.
- In `handleEditProduct`, replace `productCategory: p.category` with `productCategories: getProductCategories(p)` (import `getProductCategories` from `../utils/productCategories`).

- [ ] **Step 3: Update `SupplierModal.tsx` props and both category selects**

Replace `productCategory: string; setProductCategory: (cat: string) => void;` in the props interface with `productCategories: string[]; setProductCategories: (cats: string[]) => void;`.

Replace both `<select>` blocks for category (lines ~186-195 and ~267-275) with:

```tsx
<CategoryMultiSelect
  value={productCategories}
  onChange={setProductCategories}
  options={Array.from(new Set(categories))}
/>
```

Add `import { CategoryMultiSelect } from '../products/CategoryMultiSelect';` at the top. Update the product list rendering (line ~328, `{p.category}`) to `{getProductCategories(p).join(', ') || 'Sem Categoria'}` and the search filter (line ~82, `p.category.toLowerCase().includes(lower)`) to `getProductCategories(p).some(c => c.toLowerCase().includes(lower))`. Import `getProductCategories` from `../../utils/productCategories`.

- [ ] **Step 4: Update `App.tsx` wiring into `SupplierModal`**

Replace the `newProductCategory`/`setNewProductCategory` props (lines 773-774) with:

```tsx
newProductCategories={formState.productCategories}
setNewProductCategories={(productCategories) => setFormState(prev => ({ ...prev, productCategories }))}
```

Match these new prop names to whatever `SupplierModal` names them in Step 3 (`productCategories`/`setProductCategories` — adjust the prop names passed here accordingly so they line up, e.g. `productCategories={formState.productCategories}` if that's the prop name used by `SupplierModal`).

Also update `onEditProductFromShopping` (line ~532): replace `productCategory: product.category || ''` with `productCategories: getProductCategories(product)`.

- [ ] **Step 5: Compile check**

Run: `npx tsc --noEmit -p .`
Expected: The errors from Task 1 related to `SupplierModal.tsx`, `useSupplierForm.ts`, and `App.tsx`'s form wiring are gone. Remaining errors should only be in `SuppliersView.tsx`, `ShoppingView.tsx`, `useXmlImport.ts`, `XmlImportTab.tsx`, `useExcel.ts`, `AIView.tsx`, `HistoryView.tsx` — the files not yet touched.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/components/products/CategoryMultiSelect.tsx src/frontend/hooks/useSupplierForm.ts src/frontend/components/modals/SupplierModal.tsx src/frontend/App.tsx
git commit -m "feat(products): multi-select categories in the supplier/product form"
```

---

### Task 3: `SuppliersView.tsx` — chips instead of a single badge, multi-category search

**Files:**
- Modify: `src/frontend/components/SuppliersView.tsx`

**Interfaces:**
- Consumes: `getProductCategories` from Task 1.

- [ ] **Step 1: Import the helper**

Add `import { getProductCategories } from '../utils/productCategories';` near the top.

- [ ] **Step 2: Replace every `{product.category}` badge (lines ~366, ~478, ~585) with a chip list**

```tsx
<div className="flex flex-wrap gap-1">
  {getProductCategories(product).length > 0 ? (
    getProductCategories(product).map(cat => (
      <span key={cat} className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded-full text-[9px] font-black uppercase tracking-wider">
        {cat}
      </span>
    ))
  ) : (
    <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded-full text-[9px] font-black uppercase tracking-wider">
      Sem Categoria
    </span>
  )}
</div>
```

(Keep the surrounding wrapper `div`/edit-button/price layout as-is — only the category badge markup changes.)

- [ ] **Step 3: Fix the three search filters that reference `product.category`**

Each of the three `.filter(p => { ... normalizeText(p.category) ... })` blocks (fornecedores products filter, mercado filter, materiais filter) — replace `normalizeText(p.category).includes(normalizedSearch)` with `getProductCategories(p).some(c => normalizeText(c).includes(normalizedSearch))`.

- [ ] **Step 4: Compile check**

Run: `npx tsc --noEmit -p .`
Expected: No more `category` errors inside `SuppliersView.tsx`.

- [ ] **Step 5: Commit**

```bash
git add src/frontend/components/SuppliersView.tsx
git commit -m "feat(products): render category chips and search across all categories in SuppliersView"
```

---

### Task 4: `useProductCatalog` hook + `ProductsTab` component

**Files:**
- Create: `src/frontend/hooks/useProductCatalog.ts`
- Create: `src/frontend/components/products/ProductsTab.tsx`

**Interfaces:**
- Consumes: `Supplier[]`, `saveSupplier(s: Supplier): Promise<void>` (existing, from `useSuppliers`), `categories: string[]` (existing), `CategoryMultiSelect` (Task 2), `getProductCategories`/`formatCategories` (Task 1).
- Produces: `useProductCatalog(suppliers, saveSupplier)` returning `{ catalog: CatalogRow[], updateProductCategories(supplierId: string, productIndex: number, categories: string[]): Promise<void> }` where `CatalogRow = { product: Product; supplierId: string; supplierName: string; productIndex: number }`. `ProductsTab` — new component, props defined in Step 2.

- [ ] **Step 1: Write `useProductCatalog.ts`**

```typescript
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useMemo, useCallback } from 'react';
import { Supplier, Product } from '../types';

export interface CatalogRow {
  product: Product;
  supplierId: string;
  supplierName: string;
  productIndex: number;
}

export const useProductCatalog = (
  suppliers: Supplier[],
  saveSupplier: (s: Supplier) => Promise<void>
) => {
  const catalog: CatalogRow[] = useMemo(() => {
    const rows: CatalogRow[] = [];
    suppliers.forEach(supplier => {
      (supplier.products || []).forEach((product, productIndex) => {
        rows.push({
          product,
          supplierId: supplier.id || supplier.name,
          supplierName: supplier.name,
          productIndex
        });
      });
    });
    return rows;
  }, [suppliers]);

  const updateProductCategories = useCallback(async (supplierId: string, productIndex: number, categories: string[]) => {
    const supplier = suppliers.find(s => (s.id || s.name) === supplierId);
    if (!supplier) return;
    const updatedProducts = supplier.products.map((p, idx) => idx === productIndex ? { ...p, categories } : p);
    await saveSupplier({ ...supplier, products: updatedProducts });
  }, [suppliers, saveSupplier]);

  return { catalog, updateProductCategories };
};
```

- [ ] **Step 2: Write `ProductsTab.tsx`**

Reuses the same card visual language as `SuppliersView`'s product cards (price, code, last purchase, payment method), plus a search bar, category filter select, inline `CategoryMultiSelect` editor, and an "Adicionar" action delegated to the parent (the purchase-category picker is added on top of this in Task 6 — for now `onAddToCart` takes `(product, supplierName, quantity)` matching the current `addToCart` signature, and gets upgraded in Task 6).

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pencil } from 'lucide-react';
import { Product } from '../../types';
import { formatCurrency, normalizeText } from '../../utils';
import { SearchBar, QuantitySelector, EmptyState } from '../common';
import { CategoryMultiSelect } from './CategoryMultiSelect';
import { useProductCatalog } from '../../hooks/useProductCatalog';
import { Supplier } from '../../types';
import { getProductCategories } from '../../utils/productCategories';

interface ProductsTabProps {
  suppliers: Supplier[];
  saveSupplier: (s: Supplier) => Promise<void>;
  categories: string[];
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  onEditProduct: (product: Product, supplierName: string) => void;
  onAddToCart: (product: Product, supplierName: string, quantity: number) => void;
}

export const ProductsTab: React.FC<ProductsTabProps> = ({
  suppliers,
  saveSupplier,
  categories,
  searchTerm,
  setSearchTerm,
  onEditProduct,
  onAddToCart
}) => {
  const { catalog, updateProductCategories } = useProductCatalog(suppliers, saveSupplier);
  const [categoryFilter, setCategoryFilter] = React.useState('ALL');
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});

  const filtered = React.useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);
    return catalog.filter(row => {
      const cats = getProductCategories(row.product);
      const matchesSearch =
        normalizeText(row.product.name).includes(normalizedSearch) ||
        normalizeText(row.supplierName).includes(normalizedSearch) ||
        cats.some(c => normalizeText(c).includes(normalizedSearch));
      if (!matchesSearch) return false;
      if (categoryFilter === 'ALL') return true;
      if (categoryFilter === 'SEM_CATEGORIA') return cats.length === 0;
      return cats.includes(categoryFilter);
    }).sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [catalog, searchTerm, categoryFilter]);

  const handleQuantityChange = (key: string, value: string) => {
    if (value === '' || /^\d*[.,]?\d*$/.test(value)) {
      setQuantities(prev => ({ ...prev, [key]: value }));
    }
  };

  const handleQuantityBlur = (key: string) => {
    const val = quantities[key];
    const num = val ? parseFloat(val.replace(',', '.')) : NaN;
    if (!val || isNaN(num) || num <= 0) {
      setQuantities(prev => ({ ...prev, [key]: '1' }));
    }
  };

  const adjustQuantity = (key: string, delta: number) => {
    setQuantities(prev => {
      const val = prev[key];
      const current = (val && !isNaN(parseFloat(val.replace(',', '.')))) ? parseFloat(val.replace(',', '.')) : 1;
      const nextVal = Math.max(0, current + delta);
      return { ...prev, [key]: Number(nextVal.toFixed(3)).toString().replace('.', ',') };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight">Todos os Produtos</h2>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-black uppercase text-slate-400">Categoria:</span>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="py-2 px-3 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none cursor-pointer"
          >
            <option value="ALL">Todas ({catalog.length})</option>
            <option value="SEM_CATEGORIA">Sem Categoria</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>

      <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar produto por nome, fornecedor ou categoria..." />

      {filtered.length === 0 ? (
        <EmptyState message="Nenhum produto encontrado" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((row) => {
            const qKey = `${row.supplierId}-${row.product.name}-${row.productIndex}`;
            return (
              <div key={qKey} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:border-indigo-200 transition-all">
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[110px]">
                      {row.supplierName}
                    </span>
                    <div className="flex gap-2 items-center">
                      <button onClick={() => onEditProduct(row.product, row.supplierName)} className="p-1 hover:bg-slate-100 rounded-md">
                        <Pencil className="w-3 h-3 text-slate-400 hover:text-indigo-600" />
                      </button>
                      <span className="text-xl font-black text-indigo-600">{formatCurrency(row.product.price)}</span>
                    </div>
                  </div>
                  <h4 className="font-bold mb-3 text-slate-900">{row.product.name}</h4>
                  <CategoryMultiSelect
                    value={getProductCategories(row.product)}
                    onChange={(next) => updateProductCategories(row.supplierId, row.productIndex, next)}
                    options={categories}
                    className="mb-4"
                  />
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mt-auto">
                  <QuantitySelector
                    quantity={quantities[qKey] ?? '1'}
                    onQuantityChange={(val) => handleQuantityChange(qKey, val)}
                    onQuantityBlur={() => handleQuantityBlur(qKey)}
                    onIncrement={() => adjustQuantity(qKey, 1)}
                    onDecrement={() => adjustQuantity(qKey, -1)}
                    onEnter={() => onAddToCart(row.product, row.supplierName, parseFloat((quantities[qKey] ?? '1').replace(',', '.')) || 1)}
                    idPrefix={qKey}
                  />
                  <button
                    onClick={() => onAddToCart(row.product, row.supplierName, parseFloat((quantities[qKey] ?? '1').replace(',', '.')) || 1)}
                    className="flex-1 h-11 bg-slate-900 text-white rounded-xl font-bold text-[10px] sm:text-xs hover:bg-indigo-600 transition-all active:scale-95"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Compile check**

Run: `npx tsc --noEmit -p .`
Expected: `useProductCatalog.ts` and `ProductsTab.tsx` compile clean (not yet wired into `SuppliersView`, so no usage errors elsewhere yet).

- [ ] **Step 4: Commit**

```bash
git add src/frontend/hooks/useProductCatalog.ts src/frontend/components/products/ProductsTab.tsx
git commit -m "feat(products): add useProductCatalog hook and unified ProductsTab component"
```

---

### Task 5: Wire the Produtos tab into `SuppliersView` (3 tabs)

**Files:**
- Modify: `src/frontend/components/SuppliersView.tsx`

**Interfaces:**
- Consumes: `ProductsTab` from Task 4.

- [ ] **Step 1: Update the tab type and tab list**

Change every `'fornecedores' | 'mercado' | 'materiais' | 'importar_xml'` union (prop types `activeTab`, `onTabChange`, `internalTab`/`setInternalTab`) to `'fornecedores' | 'produtos' | 'importar_xml'`.

Replace the tab button array (lines ~203-207):

```tsx
{[
  { id: 'fornecedores', label: 'Fornecedores' },
  { id: 'produtos', label: 'Produtos' },
  { id: 'importar_xml', label: 'Importar XML' }
].map((tab) => (
```

- [ ] **Step 2: Remove the `mercado` and `materiais` tab-content blocks**

Delete the two `{activeSubTab === 'mercado' && (...)}` and `{activeSubTab === 'materiais' && (...)}` blocks (lines ~442-547 and ~549-654) entirely.

- [ ] **Step 3: Add the `produtos` tab-content block in their place**

```tsx
{activeSubTab === 'produtos' && (
  <ProductsTab
    suppliers={allSuppliers}
    saveSupplier={saveSupplier}
    categories={availableCategories}
    searchTerm={searchTerm}
    setSearchTerm={setSearchTerm}
    onEditProduct={onEditProduct}
    onAddToCart={addToCart}
  />
)}
```

Add `import { ProductsTab } from './products/ProductsTab';` at the top.

- [ ] **Step 4: Keep `handleAddChannelProduct`/MERCADO/MATERIAIS-related state used elsewhere**

`marketSupplier`, `materialsSupplier`, and `handleAddChannelProduct` were only referenced inside the now-deleted `mercado`/`materiais` blocks — remove those three now-unused declarations (lines ~109-125) since nothing else in this file calls them anymore. Confirm with a project-wide grep before deleting:

Run: `grep -rn "handleAddChannelProduct\|marketSupplier\|materialsSupplier" src/frontend`
Expected: only matches inside `SuppliersView.tsx` itself. If so, delete the three declarations.

- [ ] **Step 5: Compile check**

Run: `npx tsc --noEmit -p .`
Expected: No errors from `SuppliersView.tsx`.

- [ ] **Step 6: Manual check in Modo de Teste**

Run: `npm run dev`, open the app, enable "Modo de Teste" (Header), go to Compras → confirm the sidebar now shows exactly 3 tabs (Fornecedores, Produtos, Importar XML), and that clicking Produtos lists every product (including any created via the old Mercado/Materiais flow) with the category filter and search working.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/components/SuppliersView.tsx
git commit -m "feat(products): replace Mercado/Materiais tabs with unified Produtos tab"
```

---

### Task 6: Purchase-time category picker on cart/list items

**Files:**
- Modify: `src/frontend/types.ts`
- Modify: `src/frontend/hooks/useCart.ts`
- Create: `src/frontend/components/products/PurchaseCategoryPicker.tsx`
- Modify: `src/frontend/components/ShoppingView.tsx`
- Modify: `src/frontend/components/products/ProductsTab.tsx`
- Modify: `src/frontend/components/SuppliersView.tsx`
- Modify: `src/frontend/App.tsx`

**Interfaces:**
- Consumes: `categories: string[]` (from `useSuppliers`), `getProductCategories` (Task 1).
- Produces: `addToCart(product: Product, supplierName: string, quantity: number, category: string): void`; `addItemToList(listId: string, product: Product, supplierName: string, quantity: number, category: string): Promise<void>`; `<PurchaseCategoryPicker product={Product} categories={string[]} value={string} onChange={(c: string) => void} />`.

- [ ] **Step 1: Update `types.ts` — `CartItem` and `SavedList` items get their own `category`**

```typescript
export interface CartItem extends Omit<Product, 'categories'> {
  category: string;
  supplierName: string;
  quantity: number;
}
```

Update `SavedList.items` (currently `(Product & { supplierName: string; bought: boolean; ... })[]`) to `(Omit<Product, 'categories'> & { category: string; supplierName: string; bought: boolean; quantity: number, deliveryId?: string, invoiceId?: string, boughtAt?: string })[]`.

- [ ] **Step 2: Update `useCart.ts` signatures**

`addToCart`:

```typescript
const addToCart = (product: Product, supplierName: string, quantity: number = 1, category: string) => {
  const { categories, ...productWithoutCategories } = product;
  setCart(prev => {
    const existing = prev.find(item => item.name === product.name && item.supplierName === supplierName);
    if (existing) {
      return prev.map(item =>
        item.name === product.name && item.supplierName === supplierName
          ? { ...item, quantity: item.quantity + quantity, category }
          : item
      );
    }
    return [...prev, { ...productWithoutCategories, supplierName, quantity, category }];
  });
};
```

`addItemToList` — same substitution: destructure `categories` out of `product`, add a `category: string` parameter, spread `{ ...productWithoutCategories, supplierName, quantity, bought: false, category }` in the push branch, and in the "already in list, bump quantity" branch keep the existing `category` on the item (do not overwrite it — only the initial add sets the category).

Update the `CartItem` state type at the top of the file: `useState<CartItem[]>(...)` using the `CartItem` type imported from `../types` instead of the inline `(Product & {...})[]` type.

- [ ] **Step 3: Build `PurchaseCategoryPicker.tsx`**

```tsx
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Product } from '../../types';
import { getProductCategories } from '../../utils/productCategories';

interface PurchaseCategoryPickerProps {
  product: Product;
  categories: string[];
  value: string;
  onChange: (category: string) => void;
}

export const PurchaseCategoryPicker: React.FC<PurchaseCategoryPickerProps> = ({ product, categories, value, onChange }) => {
  React.useEffect(() => {
    if (value) return;
    const productCats = getProductCategories(product);
    const fallback = productCats[0] || categories[0] || '';
    if (fallback) onChange(fallback);
  }, [product, categories]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
      title="Categoria desta compra"
    >
      {categories.length === 0 && <option value="">Sem categorias cadastradas</option>}
      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
    </select>
  );
};
```

- [ ] **Step 4: Wire the picker + updated `addToCart` call into `ShoppingView.tsx`**

Add local state for the chosen category per card: `const [purchaseCategories, setPurchaseCategories] = useState<Record<string, string>>({});` next to the existing `shoppingQuantities` state. In the card JSX (next to the quantity control, before the "Adicionar" button), add:

```tsx
<PurchaseCategoryPicker
  product={product}
  categories={allCategories}
  value={purchaseCategories[uniqueId] || ''}
  onChange={(cat) => setPurchaseCategories(prev => ({ ...prev, [uniqueId]: cat }))}
/>
```

`ShoppingViewProps` gains `allCategories: string[]`. Import `PurchaseCategoryPicker` from `./products/PurchaseCategoryPicker`.

Update `handleAddToCart` to pass the picked category and `addToCart`'s prop type to `(product: Product, supplierName: string, quantity: number, category: string) => void`:

```typescript
const handleAddToCart = (product: ProductWithSupplier, uniqueId: string) => {
  const val = shoppingQuantities[uniqueId];
  let qty = 1;
  if (val !== undefined && val !== null && val !== '') {
    qty = parseFloat(String(val).replace(',', '.'));
  }
  if (isNaN(qty) || qty <= 0) qty = 1;
  const category = purchaseCategories[uniqueId] || allCategories[0] || '';
  addToCart(product, product.supplierName, qty, category);
  setShoppingQuantities(prev => ({ ...prev, [uniqueId]: '1' }));
};
```

Also update the category grouping (`productsByCategory`, lines ~54-74) to group by each of the product's categories instead of a single one:

```typescript
const productsByCategory = useMemo(() => {
  const acc: Record<string, ProductWithSupplier[]> = {};
  const normalizedSearch = normalizeText(searchTerm);

  suppliers.forEach(supplier => {
    supplier.products.forEach(product => {
      const cats = getProductCategories(product);
      const matchesSearch =
        normalizeText(product.name).includes(normalizedSearch) ||
        normalizeText(supplier.name).includes(normalizedSearch) ||
        cats.some(c => normalizeText(c).includes(normalizedSearch));

      if (matchesSearch) {
        const groups = cats.length > 0 ? cats : ['Sem Categoria'];
        groups.forEach(category => {
          if (!acc[category]) acc[category] = [];
          acc[category].push({ ...product, supplierName: supplier.name });
        });
      }
    });
  });

  return acc;
}, [suppliers, searchTerm]);
```

Import `getProductCategories` from `../utils/productCategories`.

- [ ] **Step 5: Wire the picker into `ProductsTab.tsx`**

Add the same `purchaseCategories` state and `PurchaseCategoryPicker` next to the `QuantitySelector` in the card, and change `onAddToCart` prop type to `(product: Product, supplierName: string, quantity: number, category: string) => void`, passing the picked category (falling back to `categories[0]`) on both the "Enter" and button click call sites.

- [ ] **Step 6: Wire the picker into `SuppliersView.tsx`**

For the Fornecedores tab's product cards (the only remaining `onAddToCart`/`addToCart` call site in this file after Task 5 removed Mercado/Materiais), add the same `purchaseCategories` state + `PurchaseCategoryPicker`, and update the `addToCart` prop type and the `onAddToCart`/`onEnter` call sites to pass the 4th `category` argument the same way.

- [ ] **Step 7: Update `App.tsx`**

`handleAddToCart` (line ~305-317) gains a `category: string` parameter and forwards it to both `addItemToList` and `addToCart`:

```typescript
const handleAddToCart = React.useCallback((product: Product, supplierName: string, quantity: number, category: string) => {
  if (activeTargetListId) {
    addItemToList(activeTargetListId, product, supplierName, quantity, category);
    addNotification(`Adicionado à lista ${activeTargetListName}`, quantity, 'info');
  } else {
    addToCart(product, supplierName, quantity, category);
    addNotification(product.name, quantity, 'cart');
  }
}, [activeTargetListId, activeTargetListName, addItemToList, addNotification, addToCart]);
```

Pass `allCategories={categories}` to the `<ShoppingView>` element (line ~680).

- [ ] **Step 8: Compile check**

Run: `npx tsc --noEmit -p .`
Expected: Clean, except for the not-yet-touched `useXmlImport.ts`, `XmlImportTab.tsx`, `useExcel.ts`, `AIView.tsx`, `HistoryView.tsx`.

- [ ] **Step 9: Manual check in Modo de Teste**

In Modo de Teste, open Compras → Produtos (or Fazer Compras), add a product that has 2 categories to the cart, confirm the category select next to the quantity control lists every system category (not just the product's own two), pick a different one, add to cart, open the cart and confirm the item shows the chosen category.

- [ ] **Step 10: Commit**

```bash
git add src/frontend/types.ts src/frontend/hooks/useCart.ts src/frontend/components/products/PurchaseCategoryPicker.tsx src/frontend/components/ShoppingView.tsx src/frontend/components/products/ProductsTab.tsx src/frontend/components/SuppliersView.tsx src/frontend/App.tsx
git commit -m "feat(products): pick purchase category per cart/list item, independent of product categories"
```

---

### Task 7: XML import — multi-category target

**Files:**
- Modify: `src/frontend/hooks/useXmlImport.ts`
- Modify: `src/frontend/components/suppliers/XmlImportTab.tsx`

**Interfaces:**
- Consumes: `CategoryMultiSelect` (Task 2), `getProductCategories` (Task 1).
- Produces: `ImportRow.targetCategories: string[]` (replaces `targetCategory: string`).

- [ ] **Step 1: Update `ImportRow` in `XmlImportTab.tsx`**

Replace `targetCategory: string;` with `targetCategories: string[];`.

- [ ] **Step 2: Update `useXmlImport.ts`**

- `findExactMatch` usage in `handleXmlFiles`: replace `targetCategory: matched?.product?.category || 'Ingredientes'` with `targetCategories: matched ? getProductCategories(matched.product) : ['Ingredientes']` (import `getProductCategories` from `../utils/productCategories`).
- In `handleSaveImport`, every place that reads/writes `row.targetCategory` or `category: row.targetCategory` / `category: newCat` switches to `categories`: `...(row.targetCategories.length > 0 ? { categories: row.targetCategories } : {})`, `categories: row.targetCategories`, and for new products `categories: row.targetCategories.length > 0 ? row.targetCategories : ['Ingredientes']`.
- The `modifiedSuppliers` diff check (`op.category !== sp.category`) becomes an array comparison: `JSON.stringify(op.categories) !== JSON.stringify(sp.categories)`.

- [ ] **Step 3: Update `XmlImportTab.tsx`**

Replace both `targetCategory` `<select>` blocks (the "Categoria (Dashboard)" one inside the exact/manual branch, and the "Categoria do Produto" one inside the new-record branch) with:

```tsx
<CategoryMultiSelect
  value={row.targetCategories}
  onChange={(next) => updateRow(row.id, { targetCategories: next })}
  options={availableCategories}
/>
```

Import `CategoryMultiSelect` from `./../products/CategoryMultiSelect` (adjust relative path: `XmlImportTab.tsx` lives in `src/frontend/components/suppliers/`, so the import is `'../products/CategoryMultiSelect'`). Remove the `__ADD_NEW__`/`prompt()`-based "create new category" options in these two selects — `CategoryMultiSelect` only offers existing categories, matching how `ProductsTab` and `SupplierModal` behave (new categories are created in Configurações, not inline here). Also update the `activeSupp` product-select `onChange` (line ~366-374) that sets `targetCategory` from a matched product's `category` — change to `targetCategories: matchedP ? getProductCategories(matchedP) : row.targetCategories` (import `getProductCategories` from `'../../utils/productCategories'`).

- [ ] **Step 4: Compile check**

Run: `npx tsc --noEmit -p .`
Expected: No errors in `useXmlImport.ts` or `XmlImportTab.tsx`.

- [ ] **Step 5: Manual check in Modo de Teste**

Import a sample XML in Modo de Teste (Compras → Importar XML), confirm the category checklist appears for both the reconciliation branch and the new-record branch, select 2 categories, save the import, then check the product in the Produtos tab shows both.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/hooks/useXmlImport.ts src/frontend/components/suppliers/XmlImportTab.tsx
git commit -m "feat(products): support multiple target categories in XML import reconciliation"
```

---

### Task 8: Excel import/export and AI matching — multi-category

**Files:**
- Modify: `src/frontend/hooks/useExcel.ts`
- Modify: `src/frontend/components/AIView.tsx`

**Interfaces:**
- Consumes: `getProductCategories` (Task 1).

- [ ] **Step 1: `useExcel.ts` export**

Replace `'Categoria': product.category,` with `'Categoria': getProductCategories(product).join(', '),`. Import `getProductCategories` from `../utils/productCategories`.

- [ ] **Step 2: `useExcel.ts` import (`handleImportExcel`, `handleSyncSheets`)**

In both places that build a product from a spreadsheet row (`category: pCat.toString()` and `category: String(category)`), split on comma and trim:

```typescript
categories: pCat.toString().split(',').map((c: string) => c.trim()).filter(Boolean)
```

(and the equivalent for `String(category)` in `handleSyncSheets`). Update the default fallback: `findVal(row, ['Categoria', 'Grupo', 'Seção']) || 'Fornecedor'` stays the same (still a string default before the split).

- [ ] **Step 3: `useExcel.ts` diff check in `performImport`**

Replace `oldP.category !== newP.category` with `JSON.stringify(oldP.categories) !== JSON.stringify(newP.categories)`.

- [ ] **Step 4: `AIView.tsx`**

Rename `selectedCategory: string` to `selectedCategories: string[]` in the match-result shape (line ~226: `selectedCategory: matchedProduct?.category || item.category || (categories.length > 0 ? categories[0] : 'Fornecedor')` becomes `selectedCategories: matchedProduct ? getProductCategories(matchedProduct) : (categories.length > 0 ? [categories[0]] : ['Fornecedor'])`). Import `getProductCategories` from `../utils/productCategories`.

Update the 4 write sites in `handleUpdate` (lines ~306, 314, 327, 335) from `category: res.selectedCategory || ...` to `categories: res.selectedCategories.length > 0 ? res.selectedCategories : [...]` (matching each site's existing fallback, e.g. `s.products[pIdx].categories` or `['Fornecedor']`).

Update the display badge (line ~1081, `{p.category}`) to `{getProductCategories(p).join(', ')}`, and the `selectedCategory: p.category` initializer (line ~1065) to `selectedCategories: getProductCategories(p)`.

Update `addToCart({ name: item.name, price: 0, category: 'AI', code: '' }, ...)` (line ~431) to `addToCart({ name: item.name, price: 0, categories: ['AI'], code: '' }, item.supplierName || 'AI', item.quantity, 'AI')` — this now needs the 4th `category` argument per Task 6's updated `addToCart` signature.

- [ ] **Step 5: Compile check**

Run: `npx tsc --noEmit -p .`
Expected: No errors in `useExcel.ts` or `AIView.tsx`.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/hooks/useExcel.ts src/frontend/components/AIView.tsx
git commit -m "feat(products): support multiple categories in Excel import/export and AI matching"
```

---

### Task 9: `HistoryView`/`CartModal` cleanup, full build, and end-to-end manual verification

**Files:**
- Modify: `src/frontend/components/HistoryView.tsx` (only if the compile check below flags it)
- Verify only: `src/frontend/components/modals/CartModal.tsx`

**Interfaces:** none new — this task is verification and any last type-error cleanup.

- [ ] **Step 1: Full compile check**

Run: `npx tsc --noEmit -p .`
Expected: Zero errors across the whole project. If `HistoryView.tsx`'s `item.category` (line 67) errors because `SavedList` items now require `category: string` rather than `categories`, no change is needed there — `item.category` already matches the new singular per-item field from Task 6. If instead TypeScript reports it as possibly `categories` (i.e. a leftover reference was missed), fix it to read `item.category`.

- [ ] **Step 2: Full production build**

Run: `npm run build`
Expected: Completes with no errors (`tsc && vite build && esbuild ...`).

- [ ] **Step 3: Manual end-to-end pass in Modo de Teste**

Run: `npm run dev`, enable Modo de Teste, and walk through:
1. Fornecedores → create a product with 2 categories via the multi-select, save, reopen the edit modal, confirm both are still checked.
2. Produtos tab → search for that product by one of its categories, confirm it's found; use the category filter dropdown to isolate it; use the inline `CategoryMultiSelect` to remove one category and add a different one, reload the page, confirm the change persisted.
3. Fazer Compras (ShoppingView) → confirm the product now appears grouped under each of its categories; add it to the cart, confirm the purchase-category select lists every system category and defaults sensibly; pick a category not in the product's own list, add to cart.
4. Open the cart, confirm the item shows the manually chosen category.
5. Finalize the list, open Histórico, confirm the saved list item shows that same category.
6. Importar XML → import a sample invoice, assign 2 categories via the checklist, save, confirm the resulting product in Produtos shows both.
7. Dashboard → confirm nothing changed (category-by-product-code mapping still works exactly as before).
8. Reset Modo de Teste ("RESETAR TESTE" button in the header) to confirm the reset flow still works cleanly with the new data shapes.

- [ ] **Step 4: Commit (only if Step 1 required a fix)**

```bash
git add -A
git commit -m "fix(products): final type cleanup after multi-category rollout"
```

---

## Self-Review Notes

- **Spec coverage:** Mudança 1 (Product.categories + normalization) → Task 1; Mudança 2 (purchase-time single category) → Task 6; Mudança 3 (3 tabs + Produtos tab) → Tasks 4-5; the file list in the spec's "Arquivos que leem/escrevem" section is covered by Tasks 2, 3, 6, 7, 8; the spec's out-of-scope note (Dashboard/`product_categories`) is called out in Global Constraints and never touched by any task.
- **Type consistency:** `getProductCategories`/`formatCategories` (Task 1) are the single source used by every later task (2, 3, 4, 6, 7, 8) — no task reinvents a local helper. `addToCart`/`addItemToList`'s 4-argument signature introduced in Task 6 is used identically by every call site touched afterward (Task 8's AI `addToCart` call).
- **Task 1's Step 4 intentionally leaves the build red** until Task 9 — this mirrors how a real multi-file rename works and gives each task a concrete, shrinking error list to verify against, rather than a fragile "don't run tsc until the end" instruction.
