/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Search, 
  Package,
  Calendar,
  Truck,
  CheckCircle2,
  Clock,
  Trash2,
  Check,
  RotateCcw,
  Pencil,
  X
} from 'lucide-react';
import { DeliveredProduct } from '../types';
import { normalizeText, formatCurrency } from '../utils';
import { ConfirmationModal } from './modals/ConfirmationModal';

interface DeliveredProductsViewProps {
  deliveredProducts: DeliveredProduct[];
  toggleDeliveryStatus: (productId: string) => void;
  deleteDeliveredProduct: (productId: string) => void;
  updatePurchaseDate: (productId: string, newDate: string) => void;
  updateForecastDate: (productId: string, newDate: string) => void;
  updateDeliveryDate: (productId: string, newDate: string) => void;
}

export const DeliveredProductsView: React.FC<DeliveredProductsViewProps> = ({
  deliveredProducts,
  toggleDeliveryStatus,
  deleteDeliveredProduct,
  updatePurchaseDate,
  updateForecastDate,
  updateDeliveryDate
}) => {
  const [searchTerm, setSearchTerm] = React.useState('');
  const [productToDelete, setProductToDelete] = React.useState<string | null>(null);
  const [editingDateId, setEditingDateId] = React.useState<string | null>(null);
  const [tempDate, setTempDate] = React.useState('');
  const [editingForecastId, setEditingForecastId] = React.useState<string | null>(null);
  const [tempForecastDate, setTempForecastDate] = React.useState('');
  const [editingDeliveryId, setEditingDeliveryId] = React.useState<string | null>(null);
  const [tempDeliveryDate, setTempDeliveryDate] = React.useState('');
  const [currentPage, setCurrentPage] = React.useState(1);
  const ITEMS_PER_PAGE = 20;

  React.useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  const toISODate = (dateStr: string) => {
    try {
      const parts = dateStr.split('/');
      if (parts.length !== 3) return new Date().toISOString().split('T')[0];
      const [day, month, year] = parts;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    } catch {
      return new Date().toISOString().split('T')[0];
    }
  };

  const fromISODate = (isoStr: string) => {
    try {
      const [year, month, day] = isoStr.split('-');
      return `${day}/${month}/${year}`;
    } catch {
      return '';
    }
  };

  const handleStartEditDate = (product: DeliveredProduct) => {
    setEditingDateId(product.id);
    setTempDate(toISODate(product.purchaseDate));
  };

  const handleSaveDate = (id: string) => {
    const formattedDate = fromISODate(tempDate);
    if (formattedDate) {
      updatePurchaseDate(id, formattedDate);
    }
    setEditingDateId(null);
  };

  const handleStartEditForecast = (product: DeliveredProduct) => {
    setEditingForecastId(product.id);
    setTempForecastDate(product.forecastDate ? toISODate(product.forecastDate) : new Date().toISOString().split('T')[0]);
  };

  const handleSaveForecast = (id: string) => {
    const formattedDate = fromISODate(tempForecastDate);
    if (formattedDate) {
      updateForecastDate(id, formattedDate);
    }
    setEditingForecastId(null);
  };

  const handleStartEditDelivery = (product: DeliveredProduct) => {
    setEditingDeliveryId(product.id);
    setTempDeliveryDate(product.deliveryDate ? toISODate(product.deliveryDate) : new Date().toISOString().split('T')[0]);
  };

  const handleSaveDelivery = (id: string) => {
    const formattedDate = fromISODate(tempDeliveryDate);
    if (formattedDate) {
      updateDeliveryDate(id, formattedDate);
    }
    setEditingDeliveryId(null);
  };

  const isLate = (forecastDate?: string) => {
    if (!forecastDate) return false;
    try {
      const parts = forecastDate.split('/');
      if (parts.length !== 3) return false;
      const [day, month, year] = parts.map(Number);
      const forecast = new Date(year, month - 1, day, 23, 59, 59);
      return forecast < new Date();
    } catch {
      return false;
    }
  };

  const filteredProducts = deliveredProducts
    .filter(p => {
      const normalizedSearch = normalizeText(searchTerm);
      return normalizeText(p.name).includes(normalizedSearch) || 
             normalizeText(p.supplierName).includes(normalizedSearch);
    })
    .sort((a, b) => {
      if (a.delivered !== b.delivered) {
        return a.delivered ? 1 : -1;
      }
      
      if (a.delivered) {
        if (a.deliveredAt && b.deliveredAt) {
          return b.deliveredAt.localeCompare(a.deliveredAt);
        }
        if (a.deliveredAt) return -1;
        if (b.deliveredAt) return 1;

        const dateA = toISODate(a.deliveryDate || '01/01/1970');
        const dateB = toISODate(b.deliveryDate || '01/01/1970');
        return dateB.localeCompare(dateA);
      } else {
        const dateA = toISODate(a.purchaseDate);
        const dateB = toISODate(b.purchaseDate);
        return dateB.localeCompare(dateA);
      }
    });

  const totalPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);

  const paginatedProducts = React.useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredProducts.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredProducts, currentPage]);

  const handleDeleteConfirm = () => {
    if (productToDelete) {
      deleteDeliveredProduct(productToDelete);
      setProductToDelete(null);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2 }}
      className="space-y-6"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight mb-1 uppercase">Produtos Entregues</h1>
          <p className="text-slate-500 font-medium text-sm">Acompanhe a chegada dos produtos comprados</p>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <div className="px-4 py-2 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center gap-2">
            <Truck className="w-4 h-4 text-emerald-600" />
            <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Logística de Entrega</span>
          </div>
        </div>
      </div>

      <div className="relative group">
        <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
        <input
          type="text"
          placeholder="Buscar produto ou fornecedor..."
          className="w-full pl-14 pr-6 py-4 bg-white border border-slate-200 focus:border-indigo-500 rounded-2xl outline-none transition-all shadow-sm text-base font-medium"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-100/50 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/50 border-b border-slate-100">
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-16">Status</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Produto</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Fornecedor</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qtd</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Data Compra</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Previsão Entrega</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Tempo</th>
                <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-20 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <Package className="w-12 h-12 text-slate-200 mb-4" />
                      <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Nenhum produto encontrado</p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedProducts.map((p) => (
                  <tr 
                    key={p.id} 
                    className={`group transition-all hover:bg-slate-50/50 ${p.delivered ? 'bg-emerald-50/20' : ''}`}
                  >
                    <td className="px-6 py-4">
                      {p.delivered ? (
                        <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600" title="Entregue">
                          <Check className="w-4 h-4" />
                        </div>
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600" title="Pendente">
                          <Clock className="w-4 h-4" />
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className={`font-bold text-sm tracking-tight ${p.delivered ? 'text-slate-400' : 'text-slate-900'}`}>
                          {p.name}
                        </span>
                        {p.delivered && p.deliveryDate && (
                          <div className="flex items-center gap-2 group/date">
                            {editingDeliveryId === p.id ? (
                              <div className="flex items-center gap-1">
                                <input
                                  type="date"
                                  value={tempDeliveryDate}
                                  onChange={(e) => setTempDeliveryDate(e.target.value)}
                                  className="bg-white border border-slate-200 rounded px-1 py-0.5 text-[11px] font-bold outline-none focus:border-indigo-500"
                                />
                                <button 
                                  onClick={() => handleSaveDelivery(p.id)}
                                  className="p-1 text-emerald-500 hover:bg-emerald-50 rounded"
                                >
                                  <Check className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={() => setEditingDeliveryId(null)}
                                  className="p-1 text-red-400 hover:bg-red-50 rounded"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ) : (
                               <div className="flex items-center gap-2">
                                  <span className="text-sm font-bold text-emerald-500 uppercase tracking-tight">
                                    Entregue em: {p.deliveryDate}
                                  </span>
                                  <button
                                    onClick={() => handleStartEditDelivery(p)}
                                    className="p-1 text-black border border-slate-200 hover:text-indigo-700 hover:bg-slate-100 rounded transition-all bg-white shadow-sm"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                               </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-tight">
                      {p.supplierName}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-1 bg-slate-100 rounded-lg text-sm font-black text-slate-700 min-w-[24px]">
                        {p.quantity || 1}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Calendar className="w-3.5 h-3.5" />
                        {editingDateId === p.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={tempDate}
                              onChange={(e) => setTempDate(e.target.value)}
                              className="bg-white border border-slate-200 rounded px-1 py-0.5 text-[11px] font-bold outline-none focus:border-indigo-500"
                            />
                            <button 
                              onClick={() => handleSaveDate(p.id)}
                              className="p-1 text-emerald-500 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={() => setEditingDateId(null)}
                              className="p-1 text-red-400 hover:bg-red-50 rounded"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group/date">
                            <span className="text-sm font-bold uppercase tracking-tight">{p.purchaseDate}</span>
                            <button
                              onClick={() => handleStartEditDate(p)}
                              className="p-1 text-black border border-slate-200 hover:text-indigo-700 hover:bg-slate-100 rounded transition-all bg-white shadow-sm"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-slate-500">
                        <Clock className="w-3.5 h-3.5" />
                        {editingForecastId === p.id ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="date"
                              value={tempForecastDate}
                              onChange={(e) => setTempForecastDate(e.target.value)}
                              className="bg-white border border-slate-200 rounded px-1 py-0.5 text-[11px] font-bold outline-none focus:border-indigo-500"
                            />
                            <button 
                              onClick={() => handleSaveForecast(p.id)}
                              className="p-1 text-emerald-500 hover:bg-emerald-50 rounded"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                            <button 
                              onClick={() => setEditingForecastId(null)}
                              className="p-1 text-red-400 hover:bg-red-50 rounded"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group/date">
                            <span className={`text-sm font-bold uppercase tracking-tight ${!p.delivered && isLate(p.forecastDate) ? 'text-red-500 animate-pulse' : ''}`}>
                              {p.forecastDate || 'Definir'}
                            </span>
                            <button
                              onClick={() => handleStartEditForecast(p)}
                              className="p-1 text-black border border-slate-200 hover:text-indigo-700 hover:bg-slate-100 rounded transition-all bg-white shadow-sm"
                            >
                              <Pencil className="w-3 h-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {p.delivered && p.deliveryTimeDays !== undefined ? (
                        <div className="flex flex-col items-center">
                          <span className="text-sm font-black text-slate-900">{p.deliveryTimeDays}</span>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Dias</span>
                        </div>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => toggleDeliveryStatus(p.id)}
                          className={`p-2 rounded-xl transition-all active:scale-95 ${
                            p.delivered 
                              ? 'bg-slate-100 text-slate-400 hover:bg-slate-200' 
                              : 'bg-emerald-500 text-white hover:bg-emerald-600 shadow-sm'
                          }`}
                          title={p.delivered ? "Reabrir Pendência" : "Marcar como Entregue"}
                        >
                          {p.delivered ? <RotateCcw className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => setProductToDelete(p.id)}
                          className="p-2 text-black hover:text-red-500 hover:bg-red-50 rounded-xl transition-all active:scale-95"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-slate-100 bg-white px-6 py-4">
            <div className="flex flex-1 justify-between sm:hidden">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="relative inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all cursor-pointer"
              >
                Anterior
              </button>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="relative ml-3 inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-all cursor-pointer"
              >
                Próximo
              </button>
            </div>
            <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
              <div>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                  Mostrando <span className="text-slate-900">{(currentPage - 1) * ITEMS_PER_PAGE + 1}</span> a{' '}
                  <span className="text-slate-900">
                    {Math.min(currentPage * ITEMS_PER_PAGE, filteredProducts.length)}
                  </span>{' '}
                  de <span className="text-slate-900">{filteredProducts.length}</span> registros
                </p>
              </div>
              <div>
                <nav className="isolate inline-flex -space-x-px rounded-xl shadow-xs" aria-label="Pagination">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center rounded-l-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-500 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    Anterior
                  </button>
                  
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => {
                    if (
                      page === 1 ||
                      page === totalPages ||
                      Math.abs(page - currentPage) <= 1
                    ) {
                      return (
                        <button
                          key={page}
                          onClick={() => setCurrentPage(page)}
                          className={`relative inline-flex items-center border px-4 py-2 text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
                            currentPage === page
                              ? 'z-10 bg-indigo-600 border-indigo-600 text-white hover:bg-indigo-700'
                              : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 active:bg-slate-100'
                          }`}
                        >
                          {page}
                        </button>
                      );
                    }
                    if (
                      (page === 2 && currentPage > 3) ||
                      (page === totalPages - 1 && currentPage < totalPages - 2)
                    ) {
                      return (
                        <span
                          key={page}
                          className="relative inline-flex items-center border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-500"
                        >
                          ...
                        </span>
                      );
                    }
                    return null;
                  })}

                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center rounded-r-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black uppercase text-slate-500 hover:bg-slate-50 active:bg-slate-100 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    Próximo
                  </button>
                </nav>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmationModal
        isOpen={!!productToDelete}
        onClose={() => setProductToDelete(null)}
        onConfirm={handleDeleteConfirm}
        title="Excluir Registro de Entrega"
        message="Tem certeza que deseja excluir este registro? Esta ação não pode ser desfeita."
      />
    </motion.div>
  );
};
