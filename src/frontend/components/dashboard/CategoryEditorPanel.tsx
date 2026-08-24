/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Search, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../utils';

interface CategoryEditorPanelProps {
  pieSearchQuery: string;
  setPieSearchQuery: (v: string) => void;
  pieCategoryFilter: string;
  setPieCategoryFilter: (v: string) => void;
  showPieProductList: boolean;
  rangeProducts: any[];
  filteredPieProducts: any[];
  normalizedCategories: any[];
  uncategorizedCount: number;
  onUpdateProductCategory: (code: string, name: string, newCategory: string) => Promise<void>;
  onUpdateProductSetor: (code: string, name: string, newSetor: string) => Promise<void>;
  setores: string[];
  setDeleteProductConfirmModal: (v: any) => void;
}

export const CategoryEditorPanel: React.FC<CategoryEditorPanelProps> = ({
  pieSearchQuery,
  setPieSearchQuery,
  pieCategoryFilter,
  setPieCategoryFilter,
  showPieProductList,
  rangeProducts,
  filteredPieProducts,
  normalizedCategories,
  uncategorizedCount,
  onUpdateProductCategory,
  onUpdateProductSetor,
  setores,
  setDeleteProductConfirmModal
}) => {
  if (!(showPieProductList || pieSearchQuery.trim().length > 0 || pieCategoryFilter !== "ALL")) {
    return null;
  }

  return (
    <div className="mt-6 pt-6 border-t border-slate-100 space-y-4 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
          <input
            type="text"
            value={pieSearchQuery}
            onChange={e => setPieSearchQuery(e.target.value)}
            placeholder="Buscar produto por nome, código, fornecedor ou categoria..."
            className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
          />
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-black uppercase text-slate-400">Filtrar Categoria:</span>
          <select
            value={pieCategoryFilter}
            onChange={e => setPieCategoryFilter(e.target.value)}
            className="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
          >
            <option value="ALL">Todas ({rangeProducts.length})</option>
            <option value="SEM_CATEGORIA">⚠️ Sem Categoria ({uncategorizedCount})</option>
            {normalizedCategories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="bg-[#1e293b] rounded-2xl border border-slate-800 p-4 max-h-[380px] overflow-y-auto space-y-2">
        {filteredPieProducts.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
            Nenhum produto encontrado para o filtro digitado
          </div>
        ) : (
          filteredPieProducts.map((p) => {
            const isUncat = !p.category || p.category === "Sem Categoria";
            return (
              <div
                key={p.key}
                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                  isUncat
                    ? "bg-[#1e293b] border-amber-500/50"
                    : "bg-[#1e293b] border-slate-700 hover:border-slate-600"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-slate-100 truncate" title={p.name}>
                      {p.name}
                    </span>
                    {p.code && (
                      <span className="text-[10px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        Ref: {p.code}
                      </span>
                    )}
                    <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                      NF: {p.invNumber}
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5 mt-1.5 text-[11px] text-slate-400 font-medium flex-wrap">
                    <span>🏢 <strong className="text-slate-300">{p.supplierName}</strong></span>
                    <span>•</span>
                    <span>📅 <strong className="text-slate-300">{p.dateStr}</strong></span>
                    <span>•</span>
                    <span>📦 Qtd: <strong className="text-slate-200">{p.quantity}</strong></span>
                    <span>•</span>
                    <span>💰 Un: <strong className="text-slate-200">{formatCurrency(p.unitPrice)}</strong></span>
                    <span>•</span>
                    <span>Total: <strong className="text-emerald-400">{formatCurrency(p.totalNet)}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-[10px] font-extrabold uppercase text-slate-400">
                    Categoria:
                  </span>
                  <select
                    value={normalizedCategories.some(c => c.name === p.category) ? p.category : (p.category !== "Sem Categoria" ? "__CUSTOM__" : "Sem Categoria")}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "__ADD_NEW__") {
                        const customCat = prompt("Digite o nome da nova categoria:");
                        if (customCat && customCat.trim()) {
                          onUpdateProductCategory(p.code, p.name, customCat.trim());
                        }
                      } else if (val !== "__CUSTOM__") {
                        onUpdateProductCategory(p.code, p.name, val);
                      }
                    }}
                    className={`text-xs font-black px-3 py-1.5 rounded-xl border outline-none cursor-pointer ${
                      isUncat
                        ? "bg-amber-950/80 text-amber-300 border-amber-700/80 focus:ring-2 focus:ring-amber-500"
                        : "bg-slate-800 text-slate-200 border-slate-700 focus:ring-2 focus:ring-emerald-500"
                    }`}
                  >
                    <option value="Sem Categoria">⚠️ Sem Categoria</option>
                    {normalizedCategories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                    {!normalizedCategories.some(c => c.name === p.category) && p.category && p.category !== "Sem Categoria" && (
                      <option value="__CUSTOM__">{p.category}</option>
                    )}
                    <option value="__ADD_NEW__">＋ Criar Nova Categoria...</option>
                  </select>

                  <span className="text-[10px] font-extrabold uppercase text-slate-400">
                    Setor:
                  </span>
                  <select
                    value={p.setor || ''}
                    onChange={(e) => onUpdateProductSetor(p.code, p.name, e.target.value)}
                    className="text-xs font-black px-3 py-1.5 rounded-xl border outline-none cursor-pointer bg-slate-800 text-slate-200 border-slate-700 focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- Selecionar --</option>
                    {setores.map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => {
                      setDeleteProductConfirmModal({
                        open: true,
                        productKey: p.key,
                        invKey: p.invKey,
                        productName: p.name,
                        productCode: p.code,
                        supplierName: p.supplierName,
                        invNumber: p.invNumber,
                        dateStr: p.dateStr,
                        totalNet: p.totalNet,
                        productIndex: p.productIndexInInvoice
                      });
                    }}
                    title="Excluir este lançamento de produto da NF"
                    className="p-2 text-rose-400 hover:text-rose-200 hover:bg-rose-900/60 rounded-xl transition-all border border-rose-800/60 bg-slate-800 cursor-pointer flex items-center justify-center shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
