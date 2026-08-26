/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TrendingUp, FileText, FileCheck2 } from 'lucide-react';
import { formatCurrency } from '../../utils';

interface DashboardStatsCardsProps {
  totalExpense: number;
  activeInvoicesCount: number;
  averageInvoiceValue: number;
  isLoading?: boolean;
  selectedCategoryName?: string;
  xmlSpendings?: any[];
  totalExpenseMissingNF?: number;
  activeInvoicesMissingNFCount?: number;
}

export const DashboardStatsCards: React.FC<DashboardStatsCardsProps> = ({
  totalExpense,
  activeInvoicesCount,
  averageInvoiceValue,
  isLoading = false,
  selectedCategoryName = '',
  xmlSpendings = [],
  totalExpenseMissingNF = 0,
  activeInvoicesMissingNFCount = 0
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Total Spend */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
          <TrendingUp className="w-24 h-24 text-indigo-700" />
        </div>
        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">
          {selectedCategoryName ? `Gasto no Período (${selectedCategoryName})` : "Gasto no Período (XML)"}
        </p>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <h3 className="text-3xl font-black text-indigo-700 tracking-tighter">
              {isLoading ? "Carregando..." : formatCurrency(totalExpense)}
            </h3>
            <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Com NF</p>
          </div>
          {totalExpenseMissingNF > 0 && (
            <div>
              <h3 className="text-xl font-black text-amber-600 tracking-tighter">
                {isLoading ? "..." : formatCurrency(totalExpenseMissingNF)}
              </h3>
              <p className="text-[9px] text-amber-600/80 font-black uppercase tracking-widest mt-0.5">Faltando NF</p>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500 font-bold mt-2">
          {selectedCategoryName ? `Filtrado pela categoria "${selectedCategoryName}"` : "Data de Emissão (dhEmi) filtrada"}
        </p>
      </div>

      {/* Invoices Amount */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
          <FileText className="w-24 h-24 text-emerald-600" />
        </div>
        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">Notas Emitidas no Período</p>
        <div className="flex items-end gap-4 flex-wrap">
          <div>
            <h3 className="text-3xl font-black text-emerald-600 tracking-tighter">
              {isLoading ? "..." : `${activeInvoicesCount} notas`}
            </h3>
            <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-0.5">Emitidas</p>
          </div>
          {activeInvoicesMissingNFCount > 0 && (
            <div>
              <h3 className="text-xl font-black text-amber-600 tracking-tighter">
                {isLoading ? "..." : `${activeInvoicesMissingNFCount} notas`}
              </h3>
              <p className="text-[9px] text-amber-600/80 font-black uppercase tracking-widest mt-0.5">Faltando</p>
            </div>
          )}
        </div>
        <p className="text-xs text-slate-500 font-bold mt-2">Total geral enviado: {xmlSpendings.length}</p>
      </div>

      {/* Invoice Average */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-md transition-shadow">
        <div className="absolute top-0 right-0 p-8 opacity-5 group-hover:scale-110 transition-transform">
          <FileCheck2 className="w-24 h-24 text-blue-600" />
        </div>
        <p className="text-[10px] font-black text-slate-600 uppercase tracking-widest mb-2">Ticket Médio por Nota</p>
        <h3 className="text-3xl font-black text-blue-600 tracking-tighter">
          {isLoading ? "..." : formatCurrency(averageInvoiceValue)}
        </h3>
        <p className="text-xs text-slate-500 font-bold mt-2">Gasto total / notas do período</p>
      </div>
    </div>
  );
};
