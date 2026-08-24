/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ChevronDown } from 'lucide-react';

interface CategoryMultiSelectProps {
  value: string[];
  onChange: (next: string[]) => void;
  options: string[];
  className?: string;
  allowCreate?: boolean;
}

export const CategoryMultiSelect: React.FC<CategoryMultiSelectProps> = ({ value, onChange, options, className, allowCreate }) => {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Ensure any already-selected category not present in `options` (e.g. a category
  // suggested during XML reconciliation that isn't registered system-wide) still shows up.
  const displayOptions = React.useMemo(() => {
    const extras = value.filter(v => !options.includes(v));
    return [...options, ...extras];
  }, [options, value]);

  React.useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const toggle = (cat: string) => {
    if (value.includes(cat)) {
      onChange(value.filter(c => c !== cat));
    } else {
      onChange([...value, cat]);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className || ''}`}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all font-medium text-sm flex items-center justify-between text-left"
      >
        <span className="truncate">{value.length > 0 ? value.join(', ') : 'Categorias'}</span>
        <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 ml-2" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-xl shadow-lg p-2 space-y-1">
          {displayOptions.length === 0 && (
            <p className="text-xs text-slate-400 px-2 py-1">Nenhuma categoria cadastrada</p>
          )}
          {displayOptions.map(cat => (
            <label key={cat} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-50 cursor-pointer text-sm">
              <input
                type="checkbox"
                checked={value.includes(cat)}
                onChange={() => toggle(cat)}
                className="w-4 h-4 accent-indigo-600"
              />
              {cat}
            </label>
          ))}
          {allowCreate && (
            <button
              type="button"
              onClick={() => {
                const name = window.prompt('Nome da nova categoria:');
                const trimmed = name?.trim();
                if (trimmed && !value.includes(trimmed)) {
                  onChange([...value, trimmed]);
                }
              }}
              className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-slate-50 text-sm font-bold text-indigo-600"
            >
              + Nova categoria
            </button>
          )}
        </div>
      )}
    </div>
  );
};
