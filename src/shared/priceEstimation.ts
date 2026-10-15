/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Motor puro de estimativa de preço. Sem banco, relógio ou rede: a data de hoje e os
// parâmetros entram como argumentos, então os mesmos dados dão sempre o mesmo resultado.
// Percentuais são números em "pontos percentuais" (5 = 5%).

export interface PriceParams {
  windowMonths: number;
  maxMonthlyTrendPct: number;
  maxProjectionMonths: number;
  leadDays: number;
  defaultBase: number;
  baseByCategory: Record<string, number>;
  volK: number;
  ageStartMonths: number;
  agePctPerMonth: number;
  minMargin: number;
  maxMargin: number;
  staleDays: number;
  calibrationByCategory: Record<string, number>;
}

export const DEFAULT_PRICE_PARAMS: PriceParams = {
  windowMonths: 12,
  maxMonthlyTrendPct: 5,
  maxProjectionMonths: 6,
  leadDays: 0,
  defaultBase: 5,
  baseByCategory: {},
  volK: 1,
  ageStartMonths: 1,
  agePctPerMonth: 0.5,
  minMargin: 3,
  maxMargin: 25,
  staleDays: 180,
  calibrationByCategory: {},
};

export type UnitKind = 'kg' | 'un';
export type Confidence = 'alta' | 'media' | 'baixa' | 'sem_referencia';
export type EstimateMethod = 'trend' | 'single' | 'cadastro' | 'manual' | 'quote' | 'none';

export interface HistoryPoint {
  /** AAAA-MM-DD (ou ISO completo; só os 10 primeiros caracteres contam). */
  date: string;
  /** Preço unitário líquido: R$/kg quando unit = 'kg', R$/un caso contrário. */
  price: number;
  unit: UnitKind;
}

export interface ManualReference {
  kind: 'manual' | 'quote';
  /** Preço da embalagem pedida. */
  value: number;
  date: string;
  by?: string;
  supplierName?: string;
}

export interface EstimateInput {
  categories: string[];
  history: HistoryPoint[];
  /** Peso da embalagem pedida em kg (extractWeightKg do nome), ou null. */
  packageKg: number | null;
  catalogPrice?: number;
  catalogDate?: string | null;
  reference?: ManualReference | null;
  today: string;
  params: PriceParams;
}

export interface PriceEstimate {
  lastPrice: number;
  lastPriceDate: string | null;
  estimatedPrice: number;
  marginPct: number;
  protectedPrice: number;
  confidence: Confidence;
  method: EstimateMethod;
  sampleSize: number;
  discardedUnit: number;
  discardedOther: number;
  intervalDays: number | null;
  volatilityRel: number;
  horizonMonths: number;
  staleHistory: boolean;
  noReference: boolean;
  reference: ManualReference | null;
  computedAt: string;
  params: PriceParams;
}

const MONTH_DAYS = 30.4375;

const toDay = (iso: string): number => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d) / 86400000;
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

interface Point { day: number; price: number }

export function estimatePrice(input: EstimateInput): PriceEstimate {
  const { params, today, categories } = input;
  const todayDay = toDay(today);
  const target = todayDay + params.leadDays;
  const itemUnit: UnitKind = input.packageKg ? 'kg' : 'un';

  // 1. Seleção e normalização para preço da embalagem pedida.
  let discardedUnit = 0;
  let discardedOther = 0;
  const byDay = new Map<number, number[]>();
  for (const h of input.history) {
    if (h.unit !== itemUnit) { discardedUnit++; continue; }
    const day = toDay(h.date);
    if (!Number.isFinite(day) || !(h.price > 0) || day > todayDay) { discardedOther++; continue; }
    const price = itemUnit === 'kg' ? h.price * (input.packageKg as number) : h.price;
    byDay.set(day, [...(byDay.get(day) || []), price]);
  }
  const all: Point[] = Array.from(byDay.entries())
    .map(([day, prices]) => ({ day, price: prices.reduce((a, b) => a + b, 0) / prices.length }))
    .sort((a, b) => a.day - b.day);

  // 2. Janela: últimos N meses; com menos de 2 compras nela usa todo o histórico.
  const cutoff = todayDay - params.windowMonths * MONTH_DAYS;
  const inWindow = all.filter(p => p.day >= cutoff);
  let used = inWindow;
  let staleHistory = false;
  if (inWindow.length < 2 && all.length > inWindow.length) {
    used = all;
    staleHistory = true;
  }
  const n = used.length;

  // 3. Referência (quando há compras, a última compra manda).
  let method: EstimateMethod;
  let lastPrice = 0;
  let lastDay: number | null = null;
  let reference: ManualReference | null = null;
  if (n >= 1) {
    method = n >= 2 ? 'trend' : 'single';
    lastPrice = used[n - 1].price;
    lastDay = used[n - 1].day;
  } else if (input.reference && input.reference.value > 0 && Number.isFinite(toDay(input.reference.date))) {
    method = input.reference.kind;
    reference = input.reference;
    lastPrice = input.reference.value;
    lastDay = toDay(input.reference.date);
  } else if (input.catalogPrice && input.catalogPrice > 0) {
    method = 'cadastro';
    lastPrice = input.catalogPrice;
    const d = input.catalogDate ? toDay(input.catalogDate) : NaN;
    lastDay = Number.isFinite(d) ? d : null;
  } else {
    method = 'none';
  }

  // 4. Tendência (Theil-Sen) e volatilidade.
  let slope = 0;
  let volatilityRel = 0;
  let intervalDays: number | null = null;
  if (method === 'trend') {
    const ms = used.map(p => (p.day - used[0].day) / MONTH_DAYS);
    const slopes: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) slopes.push((used[j].price - used[i].price) / (ms[j] - ms[i]));
    }
    slope = median(slopes);
    if (n >= 3) {
      const intercept = median(used.map((p, i) => p.price - slope * ms[i]));
      const sse = used.reduce((acc, p, i) => acc + Math.pow(p.price - (intercept + slope * ms[i]), 2), 0);
      const meanP = used.reduce((a, p) => a + p.price, 0) / n;
      volatilityRel = Math.sqrt(sse / (n - 1)) / meanP;
      intervalDays = Math.round(median(used.slice(1).map((p, i) => p.day - used[i].day)));
    } else {
      volatilityRel = Math.abs(used[1].price - used[0].price) / (used[1].price + used[0].price);
    }
  }

  // 5. Projeção.
  const effectiveLastDay = lastDay ?? (target - params.staleDays);
  const horizonMonths = method === 'trend'
    ? Math.min(params.maxProjectionMonths, Math.max(0, (target - effectiveLastDay) / MONTH_DAYS))
    : 0;
  const shrink = Math.min(1, (n - 1) / 4);
  const cap = (params.maxMonthlyTrendPct / 100) * lastPrice;
  const slopeEff = clamp(slope * shrink, -cap, cap);
  const estimatedPrice = method === 'none' ? 0 : round2(Math.max(0, lastPrice + slopeEff * horizonMonths));

  // 6. Margem de segurança.
  const ageMonths = method === 'none' ? 0 : Math.max(0, (target - effectiveLastDay) / MONTH_DAYS);
  const base = categories.length
    ? Math.max(...categories.map(c => params.baseByCategory[c] ?? params.defaultBase))
    : params.defaultBase;
  const calibration = categories.length
    ? Math.max(...categories.map(c => params.calibrationByCategory[c] ?? 0))
    : 0;
  const rawMargin = base + calibration
    + params.volK * volatilityRel * 100
    + params.agePctPerMonth * Math.max(0, ageMonths - params.ageStartMonths);
  const marginPct = round2(clamp(rawMargin, params.minMargin, params.maxMargin));
  const protectedPrice = method === 'none' ? 0 : round2(estimatedPrice * (1 + marginPct / 100));

  // 7. Confiança.
  let confidence: Confidence;
  if (method === 'none') {
    confidence = 'sem_referencia';
  } else if (method !== 'trend') {
    confidence = 'baixa';
  } else {
    const recent6 = used.filter(p => p.day >= todayDay - 6 * MONTH_DAYS).length;
    const lastAgeDays = todayDay - (lastDay as number);
    if (!staleHistory && n >= 5 && recent6 >= 3 && volatilityRel < 0.10 && lastAgeDays <= 90) confidence = 'alta';
    else if (!staleHistory && volatilityRel < 0.25 && lastAgeDays <= params.staleDays) confidence = 'media';
    else confidence = 'baixa';
  }

  return {
    lastPrice: round2(lastPrice),
    lastPriceDate: lastDay === null ? null : new Date(lastDay * 86400000).toISOString().slice(0, 10),
    estimatedPrice,
    marginPct,
    protectedPrice,
    confidence,
    method,
    sampleSize: n,
    discardedUnit,
    discardedOther,
    intervalDays,
    volatilityRel: Math.round(volatilityRel * 10000) / 10000,
    horizonMonths: Math.round(horizonMonths * 1000) / 1000,
    staleHistory,
    noReference: method === 'none',
    reference,
    computedAt: today,
    params,
  };
}
