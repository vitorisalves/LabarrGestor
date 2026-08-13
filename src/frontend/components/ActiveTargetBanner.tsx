import React from 'react';
import { motion } from 'framer-motion';
import { PlusCircle } from 'lucide-react';

interface ActiveTargetBannerProps {
  name: string | null;
  onClear: () => void;
}

export const ActiveTargetBanner: React.FC<ActiveTargetBannerProps> = ({ name, onClear }) => {
  if (!name) return null;

  return (
    <motion.div 
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="mb-8 p-6 bg-indigo-600 rounded-[2.5rem] border-2 border-slate-900 shadow-xl shadow-indigo-100 flex flex-col md:flex-row items-center justify-between gap-6"
    >
      <div className="flex items-center gap-6">
        <div className="w-16 h-16 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center border border-white/30">
          <PlusCircle className="w-8 h-8 text-white" />
        </div>
        <div>
          <p className="text-[10px] font-black text-indigo-100 uppercase tracking-widest mb-1">Você está adicionando itens à:</p>
          <h3 className="text-2xl font-black text-white uppercase tracking-tighter">{name}</h3>
        </div>
      </div>
      <button 
        onClick={onClear}
        className="w-full md:w-auto px-6 py-3 bg-white text-indigo-600 rounded-xl font-black uppercase text-xs tracking-widest hover:bg-slate-100 transition-all active:scale-95 shadow-lg border-b-4 border-slate-200 active:border-b-0"
      >
        Concluir Edição
      </button>
    </motion.div>
  );
};
