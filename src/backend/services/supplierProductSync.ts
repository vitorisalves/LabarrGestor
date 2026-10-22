/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const norm = (s: unknown) =>
  String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();

/**
 * Compra concluída "Sem NF": os dados dela passam para o produto no cadastro do fornecedor.
 * A data da última compra NÃO muda (ela já foi gravada quando o item foi marcado na lista).
 * Devolve o fornecedor atualizado, ou null se fornecedor/produto não existem ou nada mudou.
 */
export function applyUnbilledPurchase(
  supplier: { name?: string; products?: any[] },
  item: { productName?: unknown; price?: unknown; setor?: unknown; category?: unknown }
): any | null {
  const products = Array.isArray(supplier.products) ? supplier.products : [];
  const target = norm(item.productName);
  const exact = products.findIndex(p => p?.name === item.productName);
  const idx = exact >= 0 ? exact : products.findIndex(p => target && norm(p?.name) === target);
  if (idx < 0) return null;

  const current = products[idx];
  const next: any = { ...current };
  const price = Number(item.price);
  if (Number.isFinite(price) && price > 0) next.price = price;
  const setor = String(item.setor ?? '').trim();
  if (setor) next.setor = setor;
  // Só troca a categoria se a da compra não é nenhuma das que o produto já tem (não perde categorias extras).
  const category = String(item.category ?? '').trim();
  const currentCats: string[] = Array.isArray(current.categories) ? current.categories : (current.category ? [current.category] : []);
  if (category && !currentCats.includes(category)) next.categories = [category];

  const changed = next.price !== current.price || next.setor !== current.setor || next.categories !== current.categories;
  if (!changed) return null;
  return { ...supplier, products: products.map((p, i) => (i === idx ? next : p)) };
}

/** Acha o fornecedor pelo nome (sem diferenciar maiúsculas/acentos). */
export function findSupplierByName<T extends { name?: string }>(suppliers: T[], name: unknown): T | undefined {
  const target = norm(name);
  return target ? suppliers.find(s => norm(s?.name) === target) : undefined;
}
