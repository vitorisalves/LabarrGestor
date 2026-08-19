/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Trash2, RefreshCcw, FileCheck2, AlertCircle, ArrowUpRight } from 'lucide-react';
import { formatCurrency } from '../../utils';

interface PriceIncreasesTableProps {
  priceIncreases: any[];
  isPriceIncreasesLoading: boolean;
  selectedIncreases: string[];
  onToggleSelectAll: () => void;
  onToggleSelect: (id: string) => void;
  onDeleteIncrease: (id: string) => Promise<void>;
  onBulkDeleteIncreases: () => Promise<void>;
  fetchPriceIncreases: () => Promise<void>;
}

export const PriceIncreasesTable: React.FC<PriceIncreasesTableProps> = ({
  priceIncreases,
  isPriceIncreasesLoading,
  selectedIncreases,
  onToggleSelectAll,
  onToggleSelect,
  onDeleteIncrease,
  onBulkDeleteIncreases,
  fetchPriceIncreases
}) => {
  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <div className="w-2.5 h-7 bg-amber-500 rounded-full animate-pulse" />
            Produtos com Aumento na Nota Atual
          </h2>
          <p className="text-slate-600 text-xs font-bold mt-1 uppercase tracking-wider">
            Comparação automática da última compra com a penúltima compra registrada para cada produto
          </p>
        </div>

        <div className="flex items-center gap-3">
          {selectedIncreases.length > 0 && (
            <button
              onClick={onBulkDeleteIncreases}
              className="flex items-center gap-2 px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-black uppercase rounded-2xl transition-colors border-0 cursor-pointer font-bold"
            >
              <Trash2 className="w-4 h-4" />
              Excluir Selecionados ({selectedIncreases.length})
            </button>
          )}
          <button
            onClick={fetchPriceIncreases}
            disabled={isPriceIncreasesLoading}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-black uppercase rounded-2xl transition-colors border-0 cursor-pointer font-bold"
          >
            <RefreshCcw className={`w-3.5 h-3.5 ${isPriceIncreasesLoading ? 'animate-spin' : ''}`} />
            Atualizar Lista
          </button>
        </div>
      </div>

      {isPriceIncreasesLoading && priceIncreases.length === 0 ? (
        <div className="bg-slate-50 rounded-2xl p-8 text-center animate-pulse flex items-center justify-center">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Carregando aumentos...</span>
        </div>
      ) : priceIncreases.length === 0 ? (
        <div className="bg-slate-50 rounded-2xl p-10 text-center flex flex-col items-center justify-center border-2 border-dashed border-slate-200">
          <FileCheck2 className="w-12 h-12 text-slate-300" />
          <p className="text-slate-500 font-bold text-xs uppercase tracking-wide mt-3">Nenhum aumento pendente nesta lista</p>
          <p className="text-slate-400 text-[10px] uppercase tracking-wider mt-1">Os aumentos identificados nos próximos XMLs importados aparecerão aqui e persistirão até que você os exclua.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 pb-2">
                <th className="py-3 pl-3 w-10">
                  <input
                    type="checkbox"
                    checked={priceIncreases.length > 0 && selectedIncreases.length === priceIncreases.length}
                    onChange={onToggleSelectAll}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                  />
                </th>
                <th className="text-[10px] font-black uppercase text-slate-400 py-3">Produto</th>
                <th className="text-[10px] font-black uppercase text-slate-400 py-3">Fornecedor</th>
                <th className="text-[10px] font-black uppercase text-slate-400 py-3 text-right">Preço Penúltimo</th>
                <th className="text-[10px] font-black uppercase text-slate-400 py-3 text-right">Preço Último</th>
                <th className="text-[10px] font-black uppercase text-slate-400 py-3 text-right">Aumento</th>
                <th className="text-[10px] font-black uppercase text-slate-400 py-3 text-center">Data Importação</th>
                <th className="text-[10px] font-black uppercase text-slate-400 py-3 text-right pr-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {priceIncreases.map((item) => {
                let formattedDate = item.invoiceDate || "";
                try {
                  if (formattedDate) {
                    const datePart = formattedDate.split('T')[0];
                    const parts = datePart.split('-');
                    if (parts.length === 3) {
                      formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                    }
                  }
                } catch {}

                return (
                  <tr key={item.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="py-3.5 pl-3">
                      <input
                        type="checkbox"
                        checked={selectedIncreases.includes(item.id)}
                        onChange={() => onToggleSelect(item.id)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 cursor-pointer"
                      />
                    </td>
                    <td className="py-3.5 pr-2">
                      <div className="font-bold text-slate-900 text-sm">
                        {item.productName}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        <span className="text-[9px] bg-slate-100 dark:bg-[#1e293b] text-slate-600 px-1.5 py-0.5 rounded font-mono font-bold">
                          CÓD: {item.productCode}
                        </span>
                        {item.alreadyImported && (
                          <span className="inline-flex items-center gap-1 text-[9px] font-black text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                            <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
                            NOTA JÁ IMPORTADA ANTERIORMENTE
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3.5 text-slate-700 font-bold text-xs">
                      {item.supplierName}
                    </td>
                    <td className="py-3.5 text-right font-mono text-sm text-slate-500 font-bold">
                      {formatCurrency(item.oldPrice)}
                    </td>
                    <td className="py-3.5 text-right font-mono text-sm font-black text-slate-900">
                      {formatCurrency(item.newPrice)}
                    </td>
                    <td className="py-3.5 text-right">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-[#1e293b] text-red-700 rounded-lg text-xs font-black tracking-tight">
                        <ArrowUpRight className="w-3.5 h-3.5 text-red-600 shrink-0" />
                        +{item.percentIncrease.toFixed(1)}%
                      </span>
                    </td>
                    <td className="py-3.5 text-center text-slate-700 font-bold text-xs whitespace-nowrap">
                      {formattedDate}
                    </td>
                    <td className="py-3.5 text-right pr-3">
                      <button
                        onClick={() => onDeleteIncrease(item.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all border-0 cursor-pointer bg-transparent"
                        title="Excluir da lista"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
