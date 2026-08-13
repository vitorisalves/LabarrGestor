import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { motion, AnimatePresence } from 'framer-motion';
import { useTestMode } from '../context/TestModeContext';
import { Beaker } from 'lucide-react';

interface AppLayoutProps {
  children: React.ReactNode;
  currentPage: any;
  setCurrentPage: (page: any) => void;
  isAdmin: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  handleLogout: () => void;
  loggedName: string;
  isSidebarOpen: boolean;
  setIsSidebarOpen: (open: boolean) => void;
  requestPermission: () => Promise<void>;
  notifications: any[];
  appNotifications: any[];
  isNotificationsOpen: boolean;
  setIsNotificationsOpen: (open: boolean) => void;
  markAllAsRead: () => void;
  clearNotifications: () => void;
  cart: any[];
  setIsCartOpen: (open: boolean) => void;
  isOffline: boolean;
  onReconnect: () => void;
  activeWindow?: 'compras' | 'dre';
  onWindowChange?: (win: 'compras' | 'dre') => void;
}

export const AppLayout: React.FC<AppLayoutProps> = ({
  children,
  currentPage,
  setCurrentPage,
  isAdmin,
  setIsSettingsOpen,
  handleLogout,
  loggedName,
  isSidebarOpen,
  setIsSidebarOpen,
  requestPermission,
  notifications,
  appNotifications,
  isNotificationsOpen,
  setIsNotificationsOpen,
  markAllAsRead,
  clearNotifications,
  cart,
  setIsCartOpen,
  isOffline,
  onReconnect,
  activeWindow,
  onWindowChange
}) => {
  const { isTestMode } = useTestMode();

  return (
    <div className="min-h-screen bg-slate-200 flex flex-col">
      <AnimatePresence>
        {isTestMode && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="w-full bg-amber-500 text-amber-950 px-4 py-2 text-sm font-semibold flex items-center justify-center gap-2 z-50 overflow-hidden"
          >
            <Beaker className="w-4 h-4" />
            <span>Modo de Teste Ativo - As ações realizadas aqui não afetam os dados reais.</span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="flex-1 flex">
      <Sidebar 
        currentPage={currentPage} 
        setCurrentPage={setCurrentPage} 
        isAdmin={isAdmin}
        setIsSettingsOpen={setIsSettingsOpen}
        handleLogout={handleLogout}
        loggedName={loggedName}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        activeWindow={activeWindow}
      />

      <main className="flex-1 p-4 md:p-6 lg:p-8 w-full overflow-x-hidden min-h-screen transition-all">
        <div className="w-full max-w-[1800px] mx-auto">
          <Header
            requestPermission={requestPermission} 
            notifications={notifications}
            appNotifications={appNotifications}
            isNotificationsOpen={isNotificationsOpen}
            setIsNotificationsOpen={setIsNotificationsOpen}
            markAllAsRead={markAllAsRead}
            clearNotifications={clearNotifications}
            cart={cart}
            setIsCartOpen={setIsCartOpen}
            onMenuToggle={() => setIsSidebarOpen(true)}
            isOffline={isOffline}
            onReconnect={onReconnect}
            activeWindow={activeWindow}
            onWindowChange={onWindowChange}
          />
          {children}
        </div>
      </main>
      </div>
    </div>
  );
};
