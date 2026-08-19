/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Plus, 
  Search, 
  Building2, 
  Phone, 
  Package, 
  Pencil, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  Download,
  Upload,
  RefreshCcw,
  Copy,
  ExternalLink,
  FileText,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { Supplier, Product } from '../types';
import { formatCurrency, normalizeText, copyToClipboard } from '../utils';
import { SearchBar, QuantitySelector, EmptyState } from './common';
import { XmlImportTab, ImportRow } from './suppliers/XmlImportTab';
import { useXmlImport } from '../hooks/useXmlImport';

interface SuppliersViewProps {
  suppliers: Supplier[];
  allSuppliers: Supplier[];
  categories?: string[];
  isLoading?: boolean;
  onRefresh?: () => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  setIsAdding: (adding: boolean) => void;
  handleEditSupplier: (supplier: Supplier) => void;
  setSupplierToDelete: (id: string | null) => void;
  addToCart: (product: Product, supplierName: string, quantity: number) => void;
  handleExportExcel: () => void;
  handleImportExcel: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSyncSheets?: () => void;
  activeTab?: 'fornecedores' | 'mercado' | 'materiais' | 'importar_xml';
  onTabChange?: (tab: 'fornecedores' | 'mercado' | 'materiais' | 'importar_xml') => void;
  addNotification?: (message: string, count: number, type?: 'cart' | 'info') => void;
  onEditProduct: (product: Product, supplierName: string) => void;
  saveSupplier: (supplier: Supplier) => Promise<void>;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({
  suppliers,
  allSuppliers,
  categories = [],
  isLoading,
  onRefresh,
  searchTerm,
  setSearchTerm,
  setIsAdding,
  handleEditSupplier,
  setSupplierToDelete,
  addToCart,
  handleExportExcel,
  handleImportExcel,
  handleSyncSheets,
  activeTab: externalTab,
  onTabChange,
  addNotification,
  onEditProduct,
  saveSupplier
}) => {
  const [internalTab, setInternalTab] = React.useState<'fornecedores' | 'mercado' | 'materiais' | 'importar_xml'>('fornecedores');
  const activeSubTab = externalTab || internalTab;
  const setActiveSubTab = onTabChange || setInternalTab;

  const availableCategories = React.useMemo(() => {
    const defaults = ['Ingredientes', 'Embalagens', 'Limpeza', 'Escritório', 'Fornecedor'];
    if (categories && Array.isArray(categories) && categories.length > 0) {
      const combined = [...categories, ...defaults];
      return Array.from(new Set(combined.filter(Boolean)));
    }
    return defaults;
  }, [categories]);

  // --- HOOK PARA IMPORTAÇÃO DE XML ---
  const {
    importRows,
    setImportRows,
    isAnalyzing,
    xmlLogs,
    setXmlLogs,
    dragActive,
    setDragActive,
    deletingRowId,
    setDeletingRowId,
    handleXmlFiles,
    handleSaveImport,
    updateRow,
    findExactMatch
  } = useXmlImport(allSuppliers, saveSupplier, addNotification);

  const [expandedSupplier, setExpandedSupplier] = React.useState<string | null>(null);
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});

  const marketSupplier = allSuppliers.find(s => s.name.toUpperCase() === 'MERCADO');
  const materialsSupplier = allSuppliers.find(s => s.name.toUpperCase() === 'MATERIAIS');

  const handleAddChannelProduct = (channel: 'MERCADO' | 'MATERIAIS') => {
    const existingSupplier = allSuppliers.find(s => s.name.toUpperCase() === channel);
    if (existingSupplier) {
      handleEditSupplier(existingSupplier);
    } else {
      // Create a virtual supplier for this channel if it doesn't exist
      handleEditSupplier({
        id: `CHANNEL_${channel}`,
        name: channel,
        phone: '00000000000',
        products: []
      });
    }
  };

  const handleQuantityChange = (key: string, value: string) => {
    // Permite vazio, números inteiros ou decimais com ponto ou vírgula
    if (value === '' || /^\d*[.,]?\d*$/.test(value)) {
      setQuantities(prev => ({ ...prev, [key]: value }));
    }
  };

  const handleQuantityBlur = (key: string) => {
    // Se estiver vazio ou inválido volta para 1
    const val = quantities[key];
    if (val === undefined || val === null || val === '') {
      setQuantities(prev => ({ ...prev, [key]: '1' }));
      return;
    }
    const num = parseFloat(val.replace(',', '.'));
    if (isNaN(num) || num <= 0) {
      setQuantities(prev => ({ ...prev, [key]: '1' }));
    }
  };

  const adjustQuantity = (key: string, delta: number) => {
    setQuantities(prev => {
      const val = prev[key];
      const current = (val && !isNaN(parseFloat(val.replace(',', '.')))) ? parseFloat(val.replace(',', '.')) : 1;
      const newVal = Math.max(0, current + delta);
      return { ...prev, [key]: Number(newVal.toFixed(3)).toString().replace('.', ',') };
    });
  };

  const onAddToCart = (product: any, supplierName: string, key: string) => {
    const val = quantities[key] || '1';
    let qty = parseFloat(val.replace(',', '.'));
    if (isNaN(qty) || qty <= 0) {
      qty = 1;
    }
    addToCart(product, supplierName, qty);
    setQuantities(prev => ({ ...prev, [key]: '1' }));
  };

  const handleCopy = async (text: string, type: string) => {
    const success = await copyToClipboard(text);
    if (success && addNotification) {
      addNotification(`${type} copiado!`, 1, 'info');
    }
  };

  const isLink = (text: string) => {
    return text.includes('http://') || text.includes('https://') || text.includes('www.');
  };

  const filteredSuppliers = suppliers
    .filter(s => {
      const normalizedSearch = normalizeText(searchTerm);
      return normalizeText(s.name).includes(normalizedSearch) ||
        s.products.some(p => normalizeText(p.name).includes(normalizedSearch));
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-8"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tight mb-1 md:mb-2 text-balance">Gestão de Compras</h1>
            <p className="text-sm md:text-base text-slate-500 font-medium">Controle de fornecedores e itens por canal</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          {[
          { id: 'fornecedores', label: 'Fornecedores' },
          { id: 'mercado', label: 'Mercado' },
          { id: 'materiais', label: 'Materiais' },
          { id: 'importar_xml', label: 'Importar XML' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`px-6 py-2 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all whitespace-nowrap ${
              activeSubTab === tab.id 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'fornecedores' && (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight">Lista de Fornecedores</h2>
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <button
                onClick={handleSyncSheets}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 border-2 border-indigo-100 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-all shadow-sm text-xs"
              >
                <RefreshCcw className="w-4 h-4" />
                Atualizar Planilha
              </button>
              <button
                onClick={handleExportExcel}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm text-xs"
              >
                <Download className="w-4 h-4" />
                Exportar
              </button>
              <label className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm cursor-pointer text-xs">
                <Upload className="w-4 h-4" />
                Importar
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
              </label>
              <button
                onClick={() => setIsAdding(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 text-xs"
              >
                <Plus className="w-4 h-4" />
                Novo
              </button>
            </div>
          </div>

          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar..."
          />

          {filteredSuppliers.length === 0 ? (
            <EmptyState message="Nenhum fornecedor ou produto encontrado" />
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredSuppliers.map((supplier, sIdx) => (
              <motion.div
                layout
                key={`${supplier.id || 's'}-${sIdx}`}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-indigo-100"
              >
                <div 
                  onClick={() => setExpandedSupplier(expandedSupplier === supplier.id ? null : supplier.id)}
                  className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                >
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-900 rounded-xl flex items-center justify-center border border-slate-800 shadow-sm">
                        <Building2 className="w-6 h-6 md:w-7 md:h-7 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 
                            className={`text-xl font-bold mb-0.5 md:mb-1 tracking-tight uppercase ${isLink(supplier.name) ? 'text-indigo-600 hover:underline cursor-pointer' : 'text-slate-800'}`}
                            onClick={(e) => {
                              if (isLink(supplier.name)) {
                                e.stopPropagation();
                                handleCopy(supplier.name, 'Link');
                              }
                            }}
                          >
                            {supplier.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-3 text-slate-400 font-bold text-[10px] uppercase tracking-tight">
                          <span 
                            className="flex items-center gap-1 hover:text-indigo-500 transition-colors cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(supplier.phone, 'Telefone');
                            }}
                            title="Clique para copiar"
                          >
                            <Phone className="w-3 h-3" />
                            {supplier.phone}
                          </span>
                          <span className="flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {supplier.products.length} itens
                          </span>
                        </div>
                      </div>
                    </div>
                  
                  <div className="flex items-center justify-between md:justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditSupplier(supplier)}
                        className="p-2.5 text-black hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setSupplierToDelete(supplier.id)}
                        className="p-2.5 text-black hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                    <button
                      onClick={() => setExpandedSupplier(expandedSupplier === supplier.id ? null : supplier.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold uppercase text-[10px] transition-all border ${
                        expandedSupplier === supplier.id 
                          ? 'bg-slate-100 border-slate-200 text-slate-700' 
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {expandedSupplier === supplier.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {expandedSupplier === supplier.id ? 'Ocultar' : 'Produtos'}
                    </button>
                  </div>
                </div>

                <motion.div
                  initial={false}
                  animate={{ height: expandedSupplier === supplier.id ? 'auto' : 0 }}
                  className="overflow-hidden bg-slate-50/20"
                >
                  <div className="p-6 pt-0 border-t border-slate-50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
                      {supplier.products
                        .filter(p => {
                          if (!searchTerm) return true;
                          const normalizedSearch = normalizeText(searchTerm);
                          return normalizeText(p.name).includes(normalizedSearch) || 
                            normalizeText(p.category).includes(normalizedSearch) ||
                            normalizeText(supplier.name).includes(normalizedSearch);
                        })
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((product, idx) => {
                          const qKey = `${supplier.id || 'sup'}-${String(product.name)}-${idx}`;
                          return (
                            <div key={qKey} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:border-indigo-200 transition-all">
                              <div>
                                <div className="flex justify-between items-start mb-3">
                                  <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-wider">
                                    {product.category}
                                  </span>
                                  <div className='flex gap-2 items-center'>
                                    <button onClick={() => onEditProduct(product, supplier.name)} className='p-1 hover:bg-slate-100 rounded-md'>
                                      <Pencil className="w-3 h-3 text-slate-400 hover:text-indigo-600" />
                                    </button>
                                    <span className="text-xl font-black text-indigo-600">
                                      {formatCurrency(product.price)}
                                    </span>
                                  </div>
                                </div>
                                <h4 
                                  className={`font-bold mb-3 transition-colors ${isLink(product.name) ? 'text-indigo-600 hover:underline cursor-pointer' : 'text-slate-900'}`}
                                  onClick={(e) => {
                                    if (isLink(product.name)) {
                                      e.stopPropagation();
                                      handleCopy(product.name, 'Link');
                                    }
                                  }}
                                >
                                  {product.name}
                                </h4>
                                <div className="space-y-1.5 mb-6">
                                  <div className="flex items-center gap-2 bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100/50">
                                    <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                                    <span className="text-[11px] text-slate-500 font-bold uppercase">Código:</span>
                                    <span className="text-[11px] text-indigo-700 font-mono font-black uppercase tracking-wider">{product.code || 'Não associado'}</span>
                                  </div>
                                  {product.lastPurchaseDate && (
                                    <div className="flex items-center gap-2 bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100/50">
                                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                                      <span className="text-[11px] text-slate-500 font-bold uppercase">Última Compra:</span>
                                      <span className="text-[11px] text-indigo-700 font-black">{product.lastPurchaseDate}</span>
                                    </div>
                                  )}
                                  {product.paymentMethod && (
                                    <div className="flex items-center gap-2 bg-emerald-50/50 px-2 py-1 rounded-lg border border-emerald-100/50">
                                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                      <span className="text-[11px] text-slate-500 font-bold uppercase">Pagamento:</span>
                                      <span className="text-[11px] text-emerald-700 font-black">{product.paymentMethod}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2 mt-auto">
                                <QuantitySelector
                                  quantity={quantities[qKey] ?? '1'}
                                  onQuantityChange={(val) => handleQuantityChange(qKey, val)}
                                  onQuantityBlur={() => handleQuantityBlur(qKey)}
                                  onIncrement={() => adjustQuantity(qKey, 1)}
                                  onDecrement={() => adjustQuantity(qKey, -1)}
                                  onEnter={() => onAddToCart(product, supplier.name, qKey)}
                                  idPrefix={qKey}
                                />
                                <button
                                  id={`add-${qKey}`}
                                  onClick={() => onAddToCart(product, supplier.name, qKey)}
                                  className="flex-1 h-11 bg-slate-900 text-white rounded-xl font-bold text-[10px] sm:text-xs hover:bg-indigo-600 transition-all active:scale-95"
                                >
                                  Adicionar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            ))}
          </div>
          )}
        </div>
      )}

      {activeSubTab === 'mercado' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Produtos de Mercado</h2>
            <button
              onClick={() => handleAddChannelProduct('MERCADO')}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 text-xs"
            >
              <Plus className="w-4 h-4" />
              Gerenciar Produtos
            </button>
          </div>

          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar produtos no mercado..."
          />

          {!marketSupplier || marketSupplier.products.length === 0 ? (
            <EmptyState title="Canal Mercado" message="Nenhum produto cadastrado no mercado ainda." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {marketSupplier.products
                .filter(p => {
                  const normalizedSearch = normalizeText(searchTerm);
                  return normalizeText(p.name).includes(normalizedSearch) || 
                    normalizeText(p.category).includes(normalizedSearch);
                })
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((product, idx) => {
                  const qKey = `MERCADO-${String(product.name)}-${idx}`;
                  return (
                    <div key={qKey} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:border-indigo-200 transition-all">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <span className="px-3 py-1 bg-slate-50 text-slate-400 border border-slate-100 rounded-lg text-[9px] font-bold uppercase tracking-wider">
                            {product.category}
                          </span>
                          <div className='flex gap-2 items-center'>
                            <button onClick={() => onEditProduct(product, 'MERCADO')} className='p-1 hover:bg-slate-100 rounded-md'>
                              <Pencil className="w-3 h-3 text-slate-400 hover:text-indigo-600" />
                            </button>
                            <span className="text-xl font-black text-indigo-600">
                              {formatCurrency(product.price)}
                            </span>
                          </div>
                        </div>
                        <h4 
                          className={`text-lg font-bold mb-3 uppercase tracking-tight transition-colors ${isLink(product.name) ? 'text-indigo-600 hover:underline cursor-pointer' : 'text-slate-700'}`}
                          onClick={(e) => {
                            if (isLink(product.name)) {
                              e.stopPropagation();
                              handleCopy(product.name, 'Link');
                            }
                          }}
                        >
                          {product.name}
                        </h4>
                        <div className="space-y-1.5 mb-6">
                          <div className="flex items-center gap-2 bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100/50">
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                            <span className="text-[11px] text-slate-500 font-bold uppercase">Código:</span>
                            <span className="text-[11px] text-indigo-700 font-mono font-black uppercase tracking-wider">{product.code || 'Não associado'}</span>
                          </div>
                          {product.lastPurchaseDate && (
                            <div className="flex items-center gap-2 bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100/50">
                              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                              <span className="text-[11px] text-slate-500 font-bold uppercase">Última Compra:</span>
                              <span className="text-[11px] text-indigo-700 font-black">{product.lastPurchaseDate}</span>
                            </div>
                          )}
                          {product.paymentMethod && (
                            <div className="flex items-center gap-2 bg-emerald-50/50 px-2 py-1 rounded-lg border border-emerald-100/50">
                              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                              <span className="text-[11px] text-slate-500 font-bold uppercase">Pagamento:</span>
                              <span className="text-[11px] text-emerald-700 font-black">{product.paymentMethod}</span>
                            </div>
                          )}
                        </div>
                      </div>
                        <div className="flex flex-col sm:flex-row gap-2 mt-auto">
                          <QuantitySelector
                            quantity={quantities[qKey] ?? '1'}
                            onQuantityChange={(val) => handleQuantityChange(qKey, val)}
                            onQuantityBlur={() => handleQuantityBlur(qKey)}
                            onIncrement={() => adjustQuantity(qKey, 1)}
                            onDecrement={() => adjustQuantity(qKey, -1)}
                            onEnter={() => onAddToCart(product, 'MERCADO', qKey)}
                            idPrefix={qKey}
                          />
                          <button
                            id={`add-${qKey}`}
                            onClick={() => onAddToCart(product, 'MERCADO', qKey)}
                            className="flex-1 h-11 bg-slate-900 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-indigo-600 transition-all shadow-sm"
                          >
                            Adicionar
                          </button>
                        </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'materiais' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Produtos de Materiais</h2>
            <button
              onClick={() => handleAddChannelProduct('MATERIAIS')}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 text-xs"
            >
              <Plus className="w-4 h-4" />
              Gerenciar Produtos
            </button>
          </div>

          <SearchBar
            value={searchTerm}
            onChange={setSearchTerm}
            placeholder="Buscar materiais..."
          />

          {!materialsSupplier || materialsSupplier.products.length === 0 ? (
            <EmptyState title="Canal Materiais" message="Nenhum produto cadastrado em materiais ainda." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {materialsSupplier.products
                .filter(p => {
                  const normalizedSearch = normalizeText(searchTerm);
                  return normalizeText(p.name).includes(normalizedSearch) || 
                    normalizeText(p.category).includes(normalizedSearch);
                })
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((product, idx) => {
                  const qKey = `MATERIAIS-${String(product.name)}-${idx}`;
                  return (
                    <div key={qKey} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:border-indigo-100 transition-all">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <span className="px-3 py-1 bg-slate-50 text-slate-400 border border-slate-100 rounded-lg text-[9px] font-bold uppercase tracking-wider">
                            {product.category}
                          </span>
                          <div className='flex gap-2 items-center'>
                            <button onClick={() => onEditProduct(product, 'MATERIAIS')} className='p-1 hover:bg-slate-100 rounded-md'>
                              <Pencil className="w-3 h-3 text-slate-400 hover:text-indigo-600" />
                            </button>
                            <span className="text-xl font-black text-indigo-600">
                              {formatCurrency(product.price)}
                            </span>
                          </div>
                        </div>
                        <h4 
                          className={`text-lg font-bold mb-3 uppercase tracking-tight transition-colors ${isLink(product.name) ? 'text-indigo-600 hover:underline cursor-pointer' : 'text-slate-700'}`}
                          onClick={(e) => {
                            if (isLink(product.name)) {
                              e.stopPropagation();
                              handleCopy(product.name, 'Link');
                            }
                          }}
                        >
                          {product.name}
                        </h4>
                        <div className="space-y-1.5 mb-6">
                          <div className="flex items-center gap-2 bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100/50">
                            <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                            <span className="text-[11px] text-slate-500 font-bold uppercase">Código:</span>
                            <span className="text-[11px] text-indigo-700 font-mono font-black uppercase tracking-wider">{product.code || 'Não associado'}</span>
                          </div>
                          {product.lastPurchaseDate && (
                            <div className="flex items-center gap-2 bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100/50">
                              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                              <span className="text-[11px] text-slate-500 font-bold uppercase">Última Compra:</span>
                              <span className="text-[11px] text-indigo-700 font-black">{product.lastPurchaseDate}</span>
                            </div>
                          )}
                          {product.paymentMethod && (
                            <div className="flex items-center gap-2 bg-emerald-50/50 px-2 py-1 rounded-lg border border-emerald-100/50">
                              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                              <span className="text-[11px] text-slate-500 font-bold uppercase">Pagamento:</span>
                              <span className="text-[11px] text-emerald-700 font-black">{product.paymentMethod}</span>
                            </div>
                          )}
                        </div>
                      </div>
                        <div className="flex flex-col sm:flex-row gap-2 mt-auto">
                          <QuantitySelector
                            quantity={quantities[qKey] ?? '1'}
                            onQuantityChange={(val) => handleQuantityChange(qKey, val)}
                            onQuantityBlur={() => handleQuantityBlur(qKey)}
                            onIncrement={() => adjustQuantity(qKey, 1)}
                            onDecrement={() => adjustQuantity(qKey, -1)}
                            onEnter={() => onAddToCart(product, 'MATERIAIS', qKey)}
                            idPrefix={qKey}
                          />
                          <button
                            id={`add-${qKey}`}
                            onClick={() => onAddToCart(product, 'MATERIAIS', qKey)}
                            className="flex-1 h-11 bg-slate-900 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-indigo-600 transition-all shadow-sm"
                          >
                            Adicionar
                          </button>
                        </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'importar_xml' && (
        <XmlImportTab
          importRows={importRows}
          setImportRows={setImportRows}
          isAnalyzing={isAnalyzing}
          xmlLogs={xmlLogs}
          setXmlLogs={setXmlLogs}
          dragActive={dragActive}
          setDragActive={setDragActive}
          handleXmlFiles={handleXmlFiles}
          handleSaveImport={handleSaveImport}
          allSuppliers={allSuppliers}
          availableCategories={availableCategories}
          addNotification={addNotification}
          updateRow={updateRow}
          findExactMatch={findExactMatch}
          deletingRowId={deletingRowId}
          setDeletingRowId={setDeletingRowId}
        />
      )}
    </motion.div>
  );
};
