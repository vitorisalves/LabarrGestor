import React from 'react';
import { motion } from 'framer-motion';
import { BellRing, X } from 'lucide-react';

interface PermissionBannerProps {
  show: boolean;
  onDismiss: () => void;
  onRequest: () => void;
}

export const PermissionBanner: React.FC<PermissionBannerProps> = ({ show, onDismiss, onRequest }) => {
  if (!show) return null;

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 p-6 bg-indigo-600 rounded-[2rem] text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl shadow-indigo-100"
    >
      <div className="flex items-center gap-5">
        <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center shrink-0 border border-white/20">
          <BellRing className="w-7 h-7 text-white" />
        </div>
        <div>
          <h3 className="font-bold text-base">Ative Notificações no Celular</h3>
          <p className="text-sm text-indigo-100 font-medium">Receba alertas de lembretes e novas listas de compras direto no seu dispositivo.</p>
          <div className="flex flex-col gap-1 mt-2">
            <p className="text-[10px] text-indigo-200 italic font-bold">Dica iPhone: Escolha "Compartilhar" &gt; "Adicionar à Tela de Início".</p>
            <p className="text-[10px] text-yellow-300 font-black uppercase tracking-wider">Atenção: Abra o app em uma NOVA ABA para as notificações funcionarem!</p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 w-full md:w-auto">
        <button 
          onClick={onRequest}
          className="flex-1 md:flex-none px-8 py-3 bg-white text-indigo-600 font-black text-xs rounded-xl hover:bg-indigo-50 transition-colors shadow-lg uppercase tracking-widest"
        >
          ATIVAR AGORA
        </button>
        <button 
          onClick={onDismiss}
          className="p-3 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
        >
          <X className="w-6 h-6" />
        </button>
      </div>
    </motion.div>
  );
};
