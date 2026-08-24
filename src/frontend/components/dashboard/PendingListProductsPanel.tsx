/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShoppingCart, CheckCircle2, Trash2 } from 'lucide-react';
import { formatCurrency } from '../../utils';

interface PendingListProductsPanelProps {
  pendingListProducts: any[];
  isPendingLoading: boolean;
  selectedPendingIds: string[];
  bulkPendingCategory: string;
  setBulkPendingCategory: (v: string) => void;
  bulkPendingPrice: string;
  setBulkPendingPrice: (v: string) => void;
  deletePendingConfirmModal: any;
  setDeletePendingConfirmModal: (v: any) => void;
  fetchPendingListProducts: (force?: boolean) => Promise<void>;
  handlePendingPriceChange: (id: string, newPrice: number) => Promise<void>;
  handlePendingQuantityChange: (id: string, newQuantity: number) => Promise<void>;
  handlePendingCategoryChange: (id: string, newCategory: string) => Promise<void>;
  handlePendingSetorChange: (id: string, newSetor: string) => Promise<void>;
  handleToggleSelectAllPending: () => void;
  handleToggleSelectPending: (id: string) => void;
  handleApplyBulkPendingCategory: () => Promise<void>;
  handleApplyBulkPendingPrice: () => Promise<void>;
  handlePromptDeletePending: (id: string) => void;
  handlePromptBulkDeletePending: () => void;
  executeDeletePending: () => Promise<void>;
  handleConfirmPendingProducts: () => Promise<void>;
  isUploading: boolean;
  normalizedCategories: any[];
  setores: string[];
}

export const PendingListProductsPanel: React.FC<PendingListProductsPanelProps> = ({
  pendingListProducts,
  isPendingLoading,
  selectedPendingIds,
  bulkPendingCategory,
  setBulkPendingCategory,
  bulkPendingPrice,
  setBulkPendingPrice,
  deletePendingConfirmModal,
  setDeletePendingConfirmModal,
  handlePendingPriceChange,
  handlePendingQuantityChange,
  handlePendingCategoryChange,
  handlePendingSetorChange,
  handleToggleSelectAllPending,
  handleToggleSelectPending,
  handleApplyBulkPendingCategory,
  handleApplyBulkPendingPrice,
  handlePromptDeletePending,
  handlePromptBulkDeletePending,
  executeDeletePending,
  handleConfirmPendingProducts,
  isUploading,
  normalizedCategories,
  setores
}) => {
  return (
    <>
      {/* SEÇÃO: PRODUTOS PENDENTES DAS LISTAS DE COMPRAS */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6 animate-in fade-in duration-300">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 rounded-2xl border border-amber-100 text-amber-600">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  Produtos das Listas de Compras
                </h2>
                {pendingListProducts.length > 0 && (
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-black rounded-full">
                    {pendingListProducts.length} pendente(s)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-bold mt-0.5">
                Produtos checados em "Minhas Listas". Configure a categoria e o valor para confirmar e incluir nos gráficos de gastos.
              </p>
            </div>
          </div>

          {pendingListProducts.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmPendingProducts}
              disabled={isUploading}
              className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded-2xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 font-bold"
            >
              <CheckCircle2 className="w-4 h-4" />
              {selectedPendingIds.length > 0
                ? `Confirmar ${selectedPendingIds.length} Selecionado(s)`
                : `Confirmar Todos os ${pendingListProducts.length} Produtos`}
            </button>
          )}
        </div>

        {isPendingLoading ? (
          <div className="py-8 text-center text-xs font-bold text-slate-400">
            Carregando produtos das listas...
          </div>
        ) : pendingListProducts.length === 0 ? (
          <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-black text-slate-500 uppercase">Nenhum produto pendente de confirmação</p>
            <p className="text-[11px] text-slate-400 font-bold mt-1">
              Ao dar check num item em "Minhas Listas", ele aparecerá aqui para você definir a categoria, valor e confirmar a entrada nos gráficos.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Controles em Lote */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPendingIds.length > 0 && selectedPendingIds.length === pendingListProducts.length}
                    onChange={handleToggleSelectAllPending}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span>Selecionar Todos ({selectedPendingIds.length}/{pendingListProducts.length})</span>
                </label>

                <div className="h-4 w-px bg-slate-200 hidden sm:block" />

                {/* Alteração em Lote: Categoria */}
                <div className="flex items-center gap-2">
                  <select
                    value={bulkPendingCategory}
                    onChange={(e) => setBulkPendingCategory(e.target.value)}
                    className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Categoria em Lote --</option>
                    {normalizedCategories.map((c: any) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleApplyBulkPendingCategory}
                    disabled={!bulkPendingCategory || selectedPendingIds.length === 0}
                    className="px-3 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-40 text-xs font-black uppercase rounded-xl transition-colors cursor-pointer"
                  >
                    Aplicar Categoria
                  </button>
                </div>

                {/* Alteração em Lote: Valor */}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Valor R$ em lote"
                    value={bulkPendingPrice}
                    onChange={(e) => setBulkPendingPrice(e.target.value)}
                    className="w-32 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleApplyBulkPendingPrice}
                    disabled={!bulkPendingPrice || selectedPendingIds.length === 0}
                    className="px-3 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-40 text-xs font-black uppercase rounded-xl transition-colors cursor-pointer"
                  >
                    Aplicar Valor
                  </button>
                </div>
              </div>

              {/* Excluir em Lote */}
              <button
                type="button"
                onClick={handlePromptBulkDeletePending}
                disabled={selectedPendingIds.length === 0}
                className="px-3.5 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 disabled:opacity-40 text-xs font-black uppercase rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ml-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Selecionados
              </button>
            </div>

            {/* Tabela de Produtos Pendentes */}
            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                    <th className="p-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedPendingIds.length > 0 && selectedPendingIds.length === pendingListProducts.length}
                        onChange={handleToggleSelectAllPending}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                      />
                    </th>
                    <th className="p-3.5">Produto</th>
                    <th className="p-3.5">Fornecedor</th>
                    <th className="p-3.5">Origem</th>
                    <th className="p-3.5 w-24">Qtd</th>
                    <th className="p-3.5 w-36">Valor Unit. (R$)</th>
                    <th className="p-3.5 w-36">Total (R$)</th>
                    <th className="p-3.5 w-48">Categoria</th>
                    <th className="p-3.5 w-40">Setor</th>
                    <th className="p-3.5 w-16 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {pendingListProducts.map((p) => {
                    const isSelected = selectedPendingIds.includes(p.id);
                    const qty = Number(p.quantity || 1);
                    const unitPrice = Number(p.price || 0);
                    const totalPrice = qty * unitPrice;

                    return (
                      <tr key={p.id} className={`hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-indigo-50/40' : ''}`}>
                        <td className="p-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectPending(p.id)}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                          />
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">{p.productName}</td>
                        <td className="p-3.5 text-slate-600 font-medium">{p.supplierName}</td>
                        <td className="p-3.5 text-slate-500 font-medium text-[11px]">{p.listName || 'Minhas Listas'}</td>
                        <td className="p-3.5 font-bold text-slate-800">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={p.quantity !== undefined ? p.quantity : 1}
                            onChange={(e) => handlePendingQuantityChange(p.id, parseInt(e.target.value, 10) || 1)}
                            className="w-16 bg-white border border-slate-200 text-slate-800 font-bold rounded-lg px-2 py-1 text-xs outline-none focus:border-indigo-500 text-center"
                          />
                        </td>
                        <td className="p-3.5">
                          <input
                            type="number"
                            step="0.01"
                            value={p.price !== undefined ? p.price : ''}
                            onChange={(e) => handlePendingPriceChange(p.id, parseFloat(e.target.value) || 0)}
                            className="w-28 bg-white border border-slate-200 text-slate-800 font-bold rounded-lg px-2.5 py-1 text-xs outline-none focus:border-indigo-500"
                          />
                        </td>
                        <td className="p-3.5 font-black text-indigo-700">
                          {formatCurrency(totalPrice)}
                        </td>
                        <td className="p-3.5">
                          <select
                            value={p.category || ''}
                            onChange={(e) => handlePendingCategoryChange(p.id, e.target.value)}
                            className="w-full bg-white border border-slate-200 text-slate-800 font-bold rounded-lg px-2.5 py-1 text-xs outline-none focus:border-indigo-500"
                          >
                            <option value="">-- Selecionar --</option>
                            {normalizedCategories.map((c: any) => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3.5">
                          <select
                            value={p.setor || ''}
                            onChange={(e) => handlePendingSetorChange(p.id, e.target.value)}
                            className="w-full bg-white border border-slate-200 text-slate-800 font-bold rounded-lg px-2.5 py-1 text-xs outline-none focus:border-indigo-500"
                          >
                            <option value="">-- Selecionar --</option>
                            {setores.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handlePromptDeletePending(p.id)}
                            title="Excluir produto pendente"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border-0 bg-transparent"
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
          </div>
        )}
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE PRODUTO PENDENTE (REGRA 11) */}
      {deletePendingConfirmModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white max-w-md w-full p-6 rounded-3xl shadow-xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-50 rounded-2xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Confirmar Exclusão
              </h3>
            </div>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              {deletePendingConfirmModal.isBulk
                ? `Tem certeza que deseja excluir os ${deletePendingConfirmModal.idsToDelete.length} produto(s) selecionado(s) da lista pendente? Esta ação removerá os itens permanentemente da fila.`
                : `Tem certeza que deseja excluir este produto da lista pendente do dashboard?`}
            </p>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletePendingConfirmModal({ open: false, idsToDelete: [], isBulk: false })}
                className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeDeletePending}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase transition-colors shadow-sm cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
