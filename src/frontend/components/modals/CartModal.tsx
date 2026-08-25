import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ShoppingCart, Minus, Plus, Trash2, Check } from 'lucide-react';
import { CartItem } from '../../types';
import { formatCurrency } from '../../utils';

interface CartModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  listName: string;
  setListName: (name: string) => void;
  shippingFee: number;
  setShippingFee: (fee: number) => void;
  updateCartQuantity: (name: string, supplier: string, delta: number) => void;
  setCartQuantity?: (name: string, supplier: string, quantity: number) => void;
  updateProductPrice: (name: string, supplier: string, newPrice: number) => void;
  removeFromCart: (name: string, supplier: string) => void;
  finalizeList: () => void;
  isFinalizing: boolean;
  clearCart: () => void;
  isEditingList?: boolean;
}

export const CartModal: React.FC<CartModalProps> = ({
  isOpen,
  onClose,
  cart,
  listName,
  setListName,
  shippingFee,
  setShippingFee,
  updateCartQuantity,
  setCartQuantity,
  updateProductPrice,
  removeFromCart,
  finalizeList,
  isFinalizing,
  clearCart,
  isEditingList = false
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={onClose}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="bg-white w-full max-w-2xl rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3 md:gap-4">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg shadow-slate-200">
                  <ShoppingCart className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">Carrinho</h2>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{cart.length} itens</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-200 rounded-xl transition-all text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-slate-900">
              {cart.length > 0 && (
                <div className="space-y-4 pb-6 border-b border-slate-100">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-widest">Identificação da Lista</label>
                    <input
                      type="text"
                      placeholder="Ex: Compra Semanal"
                      className="w-full px-5 py-3 bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all font-medium text-slate-700"
                      value={listName}
                      onChange={(e) => setListName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && listName.trim() && !isFinalizing) {
                          e.preventDefault();
                          finalizeList();
                        }
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold text-slate-400 ml-1 uppercase tracking-widest">Taxa de Entrega (Frete)</label>
                    <input
                      type="number"
                      className="w-full px-5 py-3 bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all font-medium text-slate-700"
                      value={shippingFee}
                      onChange={(e) => setShippingFee(Number(e.target.value))}
                    />
                  </div>
                </div>
              )}

              {cart.length === 0 ? (
                <div className="text-center py-20 text-slate-400">
                  <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-dashed border-slate-200">
                    <ShoppingCart className="w-8 h-8 opacity-20" />
                  </div>
                  <p className="text-lg font-bold text-slate-900">O carrinho está vazio</p>
                  <p className="text-sm font-medium text-slate-400 mt-1">Adicione produtos para começar.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((item, i) => (
                    <div key={i} className="flex items-center justify-between p-4 bg-white rounded-xl border border-slate-100 hover:border-indigo-100 transition-all">
                      <div className="flex-1">
                        <p className="font-bold text-slate-700 tracking-tight leading-tight">{item.name}</p>
                        <div className="flex flex-wrap items-center gap-2 mt-1 leading-tight">
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                            {item.supplierName}
                          </span>
                          <span className="text-slate-300">|</span>
                          {item.setor && (
                            <>
                              <span className="text-[9px] font-black text-indigo-600 bg-indigo-50 px-1.5 rounded border border-indigo-100 uppercase tracking-wider">
                                {item.setor}
                              </span>
                              <span className="text-slate-300">|</span>
                            </>
                          )}
                          {item.code ? (
                            <span className="text-[9px] font-mono text-emerald-700 bg-emerald-50 px-1 rounded border border-emerald-100">
                              Cód: {item.code}
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold text-rose-600 bg-rose-50 px-1 rounded border border-rose-100 uppercase tracking-wider">
                              Não Associado
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 bg-slate-50 px-2 py-1.5 rounded-lg border border-slate-100">
                          <button onClick={() => updateCartQuantity(item.name, item.supplierName, -1)} className="text-slate-400 hover:text-red-500 transition-colors p-0.5 cursor-pointer">
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="text"
                            inputMode="decimal"
                            className="w-12 text-center font-bold text-slate-800 text-sm tabular-nums bg-white border border-slate-200 rounded px-1 py-0.5 outline-none focus:ring-2 focus:ring-indigo-500"
                            value={item.quantity === 0 ? '' : item.quantity}
                            onChange={(e) => {
                              const raw = e.target.value.replace(',', '.');
                              if (raw === '') {
                                if (setCartQuantity) {
                                  setCartQuantity(item.name, item.supplierName, 0);
                                }
                              } else if (!isNaN(Number(raw))) {
                                const val = Number(raw);
                                if (setCartQuantity) {
                                  setCartQuantity(item.name, item.supplierName, val);
                                } else {
                                  const delta = val - item.quantity;
                                  updateCartQuantity(item.name, item.supplierName, delta);
                                }
                              }
                            }}
                            onBlur={() => {
                              if (!item.quantity || item.quantity <= 0) {
                                if (setCartQuantity) {
                                  setCartQuantity(item.name, item.supplierName, 1);
                                } else {
                                  updateCartQuantity(item.name, item.supplierName, 1 - item.quantity);
                                }
                              }
                            }}
                          />
                          <button onClick={() => updateCartQuantity(item.name, item.supplierName, 1)} className="text-slate-400 hover:text-green-600 transition-colors p-0.5 cursor-pointer">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                        <div className="text-right min-w-[80px]">
                          <input
                            type="number"
                            className="w-20 text-right font-black text-slate-800 text-sm tabular-nums bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none"
                            value={item.price}
                            onChange={(e) => updateProductPrice(item.name, item.supplierName, Number(e.target.value))}
                          />
                        </div>
                        <button onClick={() => removeFromCart(item.name, item.supplierName)} className="p-2 text-black hover:text-red-500 transition-all">
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
                <div className="shrink-0 px-2 flex flex-col gap-1">
                  <div className="flex justify-between gap-4">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Subtotal</p>
                    <p className="text-sm font-black text-slate-600 tracking-tighter tabular-nums leading-none">
                        {formatCurrency(cart.reduce((acc, item) => acc + (item.price * item.quantity), 0))}
                    </p>
                  </div>
                  <div className="flex justify-between gap-4">
                      <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Frete</p>
                      <p className="text-sm font-black text-slate-600 tracking-tighter tabular-nums leading-none">
                          {formatCurrency(shippingFee)}
                      </p>
                  </div>
                  <div className="flex justify-between gap-4 pt-1 border-t border-slate-200">
                    <p className="text-[9px] font-bold text-slate-900 uppercase tracking-widest leading-none">Total</p>
                    <p className="text-xl font-black text-slate-900 tracking-tighter tabular-nums leading-none">
                        {formatCurrency(cart.reduce((acc, item) => acc + (item.price * item.quantity), 0) + shippingFee)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-1 justify-end max-w-[280px]">
                  <button
                    onClick={finalizeList}
                    disabled={!listName.trim() || isFinalizing}
                    className="flex-1 py-3 bg-indigo-600 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest shadow-md hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {isFinalizing ? (
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                        className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      />
                    ) : (
                      <>
                        <Check className="w-4 h-4" />
                        {isEditingList ? 'Salvar Alterações' : 'Enviar para Aprovação'}
                      </>
                    )}
                  </button>
                  
                  <button 
                    onClick={clearCart}
                    className="p-3 bg-red-50 text-red-500 rounded-xl hover:bg-red-100 transition-all flex items-center justify-center shrink-0"
                    title="Limpar Tudo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
