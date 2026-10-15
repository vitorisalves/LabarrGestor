import React from 'react';
import type { Confidence } from '../../../shared/priceEstimation';

const STYLES: Record<Confidence, { label: string; className: string }> = {
  alta: { label: 'Confiança alta', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  media: { label: 'Confiança média', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  baixa: { label: 'Confiança baixa', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  sem_referencia: { label: 'Sem referência', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const PriceConfidenceBadge: React.FC<{ confidence: Confidence }> = ({ confidence }) => {
  const style = STYLES[confidence];
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-wider ${style.className}`}>
      {style.label}
    </span>
  );
};
