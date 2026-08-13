/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'framer-motion';
import { Building2, User, ListChecks } from 'lucide-react';

interface LoginProps {
  loginCpf: string;
  setLoginCpf: (cpf: string) => void;
  loginName: string;
  setLoginName: (name: string) => void;
  loginError: string;
  handleLogin: (e: React.FormEvent) => void;
  authorizedCpfs?: string[];
}

export const Login: React.FC<LoginProps> = ({
  loginCpf,
  setLoginCpf,
  loginName,
  setLoginName,
  loginError,
  handleLogin,
  authorizedCpfs = []
}) => {
  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="max-w-md w-full"
      >
        <div className="text-center mb-8">
          <div className="w-40 h-40 bg-white rounded-[2.5rem] overflow-hidden flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-indigo-100 border-2 border-slate-900 transition-transform hover:scale-105 active:scale-95 cursor-pointer">
            <img 
              src="https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTF8VmLyweYpbSL_D3D1F-hsvmGwm9EHcPi5A&s" 
              alt="Logo" 
              className="w-full h-full object-cover p-1"
              referrerPolicy="no-referrer"
            />
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Labarr</h1>
          <p className="text-slate-500 font-medium">Gerenciador de Compras e Fornecedores</p>
        </div>

        <div className="bg-white p-8 rounded-[2rem] shadow-2xl shadow-slate-200/60 border-2 border-slate-900">
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-black text-slate-900 mb-2 ml-1 uppercase tracking-wider">Seu CPF</label>
              <div className="relative">
                <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-900" />
                <input
                  type="text"
                  list="cpfs"
                  placeholder="000.000.000-00"
                  className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-900 focus:ring-4 focus:ring-indigo-100 rounded-2xl outline-none transition-all font-bold text-slate-900 placeholder:text-slate-300"
                  value={loginCpf}
                  onChange={(e) => setLoginCpf(e.target.value)}
                  required
                />
                <datalist id="cpfs">
                  {authorizedCpfs.map(cpf => (
                    <option key={cpf} value={cpf} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className="block text-sm font-black text-slate-900 mb-2 ml-1 uppercase tracking-wider">Seu Nome (para novos cadastros)</label>
              <div className="relative">
                <ListChecks className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-900" />
                <input
                  type="text"
                  placeholder="Como quer ser chamado?"
                  className="w-full pl-12 pr-4 py-4 bg-white border-2 border-slate-900 focus:ring-4 focus:ring-indigo-100 rounded-2xl outline-none transition-all font-bold text-slate-900 placeholder:text-slate-300"
                  value={loginName}
                  onChange={(e) => setLoginName(e.target.value)}
                />
              </div>
            </div>

            {loginError && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="p-4 bg-red-50 border-2 border-red-600 rounded-2xl"
              >
                <p className="text-red-600 text-sm font-black text-center">{loginError}</p>
              </motion.div>
            )}

            <button
              type="submit"
              className="w-full py-4 bg-slate-900 hover:bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-slate-200 transition-all active:scale-[0.98] border-b-4 border-slate-700 active:border-b-0"
            >
              Entrar no Sistema
            </button>
          </form>
        </div>
        
        <p className="text-center mt-8 text-slate-400 text-sm font-medium">
          Acesso restrito a usuários autorizados
        </p>
      </motion.div>
    </div>
  );
};
