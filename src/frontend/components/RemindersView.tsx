/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'framer-motion';
import { BellRing, Calendar, Plus, Clock, Trash2, RefreshCcw, Check } from 'lucide-react';
import { Reminder } from '../types';
import { formatDate } from '../utils';

interface RemindersViewProps {
  reminders: Reminder[];
  isLoading?: boolean;
  onRefresh?: () => void;
  reminderProductName: string;
  setReminderProductName: (name: string) => void;
  reminderDate: string;
  setReminderDate: (date: string) => void;
  addReminder: (name: string, date: string) => void;
  deleteReminder: (id: string) => void;
}

export const RemindersView: React.FC<RemindersViewProps> = ({
  reminders,
  isLoading,
  onRefresh,
  reminderProductName,
  setReminderProductName,
  reminderDate,
  setReminderDate,
  addReminder,
  deleteReminder
}) => {
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (reminderProductName.trim() && reminderDate) {
      addReminder(reminderProductName, reminderDate);
      setReminderProductName('');
      setReminderDate('');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="w-full max-w-[1800px] mx-auto space-y-8"
    >
      <div className="flex items-center justify-between px-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight uppercase">Lembretes</h1>
          <p className="text-slate-500 font-medium text-sm italic">Sincronize para ver atualizações de outros usuários</p>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className={`p-3 rounded-2xl transition-all ${isLoading ? 'bg-indigo-100 text-indigo-400' : 'bg-indigo-50 text-indigo-600 hover:bg-indigo-100 active:scale-95'}`}
          title="Sincronizar lembretes"
        >
          <RefreshCcw className={`w-6 h-6 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="bg-white p-8 rounded-[2rem] border-2 border-slate-900 shadow-2xl shadow-slate-200/60">
        <div className="flex items-center gap-4 mb-8">
          <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center">
            <BellRing className="w-6 h-6 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Novo Lembrete</h2>
            <p className="text-slate-500 font-medium text-sm">Agende o aviso para reposição de estoque</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-900 ml-1 uppercase tracking-widest">Nome do Produto</label>
            <input
              type="text"
              placeholder="Ex: Leite Integral"
              className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-medium"
              value={reminderProductName}
              onChange={(e) => setReminderProductName(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <label className="text-[10px] font-black text-slate-900 ml-1 uppercase tracking-widest">Data do Aviso</label>
            <input
              type="date"
              className="w-full px-6 py-4 bg-slate-50 border-2 border-transparent focus:border-indigo-500 focus:bg-white rounded-2xl outline-none transition-all font-medium"
              value={reminderDate}
              onChange={(e) => setReminderDate(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <button
              type="submit"
              className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100 flex items-center justify-center gap-2 active:scale-95"
            >
              <Plus className="w-5 h-5" />
              Agendar Lembrete
            </button>
          </div>
        </form>
      </div>

      <div className="space-y-4">
        <h3 className="text-xl font-black text-slate-900 px-4 uppercase tracking-tighter">Lembretes Ativos</h3>
        {reminders.length === 0 ? (
          <div className="bg-white p-12 rounded-[2rem] border-2 border-dashed border-slate-200 text-center text-slate-400">
            <Clock className="w-12 h-12 mx-auto mb-4 opacity-10" />
            <p className="font-bold">Nenhum lembrete agendado.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[...reminders].sort((a, b) => {
              if (a.notified === b.notified) {
                return new Date(a.date).getTime() - new Date(b.date).getTime();
              }
              return a.notified ? 1 : -1;
            }).map((reminder) => (
              <motion.div
                key={reminder.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-6 rounded-3xl border-2 transition-all ${
                  reminder.notified 
                    ? 'bg-slate-50 border-slate-100 opacity-60' 
                    : 'bg-white border-indigo-50 shadow-sm hover:shadow-md'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center mb-4 ${
                      reminder.notified ? 'bg-slate-200' : 'bg-indigo-100'
                    }`}>
                      <Calendar className={`w-6 h-6 ${reminder.notified ? 'text-slate-400' : 'text-indigo-600'}`} />
                    </div>
                    <h4 className="font-black text-slate-900 uppercase tracking-tight text-lg">{reminder.productName}</h4>
                    <p className="text-xs font-bold text-slate-500 mt-1 uppercase tracking-wider">
                      Aviso em: {formatDate(reminder.date)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-2">
                    <button
                      onClick={() => deleteReminder(reminder.id)}
                      className="p-2 text-black hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                    {reminder.notified && (
                      <div className="flex items-center gap-1.5 px-3 py-1 bg-green-100 text-green-600 rounded-full">
                        <Check className="w-3 h-3 stroke-[3]" />
                        <span className="text-[9px] font-black uppercase tracking-widest leading-none">
                          Concluído
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
};
