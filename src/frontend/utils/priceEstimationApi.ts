/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PriceEstimate, PriceParams } from '../../shared/priceEstimation';
import type { PriceSettingsChange } from '../../shared/priceSettings';

export interface PriceSettingsResponse {
  enabled: boolean;
  params: PriceParams;
  history: PriceSettingsChange[];
}

export interface ManualPriceInput {
  kind: 'manual' | 'quote';
  value: number;
  date: string;
  supplierName?: string;
}

export const estimateKey = (i: { name: string; supplierName: string }) => `${i.supplierName}||${i.name}`;

let settingsRequest: Promise<PriceSettingsResponse | null> | null = null;

export function fetchPriceSettings(force = false): Promise<PriceSettingsResponse | null> {
  if (!settingsRequest || force) {
    settingsRequest = fetch('/api/xml/price-settings', { headers: { 'Cache-Control': 'no-cache' } })
      .then(res => (res.ok ? (res.json() as Promise<PriceSettingsResponse>) : null))
      .catch(() => null);
  }
  return settingsRequest;
}

export async function savePriceSettings(params: PriceParams): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch('/api/xml/price-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params }),
    });
    if (res.ok) {
      await fetchPriceSettings(true);
      return { ok: true };
    }
    const body = await res.json().catch(() => null);
    return { ok: false, message: body?.message || `Erro ${res.status}` };
  } catch {
    return { ok: false, message: 'Falha de conexão com o servidor.' };
  }
}

export async function fetchPriceEstimates(
  items: Array<{ name: string; code?: string; supplierName: string; manualPrice?: ManualPriceInput | null }>
): Promise<Record<string, PriceEstimate> | null> {
  try {
    const res = await fetch('/api/xml/price-estimates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(i => ({ name: i.name, code: i.code, supplierName: i.supplierName, manualPrice: i.manualPrice ?? null })),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const map: Record<string, PriceEstimate> = {};
    (data.estimates as PriceEstimate[]).forEach((estimate, idx) => {
      map[estimateKey(items[idx])] = estimate;
    });
    return map;
  } catch {
    return null;
  }
}
