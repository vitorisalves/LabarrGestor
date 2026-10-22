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
  onUpdateProductCategory: (code: string, name: string, newCategory: string, target?: { invKey: string; productIndex: number }) => Promise<void>;
  onUpdateProductSetor: (code: string, name: string, newSetor: string, target?: { invKey: string; productIndex: number }) => Promise<void>;
  applyScope: 'all' | 'single';
  setApplyScope: (v: 'all' | 'single') => void;
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
  applyScope,
  setApplyScope,
  setores,
  setDeleteProductConfirmModal
}) => {
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = React.useState('');
  const [bulkSetor, setBulkSetor] = React.useState('');
  const [isBulkApplying, setIsBulkApplying] = React.useState(false);

  if (!(showPieProductList || pieSearchQuery.trim().length > 0 || pieCategoryFilter !== "ALL")) {
    return null;
  }

  // Em "Só esta compra", a troca vale para a nota e a posição do item clicado.
  const selectedRows = filteredPieProducts.filter(p => selectedKeys.has(p.key));
  const allSelected = filteredPieProducts.length > 0 && filteredPieProducts.every(p => selectedKeys.has(p.key));
  const toggleKey = (key: string) => setSelectedKeys(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const toggleAll = () => setSelectedKeys(allSelected ? new Set() : new Set(filteredPieProducts.map(p => p.key)));

  // Aplica em sequência (cada troca parte do resultado da anterior). Em "Todas as compras",
  // o mesmo produto selecionado em várias compras é trocado uma vez só.
  const applyBulk = async (kind: 'category' | 'setor', value: string) => {
    if (!value || selectedRows.length === 0 || isBulkApplying) return;
    setIsBulkApplying(true);
    try {
      const seen = new Set<string>();
      for (const p of selectedRows) {
        if (applyScope === 'all') {
          const id = p.code ? `c:${p.code}` : `n:${p.name}`;
          if (seen.has(id)) continue;
          seen.add(id);
        }
        if (kind === 'category') await onUpdateProductCategory(p.code, p.name, value, targetOf(p));
        else await onUpdateProductSetor(p.code, p.name, value, targetOf(p));
      }
      if (kind === 'category') setBulkCategory(''); else setBulkSetor('');
      setSelectedKeys(new Set());
    } finally {
      setIsBulkApplying(false);
    }
  };

  const targetOf = (p: any) => applyScope === 'single' ? { invKey: p.invKey, productIndex: p.productIndexInInvoice } : undefined;

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

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-black uppercase text-slate-400">Aplicar troca a:</span>
        {([['single', 'Só esta compra'], ['all', 'Todas as compras do produto']] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => setApplyScope(value)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-black uppercase border cursor-pointer transition-colors ${
              applyScope === value
                ? "bg-emerald-600 text-[#ffffff] border-emerald-500"
                : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <label className="flex items-center gap-2 text-[11px] font-black uppercase text-slate-500 cursor-pointer">
          <input type="checkbox" checked={allSelected} onChange={toggleAll} className="w-4 h-4 rounded border-slate-300" />
          Selecionar todos ({filteredPieProducts.length})
        </label>
        {selectedRows.length > 0 && (
          <>
            <span className="text-[11px] font-black uppercase text-emerald-600">{selectedRows.length} selecionado(s)</span>
            <select
              value={bulkCategory}
              onChange={e => setBulkCategory(e.target.value)}
              className="py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="">-- Categoria em Lote --</option>
              {normalizedCategories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
            <button
              type="button"
              onClick={() => applyBulk('category', bulkCategory)}
              disabled={!bulkCategory || isBulkApplying}
              className="px-3 py-1.5 rounded-xl text-[11px] font-black uppercase bg-emerald-600 text-[#ffffff] disabled:opacity-40 cursor-pointer"
            >
              Aplicar Categoria
            </button>
            <select
              value={bulkSetor}
              onChange={e => setBulkSetor(e.target.value)}
              className="py-1.5 px-3 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none cursor-pointer"
            >
              <option value="">-- Setor em Lote --</option>
              {setores.map(sc => <option key={sc} value={sc}>{sc}</option>)}
            </select>
            <button
              type="button"
              onClick={() => applyBulk('setor', bulkSetor)}
              disabled={!bulkSetor || isBulkApplying}
              className="px-3 py-1.5 rounded-xl text-[11px] font-black uppercase bg-indigo-600 text-[#ffffff] disabled:opacity-40 cursor-pointer"
            >
              Aplicar Setor
            </button>
          </>
        )}
      </div>

      <div className="bg-[#1e293b] rounded-2xl border border-slate-800 p-4 max-h-[380px] overflow-y-auto space-y-2">
        {filteredPieProducts.length === 0 ? (
          <div className="py-8 text-center text-[#ffffff] text-xs font-bold uppercase tracking-wider">
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
                <input
                  type="checkbox"
                  checked={selectedKeys.has(p.key)}
                  onChange={() => toggleKey(p.key)}
                  className="w-4 h-4 shrink-0 rounded border-slate-300"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-black text-[#ffffff] truncate" title={p.name}>
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

                  <div className="flex items-center gap-2.5 mt-1.5 text-[11px] text-[#ffffff] font-medium flex-wrap">
                    <span>🏢 <strong className="text-[#ffffff]">{p.supplierName}</strong></span>
                    <span>•</span>
                    <span>📅 <strong className="text-[#ffffff]">{p.dateStr}</strong></span>
                    <span>•</span>
                    <span>📦 Qtd: <strong className="text-[#ffffff]">{p.quantity}</strong></span>
                    <span>•</span>
                    <span>💰 Un: <strong className="text-[#ffffff]">{formatCurrency(p.unitPrice)}</strong></span>
                    <span>•</span>
                    <span>Total: <strong className="text-emerald-400">{formatCurrency(p.totalNet)}</strong></span>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span className="text-[10px] font-extrabold uppercase text-[#ffffff]">
                    Categoria:
                  </span>
                  <select
                    value={normalizedCategories.some(c => c.name === p.category) ? p.category : (p.category !== "Sem Categoria" ? "__CUSTOM__" : "Sem Categoria")}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "__ADD_NEW__") {
                        const customCat = prompt("Digite o nome da nova categoria:");
                        if (customCat && customCat.trim()) {
                          onUpdateProductCategory(p.code, p.name, customCat.trim(), targetOf(p));
                        }
                      } else if (val !== "__CUSTOM__") {
                        onUpdateProductCategory(p.code, p.name, val, targetOf(p));
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

                  <span className="text-[10px] font-extrabold uppercase text-[#ffffff]">
                    Setor:
                  </span>
                  <select
                    value={p.setor || ''}
                    onChange={(e) => onUpdateProductSetor(p.code, p.name, e.target.value, targetOf(p))}
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
