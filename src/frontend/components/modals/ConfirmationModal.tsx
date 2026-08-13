import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2 } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'info';
}

export const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  variant = 'danger'
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[250] flex items-center justify-center p-4" onClick={onClose}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.2 }}
            className="bg-white w-full max-w-sm p-8 rounded-2xl shadow-xl text-center"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`w-16 h-16 ${variant === 'danger' ? 'bg-red-50 text-red-500' : 'bg-indigo-50 text-indigo-500'} rounded-xl flex items-center justify-center mx-auto mb-6`}>
              <Trash2 className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900 mb-2">{title}</h3>
            <p className="text-slate-500 text-sm font-medium mb-8">{message}</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onClose}
                className="py-3 text-slate-500 text-sm font-bold hover:bg-slate-50 rounded-xl transition-all"
              >
                {cancelText}
              </button>
              <button
                onClick={onConfirm}
                className={`py-3 ${variant === 'danger' ? 'bg-red-500 hover:bg-red-600' : 'bg-indigo-600 hover:bg-indigo-700'} text-white rounded-xl text-sm font-bold shadow-md transition-all`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
