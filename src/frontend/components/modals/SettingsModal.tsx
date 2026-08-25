import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Settings, Package, Building2, Trash2, UserPlus, User, Check, Moon, Sun } from 'lucide-react';
import { AuthorizedUser } from '../../types';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: string[];
  newCategoryName: string;
  setNewCategoryName: (name: string) => void;
  handleAddCategory: () => void;
  setores: string[];
  newSetorName: string;
  setNewSetorName: (name: string) => void;
  handleAddSetor: () => void;
  authorizedUsers: AuthorizedUser[];
  updateUserStatus: (uid: string, status: 'approved' | 'denied') => void;
  setCategoryToDelete: (cat: string) => void;
  setSetorToDelete: (setor: string) => void;
  setUserToDelete: (uid: string) => void;
  isDarkMode?: boolean;
  setIsDarkMode?: (dark: boolean) => void;
  isAdmin?: boolean;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  categories,
  newCategoryName,
  setNewCategoryName,
  handleAddCategory,
  setores,
  newSetorName,
  setNewSetorName,
  handleAddSetor,
  authorizedUsers,
  updateUserStatus,
  setCategoryToDelete,
  setSetorToDelete,
  setUserToDelete,
  isDarkMode = false,
  setIsDarkMode,
  isAdmin = true
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[200] flex items-center justify-center p-4" onClick={onClose}>
          <motion.div 
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="bg-white w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center shadow-lg">
                  <Settings className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">Painel de Controle</h2>
                  <p className="text-[10px] md:text-xs text-slate-400 font-bold uppercase tracking-widest">Administração do sistema</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 hover:bg-slate-200 rounded-xl transition-all"
              >
                <X className="w-5 h-5 text-slate-400" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-10">
              {isAdmin && (
                <>
                  {/* Categorias */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-3 uppercase tracking-wider">
                      <Package className="w-4 h-4 text-indigo-600" />
                      Categorias
                    </h3>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Nova categoria..."
                        className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all font-medium text-sm"
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCategory();
                          }
                        }}
                      />
                      <button
                        onClick={handleAddCategory}
                        className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm"
                      >
                        Adicionar
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set(categories)).map((cat, idx) => (
                        <div key={`${cat}-${idx}`} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-xs font-bold border border-slate-100 group">
                          {cat}
                          <button
                            onClick={() => setCategoryToDelete(cat)}
                            className="p-0.5 text-black hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Setores */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-3 uppercase tracking-wider">
                      <Building2 className="w-4 h-4 text-indigo-600" />
                      Setores
                    </h3>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="Novo setor..."
                        className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white rounded-xl outline-none transition-all font-medium text-sm"
                        value={newSetorName}
                        onChange={(e) => setNewSetorName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddSetor();
                          }
                        }}
                      />
                      <button
                        onClick={handleAddSetor}
                        className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-slate-800 transition-all shadow-sm"
                      >
                        Adicionar
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {Array.from(new Set(setores)).map((setor, idx) => (
                        <div key={`${setor}-${idx}`} className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 text-slate-600 rounded-lg text-xs font-bold border border-slate-100 group">
                          {setor}
                          <button
                            onClick={() => setSetorToDelete(setor)}
                            className="p-0.5 text-black hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                            title="Excluir"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>

                  {/* Usuários */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-3 uppercase tracking-wider">
                      <UserPlus className="w-4 h-4 text-indigo-600" />
                      Solicitações
                    </h3>
                    <div className="space-y-2">
                      {authorizedUsers.filter(u => u.status === 'pending').length === 0 ? (
                        <div className="text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Nenhuma pendência</p>
                        </div>
                      ) : (
                        authorizedUsers.filter(u => u.status === 'pending').map(user => (
                          <div key={user.uid} className="flex items-center justify-between p-4 bg-white border border-slate-100 rounded-xl shadow-sm">
                            <div className="flex items-center gap-3">
                              <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center">
                                <User className="w-5 h-5 text-indigo-600" />
                              </div>
                              <div>
                                <p className="font-bold text-slate-700 text-sm">{user.name || 'Sem nome'}</p>
                                <p className="text-[10px] text-slate-400 font-bold">CPF: {user.cpf}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                onClick={() => updateUserStatus(user.uid!, 'approved')}
                                className="p-2 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition-all"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => updateUserStatus(user.uid!, 'denied')}
                                className="p-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition-all"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </section>

                  {/* Usuários Já Autorizados */}
                  <section className="space-y-4">
                    <h3 className="text-sm font-black text-slate-800 flex items-center gap-3 uppercase tracking-wider">
                      <User className="w-4 h-4 text-emerald-600" />
                      Acessos Autorizados
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {authorizedUsers.filter(u => u.status === 'approved').length === 0 ? (
                        <div className="col-span-full text-center py-6 bg-slate-50 rounded-xl border border-dashed border-slate-200">
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest">Nenhum acesso liberado</p>
                        </div>
                      ) : (
                        authorizedUsers.filter(u => u.status === 'approved').map(user => (
                          <div key={user.uid} className="flex items-center justify-between p-3 bg-slate-50/50 border border-slate-100 rounded-xl group/user">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 bg-white border border-slate-100 rounded-lg flex items-center justify-center shadow-sm">
                                <span className="text-[10px] font-black text-slate-400">
                                  {user.name ? user.name.substring(0, 1).toUpperCase() : '?'}
                                </span>
                              </div>
                              <div>
                                <p className="font-bold text-slate-700 text-[14px] truncate max-w-[120px]">{user.name || 'Sem nome'}</p>
                                <p className="text-[13px] text-black font-bold">CPF: {user.cpf}</p>
                              </div>
                            </div>
                            <button
                              onClick={() => user.uid && setUserToDelete(user.uid)}
                              className="p-1.5 text-black hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover/user:opacity-100"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </section>
                </>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
