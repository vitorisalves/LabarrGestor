/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { PieChart, AlertTriangle, CheckCircle, Pencil, Check, X } from 'lucide-react';
import { format, startOfMonth, endOfMonth, isWithinInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { formatCurrency } from '../utils';
import { useSetorLimits } from '../hooks/useSetorLimits';

interface SectorDashboardViewProps {
  setores: string[];
  invoices: any[];
  isLoading?: boolean;
}

const parseDateSafe = (dateStr: string): Date | null => {
  if (!dateStr) return null;
  try {
    if (dateStr.includes('T')) return parseISO(dateStr);
    const [y, m, d] = dateStr.split('-').map(Number);
    if (y && m && d) return new Date(y, m - 1, d);
    return parseISO(dateStr);
  } catch {
    return null;
  }
};

export const SectorDashboardView: React.FC<SectorDashboardViewProps> = ({ setores, invoices, isLoading = false }) => {
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });
  const { setorLimits, updateSetorLimit } = useSetorLimits();
  const [editingSetor, setEditingSetor] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const spendBySetor = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const monthDate = new Date(y, m - 1, 1);
    const start = startOfMonth(monthDate);
    const end = endOfMonth(monthDate);

    const map = new Map<string, number>();

    invoices.forEach((inv: any) => {
      // Entradas confirmadas pela lista de compras (source 'shopping_list') não são
      // NF de verdade - ficam de fora daqui, só entram em "Faltando NF" abaixo.
      if (inv.source === 'shopping_list') return;
      const dateStr = inv.date || inv.dhEmi || inv.createdAt;
      if (!dateStr) return;
      const spendingDate = parseDateSafe(dateStr);
      if (!spendingDate || !isWithinInterval(spendingDate, { start, end })) return;

      (inv.products || []).filter((p: any) => !p.deleted).forEach((p: any) => {
        if (!p.setor) return;
        const val = p.totalNet !== undefined
          ? p.totalNet
          : (p.vUnCom || p.price || 0) * (p.quantity || 1);
        map.set(p.setor, (map.get(p.setor) || 0) + val);
      });
    });

    return map;
  }, [invoices, selectedMonth]);

  // Mesma lógica de saldo do "Faltando NF" do Dashboard XML, só que por setor:
  // cada produto confirmado Sem NF soma na dívida daquele setor, e cada NF real
  // (produto com o mesmo setor, valor bruto antes de desconto) abate essa dívida,
  // olhando para trás desde o início até o fim do mês selecionado.
  const missingNFBySetor = useMemo(() => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const end = endOfMonth(new Date(y, m - 1, 1));

    const semNF = new Map<string, number>();
    const realNF = new Map<string, number>();

    invoices.forEach((inv: any) => {
      const dateStr = inv.date || inv.dhEmi || inv.createdAt;
      if (!dateStr) return;
      const spendingDate = parseDateSafe(dateStr);
      if (!spendingDate || spendingDate > end) return;

      const isMissing = inv.source === 'shopping_list' && inv.hasNF !== true;

      (inv.products || []).filter((p: any) => !p.deleted).forEach((p: any) => {
        if (!p.setor) return;
        if (isMissing) {
          const val = p.totalNet !== undefined
            ? p.totalNet
            : (p.vUnCom || p.price || 0) * (p.quantity || 1);
          semNF.set(p.setor, (semNF.get(p.setor) || 0) + val);
        } else if (inv.source !== 'shopping_list') {
          const grossVal = (p.vUnComGross || p.vUnCom || p.price || 0) * (p.quantity || 1);
          realNF.set(p.setor, (realNF.get(p.setor) || 0) + grossVal);
        }
      });
    });

    const result = new Map<string, number>();
    const allSetores = new Set([...semNF.keys(), ...realNF.keys()]);
    allSetores.forEach(s => {
      result.set(s, Math.max(0, (semNF.get(s) || 0) - (realNF.get(s) || 0)));
    });
    return result;
  }, [invoices, selectedMonth]);

  const startEdit = (setor: string) => {
    setEditingSetor(setor);
    setEditValue(String(setorLimits[setor] || ''));
  };

  const saveEdit = (setor: string) => {
    const val = parseFloat(editValue.replace(',', '.')) || 0;
    updateSetorLimit(setor, val);
    setEditingSetor(null);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="space-y-8"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <h2 className="text-xl md:text-2xl font-black text-slate-900 tracking-tight mb-1 uppercase flex items-center gap-3">
            <PieChart className="w-6 h-6 text-indigo-700" />
            Gasto por Setor
          </h2>
          <p className="text-slate-600 text-[10px] font-black uppercase tracking-wider">Gasto mensal por setor comparado ao limite configurado</p>
        </div>
        <select
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="bg-slate-50 border border-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-100 cursor-pointer"
        >
          {Array.from({ length: 24 }, (_, i) => {
            const d = new Date();
            d.setDate(1);
            d.setMonth(d.getMonth() - i);
            const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const label = format(d, 'MMMM/yyyy', { locale: ptBR });
            return <option key={value} value={value}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>;
          })}
        </select>
      </div>

      {isLoading ? (
        <div className="bg-white p-12 rounded-3xl border border-slate-100 shadow-sm text-center">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Carregando dados...</span>
        </div>
      ) : setores.length === 0 ? (
        <div className="bg-white p-12 rounded-3xl border border-dashed border-slate-200 text-center">
          <p className="text-slate-500 font-bold text-sm uppercase">Nenhum setor cadastrado</p>
          <p className="text-slate-400 text-xs mt-1">Crie setores em Configurações para acompanhar o gasto aqui.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {setores.map(setor => {
            const spent = spendBySetor.get(setor) || 0;
            const missingNF = missingNFBySetor.get(setor) || 0;
            const limit = setorLimits[setor] || 0;
            const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
            const overLimit = limit > 0 && spent > limit;
            const isEditing = editingSetor === setor;

            return (
              <div key={setor} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">{setor}</h3>
                  {overLimit ? (
                    <AlertTriangle className="w-5 h-5 text-rose-500" />
                  ) : limit > 0 ? (
                    <CheckCircle className="w-5 h-5 text-emerald-500" />
                  ) : null}
                </div>

                <div className="flex items-end gap-3 flex-wrap">
                  <div>
                    <span className="text-2xl font-black text-slate-900">{formatCurrency(spent)}</span>
                    <span className="text-xs font-bold text-slate-400 ml-1">gasto no mês</span>
                  </div>
                  {missingNF > 0 && (
                    <div>
                      <span className="text-base font-black text-amber-600">{formatCurrency(missingNF)}</span>
                      <p className="text-[9px] text-amber-600/80 font-black uppercase tracking-widest">Faltando NF</p>
                    </div>
                  )}
                </div>

                {limit > 0 && (
                  <div className="choc-bar w-full">
                    <div
                      className={`choc-bar-fill ${overLimit ? 'is-over' : ''}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}

                <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                  <span className="text-[10px] font-bold text-slate-400 uppercase">Limite Mensal</span>
                  {isEditing ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        step="0.01"
                        autoFocus
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit(setor);
                          if (e.key === 'Escape') setEditingSetor(null);
                        }}
                        className="w-24 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 outline-none focus:border-indigo-500"
                      />
                      <button onClick={() => saveEdit(setor)} className="p-1 text-emerald-600 hover:bg-emerald-50 rounded-md">
                        <Check className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => setEditingSetor(null)} className="p-1 text-slate-400 hover:bg-slate-100 rounded-md">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => startEdit(setor)}
                      className="flex items-center gap-1.5 text-xs font-black text-slate-700 hover:text-indigo-600"
                    >
                      {limit > 0 ? formatCurrency(limit) : 'Definir limite'}
                      <Pencil className="w-3 h-3 text-slate-400" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
};
