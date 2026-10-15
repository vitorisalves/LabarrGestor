import React from 'react';
import type { PurchaseOrder } from '../../types';
import { formatCurrency } from '../../utils';

export interface LimitDraft {
  limit: string;
  reason: string;
}

export const parseLimit = (raw: string): number => Number(raw.replace(',', '.'));

export const limitChanged = (order: PurchaseOrder, draft?: LimitDraft): boolean => {
  if (!draft || draft.limit.trim() === '' || typeof order.suggestedLimit !== 'number') return false;
  return Math.abs(parseLimit(draft.limit) - order.suggestedLimit) > 0.005;
};

interface ApprovalLimitFieldsProps {
  order: PurchaseOrder;
  draft?: LimitDraft;
  onChange: (draft: LimitDraft) => void;
}

export const ApprovalLimitFields: React.FC<ApprovalLimitFieldsProps> = ({ order, draft, onChange }) => {
  if (typeof order.suggestedLimit !== 'number') return null;
  const current: LimitDraft = draft ?? { limit: String(order.suggestedLimit).replace('.', ','), reason: '' };
  const weak = order.items.filter(i => i.estimate && (i.estimate.confidence === 'baixa' || i.estimate.confidence === 'sem_referencia')).length;
  const changed = limitChanged(order, current);

  return (
    <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
      <div className="flex justify-between text-[11px] font-bold text-slate-500">
        <span>Total estimado</span>
        <span className="text-slate-800">{formatCurrency(order.estimatedTotal ?? order.total)}</span>
      </div>
      <div className="flex justify-between text-[11px] font-bold text-slate-500">
        <span>Limite sugerido (com margem)</span>
        <span className="text-slate-800">{formatCurrency(order.suggestedLimit)}</span>
      </div>
      {weak > 0 && (
        <p className="text-[10px] font-bold text-amber-600">{weak} item(ns) com confiança baixa ou sem referência</p>
      )}
      <label className="block text-[10px] font-black uppercase text-slate-400">Limite aprovado (R$)</label>
      <input
        type="text"
        inputMode="decimal"
        value={current.limit}
        onChange={e => onChange({ ...current, limit: e.target.value })}
        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-indigo-500"
      />
      {changed && (
        <textarea
          value={current.reason}
          onChange={e => onChange({ ...current, reason: e.target.value })}
          placeholder="Motivo da alteração do limite (obrigatório)..."
          rows={2}
          className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-medium outline-none focus:border-indigo-500 resize-none"
        />
      )}
    </div>
  );
};
