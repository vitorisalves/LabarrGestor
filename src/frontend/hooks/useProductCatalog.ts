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
