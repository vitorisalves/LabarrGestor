/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_PRICE_PARAMS, PriceParams } from './priceEstimation';

export interface PriceSettingsChange {
  at: string;
  by: string;
  field: string;
  before: unknown;
  after: unknown;
}

const SCALAR_FIELDS = [
  'windowMonths', 'maxMonthlyTrendPct', 'maxProjectionMonths', 'leadDays', 'defaultBase',
  'volK', 'ageStartMonths', 'agePctPerMonth', 'minMargin', 'maxMargin', 'staleDays',
] as const;

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const numberRecord = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const n = Number(val);
      if (k.trim() && Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
};

/** Completa com os valores iniciais e converte para número o que veio de formulário/JSON. */
export function normalizeParams(input?: Partial<PriceParams> | null): PriceParams {
  const d = DEFAULT_PRICE_PARAMS;
  const i: any = input || {};
  return {
    windowMonths: num(i.windowMonths, d.windowMonths),
    maxMonthlyTrendPct: num(i.maxMonthlyTrendPct, d.maxMonthlyTrendPct),
    maxProjectionMonths: num(i.maxProjectionMonths, d.maxProjectionMonths),
    leadDays: num(i.leadDays, d.leadDays),
    defaultBase: num(i.defaultBase, d.defaultBase),
    baseByCategory: numberRecord(i.baseByCategory),
    volK: num(i.volK, d.volK),
    ageStartMonths: num(i.ageStartMonths, d.ageStartMonths),
    agePctPerMonth: num(i.agePctPerMonth, d.agePctPerMonth),
    minMargin: num(i.minMargin, d.minMargin),
    maxMargin: num(i.maxMargin, d.maxMargin),
    staleDays: num(i.staleDays, d.staleDays),
    calibrationByCategory: numberRecord(i.calibrationByCategory),
  };
}

/** Lista de erros em português; vazia quando os parâmetros são válidos. */
export function validateParams(p: PriceParams): string[] {
  const errors: string[] = [];
  const range = (label: string, v: number, lo: number, hi: number, integer = false) => {
    if (!Number.isFinite(v) || v < lo || v > hi || (integer && !Number.isInteger(v))) {
      errors.push(`${label} deve ser ${integer ? 'um número inteiro ' : 'um número '}entre ${lo} e ${hi}.`);
    }
  };
  range('Janela de histórico (meses)', p.windowMonths, 1, 60, true);
  range('Variação máxima da tendência (% ao mês)', p.maxMonthlyTrendPct, 0, 100);
  range('Projeção máxima (meses)', p.maxProjectionMonths, 0, 24, true);
  range('Prazo até a compra (dias)', p.leadDays, 0, 365, true);
  range('Margem base padrão (%)', p.defaultBase, 0, 100);
  range('Peso da volatilidade', p.volK, 0, 10);
  range('Meses sem acréscimo de idade', p.ageStartMonths, 0, 60);
  range('Acréscimo por mês de idade (%)', p.agePctPerMonth, 0, 100);
  range('Margem mínima (%)', p.minMargin, 0, 100);
  range('Margem máxima (%)', p.maxMargin, 0, 100);
  range('Dias para preço desatualizado', p.staleDays, 1, 3650, true);
  if (p.minMargin > p.maxMargin) errors.push('A margem mínima não pode ser maior que a máxima.');
  for (const [cat, v] of Object.entries(p.baseByCategory)) range(`Margem base de "${cat}" (%)`, v, 0, 100);
  for (const [cat, v] of Object.entries(p.calibrationByCategory)) range(`Calibração de "${cat}" (%)`, v, -100, 100);
  return errors;
}

/** Diferenças campo a campo, para o histórico de alterações. */
export function diffParams(before: PriceParams, after: PriceParams): Array<{ field: string; before: unknown; after: unknown }> {
  const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
  for (const f of SCALAR_FIELDS) {
    if (before[f] !== after[f]) changes.push({ field: f, before: before[f], after: after[f] });
  }
  for (const group of ['baseByCategory', 'calibrationByCategory'] as const) {
    const keys = new Set([...Object.keys(before[group]), ...Object.keys(after[group])]);
    for (const k of Array.from(keys).sort()) {
      const b = before[group][k];
      const a = after[group][k];
      if (b !== a) changes.push({ field: `${group}.${k}`, before: b ?? null, after: a ?? null });
    }
  }
  return changes;
}
