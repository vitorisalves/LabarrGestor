/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCcw, AlertTriangle } from 'lucide-react';
import { extractErrorMessage } from '../utils';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', extractErrorMessage(error));
  }

  public render() {
    if (this.state.hasError) {
      const isAssertionError = this.state.error?.message.includes('ASSERTION FAILED');
      
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 text-center">
          <div className="max-w-md w-full bg-white p-10 rounded-[3rem] shadow-2xl border-2 border-slate-900">
            <div className="w-20 h-20 bg-red-50 text-red-600 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-red-100">
              <AlertTriangle className="w-10 h-10" />
            </div>
            
            <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase mb-2 text-balance leading-none">
              Ops! Ocorreu um erro
            </h1>
            
            <p className="text-slate-500 font-medium mb-8 text-sm leading-relaxed">
              {isAssertionError 
                ? "O banco de dados do Firebase encontrou uma instabilidade temporária. Isso geralmente acontece quando o limite de cota é atingido."
                : "Houve uma falha inesperada na renderização do aplicativo."}
            </p>

            <div className="p-4 bg-slate-50 rounded-2xl mb-8 border border-slate-200">
                <code className="text-[10px] text-slate-400 font-bold block max-h-20 overflow-y-auto break-words">
                    {this.state.error?.message || "Erro desconhecido"}
                </code>
            </div>

            <button
              onClick={() => window.location.reload()}
              className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-600 transition-all flex items-center justify-center gap-3 shadow-lg shadow-slate-200"
            >
              <RefreshCcw className="w-4 h-4" />
              Recarregar Aplicativo
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
