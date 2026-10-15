import React from 'react';
import type { PriceEstimate } from '../../../shared/priceEstimation';
import { formatCurrency } from '../../utils';
import { PriceConfidenceBadge } from './PriceConfidenceBadge';

export const OrderItemEstimate: React.FC<{ estimate?: PriceEstimate }> = ({ estimate }) => {
  if (!estimate) return null;
  return (
    <div className="px-3 pb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
      <PriceConfidenceBadge confidence={estimate.confidence} />
      {estimate.method === 'none' ? (
        <span className="text-rose-600">Sem referência de preço</span>
      ) : (
        <>
          <span>Último {formatCurrency(estimate.lastPrice)}</span>
          <span className="text-slate-300">→</span>
          <span className="text-slate-800">Est. {formatCurrency(estimate.estimatedPrice)}</span>
          <span>(+{estimate.marginPct.toLocaleString('pt-BR')}% = {formatCurrency(estimate.protectedPrice)})</span>
        </>
      )}
    </div>
  );
};
