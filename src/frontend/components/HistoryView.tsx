/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Calendar, 
  User, 
  ListChecks, 
  Trash2, 
  Pencil, 
  Check, 
  ChevronDown, 
  ChevronUp,
  PlusCircle,
  RefreshCcw,
  FileText,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { AnimatePresence } from 'framer-motion';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SavedList } from '../types';
import { formatCurrency, formatDate } from '../utils';

interface HistoryViewProps {
  savedLists: SavedList[];
  isLoading?: boolean;
  onRefresh?: () => void;
  editSavedList: (list: SavedList) => void;
  deleteSavedList: (id: string) => void;
  toggleSavedListItemBought: (listId: string, productName: string, supplierName: string) => void;
  setActiveTargetList: (id: string | null, name: string | null) => void;
}

const HistoryItemRow = React.memo(({ 
  listId, 
  item, 
  onToggle 
}: { 
  listId: string; 
  item: any; 
  onToggle: (listId: string, productName: string, supplierName: string) => void;
}) => {
  return (
    <tr className={`group hover:bg-slate-50 transition-colors ${item.bought ? 'bg-slate-50/50' : ''}`}>
      <td className="px-6 py-4">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onToggle(listId, item.name, item.supplierName);
          }}
          className={`w-7 h-7 rounded-lg border flex items-center justify-center transition-all ${
            item.bought 
              ? 'bg-green-600 border-green-700 text-white shadow-sm' 
              : 'border-black hover:border-slate-900'
          }`}
        >
          {item.bought && <Check className="w-4 h-4" />}
        </button>
      </td>
      <td className="px-6 py-4">
        <p className={`text-sm font-bold text-slate-700 tracking-tight ${item.bought ? 'line-through opacity-40 text-slate-400' : ''}`}>{item.name}</p>
        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{item.category}</p>
      </td>
      <td className="px-6 py-4">
        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
          {item.supplierName}
        </span>
      </td>
      <td className="px-6 py-4 text-center font-bold text-slate-700 text-base tabular-nums">{item.quantity}</td>
      <td className="px-6 py-4 text-right font-black text-slate-800 text-base tabular-nums">
        {formatCurrency(item.price * item.quantity)}
      </td>
    </tr>
  );
});
HistoryItemRow.displayName = 'HistoryItemRow';

export const HistoryView: React.FC<HistoryViewProps> = ({
  savedLists,
  isLoading,
  onRefresh,
  editSavedList,
  deleteSavedList,
  toggleSavedListItemBought,
  setActiveTargetList
}) => {
  const [expandedList, setExpandedList] = React.useState<string | null>(null);
  const [currentPage, setCurrentPage] = React.useState(1);
  const itemsPerPage = 10;

  const sortedLists = React.useMemo(() => {
    return [...savedLists].sort((a, b) => {
      const aCompleted = a.items.length > 0 && a.items.every(item => item.bought);
      const bCompleted = b.items.length > 0 && b.items.every(item => item.bought);

      if (aCompleted && !bCompleted) return 1;
      if (!aCompleted && bCompleted) return -1;
      
      // If both are same status, they are already sorted by date desc from the hook
      return 0;
    });
  }, [savedLists]);

  const totalPages = Math.ceil(sortedLists.length / itemsPerPage);

  React.useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  const paginatedLists = React.useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return sortedLists.slice(startIndex, startIndex + itemsPerPage);
  }, [sortedLists, currentPage]);

  const exportToPDF = (list: SavedList) => {
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(20);
    doc.setTextColor(15, 23, 42); // slate-900
    doc.text('Lista de Compras - LABARR', 14, 22);
    
    doc.setFontSize(12);
    doc.setTextColor(100);
    doc.text(`Lista: ${list.name.toUpperCase()}`, 14, 32);
    doc.text(`Data: ${formatDate(list.date)}`, 14, 38);
    doc.text(`Operador: ${list.createdBy || 'Sistema'}`, 14, 44);
    
    // Table
    const sortedItemsForPDF = [...list.items].sort((a, b) => {
      if (a.bought && !b.bought) return 1;
      if (!a.bought && b.bought) return -1;
      return 0;
    });

    const tableData = sortedItemsForPDF.map(item => [
      item.bought ? '[X]' : '[ ]',
      item.name,
      item.supplierName,
      item.quantity.toString(),
      formatCurrency(item.price),
      formatCurrency(item.price * item.quantity)
    ]);

    autoTable(doc, {
      startY: 55,
      head: [['Status', 'Produto', 'Fornecedor', 'Qtd', 'Preço Un.', 'Subtotal']],
      body: tableData,
      theme: 'grid',
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      styles: { fontSize: 9, cellPadding: 3 },
      columnStyles: {
        0: { halign: 'center', cellWidth: 15 },
        3: { halign: 'center', cellWidth: 15 },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
    });

    // Total
    const finalY = (doc as any).lastAutoTable.finalY + 10;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`TOTAL DA LISTA: ${formatCurrency(list.total)}`, 140, finalY);

    // Save
    doc.save(`LISTA_${list.name.replace(/\s+/g, '_').toUpperCase()}_${formatDate(list.date).split(',')[0].replace(/\//g, '-')}.pdf`);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-8"
    >
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Minhas Listas</h1>
          <p className="text-slate-500 font-medium">Histórico de compras e listas salvas</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className={`p-3 rounded-2xl transition-all ${isLoading ? 'bg-indigo-100 text-indigo-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 active:scale-95 shadow-sm'}`}
          title="Sincronizar listas"
        >
          <RefreshCcw className={`w-6 h-6 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>      <div className="grid grid-cols-1 gap-4">
        {sortedLists.length === 0 ? (
          <div className="bg-white rounded-2xl p-20 border border-dashed border-slate-200 flex flex-col items-center justify-center text-slate-400">
            <ListChecks className="w-16 h-16 mb-4 opacity-20" />
            <p className="text-lg font-bold uppercase tracking-tight">Nenhuma lista encontrada</p>
            <p className="text-sm text-slate-400">Suas listas finalizadas aparecerão aqui.</p>
          </div>
        ) : (
          paginatedLists.map((list) => {
            const isCompleted = list.items.length > 0 && list.items.every(item => item.bought);
            
            return (
              <motion.div
                key={list.id}
                className={`bg-white rounded-2xl border shadow-sm overflow-hidden transition-all ${
                  isCompleted ? 'border-green-100' : 'border-slate-100'
                }`}
              >
                <div 
                  onClick={() => setExpandedList(expandedList === list.id ? null : list.id)}
                  className={`p-6 flex flex-col md:flex-row md:items-center justify-between gap-6 cursor-pointer transition-colors ${
                    isCompleted ? 'bg-green-50/20 hover:bg-green-50/40' : 'hover:bg-slate-50/50'
                  }`}
                >
                  <div className="flex items-center gap-5">
                    <div className={`w-12 h-12 md:w-14 md:h-14 rounded-xl flex items-center justify-center transition-colors border ${
                      isCompleted ? 'bg-green-600 border-green-700' : 'bg-slate-900 border-slate-800'
                    }`}>
                      {isCompleted ? (
                        <Check className="w-6 h-6 text-white" />
                      ) : (
                        <Calendar className="w-6 h-6 text-white" />
                      )}
                    </div>
                    <div>
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-xl font-bold text-slate-800 tracking-tight uppercase">{list.name}</h3>
                        {isCompleted && (
                          <span className="px-2 py-0.5 bg-green-600 text-white rounded-md text-[9px] font-bold uppercase tracking-widest flex items-center gap-1 border border-green-700 shadow-sm">
                            <Check className="w-2.5 h-2.5" />
                            OK
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-black font-bold text-[10px] uppercase tracking-tight">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          {formatDate(list.date)}
                        </span>
                        <span className="flex items-center gap-1">
                          <User className="w-3.5 h-3.5" />
                          {list.createdBy || 'Sistema'}
                        </span>
                        <span className="px-2 py-0.5 bg-slate-900 text-white rounded text-[9px]">
                          {list.items.length} itens
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right mr-4 flex gap-4">
                      <div className="flex flex-col items-end">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Subtotal</p>
                        <p className="text-sm font-black text-slate-600 tabular-nums tracking-tighter">{formatCurrency(list.total - (list.shippingFee || 0))}</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Frete</p>
                        <p className="text-sm font-black text-slate-600 tabular-nums tracking-tighter">{formatCurrency(list.shippingFee || 0)}</p>
                      </div>
                      <div className="flex flex-col items-end">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total</p>
                        <p className="text-2xl font-black text-slate-800 tabular-nums tracking-tighter">{formatCurrency(list.total)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => exportToPDF(list)}
                        className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                        title="Exportar PDF"
                      >
                        <FileText className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => editSavedList(list)}
                        className="p-2 text-black hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => deleteSavedList(list.id)}
                        className="p-2 text-black hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setExpandedList(expandedList === list.id ? null : list.id)}
                        className="p-2 text-slate-400 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-all"
                      >
                        {expandedList === list.id ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>
                </div>

                <AnimatePresence>
                  {expandedList === list.id && (
                    <motion.div
                      initial={{ height: 0 }}
                      animate={{ height: 'auto' }}
                      exit={{ height: 0 }}
                      className="overflow-hidden bg-slate-50/20 border-t border-slate-100"
                    >
                      <div className="p-6">
                        <div className="flex items-center justify-between mb-6">
                            <h4 className="text-lg font-bold text-slate-800 uppercase tracking-tight">Itens da Lista</h4>
                            <button
                              onClick={() => setActiveTargetList(list.id, list.name)}
                              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md text-[10px] uppercase tracking-widest"
                            >
                              <PlusCircle className="w-4 h-4" />
                              Adicionar Produtos
                            </button>
                        </div>
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                          <table className="w-full text-left">
                            <thead>
                              <tr className="bg-slate-900">
                                <th className="px-6 py-4 text-[9px] font-bold text-white uppercase tracking-widest">Status</th>
                                <th className="px-6 py-4 text-[9px] font-bold text-white uppercase tracking-widest">Produto</th>
                                <th className="px-6 py-4 text-[9px] font-bold text-white uppercase tracking-widest">Fornecedor</th>
                                <th className="px-6 py-4 text-[9px] font-bold text-white uppercase tracking-widest text-center">Qtd</th>
                                <th className="px-6 py-4 text-[9px] font-bold text-white uppercase tracking-widest text-right">Subtotal</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {[...list.items]
                                .sort((a, b) => {
                                  if (a.bought && !b.bought) return 1;
                                  if (!a.bought && b.bought) return -1;
                                  return 0;
                                })
                                .map((item, idx) => (
                                  <HistoryItemRow
                                    key={`${list.id}-${item.name}-${item.supplierName}-${idx}`}
                                    listId={list.id}
                                    item={item}
                                    onToggle={toggleSavedListItemBought}
                                  />
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border border-slate-100 bg-white px-6 py-4 rounded-2xl shadow-sm">
          <div className="flex flex-1 justify-between sm:hidden">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="relative inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Anterior
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="relative ml-3 inline-flex items-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
            >
              Próximo
            </button>
          </div>
          <div className="hidden sm:flex sm:flex-1 sm:items-center sm:justify-between">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-wider font-bold">
                Mostrando <span className="font-black text-slate-800 text-sm">{(currentPage - 1) * itemsPerPage + 1}</span> a{' '}
                <span className="font-black text-slate-800 text-sm">{Math.min(currentPage * itemsPerPage, sortedLists.length)}</span> de{' '}
                <span className="font-black text-slate-800 text-sm">{sortedLists.length}</span> listas
              </p>
            </div>
            <div>
              <nav className="isolate inline-flex -space-x-px rounded-xl gap-1" aria-label="Pagination">
                <button
                  onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                  disabled={currentPage === 1}
                  className="relative inline-flex items-center rounded-xl p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <span className="sr-only">Anterior</span>
                  <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                </button>
                {Array.from({ length: totalPages }, (_, idx) => idx + 1).map((page) => (
                  <button
                    key={page}
                    onClick={() => setCurrentPage(page)}
                    aria-current={page === currentPage ? 'page' : undefined}
                    className={`relative inline-flex items-center justify-center min-w-10 h-10 rounded-xl text-xs font-bold transition-all ${
                      page === currentPage
                        ? 'z-10 bg-indigo-600 text-white shadow-md shadow-indigo-600/10'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}
                <button
                  onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                  disabled={currentPage === totalPages}
                  className="relative inline-flex items-center rounded-xl p-2 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
                >
                  <span className="sr-only">Próximo</span>
                  <ChevronRight className="h-5 w-5" aria-hidden="true" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
