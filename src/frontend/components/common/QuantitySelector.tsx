import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface QuantitySelectorProps {
  value?: string;
  quantity?: string;
  onChange?: (value: string) => void;
  onQuantityChange?: (value: string) => void;
  onBlur?: () => void;
  onQuantityBlur?: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onEnterKey?: () => void;
  onEnter?: () => void;
  idPrefix?: string;
  className?: string;
}

export const QuantitySelector: React.FC<QuantitySelectorProps> = ({
  value,
  quantity,
  onChange,
  onQuantityChange,
  onBlur,
  onQuantityBlur,
  onIncrement,
  onDecrement,
  onEnterKey,
  onEnter,
  idPrefix = 'qty',
  className = ''
}) => {
  const currentValue = value ?? quantity ?? '1';
  const handleChange = onChange || onQuantityChange || (() => {});
  const handleBlur = onBlur || onQuantityBlur;
  const handleEnter = onEnterKey || onEnter;

  return (
    <div className={`flex items-center bg-slate-100 rounded-xl border-2 border-transparent focus-within:border-indigo-600 transition-all overflow-hidden shrink-0 h-11 ${className}`}>
      <button 
        id={`dec-${idPrefix}`}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onDecrement();
        }}
        className="w-9 h-full text-slate-400 hover:text-indigo-600 hover:bg-slate-200 transition-all active:scale-90 flex items-center justify-center"
      >
        <ChevronDown className="w-4 h-4 font-black" />
      </button>
      <input
        id={`qty-${idPrefix}`}
        type="text"
        value={currentValue}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && handleEnter) {
            e.preventDefault();
            handleEnter();
          }
        }}
        className="w-10 h-full bg-transparent text-center font-bold text-slate-900 outline-none text-sm"
        placeholder="Qtd"
      />
      <button 
        id={`inc-${idPrefix}`}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onIncrement();
        }}
        className="w-9 h-full text-slate-400 hover:text-indigo-600 hover:bg-slate-200 transition-all active:scale-90 flex items-center justify-center"
      >
        <ChevronUp className="w-4 h-4 font-black" />
      </button>
    </div>
  );
};
