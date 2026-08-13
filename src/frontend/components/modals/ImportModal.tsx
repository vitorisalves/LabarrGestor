import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Package, Plus, Trash2 } from 'lucide-react';
import { Supplier } from '../../types';

interface ImportModalProps {
  pendingImportData: Record<string, Supplier> | null;
  onClose: () => void;
  onPerformImport: (replace: boolean) => void;
  isImporting: boolean;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  pendingImportData,
  onClose,
  onPerformImport,
  isImporting
}) => {
  return (
    <AnimatePresence>
      {pendingImportData && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[230] flex items-center justify-center p-4" onClick={onClose}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="bg-white w-full max-w-lg p-8 md:p-10 rounded-[3rem] shadow-2xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-24 h-24 bg-indigo-50 text-indigo-600 rounded-[2rem] flex items-center justify-center mx-auto mb-8 border-4 border-indigo-100 shadow-xl shadow-indigo-100/30 relative">
              <button 
                onClick={onClose}
                className="absolute -top-4 -right-4 p-2 bg-white border-2 border-slate-900 rounded-xl hover:bg-slate-100 transition-all text-slate-900 shadow-lg"
                title="Fechar"
              >
                <X className="w-5 h-5" />
              </button>
              <motion.div
                animate={isImporting ? { rotate: 360 } : {}}
                transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
              >
                <Package className="w-12 h-12" />
              </motion.div>
            </div>
            
            <h3 className="text-3xl font-black text-slate-900 mb-2 uppercase tracking-tighter">Importar Lista</h3>
            <p className="text-slate-500 font-medium mb-8">
              Encontramos <span className="text-indigo-600 font-black">{Object.keys(pendingImportData).length} fornecedores</span> no arquivo. 
              Como deseja prosseguir?
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-900">
              <button
                disabled={isImporting}
                onClick={() => onPerformImport(false)}
                className="group relative flex flex-col items-center gap-3 p-6 bg-white border-2 border-slate-100 hover:border-indigo-600 rounded-3xl transition-all shadow-sm disabled:opacity-50"
              >
                <Plus className="w-6 h-6 text-indigo-600 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <p className="font-black text-slate-900 uppercase text-xs tracking-widest leading-none mb-1">Manter Atuais</p>
                  <p className="text-[10px] text-slate-400 font-bold leading-tight">Adicionar novos ao final da lista existente.</p>
                </div>
              </button>

              <button
                disabled={isImporting}
                onClick={() => onPerformImport(true)}
                className="group relative flex flex-col items-center gap-3 p-6 bg-white border-2 border-slate-100 hover:border-red-600 rounded-3xl transition-all shadow-sm disabled:opacity-50"
              >
                <Trash2 className="w-6 h-6 text-red-600 group-hover:scale-110 transition-transform" />
                <div className="text-left">
                  <p className="font-black text-slate-900 uppercase text-xs tracking-widest leading-none mb-1 text-red-600">Substituir Tudo</p>
                  <p className="text-[10px] text-slate-400 font-bold leading-tight">Substitui apenas a lista Fornecedores. Mercado e Materiais serão mantidos.</p>
                </div>
              </button>
            </div>

            <div className="mt-8">
              <button
                disabled={isImporting}
                onClick={onClose}
                className="w-full py-4 text-slate-400 font-black uppercase text-xs tracking-widest hover:text-slate-900 transition-colors"
              >
                Cancelar Importação
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
