/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { RotateCcw } from 'lucide-react';
import { ConfirmationModal } from '../modals/ConfirmationModal';

interface ResetListSpendingsButtonProps {
  start: Date;
  end: Date;
  periodLabel: string;
  onDone?: () => void | Promise<void>;
}

export const ResetListSpendingsButton: React.FC<ResetListSpendingsButtonProps> = ({ start, end, periodLabel, onDone }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const [isResetting, setIsResetting] = React.useState(false);

  const handleConfirm = async () => {
    setIsOpen(false);
    setIsResetting(true);
    try {
      const res = await fetch('/api/xml/list-spendings/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ start: start.toISOString(), end: end.toISOString() })
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await onDone?.();
    } catch (err) {
      console.error('Erro ao resetar gastos das listas:', err);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        disabled={isResetting}
        className="flex items-center gap-2 px-4 py-3 bg-white border border-red-100 text-red-600 text-[10px] font-black uppercase tracking-wider rounded-xl hover:bg-red-50 disabled:opacity-50 transition-all active:scale-95"
        title="Remove os gastos vindos das listas de compras no período; notas fiscais não são afetadas"
      >
        <RotateCcw className={`w-4 h-4 ${isResetting ? 'animate-spin' : ''}`} />
        Resetar gastos das listas
      </button>
      <ConfirmationModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={handleConfirm}
        title="Resetar gastos das listas"
        message={`Isso vai remover os gastos lançados a partir das listas de compras em ${periodLabel}. As notas fiscais não serão afetadas. Essa ação não pode ser desfeita.`}
        confirmText="Resetar"
      />
    </>
  );
};
