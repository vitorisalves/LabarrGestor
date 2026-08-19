/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  FileCheck2,
  XCircle,
  RefreshCcw
} from 'lucide-react';
import { formatCurrency } from '../../utils';

interface BatchImportPreviewModalProps {
  isOpen: boolean;
  batchPreview: any[];
  onClose: () => void;
  onProductCategoryChange: (invoiceIdx: number, productIdx: number, categoryId: string) => void;
  onToggleProductDeletion: (invoiceIdx: number, productIdx: number) => void;
  onBulkCategorize: () => void;
  onBulkDelete: () => void;
  onConfirm: () => Promise<void>;
  categories: any[];
  bulkCategory: string;
  setBulkCategory: (value: string) => void;
  selectedProducts: string[];
  setSelectedProducts: (value: string[]) => void;
  toggleProductSelection: (id: string) => void;
  toggleAllProducts: () => void;
  isUploading: boolean;
}

export const BatchImportPreviewModal: React.FC<BatchImportPreviewModalProps> = ({
  isOpen,
  batchPreview,
  onClose,
  onProductCategoryChange,
  onToggleProductDeletion,
  onBulkCategorize,
  onBulkDelete,
  onConfirm,
  categories,
  bulkCategory,
  setBulkCategory,
  selectedProducts,
  setSelectedProducts,
  toggleProductSelection,
  toggleAllProducts,
  isUploading
}) => {
  if (!isOpen || batchPreview.length === 0) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-4xl rounded-3xl shadow-xl border border-slate-100 overflow-hidden flex flex-col max-h-[85vh] animate-in zoom-in-95 duration-300">
        {/* Modal Header */}
        <div className="p-6 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight flex items-center gap-2">
              <FileCheck2 className="w-5 h-5 text-indigo-600" />
              Conciliação e Pré-visualização de XML em Lote
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              Revise as faturas consolidadas abaixo antes de persistir as mudanças no banco de dados.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"
          >
            <XCircle className="w-6 h-6" />
          </button>
        </div>


        {/* Modal Actions */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <select
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg px-3 py-2 outline-none focus:border-indigo-500"
            >
              <option value="">-- Selecionar Categoria --</option>
              {categories.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={onBulkCategorize}
              disabled={!bulkCategory || selectedProducts.length === 0}
              className="px-3 py-2 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-50 text-xs font-black uppercase rounded-lg transition-colors"
            >
              Categorizar Selecionados
            </button>
            <button
              type="button"
              onClick={onBulkDelete}
              disabled={selectedProducts.length === 0}
              className="px-3 py-2 bg-red-100 text-red-700 hover:bg-red-200 disabled:opacity-50 text-xs font-black uppercase rounded-lg transition-colors"
            >
              Excluir Selecionados
            </button>
          </div>
          <div className="text-xs font-bold text-slate-500">
            {selectedProducts.length} selecionados
          </div>
        </div>

        {/* Modal Body (Table) */}
        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          <div className="overflow-x-auto border border-slate-100 rounded-2xl">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-100">
                  <th className="p-3 text-center w-10">
                    <input
                      type="checkbox"
                      checked={batchPreview.length > 0 && selectedProducts.length === batchPreview.reduce((acc, inv) => acc + inv.products.length, 0)}
                      onChange={toggleAllProducts}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                  </th>
                  <th className="p-3 text-[10px] font-black text-slate-600 uppercase tracking-wider">Fornecedor / Arquivo</th>
                  <th className="p-3 text-[10px] font-black text-slate-600 uppercase tracking-wider">Produto</th>
                  <th className="p-3 text-right text-[10px] font-black text-slate-600 uppercase tracking-wider">Valor Un.</th>
                  <th className="p-3 text-right text-[10px] font-black text-slate-600 uppercase tracking-wider">Qtd</th>
                  <th className="p-3 text-[10px] font-black text-slate-600 uppercase tracking-wider">Categoria</th>
                  <th className="p-3 text-center text-[10px] font-black text-slate-600 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {batchPreview.map((inv, iIdx) => (
                  <React.Fragment key={inv.nfeKey || iIdx}>
                    {inv.products.map((prod: any, pIdx: number) => {
                      const pId = `${iIdx}-${pIdx}`;
                      const isSelected = selectedProducts.includes(pId);
                      return (
                        <tr key={pId} className={`transition-colors ${prod.deleted ? 'bg-red-50/50 opacity-60' : isSelected ? 'bg-indigo-50/50' : 'hover:bg-slate-50/50'}`}>
                          <td className="p-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleProductSelection(pId)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                            />
                          </td>
                          <td className="p-3 text-xs font-bold text-slate-900 max-w-[150px] truncate uppercase">
                            <div className="text-[10px] text-slate-400 font-normal">{inv.fileName}</div>
                            {inv.supplierName}
                          </td>
                          <td className="p-3 text-xs font-bold text-slate-800 max-w-[180px] truncate">
                            {prod.name}
                          </td>
                          <td className="p-3 text-xs font-semibold text-slate-600 text-right">{formatCurrency(prod.vUnCom)}</td>
                          <td className="p-3 text-xs font-semibold text-slate-600 text-right">{prod.quantity}</td>
                          <td className="p-3">
                            <select
                              value={prod.categoryId || ''}
                              onChange={(e) => onProductCategoryChange(iIdx, pIdx, e.target.value)}
                              className="w-full bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-lg px-2 py-1 outline-none focus:border-indigo-500"
                            >
                              <option value="">Sem Categoria</option>
                              {categories.map((c: any) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-3 text-center">
                            <button
                              type="button"
                              onClick={() => onToggleProductDeletion(iIdx, pIdx)}
                              className={`px-2 py-1 text-[10px] font-black uppercase rounded-lg ${prod.deleted ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' : 'bg-red-100 text-red-600 hover:bg-red-200'}`}
                            >
                              {prod.deleted ? 'Restaurar' : 'Excluir'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {/* Modal Footer */}
        <div className="p-6 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-black uppercase text-slate-600 hover:text-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isUploading}
            className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black uppercase rounded-2xl transition-all shadow-sm font-bold"
          >
            {isUploading ? (
              <>
                <RefreshCcw className="w-4 h-4 animate-spin" />
                Processando...
              </>
            ) : (
              <>
                <FileCheck2 className="w-4 h-4" />
                Confirmar Importação ({batchPreview.length} XMLs)
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
