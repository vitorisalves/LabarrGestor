/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationError, parsePrice, parseQuantity } from '../validation.js';

/** ID do gasto confirmado, derivado do item pendente: confirmar de novo regrava o mesmo registro. */
export function confirmedSpendingId(it: { id?: unknown; confirmId?: unknown; date?: unknown }): string {
  const key = String(it?.id ?? it?.confirmId ?? '').trim();
  if (!key) throw new ValidationError('Item sem identificador: recarregue a tela e tente de novo.');
  // O id pendente se repete quando a lista é reutilizada; a data do item (fixa desde que foi marcado) separa as compras.
  const ts = it?.date ? Date.parse(String(it.date)) : NaN;
  const suffix = Number.isFinite(ts) ? `_${ts}` : '';
  return `conf_list_${key.replace(/[^A-Za-z0-9_-]/g, '_')}${suffix}`;
}

/** Monta o gasto (mesmo registro vai para xml_spendings e invoices). */
export function buildConfirmedSpending(it: Record<string, any>, now: Date): Record<string, any> {
  const price = parsePrice(it.price, 'Preço');
  const quantity = parseQuantity(it.quantity, 'Quantidade');
  const total = Math.round(price * quantity * 100) / 100; // quantidade fracionada: fecha em centavos
  const id = confirmedSpendingId(it);
  const dateStr = it.date || now.toISOString();
  const name = it.productName || 'Produto sem nome';
  const code = `LIST_${String(it.productName || 'PROD').toUpperCase()}`;

  return {
    id,
    dhEmi: dateStr,
    date: dateStr,
    createdAt: dateStr,
    supplierName: it.supplierName || 'Lista de Compras',
    vTotTrib: total,
    vNF: total,
    total,
    source: 'shopping_list',
    hasNF: it.hasNF === true,
    listName: it.listName || 'Minhas Listas',
    products: [{
      code,
      cProd: code,
      name,
      xProd: name,
      vUnCom: price,
      price,
      quantity,
      vProd: total,
      category: it.category || 'Sem Categoria',
      categoryId: it.category || 'Sem Categoria',
      setor: it.setor || ''
    }]
  };
}
