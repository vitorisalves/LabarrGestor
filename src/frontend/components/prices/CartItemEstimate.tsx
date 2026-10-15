import React from 'react';
import type { PriceEstimate } from '../../../shared/priceEstimation';
import type { CartItem } from '../../types';
import type { ManualPriceInput } from '../../utils/priceEstimationApi';
import { formatCurrency } from '../../utils';
import { PriceConfidenceBadge } from './PriceConfidenceBadge';

interface CartItemEstimateProps {
  item: CartItem;
  estimate?: PriceEstimate;
  onManualPrice: (manual: ManualPriceInput | null) => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const METHOD_LABEL: Record<PriceEstimate['method'], string> = {
  trend: 'tendência do histórico',
  single: 'última compra',
  cadastro: 'preço do cadastro',
  manual: 'preço informado',
  quote: 'cotação informada',
  none: 'sem referência',
};

export const CartItemEstimate: React.FC<CartItemEstimateProps> = ({ item, estimate, onManualPrice }) => {
  const [kind, setKind] = React.useState<'manual' | 'quote'>('manual');
  const [value, setValue] = React.useState('');
  const [date, setDate] = React.useState(todayIso());
  const [supplier, setSupplier] = React.useState('');

  if (!estimate) return null;

  const canInform = ['none', 'cadastro', 'manual', 'quote'].includes(estimate.method);
  const parsed = Number(value.replace(',', '.'));
  const valid = parsed > 0 && date <= todayIso() && (kind !== 'quote' || supplier.trim().length > 0);

  return (
    <div className="basis-full space-y-2 pt-2 border-t border-slate-100">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
        <PriceConfidenceBadge confidence={estimate.confidence} />
        {estimate.method !== 'none' && (
          <>
            <span>Último: {formatCurrency(estimate.lastPrice)}{estimate.lastPriceDate ? ` (${estimate.lastPriceDate.split('-').reverse().join('/')})` : ''}</span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-800">Estimado: {formatCurrency(estimate.estimatedPrice)}</span>
            <span className="text-slate-300">|</span>
            <span>Margem {estimate.marginPct.toLocaleString('pt-BR')}% → protegido {formatCurrency(estimate.protectedPrice)}</span>
            <span className="text-slate-300">|</span>
            <span className="font-medium">{METHOD_LABEL[estimate.method]}</span>
          </>
        )}
        {estimate.method === 'none' && (
          <span className="text-rose-600">Sem histórico, sem cadastro e sem cotação: informe um preço abaixo (não bloqueia a requisição).</span>
        )}
      </div>

      {canInform && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={e => setKind(e.target.value as 'manual' | 'quote')}
            className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold outline-none"
          >
            <option value="manual">Preço estimado</option>
            <option value="quote">Cotação do fornecedor</option>
          </select>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Valor"
            value={value}
            onChange={e => setValue(e.target.value)}
            className="w-24 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold outline-none focus:border-indigo-500"
          />
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={e => setDate(e.target.value)}
            className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold outline-none focus:border-indigo-500"
          />
          {kind === 'quote' && (
            <input
              type="text"
              placeholder="Fornecedor da cotação"
              value={supplier}
              onChange={e => setSupplier(e.target.value)}
              className="w-40 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold outline-none focus:border-indigo-500"
            />
          )}
          <button
            type="button"
            disabled={!valid}
            onClick={() => onManualPrice({ kind, value: parsed, date, supplierName: kind === 'quote' ? supplier.trim() || undefined : undefined })}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase disabled:opacity-40"
          >
            Aplicar
          </button>
          {item.manualPrice && (
            <button
              type="button"
              onClick={() => { onManualPrice(null); setValue(''); }}
              className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase"
            >
              Remover
            </button>
          )}
        </div>
      )}
    </div>
  );
};
