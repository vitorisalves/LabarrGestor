/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

interface SystemLog {
  id: string;
  timestamp: string;
  type: 'category' | 'delete' | 'info';
  message: string;
}

interface SystemLogsPanelProps {
  systemLogs: SystemLog[];
  onClearLogs?: () => void;
}

export const SystemLogsPanel: React.FC<SystemLogsPanelProps> = ({
  systemLogs,
  onClearLogs
}) => {
  if (systemLogs.length === 0) {
    return null;
  }

  return (
    <div className="mt-6 pt-6 border-t border-slate-100 space-y-3 animate-fadeIn">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider">
            📋 Logs de Ações no Sistema ({systemLogs.length})
          </h4>
        </div>
        {onClearLogs && (
          <button
            type="button"
            onClick={onClearLogs}
            className="text-[10px] font-bold text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
          >
            Limpar Logs
          </button>
        )}
      </div>

      <div className="bg-slate-900 text-slate-100 p-3.5 rounded-2xl font-mono text-[11px] max-h-[180px] overflow-y-auto space-y-2 border border-slate-800">
        {systemLogs.map((log) => (
          <div key={log.id} className="flex items-start gap-2 border-b border-slate-800/60 pb-1.5 last:border-0 last:pb-0">
            <span className="text-slate-500 text-[10px] shrink-0 font-bold">[{log.timestamp}]</span>
            {log.type === 'category' ? (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-emerald-950 text-emerald-400 border border-emerald-800/50 shrink-0">
                CATEGORIA
              </span>
            ) : log.type === 'delete' ? (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-rose-950 text-rose-400 border border-rose-800/50 shrink-0">
                EXCLUSÃO
              </span>
            ) : (
              <span className="px-1.5 py-0.2 rounded text-[9px] font-extrabold bg-slate-800 text-slate-300 shrink-0">
                INFO
              </span>
            )}
            <span className="text-slate-300 leading-snug">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
