import React from 'react';
import { motion } from 'framer-motion';
import { RefreshCcw } from 'lucide-react';

interface QuotaBannerProps {
  error: string | null;
  isQuotaExceeded: boolean;
  onReconnect: () => void;
}

export const QuotaBanner: React.FC<QuotaBannerProps> = ({ error, isQuotaExceeded, onReconnect }) => {
  if (!error) return null;

  const smallLabelStyle = "text-[10px] font-black uppercase tracking-[0.2em] leading-none opacity-50";

  return (
    <motion.div 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8 overflow-hidden bg-white border border-slate-200 rounded-2xl shadow-sm"
    >
      <div className="flex items-center gap-3 px-6 py-3 bg-slate-900 text-white">
        <RefreshCcw className="w-4 h-4 animate-spin-slow" />
        <div className="flex flex-col">
          <span className={smallLabelStyle}>Status de Conexão</span>
          <span className="text-sm font-bold tracking-tight">Sincronização Limitada (Modo Offline)</span>
        </div>
      </div>
      
      <div className="p-6">
        <p className="text-slate-600 font-medium text-sm leading-relaxed mb-4">
          {isQuotaExceeded 
            ? (
              <>
                O limite diário de leitura do banco de dados foi atingido. O sistema está operando em <span className="font-bold text-slate-900 underline decoration-indigo-500/30 underline-offset-4">modo de alta disponibilidade local</span>.
                <br /><br />
                Você pode continuar usando o app normalmente. Suas alterações serão salvas localmente e sincronizadas assim que a cota for restaurada (meia-noite de hoje).
              </>
            )
            : `Ocorreu um erro técnico: ${error}`}
        </p>
        
        <div className="flex items-center justify-between pt-4 border-t border-slate-100 flex-wrap gap-4">
          <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400">
            <span className="w-2 h-2 rounded-full bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.5)]" />
            <span>DADOS CARREGADOS DO CACHE (BROWSER)</span>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            <a 
              href="https://firebase.google.com/pricing#cloud-firestore" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-[10px] font-black text-slate-400 uppercase tracking-widest hover:text-indigo-600 transition-colors"
            >
              Documentação de Cota →
            </a>

            <button 
              onClick={onReconnect}
              className="text-[10px] font-black text-white bg-indigo-600 px-4 py-2 rounded-xl uppercase tracking-tighter hover:bg-indigo-700 transition-all flex items-center gap-2"
            >
              <RefreshCcw className="w-3 h-3" />
              Tentar Reconectar Agora
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
};
