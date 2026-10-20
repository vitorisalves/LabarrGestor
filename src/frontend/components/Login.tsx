/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'framer-motion';

interface LoginProps {
  loginError: string;
  loginWithGoogle: () => void;
  /** Conta Google já ativa, mas ainda não aprovada: mostra a tela de espera. */
  isPendingApproval?: boolean;
  signedInEmail?: string;
  handleLogout?: () => void;
}

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" className="w-6 h-6" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.5l6.7-6.7C35.6 2.4 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.5 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
    <path fill="#FBBC05" d="M10.4 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.9 16.4 0 20.1 0 24s.9 7.6 2.6 10.8l7.8-6.1z" />
    <path fill="#34A853" d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.6-5.9c-2.1 1.4-4.8 2.3-7.6 2.3-6.3 0-11.7-4-13.6-9.8l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

export const Login: React.FC<LoginProps> = ({
  loginError,
  loginWithGoogle,
  isPendingApproval = false,
  signedInEmail = '',
  handleLogout
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
          {isPendingApproval ? (
            <div className="space-y-6 text-center">
              <div>
                <p className="text-xl font-black text-slate-900 mb-2">Aguardando aprovação</p>
                <p className="text-slate-600 font-medium">
                  Sua solicitação foi enviada. Quando um administrador liberar o acesso, ele aparece aqui automaticamente.
                </p>
              </div>
              {signedInEmail && (
                <p className="text-sm font-black text-slate-900 break-all">{signedInEmail}</p>
              )}
              <button
                type="button"
                onClick={handleLogout}
                className="w-full py-4 bg-white hover:bg-slate-100 text-slate-900 rounded-2xl font-black text-lg border-2 border-slate-900 transition-all active:scale-[0.98]"
              >
                Sair e usar outra conta
              </button>
            </div>
          ) : (
            <div className="space-y-6">
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
                type="button"
                onClick={loginWithGoogle}
                className="w-full py-4 bg-slate-900 hover:bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-slate-200 transition-all active:scale-[0.98] border-b-4 border-slate-700 active:border-b-0 flex items-center justify-center gap-3"
              >
                <span className="bg-white rounded-full p-1 flex"><GoogleMark /></span>
                Entrar com Google
              </button>
            </div>
          )}
        </div>

        <p className="text-center mt-8 text-slate-400 text-sm font-medium">
          Acesso restrito a contas autorizadas
        </p>
      </motion.div>
    </div>
  );
};
