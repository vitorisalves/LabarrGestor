/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface PurchaseSetorPickerProps {
  setores: string[];
  value: string;
  onChange: (setor: string) => void;
}

export const PurchaseSetorPicker: React.FC<PurchaseSetorPickerProps> = ({ setores, value, onChange }) => {
  React.useEffect(() => {
    if (value) return;
    const fallback = setores[0] || '';
    if (fallback) onChange(fallback);
  }, [setores]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
      title="Setor desta compra"
    >
      {setores.length === 0 && !value && <option value="">Sem setores cadastrados</option>}
      {value && !setores.includes(value) && <option value={value}>{value}</option>}
      {setores.map(setor => <option key={setor} value={setor}>{setor}</option>)}
    </select>
  );
};
