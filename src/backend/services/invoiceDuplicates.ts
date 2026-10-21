/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DuplicateGroup {
  reason: 'mesma_chave' | 'mesmo_conteudo';
  key: string;
  ids: string[];
}

const normalizeId = (id: string) => String(id).replace(/^NFe/, '');

/**
 * Procura notas repetidas, só leitura. "mesma_chave": o mesmo ID com e sem o prefixo NFe.
 * "mesmo_conteudo": IDs diferentes com mesmo fornecedor, dia, total e quantidade de itens.
 * Lançamentos provisórios de lista de compras ficam de fora.
 */
export function findDuplicateInvoices(invoices: Array<Record<string, any>>): DuplicateGroup[] {
  const real = invoices.filter(inv => inv && inv.id && inv.source !== 'shopping_list');
  const groups: DuplicateGroup[] = [];

  const byKey = new Map<string, string[]>();
  for (const inv of real) {
    const k = normalizeId(inv.id);
    byKey.set(k, [...(byKey.get(k) || []), String(inv.id)]);
  }
  const inKeyGroup = new Set<string>();
  for (const [key, ids] of byKey) {
    if (ids.length > 1) {
      groups.push({ reason: 'mesma_chave', key, ids });
      ids.forEach(i => inKeyGroup.add(i));
    }
  }

  const byContent = new Map<string, string[]>();
  for (const inv of real) {
    if (inKeyGroup.has(String(inv.id))) continue;
    const day = String(inv.date || inv.dhEmi || '').slice(0, 10);
    const total = Number(inv.vTotTrib ?? inv.total ?? 0).toFixed(2);
    const count = Array.isArray(inv.products) ? inv.products.length : 0;
    if (!day) continue;
    const k = `${String(inv.supplierName || '').trim().toLowerCase()}|${day}|${total}|${count}`;
    byContent.set(k, [...(byContent.get(k) || []), String(inv.id)]);
  }
  for (const [key, ids] of byContent) {
    if (ids.length > 1) groups.push({ reason: 'mesmo_conteudo', key, ids });
  }
  return groups;
}
