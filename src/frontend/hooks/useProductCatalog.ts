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

  const updateProductSetor = useCallback(async (supplierId: string, productIndex: number, setor: string) => {
    const supplier = suppliers.find(s => (s.id || s.name) === supplierId);
    if (!supplier) return;
    const updatedProducts = supplier.products.map((p, idx) => idx === productIndex ? { ...p, setor } : p);
    await saveSupplier({ ...supplier, products: updatedProducts });
  }, [suppliers, saveSupplier]);

  // Aplica a mesma categoria (ou o mesmo setor) a vários produtos de uma vez,
  // agrupando por fornecedor para salvar cada um só uma vez.
  const bulkUpdateProducts = useCallback(async (
    rows: CatalogRow[],
    updates: { categories?: string[]; setor?: string }
  ) => {
    const bySupplier = new Map<string, CatalogRow[]>();
    rows.forEach(row => {
      const list = bySupplier.get(row.supplierId) || [];
      list.push(row);
      bySupplier.set(row.supplierId, list);
    });

    for (const [supplierId, supplierRows] of bySupplier.entries()) {
      const supplier = suppliers.find(s => (s.id || s.name) === supplierId);
      if (!supplier) continue;
      const indexesToUpdate = new Set(supplierRows.map(r => r.productIndex));
      const updatedProducts = supplier.products.map((p, idx) => {
        if (!indexesToUpdate.has(idx)) return p;
        return {
          ...p,
          ...(updates.categories !== undefined ? { categories: updates.categories } : {}),
          ...(updates.setor !== undefined ? { setor: updates.setor } : {})
        };
      });
      await saveSupplier({ ...supplier, products: updatedProducts });
    }
  }, [suppliers, saveSupplier]);

  // Remove os produtos selecionados dos respectivos fornecedores.
  const bulkDeleteProducts = useCallback(async (rows: CatalogRow[]) => {
    const bySupplier = new Map<string, CatalogRow[]>();
    rows.forEach(row => {
      const list = bySupplier.get(row.supplierId) || [];
      list.push(row);
      bySupplier.set(row.supplierId, list);
    });

    for (const [supplierId, supplierRows] of bySupplier.entries()) {
      const supplier = suppliers.find(s => (s.id || s.name) === supplierId);
      if (!supplier) continue;
      const indexesToRemove = new Set(supplierRows.map(r => r.productIndex));
      const updatedProducts = supplier.products.filter((_, idx) => !indexesToRemove.has(idx));
      await saveSupplier({ ...supplier, products: updatedProducts });
    }
  }, [suppliers, saveSupplier]);

  return { catalog, updateProductCategories, updateProductSetor, bulkUpdateProducts, bulkDeleteProducts };
};
