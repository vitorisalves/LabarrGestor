/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { estimatePrice, HistoryPoint, ManualReference, PriceEstimate, PriceParams } from '../../shared/priceEstimation';
import { extractWeightKg } from '../../shared/units';
import { normName } from '../../shared/text';

// Camada que traduz os dados do sistema (notas, fornecedores) para a entrada do motor puro.
// Não acessa banco: quem chama (app.ts) carrega as coleções e passa aqui.

export class EstimateInputError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export interface ManualPriceInput {
  kind: 'manual' | 'quote';
  value: number;
  date: string;
  supplierName?: string;
}

export interface EstimateRequestItem {
  name: string;
  code?: string;
  supplierName: string;
  manualPrice?: ManualPriceInput | null;
}

export interface EstimateContext {
  invoices: any[];
  suppliers: any[];
  params: PriceParams;
  /** AAAA-MM-DD */
  today: string;
  /** Nome de quem está pedindo (gravado nas referências manuais/cotações). */
  by: string;
}

export interface HistoryIndex {
  byCode: Map<string, HistoryPoint[]>;
  byName: Map<string, HistoryPoint[]>;
}

/** "15/06/2026" -> "2026-06-15"; datas ISO ficam com os 10 primeiros caracteres. */
export function toIsoDate(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/**
 * Indexa as compras de cada produto por código e por nome normalizado.
 * Entram: notas reais e entradas da lista "Sem NF" (hasNF === true).
 * Ficam de fora: entradas da lista "NF" (provisórias), itens excluídos, preço <= 0 e notas manual-inv-.
 */
export function buildHistoryIndex(invoices: any[]): HistoryIndex {
  const byCode = new Map<string, HistoryPoint[]>();
  const byName = new Map<string, HistoryPoint[]>();
  const push = (map: Map<string, HistoryPoint[]>, key: string, point: HistoryPoint) => {
    const list = map.get(key);
    if (list) list.push(point); else map.set(key, [point]);
  };

  for (const inv of invoices || []) {
    if (!inv || String(inv.id || '').startsWith('manual-inv-')) continue;
    if (inv.source === 'shopping_list' && inv.hasNF !== true) continue;
    const date = toIsoDate(inv.dhEmi || inv.date || inv.createdAt);
    if (!date || !Array.isArray(inv.products)) continue;

    for (const p of inv.products) {
      if (!p || p.deleted || !p.name || p.name === 'N/A') continue;
      const price = Number(p.vUnCom || p.price || 0);
      if (!(price > 0)) continue;
      const weight = extractWeightKg(String(p.name));
      const point: HistoryPoint = weight
        ? { date, price: price / weight, unit: 'kg' }
        : { date, price, unit: 'un' };
      const code = String(p.code ?? '').trim();
      if (code && code !== 'N/A') push(byCode, code, point);
      push(byName, normName(p.name), point);
    }
  }
  return { byCode, byName };
}

function lookupHistory(index: HistoryIndex, item: EstimateRequestItem): HistoryPoint[] {
  const code = String(item.code ?? '').trim();
  if (code && code !== 'N/A') {
    const byCode = index.byCode.get(code);
    if (byCode && byCode.length) return byCode;
  }
  return index.byName.get(normName(item.name)) || [];
}

function lookupCatalog(suppliers: any[], item: EstimateRequestItem) {
  const supplier = (suppliers || []).find(s => normName(s?.name) === normName(item.supplierName));
  const products: any[] = Array.isArray(supplier?.products) ? supplier.products : [];
  const code = String(item.code ?? '').trim();
  const product =
    (code && code !== 'N/A' ? products.find(p => String(p?.code ?? '').trim() === code) : undefined) ||
    products.find(p => normName(p?.name) === normName(item.name));
  if (!product) return { price: undefined as number | undefined, date: null as string | null, categories: [] as string[] };
  const categories: string[] = Array.isArray(product.categories)
    ? product.categories.filter(Boolean)
    : product.category ? [product.category] : [];
  return {
    price: Number(product.price) > 0 ? Number(product.price) : undefined,
    date: toIsoDate(product.lastPurchaseDate),
    categories,
  };
}

/** Valida a entrada manual/cotação vinda do navegador; lança EstimateInputError se inválida. */
export function validateManualPrice(input: ManualPriceInput, today: string): ManualPriceInput {
  const value = Number(input?.value);
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new EstimateInputError('manual_invalid', 'O preço informado deve ser maior que zero.');
  }
  if (input.kind !== 'manual' && input.kind !== 'quote') {
    throw new EstimateInputError('manual_invalid', 'Tipo de preço informado inválido.');
  }
  const date = toIsoDate(input.date);
  if (!date || date > today) {
    throw new EstimateInputError('manual_invalid', 'A data do preço informado é inválida ou está no futuro.');
  }
  return { kind: input.kind, value, date, supplierName: input.supplierName?.trim() || undefined };
}

/** Estima o preço de cada item, na mesma ordem em que vieram. */
export function estimateItems(items: EstimateRequestItem[], ctx: EstimateContext): PriceEstimate[] {
  const index = buildHistoryIndex(ctx.invoices);
  return items.map(item => {
    const catalog = lookupCatalog(ctx.suppliers, item);
    let reference: ManualReference | null = null;
    if (item.manualPrice) {
      const valid = validateManualPrice(item.manualPrice, ctx.today);
      reference = { ...valid, by: ctx.by };
    }
    return estimatePrice({
      categories: catalog.categories,
      history: lookupHistory(index, item),
      packageKg: extractWeightKg(String(item.name)),
      catalogPrice: catalog.price,
      catalogDate: catalog.date,
      reference,
      today: ctx.today,
      params: ctx.params,
    });
  });
}
