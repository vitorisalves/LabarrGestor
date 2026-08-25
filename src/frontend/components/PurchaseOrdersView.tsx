/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'framer-motion';
import { ClipboardList, Check, X, Send, Trash2, User, Calendar, Package } from 'lucide-react';
import { PurchaseOrder } from '../types';
import { formatCurrency, formatDate } from '../utils';
import { ConfirmationModal } from './modals/ConfirmationModal';

interface PurchaseOrdersViewProps {
  purchaseOrders: PurchaseOrder[];
  isLoading: boolean;
  approveRequisition: (id: string, observacao?: string) => Promise<void>;
  approveOrder: (id: string, observacao?: string) => Promise<void>;
  rejectOrder: (id: string, observacao?: string) => Promise<void>;
  updateObservacao: (id: string, observacao: string) => Promise<void>;
  sendToShoppingList: (id: string) => Promise<void>;
  deleteOrder: (id: string) => Promise<void>;
}

export const PurchaseOrdersView: React.FC<PurchaseOrdersViewProps> = ({
  purchaseOrders,
  isLoading,
  approveRequisition,
  approveOrder,
  rejectOrder,
  updateObservacao,
  sendToShoppingList,
  deleteOrder
}) => {
  const [observacaoDrafts, setObservacaoDrafts] = React.useState<Record<string, string>>({});
  const [confirmModal, setConfirmModal] = React.useState<{ open: boolean; action: 'reject' | 'delete' | null; id: string | null }>({ open: false, action: null, id: null });

  const created = purchaseOrders.filter(o => o.status === 'pending' || o.status === 'rejected');
  const requisitionApproved = purchaseOrders.filter(o => o.status === 'requisition_approved');
  const approved = purchaseOrders.filter(o => o.status === 'approved');

  const getObservacao = (order: PurchaseOrder) => observacaoDrafts[order.id] ?? order.observacao ?? '';

  const handleConfirm = async () => {
    if (!confirmModal.id) return;
    if (confirmModal.action === 'reject') {
      await rejectOrder(confirmModal.id, getObservacao(purchaseOrders.find(o => o.id === confirmModal.id)!));
    } else if (confirmModal.action === 'delete') {
      await deleteOrder(confirmModal.id);
    }
    setConfirmModal({ open: false, action: null, id: null });
  };

  const ItemsList: React.FC<{ order: PurchaseOrder }> = ({ order }) => (
    <div className="bg-slate-50 rounded-xl border border-slate-100 divide-y divide-slate-100 max-h-40 overflow-y-auto">
      {order.items.map((item, idx) => (
        <div key={idx} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
          <span className="font-bold text-slate-700 truncate">{item.name}</span>
          <span className="flex items-center gap-3 shrink-0 text-slate-500">
            <span>{item.quantity}x</span>
            <span className="font-black text-slate-800">{formatCurrency(item.price * item.quantity)}</span>
          </span>
        </div>
      ))}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="space-y-8"
    >
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <h1 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tight mb-1 md:mb-2 text-balance flex items-center gap-3">
          <ClipboardList className="w-8 h-8 text-indigo-700" />
          Ordem de Compra
        </h1>
        <p className="text-sm md:text-base text-slate-500 font-medium">Requisição → Requisição Aprovada → Compra Aprovada → Minhas Listas</p>
      </div>

      {isLoading ? (
        <div className="bg-white p-12 rounded-3xl border border-slate-100 shadow-sm text-center">
          <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Carregando...</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna 1: Requisição Criada */}
          <div className="space-y-4">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-amber-500 rounded-full" />
              Requisição Criada ({created.length})
            </h2>
            {created.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-200 text-center">
                <p className="text-slate-400 text-xs font-bold uppercase">Nenhuma requisição pendente</p>
              </div>
            ) : (
              created.map(order => (
                <div key={order.id} className={`bg-white p-5 rounded-2xl border shadow-sm space-y-3 ${order.status === 'rejected' ? 'border-rose-200' : 'border-slate-100'}`}>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 text-sm">{order.name}</h3>
                    <span className="text-sm font-black text-indigo-600">{formatCurrency(order.total)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold uppercase">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{order.createdBy || 'Desconhecido'}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(order.date)}</span>
                  </div>
                  {order.status === 'rejected' && (
                    <span className="inline-block px-2 py-0.5 bg-rose-100 text-rose-700 rounded-full text-[10px] font-black uppercase">
                      Rejeitada {order.rejectedBy ? `por ${order.rejectedBy}` : ''}
                    </span>
                  )}
                  <div>
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 mb-1">
                      <Package className="w-3 h-3" /> Itens
                    </span>
                    <ItemsList order={order} />
                  </div>
                  <textarea
                    value={getObservacao(order)}
                    onChange={(e) => setObservacaoDrafts(prev => ({ ...prev, [order.id]: e.target.value }))}
                    onBlur={() => updateObservacao(order.id, getObservacao(order))}
                    placeholder="Observação (opcional)..."
                    rows={2}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-100 rounded-xl text-xs font-medium outline-none focus:border-indigo-500 resize-none"
                  />
                  <div className="flex items-center gap-2">
                    {order.status !== 'rejected' && (
                      <button
                        onClick={() => approveRequisition(order.id, getObservacao(order))}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase transition-all"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Aprovar Requisição
                      </button>
                    )}
                    {order.status !== 'rejected' ? (
                      <button
                        onClick={() => setConfirmModal({ open: true, action: 'reject', id: order.id })}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-black uppercase transition-all"
                      >
                        <X className="w-3.5 h-3.5" />
                        Rejeitar
                      </button>
                    ) : (
                      <button
                        onClick={() => setConfirmModal({ open: true, action: 'delete', id: order.id })}
                        className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-xs font-black uppercase transition-all"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Excluir
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Coluna 2: Requisição Aprovada */}
          <div className="space-y-4">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-indigo-500 rounded-full" />
              Requisição Aprovada ({requisitionApproved.length})
            </h2>
            {requisitionApproved.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-200 text-center">
                <p className="text-slate-400 text-xs font-bold uppercase">Nenhuma requisição aprovada</p>
              </div>
            ) : (
              requisitionApproved.map(order => (
                <div key={order.id} className="bg-white p-5 rounded-2xl border border-indigo-100 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 text-sm">{order.name}</h3>
                    <span className="text-sm font-black text-indigo-600">{formatCurrency(order.total)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold uppercase">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{order.createdBy || 'Desconhecido'}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(order.date)}</span>
                  </div>
                  <span className="inline-block px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full text-[10px] font-black uppercase">
                    Requisição aprovada {order.requisitionApprovedBy ? `por ${order.requisitionApprovedBy}` : ''}
                  </span>
                  <div>
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 mb-1">
                      <Package className="w-3 h-3" /> Itens
                    </span>
                    <ItemsList order={order} />
                  </div>
                  {order.observacao && (
                    <p className="text-xs text-slate-500 italic">"{order.observacao}"</p>
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => approveOrder(order.id, order.observacao)}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black uppercase transition-all"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Aprovar Compra
                    </button>
                    <button
                      onClick={() => setConfirmModal({ open: true, action: 'reject', id: order.id })}
                      className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-black uppercase transition-all"
                    >
                      <X className="w-3.5 h-3.5" />
                      Rejeitar
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Coluna 3: Compra Aprovada */}
          <div className="space-y-4">
            <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <span className="w-2.5 h-2.5 bg-emerald-500 rounded-full" />
              Compra Aprovada ({approved.length})
            </h2>
            {approved.length === 0 ? (
              <div className="bg-white p-8 rounded-2xl border border-dashed border-slate-200 text-center">
                <p className="text-slate-400 text-xs font-bold uppercase">Nenhuma compra aprovada</p>
              </div>
            ) : (
              approved.map(order => (
                <div key={order.id} className="bg-white p-5 rounded-2xl border border-emerald-100 shadow-sm space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold text-slate-900 text-sm">{order.name}</h3>
                    <span className="text-sm font-black text-indigo-600">{formatCurrency(order.total)}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold uppercase">
                    <span className="flex items-center gap-1"><User className="w-3 h-3" />{order.createdBy || 'Desconhecido'}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{formatDate(order.date)}</span>
                  </div>
                  <span className="inline-block px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-black uppercase">
                    Compra aprovada {order.approvedBy ? `por ${order.approvedBy}` : ''}
                  </span>
                  <div>
                    <span className="flex items-center gap-1 text-[10px] font-black uppercase text-slate-400 mb-1">
                      <Package className="w-3 h-3" /> Itens
                    </span>
                    <ItemsList order={order} />
                  </div>
                  {order.observacao && (
                    <p className="text-xs text-slate-500 italic">"{order.observacao}"</p>
                  )}
                  <button
                    onClick={() => sendToShoppingList(order.id)}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase transition-all shadow-md"
                  >
                    <Send className="w-3.5 h-3.5" />
                    Enviar para Lista de Compras
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={confirmModal.open}
        onClose={() => setConfirmModal({ open: false, action: null, id: null })}
        onConfirm={handleConfirm}
        variant={confirmModal.action === 'delete' ? 'danger' : undefined}
        title={confirmModal.action === 'reject' ? 'Rejeitar ordem de compra?' : 'Excluir ordem de compra?'}
        message={confirmModal.action === 'reject'
          ? 'A ordem ficará marcada como rejeitada. Você pode excluí-la depois.'
          : 'Isso vai apagar permanentemente esta ordem de compra rejeitada.'}
      />
    </motion.div>
  );
};
