/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Categoria que o sistema usava como padrão antes de existir "sem categoria". */
export const LEGACY_DEFAULT_CATEGORY = 'Ingredientes';

const same = (a: unknown, b: string) => String(a ?? '').trim().toLowerCase() === b.toLowerCase();

/**
 * Tira a categoria `name` de um produto (campos `categories` e `category`).
 * Devolve o produto novo, ou null se ele não tinha essa categoria.
 */
export function stripCategory(product: any, name: string): any | null {
  const cats: string[] = Array.isArray(product?.categories) ? product.categories : [];
  const hadList = cats.some(c => same(c, name));
  const hadLegacy = same(product?.category, name);
  if (!hadList && !hadLegacy) return null;
  const next: any = { ...product };
  if (Array.isArray(product.categories)) next.categories = cats.filter(c => !same(c, name));
  if (hadLegacy) next.category = '';
  return next;
}

/** Aplica `stripCategory` nos produtos de um fornecedor. Devolve o fornecedor novo e quantos produtos mudaram. */
export function stripCategoryFromSupplier(supplier: any, name: string): { supplier: any; changed: number } {
  const products = Array.isArray(supplier?.products) ? supplier.products : [];
  let changed = 0;
  const next = products.map((p: any) => {
    const stripped = stripCategory(p, name);
    if (!stripped) return p;
    changed++;
    return stripped;
  });
  return { supplier: changed ? { ...supplier, products: next } : supplier, changed };
}
