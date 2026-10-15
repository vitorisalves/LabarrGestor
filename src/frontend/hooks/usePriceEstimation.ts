/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import type { PriceEstimate } from '../../shared/priceEstimation';
import type { CartItem } from '../types';
import { fetchPriceEstimates, fetchPriceSettings } from '../utils/priceEstimationApi';

// Pré-visualização das estimativas dos itens do carrinho. Só funciona com o recurso ligado
// no servidor; desligado, `enabled` é false e nada muda na interface.
export function usePriceEstimation(cart: CartItem[], active: boolean) {
  const [enabled, setEnabled] = useState(false);
  const [estimates, setEstimates] = useState<Record<string, PriceEstimate>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPriceSettings().then(s => { if (alive) setEnabled(!!s?.enabled); });
    return () => { alive = false; };
  }, []);

  const signature = JSON.stringify(cart.map(i => [i.name, i.supplierName, i.code, i.manualPrice ?? null]));

  useEffect(() => {
    if (!enabled || !active || cart.length === 0) {
      setEstimates({});
      setLoading(false);
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await fetchPriceEstimates(cart);
      if (!alive) return;
      if (result) setEstimates(result);
      setLoading(false);
    }, 400);
    return () => { alive = false; clearTimeout(timer); };
  }, [enabled, active, signature]);

  return { enabled, estimates, loading };
}
