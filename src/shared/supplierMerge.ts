/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { normName } from './text.js';

// A planilha só introduz o que ainda não existe: fornecedor novo entra completo e
// fornecedor existente só recebe produtos novos. Nada do que já existe é alterado.

export interface MergeProduct { name: string; [key: string]: any }
export interface MergeSupplier { id?: string; name: string; phone?: string; products: MergeProduct[]; [key: string]: any }

export interface MergeResult {
  toSave: MergeSupplier[];
  addedSuppliers: number;
  addedProducts: number;
  skippedProducts: number;
}

export function mergeSuppliersAddOnly(existing: MergeSupplier[], incoming: MergeSupplier[], newId: () => string): MergeResult {
  const byName = new Map<string, MergeSupplier>();
  existing.forEach(s => byName.set(normName(s.name), s));

  const changed = new Map<string, MergeSupplier>();
  let addedSuppliers = 0;
  let addedProducts = 0;
  let skippedProducts = 0;

  for (const supplier of incoming) {
    const key = normName(supplier.name);
    if (!key) continue;
    const current = byName.get(key);
    const known = new Set((current?.products || []).map(p => normName(p.name)));

    const fresh: MergeProduct[] = [];
    for (const product of supplier.products || []) {
      const pKey = normName(product.name);
      if (!pKey || known.has(pKey)) { skippedProducts++; continue; }
      known.add(pKey);
      fresh.push(product);
    }

    if (current) {
      if (fresh.length > 0) {
        const merged = { ...current, products: [...current.products, ...fresh] };
        byName.set(key, merged);
        changed.set(key, merged);
        addedProducts += fresh.length;
      }
    } else {
      const created = { ...supplier, id: newId(), products: fresh };
      byName.set(key, created);
      changed.set(key, created);
      addedSuppliers++;
      addedProducts += fresh.length;
    }
  }
  return { toSave: Array.from(changed.values()), addedSuppliers, addedProducts, skippedProducts };
}
