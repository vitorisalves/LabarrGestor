/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { Product } from '../../types';
import { formatCurrency, normalizeText } from '../../utils';
import { SearchBar, QuantitySelector, EmptyState } from '../common';
import { CategoryMultiSelect } from './CategoryMultiSelect';
import { PurchaseSetorPicker } from './PurchaseSetorPicker';
import { useProductCatalog, CatalogRow } from '../../hooks/useProductCatalog';
import { Supplier } from '../../types';
import { getProductCategories } from '../../utils/productCategories';
import { ConfirmationModal } from '../modals/ConfirmationModal';

interface ProductsTabProps {
  suppliers: Supplier[];
  saveSupplier: (s: Supplier) => Promise<void>;
  categories: string[];
  setores: string[];
  searchTerm: string;
  setSearchTerm: (v: string) => void;
  onEditProduct: (product: Product, supplierName: string) => void;
  onOpenNewProduct?: () => void;
  onAddToCart: (product: Product, supplierName: string, quantity: number, setor: string) => void;
  purchaseSetores: Record<string, string>;
  setPurchaseSetores: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export const ProductsTab: React.FC<ProductsTabProps> = ({
  suppliers,
  saveSupplier,
  categories,
  setores,
  searchTerm,
  setSearchTerm,
  onEditProduct,
  onOpenNewProduct,
  onAddToCart,
  purchaseSetores,
  setPurchaseSetores
}) => {
  const { catalog, updateProductCategories, updateProductSetor, bulkUpdateProducts, bulkDeleteProducts } = useProductCatalog(suppliers, saveSupplier);
  const [categoryFilter, setCategoryFilter] = React.useState('ALL');
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});
  const [selectedKeys, setSelectedKeys] = React.useState<Set<string>>(new Set());
  const [bulkCategory, setBulkCategory] = React.useState('');
  const [bulkSetor, setBulkSetor] = React.useState('');
  const [isBulkDeleting, setIsBulkDeleting] = React.useState(false);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = React.useState(false);

  const rowKey = (row: CatalogRow) => `${row.supplierId}-${row.product.name}`;

  const filtered = React.useMemo(() => {
    const normalizedSearch = normalizeText(searchTerm);
    return catalog.filter(row => {
      const cats = getProductCategories(row.product);
      const matchesSearch =
        normalizeText(row.product.name).includes(normalizedSearch) ||
        normalizeText(row.supplierName).includes(normalizedSearch) ||
        cats.some(c => normalizeText(c).includes(normalizedSearch));
      if (!matchesSearch) return false;
      if (categoryFilter === 'ALL') return true;
      if (categoryFilter === 'SEM_CATEGORIA') return cats.length === 0;
      return cats.includes(categoryFilter);
    }).sort((a, b) => a.product.name.localeCompare(b.product.name));
  }, [catalog, searchTerm, categoryFilter]);

  const selectedRows = React.useMemo(
    () => filtered.filter(row => selectedKeys.has(rowKey(row))),
    [filtered, selectedKeys]
  );

  const handleQuantityChange = (key: string, value: string) => {
    if (value === '' || /^\d*[.,]?\d*$/.test(value)) {
      setQuantities(prev => ({ ...prev, [key]: value }));
    }
  };

  const handleQuantityBlur = (key: string) => {
    const val = quantities[key];
    const num = val ? parseFloat(val.replace(',', '.')) : NaN;
    if (!val || isNaN(num) || num <= 0) {
      setQuantities(prev => ({ ...prev, [key]: '1' }));
    }
  };

  const adjustQuantity = (key: string, delta: number) => {
    setQuantities(prev => {
      const val = prev[key];
      const current = (val && !isNaN(parseFloat(val.replace(',', '.')))) ? parseFloat(val.replace(',', '.')) : 1;
      const nextVal = Math.max(0, current + delta);
      return { ...prev, [key]: Number(nextVal.toFixed(3)).toString().replace('.', ',') };
    });
  };

  const toggleSelected = (key: string) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedKeys.size === filtered.length) {
      setSelectedKeys(new Set());
    } else {
      setSelectedKeys(new Set(filtered.map(rowKey)));
    }
  };

  const handleApplyBulkCategory = async () => {
    if (!bulkCategory || selectedRows.length === 0) return;
    await bulkUpdateProducts(selectedRows, { categories: [bulkCategory] });
    setBulkCategory('');
    setSelectedKeys(new Set());
  };

  const handleApplyBulkSetor = async () => {
    if (!bulkSetor || selectedRows.length === 0) return;
    await bulkUpdateProducts(selectedRows, { setor: bulkSetor });
    setBulkSetor('');
    setSelectedKeys(new Set());
  };

  const handleConfirmBulkDelete = async () => {
    setIsDeleteConfirmOpen(false);
    if (selectedRows.length === 0) return;
    setIsBulkDeleting(true);
    try {
      await bulkDeleteProducts(selectedRows);
      setSelectedKeys(new Set());
    } finally {
      setIsBulkDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight">Todos os Produtos</h2>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-black uppercase text-slate-400">Categoria:</span>
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="py-2 px-3 text-xs bg-white border border-slate-200 rounded-xl font-bold text-slate-700 outline-none cursor-pointer"
          >
            <option value="ALL">Todas ({catalog.length})</option>
            <option value="SEM_CATEGORIA">Sem Categoria</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {onOpenNewProduct && (
            <button
              onClick={onOpenNewProduct}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-sm text-xs shrink-0"
            >
              <Plus className="w-4 h-4" />
              Novo Produto
            </button>
          )}
        </div>
      </div>

      <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Buscar produto por nome, fornecedor ou categoria..." />

      {filtered.length > 0 && (
        <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedKeys.size > 0 && selectedKeys.size === filtered.length}
              onChange={toggleSelectAll}
              className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
            />
            <span>Selecionar Todos ({selectedKeys.size}/{filtered.length})</span>
          </label>

          <div className="h-4 w-px bg-slate-200" />

          <div className="flex items-center gap-2">
            <select
              value={bulkCategory}
              onChange={(e) => setBulkCategory(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500"
            >
              <option value="">-- Categoria em Lote --</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={handleApplyBulkCategory}
              disabled={!bulkCategory || selectedKeys.size === 0}
              className="px-3 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-40 text-xs font-black uppercase rounded-xl transition-colors"
            >
              Aplicar Categoria
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={bulkSetor}
              onChange={(e) => setBulkSetor(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500"
            >
              <option value="">-- Setor em Lote --</option>
              {setores.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <button
              onClick={handleApplyBulkSetor}
              disabled={!bulkSetor || selectedKeys.size === 0}
              className="px-3 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-40 text-xs font-black uppercase rounded-xl transition-colors"
            >
              Aplicar Setor
            </button>
          </div>

          <button
            onClick={() => setIsDeleteConfirmOpen(true)}
            disabled={selectedKeys.size === 0 || isBulkDeleting}
            className="ml-auto flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 disabled:opacity-40 text-xs font-black uppercase rounded-xl transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isBulkDeleting ? 'Excluindo...' : 'Excluir Selecionados'}
          </button>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState message="Nenhum produto encontrado" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map((row) => {
            const qKey = rowKey(row);
            const isSelected = selectedKeys.has(qKey);
            return (
              <div key={qKey} className={`bg-white p-6 rounded-3xl border shadow-sm flex flex-col justify-between group transition-all ${isSelected ? 'border-indigo-400 ring-1 ring-indigo-200' : 'border-slate-100 hover:border-indigo-200'}`}>
                <div>
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleSelected(qKey)}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500 mt-0.5"
                      />
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest truncate max-w-[90px]">
                        {row.supplierName}
                      </span>
                    </div>
                    <div className="flex gap-2 items-center">
                      <button onClick={() => onEditProduct(row.product, row.supplierName)} className="p-1 hover:bg-slate-100 rounded-md">
                        <Pencil className="w-3 h-3 text-slate-400 hover:text-indigo-600" />
                      </button>
                      <span className="text-xl font-black text-indigo-600">{formatCurrency(row.product.price)}</span>
                    </div>
                  </div>
                  <h4 className="font-bold mb-3 text-slate-900">{row.product.name}</h4>
                  <div className="space-y-1.5 mb-3">
                    <div className="flex items-center gap-2 bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100/50">
                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                      <span className="text-[11px] text-slate-500 font-bold uppercase">Código:</span>
                      <span className="text-[11px] text-indigo-700 font-mono font-black uppercase tracking-wider">{row.product.code || 'Não associado'}</span>
                    </div>
                    {row.product.lastPurchaseDate && (
                      <div className="flex items-center gap-2 bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100/50">
                        <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                        <span className="text-[11px] text-slate-500 font-bold uppercase">Última Compra:</span>
                        <span className="text-[11px] text-indigo-700 font-black">{row.product.lastPurchaseDate}</span>
                      </div>
                    )}
                    {row.product.paymentMethod && (
                      <div className="flex items-center gap-2 bg-emerald-50/50 px-2 py-1 rounded-lg border border-emerald-100/50">
                        <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                        <span className="text-[11px] text-slate-500 font-bold uppercase">Pagamento:</span>
                        <span className="text-[11px] text-emerald-700 font-black">{row.product.paymentMethod}</span>
                      </div>
                    )}
                  </div>
                  <CategoryMultiSelect
                    value={getProductCategories(row.product)}
                    onChange={(next) => updateProductCategories(row.supplierId, row.productIndex, next)}
                    options={categories}
                    className="mb-2"
                  />
                  <select
                    value={row.product.setor || ''}
                    onChange={(e) => updateProductSetor(row.supplierId, row.productIndex, e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-2 outline-none focus:border-indigo-500 mb-4"
                  >
                    <option value="">Sem Setor</option>
                    {setores.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 mt-auto">
                  <QuantitySelector
                    quantity={quantities[qKey] ?? '1'}
                    onQuantityChange={(val) => handleQuantityChange(qKey, val)}
                    onQuantityBlur={() => handleQuantityBlur(qKey)}
                    onIncrement={() => adjustQuantity(qKey, 1)}
                    onDecrement={() => adjustQuantity(qKey, -1)}
                    onEnter={() => onAddToCart(row.product, row.supplierName, parseFloat((quantities[qKey] ?? '1').replace(',', '.')) || 1, purchaseSetores[qKey] || setores[0] || '')}
                    idPrefix={qKey}
                  />
                  <PurchaseSetorPicker
                    setores={setores}
                    value={purchaseSetores[qKey] || ''}
                    onChange={(setor) => setPurchaseSetores(prev => ({ ...prev, [qKey]: setor }))}
                  />
                  <button
                    onClick={() => onAddToCart(row.product, row.supplierName, parseFloat((quantities[qKey] ?? '1').replace(',', '.')) || 1, purchaseSetores[qKey] || setores[0] || '')}
                    className="flex-1 h-11 bg-slate-900 text-white rounded-xl font-bold text-[10px] sm:text-xs hover:bg-indigo-600 transition-all active:scale-95"
                  >
                    Adicionar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setIsDeleteConfirmOpen(false)}
        onConfirm={handleConfirmBulkDelete}
        variant="danger"
        title="Excluir produtos selecionados?"
        message={`Isso vai remover ${selectedKeys.size} produto(s) permanentemente do catálogo dos respectivos fornecedores. Essa ação não pode ser desfeita.`}
      />
    </div>
  );
};
