/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Supplier } from '../types';

const extractWeightKg = (name: string): number | null => {
  const kgMatch = name.match(/([0-9]+(?:[.,][0-9]+)?)\s*KG\b/i);
  if (kgMatch) {
    return parseFloat(kgMatch[1].replace(',', '.'));
  }
  const gMatch = name.match(/([0-9]+(?:[.,][0-9]+)?)\s*G\b/i);
  if (gMatch) {
    return parseFloat(gMatch[1].replace(',', '.')) / 1000;
  }
  return null;
};

export interface PriceHistoryEntry {
  date: string;
  price: number;
  supplierName: string;
  quantity: number;
  invoiceId: string;
  percentChange?: number;
}

export interface AnalyzedProduct {
  name: string;
  code: string;
  suppliers: string[];
  minPrice: number;
  maxPrice: number;
  currentPrice: number;
  oldestPrice: number;
  totalPercentChange: number;
  history: PriceHistoryEntry[];
}

export interface PriceAnalysisResult {
  allProducts: AnalyzedProduct[];
  topIncreases: AnalyzedProduct[];
}

export function analyzePrices(invoices: any[], suppliers: Supplier[]): PriceAnalysisResult {
  const currentYear = new Date().getFullYear();
  
  const getYearFromDate = (dateStr: string): number => {
    if (dateStr && dateStr.length >= 4) {
      const yearNum = parseInt(dateStr.substring(0, 4), 10);
      if (!isNaN(yearNum) && yearNum > 1900 && yearNum < 2100) {
        return yearNum;
      }
    }
    return new Date(dateStr).getFullYear();
  };

  const productMap: Record<string, {
    name: string;
    code: string;
    supplierNames: Set<string>;
    history: {
      date: string;
      price: number;
      supplierName: string;
      quantity: number;
      invoiceId: string;
    }[];
  }> = {};

  // 1. Map current supplier product prices to use as backfill baseline
  const fallbackPrices: Record<string, { price: number; name: string; supplier: string }> = {};
  suppliers.forEach(supp => {
    if (Array.isArray(supp.products)) {
      supp.products.forEach((p: any) => {
        if (p.name) {
          const key = p.name.trim().toLowerCase();
          fallbackPrices[key] = {
            price: Number(p.price || 0),
            name: p.name,
            supplier: supp.name
          };
        }
      });
    }
  });

  // 2. Extract products from all invoices
  invoices.forEach(inv => {
    if (inv.id && inv.id.startsWith('manual-inv-')) return;
    if (!Array.isArray(inv.products)) return;

    inv.products.forEach((prod: any) => {
      if (!prod.name || prod.name === 'N/A') return;
      const name = prod.name;
      const code = prod.code || 'N/A';
      const normKey = name.trim().toLowerCase();

      // Check if there is explicit price (vUnCom / price / vUnTrib) on the invoice doc, else default to fallback
      let itemPrice = Number(prod.vUnCom || prod.price || prod.vUnTrib || 0);
      if (!itemPrice || itemPrice <= 0) {
        const suppInfo = fallbackPrices[normKey];
        itemPrice = Number(suppInfo?.price || 15);
      }

      const weightKg = extractWeightKg(name);
      let itemQuantity = Number(prod.quantity || 1);
      if (weightKg && weightKg > 0 && weightKg !== 1) {
        itemPrice = itemPrice / weightKg;
        itemQuantity = itemQuantity * weightKg;
      }

      if (!productMap[normKey]) {
        productMap[normKey] = {
          name,
          code,
          supplierNames: new Set(),
          history: []
        };
      }

      productMap[normKey].supplierNames.add(inv.supplierName || 'Desconhecido');
      productMap[normKey].history.push({
        date: inv.date || '2026-06-19T00:00:00Z',
        price: itemPrice,
        supplierName: inv.supplierName || 'Desconhecido',
        quantity: itemQuantity,
        invoiceId: inv.id
      });
    });
  });

  // 3. Process history and sort chronologically
  const finalProducts: AnalyzedProduct[] = [];

  Object.values(productMap).forEach(p => {
    p.history.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    // Filter consecutive duplicate entries from the exact same invoice
    const uniqueHistory: typeof p.history = [];
    p.history.forEach(h => {
      const last = uniqueHistory[uniqueHistory.length - 1];
      if (last && last.invoiceId === h.invoiceId) {
        return;
      }
      uniqueHistory.push(h);
    });

    if (uniqueHistory.length < 2) return;

    // Add variation field
    const computedHistory: PriceHistoryEntry[] = uniqueHistory.map((h, idx) => {
      let percentChange = 0;
      if (idx > 0) {
        const prevPrice = uniqueHistory[idx - 1].price;
        percentChange = prevPrice > 0 ? ((h.price - prevPrice) / prevPrice) * 100 : 0;
      }
      return {
        ...h,
        percentChange
      };
    });

    const currentPrice = computedHistory[computedHistory.length - 1].price;
    const oldestPrice = computedHistory.length >= 2 
      ? computedHistory[computedHistory.length - 2].price 
      : currentPrice;
    const prices = computedHistory.map(h => h.price);
    const minPrice = Math.min(...prices);
    const maxPrice = Math.max(...prices);

    // Percentage change from the penultimate purchase to the newest purchase
    const totalPercentChange = oldestPrice > 0 ? ((currentPrice - oldestPrice) / oldestPrice) * 100 : 0;

    finalProducts.push({
      name: p.name,
      code: p.code,
      suppliers: Array.from(p.supplierNames),
      minPrice,
      maxPrice,
      currentPrice,
      oldestPrice,
      totalPercentChange,
      history: computedHistory
    });
  });

  // Top 10 products with highest price increases (at least 2 purchases in current year, change > 0, sorted DESC)
  const topIncreases = [...finalProducts]
    .filter(p => p.totalPercentChange > 0)
    .sort((a, b) => b.totalPercentChange - a.totalPercentChange)
    .slice(0, 10);

  return {
    allProducts: finalProducts,
    topIncreases
  };
}
