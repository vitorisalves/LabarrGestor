import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, Pencil, Plus, Trash2, Search, Check, Loader2 } from 'lucide-react';
import { Product } from '../../types';
import { formatCurrency } from '../../utils';

interface SupplierModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingSupplierId: string | null;
  name: string;
  setName: (name: string) => void;
  phone: string;
  setPhone: (phone: string) => void;
  productList: Product[];
  productName: string;
  setProductName: (name: string) => void;
  productPrice: string;
  setProductPrice: (price: string) => void;
  productCategory: string;
  setProductCategory: (cat: string) => void;
  productCode: string;
  setProductCode: (code: string) => void;
  productLastPurchaseDate: string;
  setProductLastPurchaseDate: (date: string) => void;
  productPaymentMethod: string;
  setProductPaymentMethod: (method: string) => void;
  categories: string[];
  editingProductIndex: number | null;
  productNameRef: React.RefObject<HTMLInputElement>;
  onAddProduct: () => void;
  onEditProduct: (index: number | null) => void;
  onRemoveProduct: (index: number) => void;
  onSave: (e: React.FormEvent) => void;
  isSaving: boolean;
}

export const SupplierModal: React.FC<SupplierModalProps> = ({
  isOpen,
  onClose,
  editingSupplierId,
  name,
  setName,
  phone,
  setPhone,
  productList,
  productName,
  setProductName,
  productPrice,
  setProductPrice,
  productCategory,
  setProductCategory,
  productLastPurchaseDate,
  setProductLastPurchaseDate,
  productPaymentMethod,
  setProductPaymentMethod,
  productCode,
  setProductCode,
  categories,
  editingProductIndex,
  productNameRef,
  onAddProduct,
  onEditProduct,
  onRemoveProduct,
  onSave,
  isSaving
}) => {
  const [localSearch, setLocalSearch] = React.useState('');

  React.useEffect(() => {
    if (!isOpen) {
      setLocalSearch('');
    }
  }, [isOpen, editingSupplierId]);

  const filteredProducts = React.useMemo(() => {
    if (!localSearch.trim()) return productList;
    const lower = localSearch.toLowerCase();
    return productList.map((p, originalIndex) => ({ ...p, originalIndex }))
      .filter(p => 
        p.name.toLowerCase().includes(lower) || 
        p.category.toLowerCase().includes(lower)
      );
  }, [productList, localSearch]);

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={onClose}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="bg-white w-full max-w-4xl max-h-[90vh] rounded-2xl shadow-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h2 className="text-lg md:text-xl font-bold text-slate-900 leading-tight">
                  {editingSupplierId ? 'Editar Fornecedor' : 'Novo Fornecedor'}
                </h2>
                <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-widest">Informações do parceiro e catálogo</p>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-200 rounded-xl transition-all"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {/* Info Básica */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Empresa</label>
                  <input
                    type="text"
                    placeholder="Ex: Distribuidora"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all font-medium text-sm"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Telefone</label>
                  <input
                    type="text"
                    placeholder="(00) 00000-0000"
                    className="w-full px-4 py-3 bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all font-medium text-sm"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                  />
                </div>
              </div>

              {/* Seção de Produtos */}
              <div className="space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <h3 className="text-base font-bold text-slate-800 flex items-center gap-3 uppercase tracking-tight">
                    <Package className="w-5 h-5 text-indigo-600" />
                    Catálogo de Produtos
                  </h3>
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                      <input 
                        type="text"
                        placeholder="Buscar item..."
                        className="pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-100 rounded-lg outline-none focus:border-indigo-500 transition-all font-bold text-[10px]"
                        value={localSearch}
                        onChange={(e) => setLocalSearch(e.target.value)}
                      />
                    </div>
                    <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-bold uppercase tracking-widest whitespace-nowrap">
                      {productList.length} itens
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <input
                      ref={productNameRef}
                      type="text"
                      placeholder="Nome do produto"
                      className="px-4 py-3 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all font-medium text-sm"
                      value={productName}
                      onChange={(e) => setProductName(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Código"
                      className="px-4 py-3 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all font-medium text-sm"
                      value={productCode}
                      onChange={(e) => setProductCode(e.target.value)}
                    />
                    <input
                      type="number"
                      placeholder="Preço (R$)"
                      className="px-4 py-3 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all font-medium text-sm"
                      value={productPrice}
                      onChange={(e) => setProductPrice(e.target.value)}
                    />
                    <select
                      className="px-4 py-3 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all font-medium text-sm appearance-none"
                      value={productCategory}
                      onChange={(e) => setProductCategory(e.target.value)}
                    >
                      <option value="">Categoria</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      placeholder="Última Data Compra (Ex: 01/01/2024)"
                      className="px-4 py-3 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all font-medium text-sm"
                      value={productLastPurchaseDate}
                      onChange={(e) => setProductLastPurchaseDate(e.target.value)}
                    />
                    <input
                      type="text"
                      placeholder="Forma de Pagamento (Ex: PIX)"
                      className="px-4 py-3 bg-white border border-slate-200 focus:border-indigo-500 rounded-xl outline-none transition-all font-medium text-sm"
                      value={productPaymentMethod}
                      onChange={(e) => setProductPaymentMethod(e.target.value)}
                    />
                  </div>
                  <button
                    onClick={onAddProduct}
                    className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-all shadow-sm"
                  >
                    {editingProductIndex !== null ? <Pencil className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
                    {editingProductIndex !== null ? 'Atualizar Produto' : 'Adicionar ao Catálogo'}
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredProducts.map((p) => {
                    const i = (p as any).originalIndex ?? productList.indexOf(p);
                    const isEditingThis = editingProductIndex === i;
                    return (
                      <div 
                        key={i} 
                        onClick={() => !isEditingThis && onEditProduct(i)}
                        className={`flex items-center justify-between p-4 bg-white border rounded-xl group transition-all relative cursor-pointer ${isEditingThis ? 'border-indigo-500 bg-indigo-50/10' : 'border-slate-100 hover:border-indigo-100'}`}
                      >
                        {isEditingThis && (
                          <div 
                            className="absolute inset-0 z-[210]" 
                            onClick={() => onEditProduct(null)} 
                          />
                        )}
                        <div className={`flex-1 ${isEditingThis ? 'relative z-[220]' : ''}`}>
                          <div className="flex flex-col gap-0.5">
                            {isEditingThis ? (
                              <>
                                <input
                                  type="text"
                                  className="w-full px-2 py-1.5 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-slate-800 outline-none mb-2"
                                  value={productName}
                                  onChange={(e) => setProductName(e.target.value)}
                                  placeholder="Nome do produto"
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') onAddProduct();
                                    if (e.key === 'Escape') onEditProduct(null);
                                  }}
                                />
                                <div className="flex flex-wrap items-center gap-2">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[10px] font-bold text-indigo-600">R$</span>
                                    <input
                                      type="number"
                                      className="w-20 px-2 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-700 outline-none"
                                      value={productPrice}
                                      onChange={(e) => setProductPrice(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') onAddProduct();
                                        if (e.key === 'Escape') onEditProduct(null);
                                      }}
                                    />
                                  </div>
                                  <select
                                    className="px-2 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-[10px] font-bold text-indigo-600 outline-none"
                                    value={productCategory}
                                    onChange={(e) => setProductCategory(e.target.value)}
                                  >
                                    {categories.map(cat => (
                                      <option key={cat} value={cat}>{cat}</option>
                                    ))}
                                  </select>
                                </div>
                                <div className="grid grid-cols-3 gap-2 mt-2">
                                  <input
                                    type="text"
                                    className="px-2 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-[10px] font-bold text-slate-700 outline-none"
                                    value={productCode}
                                    onChange={(e) => setProductCode(e.target.value)}
                                    placeholder="Código"
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') onAddProduct();
                                      if (e.key === 'Escape') onEditProduct(null);
                                    }}
                                  />
                                  <input
                                    type="text"
                                    className="px-2 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-[10px] font-bold text-slate-700 outline-none"
                                    value={productLastPurchaseDate}
                                    onChange={(e) => setProductLastPurchaseDate(e.target.value)}
                                    placeholder="Data"
                                  />
                                  <input
                                    type="text"
                                    className="px-2 py-1 bg-indigo-50 border border-indigo-200 rounded-lg text-[10px] font-bold text-slate-700 outline-none"
                                    value={productPaymentMethod}
                                    onChange={(e) => setProductPaymentMethod(e.target.value)}
                                    placeholder="Pagto"
                                  />
                                </div>
                              </>
                            ) : (
                              <>
                                <p className="font-bold text-slate-700 text-sm tracking-tight">{p.name}</p>
                                <div className="flex flex-wrap gap-x-3 gap-y-1 mt-1">
                                  <div className="text-[8px] text-slate-500 font-bold uppercase tracking-tight flex items-center gap-1">
                                    <span className={`w-1.5 h-1.5 rounded-full ${p.code ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'}`} />
                                    Cód: <span className={`font-mono font-bold ${p.code ? 'text-emerald-700 bg-emerald-50/50 px-1 rounded' : 'text-amber-700 bg-amber-50/50 px-1 rounded'}`}>{p.code || 'Não associado'}</span>
                                  </div>
                                  {p.lastPurchaseDate && (
                                    <div className="text-[8px] text-slate-500 font-bold uppercase tracking-tight flex items-center gap-1">
                                      <span className="w-1 h-1 bg-indigo-400 rounded-full" />
                                      Últ. Compra: <span className="text-slate-900">{p.lastPurchaseDate}</span>
                                    </div>
                                  )}
                                  {p.paymentMethod && (
                                    <div className="text-[8px] text-slate-500 font-bold uppercase tracking-tight flex items-center gap-1">
                                      <span className="w-1 h-1 bg-emerald-400 rounded-full" />
                                      Pagto: <span className="text-slate-900">{p.paymentMethod}</span>
                                    </div>
                                  )}
                                </div>
                                <div className="flex items-center gap-3 mt-1">
                                  <span className="text-xs font-black text-indigo-600">{formatCurrency(p.price)}</span>
                                  <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{p.category}</span>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                        <div className={`flex items-center gap-1 ${isEditingThis ? 'opacity-100 relative z-[220]' : 'opacity-0 group-hover:opacity-100'} transition-all`}>
                          {isEditingThis ? (
                            <button 
                              onClick={onAddProduct}
                              className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-sm hover:bg-indigo-700 transition-colors"
                              title="Salvar"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button onClick={() => onEditProduct(i)} className="p-1.5 text-black hover:text-indigo-600 transition-colors">
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button onClick={() => onRemoveProduct(i)} className="p-1.5 text-black hover:text-red-500 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="p-6 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
              <button
                onClick={onClose}
                className="px-6 py-3 text-slate-500 text-sm font-bold hover:text-slate-900 transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={onSave}
                disabled={isSaving || !name || !phone || (productList.length === 0 && !productName.trim())}
                className="px-8 py-3 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                {editingSupplierId ? 'Salvar Alterações' : 'Cadastrar Fornecedor'}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
