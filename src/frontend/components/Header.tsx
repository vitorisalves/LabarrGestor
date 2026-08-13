/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShoppingCart, Menu, CloudOff, RefreshCw, LayoutGrid, Beaker } from 'lucide-react';
import { NotificationCenter } from './NotificationCenter';
import { UINotification, AppNotification, CartItem } from '../types';
import { useTestMode } from '../context/TestModeContext';

interface HeaderProps {
  notifications: UINotification[];
  appNotifications: AppNotification[];
  isNotificationsOpen: boolean;
  setIsNotificationsOpen: (open: boolean) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  cart: CartItem[];
  setIsCartOpen: (open: boolean) => void;
  onMenuToggle?: () => void;
  requestPermission?: () => void;
  isOffline?: boolean;
  onReconnect?: () => void;
  activeWindow?: 'compras' | 'dre';
  onWindowChange?: (win: 'compras' | 'dre') => void;
}

export const Header: React.FC<HeaderProps> = ({
  notifications,
  appNotifications,
  isNotificationsOpen,
  setIsNotificationsOpen,
  markAllAsRead,
  clearNotifications,
  cart,
  setIsCartOpen,
  onMenuToggle,
  requestPermission,
  isOffline,
  onReconnect,
  activeWindow,
  onWindowChange
}) => {
  const { isTestMode, toggleTestMode } = useTestMode();
  const cartItemsCount = cart.reduce((acc, item) => acc + item.quantity, 0);

  return (
    <header className="flex justify-between items-center gap-4 mb-8 md:mb-12 flex-wrap">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="p-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-all shadow-sm cursor-pointer"
          title="Abrir Menu"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Alternador de Janela */}
        {activeWindow && onWindowChange && (
          <div className="flex bg-slate-900 p-0.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
            <button
              onClick={() => onWindowChange('compras')}
              className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all border-0 cursor-pointer ${
                activeWindow === 'compras'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white bg-transparent'
              }`}
            >
              Compras
            </button>
            <button
              onClick={() => onWindowChange('dre')}
              className={`px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all border-0 cursor-pointer ${
                activeWindow === 'dre'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-300 hover:text-white bg-transparent'
              }`}
            >
              DRE
            </button>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3 md:gap-4 ml-auto">
        <button
          onClick={toggleTestMode}
          className={`flex items-center gap-2 px-3 py-2 border rounded-xl shadow-sm transition-all text-xs font-bold ${
            isTestMode 
              ? 'bg-amber-100 border-amber-300 text-amber-800 hover:bg-amber-200'
              : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-amber-600'
          }`}
          title={isTestMode ? 'Desativar Modo de Teste' : 'Ativar Modo de Teste'}
        >
          <Beaker className="w-4 h-4" />
          <span className="hidden sm:inline">TESTE</span>
        </button>

        {/* Indicador de Status de Sincronização */}
        {isOffline && (
          <button 
            onClick={onReconnect}
            className="flex items-center gap-2 px-4 py-2 bg-amber-50 border border-amber-100 text-amber-700 rounded-xl shadow-sm animate-pulse cursor-pointer hover:bg-amber-100 transition-colors"
            title="Sincronização interrompida (Limite atingido). Clique para tentar reconectar."
          >
            <CloudOff className="w-4 h-4" />
            <span className="text-[10px] font-bold hidden sm:inline">LIMITE ATINGIDO (RECONECTAR)</span>
          </button>
        )}

        {/* Botão do Carrinho */}
        <button
          onClick={() => setIsCartOpen(true)}
          className="relative p-2.5 bg-white border border-slate-200 text-slate-500 rounded-xl hover:bg-slate-50 hover:text-indigo-600 transition-all shadow-sm group"
        >
          <ShoppingCart className="w-5 h-5" />
          {cartItemsCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-indigo-600 text-white text-[9px] font-bold rounded-full flex items-center justify-center border-2 border-white shadow-sm group-hover:scale-110 transition-transform">
              {cartItemsCount}
            </span>
          )}
        </button>

        {/* Centro de Notificações */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-all">
          <NotificationCenter 
            notifications={notifications}
            appNotifications={appNotifications}
            isOpen={isNotificationsOpen}
            setIsOpen={setIsNotificationsOpen}
            markAllAsRead={markAllAsRead}
            clearNotifications={clearNotifications}
            setIsCartOpen={setIsCartOpen}
            requestPermission={requestPermission}
          />
        </div>
      </div>
    </header>
  );
};
