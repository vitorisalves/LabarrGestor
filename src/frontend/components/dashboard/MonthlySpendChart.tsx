/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { AlertCircle, Download } from 'lucide-react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip
} from 'recharts';
import { formatCurrency } from '../../utils';

interface MonthlySpendChartProps {
  expenseData: any[];
  isLoading?: boolean;
  isChartReady?: boolean;
  selectedChartCategory?: string;
  setSelectedChartCategory?: (value: string) => void;
  normalizedCategories?: any[];
  generateReport?: () => void;
  expenseChartRef?: React.RefObject<HTMLDivElement>;
}

export const MonthlySpendChart: React.FC<MonthlySpendChartProps> = ({
  expenseData,
  isLoading = false,
  isChartReady = false,
  selectedChartCategory = '',
  setSelectedChartCategory = () => {},
  normalizedCategories = [],
  generateReport = () => {},
  expenseChartRef
}) => {
  return (
    <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between" ref={expenseChartRef}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <div className="w-2.5 h-7 bg-indigo-700 rounded-full" />
            Gasto Mensal Real (XML)
          </h2>
          <p className="text-slate-600 text-[10px] font-black mt-1 uppercase tracking-wider">Histórico baseado na data de emissão das notas</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedChartCategory}
            onChange={(e) => setSelectedChartCategory(e.target.value)}
            className="bg-slate-50 border-0 text-slate-700 text-[10px] font-black uppercase tracking-wider rounded-xl px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-100 cursor-pointer"
          >
            <option value="">Todas as Categorias</option>
            {normalizedCategories.map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <button
            onClick={generateReport}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-50 text-indigo-700 text-[10px] font-black uppercase rounded-xl hover:bg-indigo-100 transition-colors border-0 font-bold"
          >
            <Download className="w-3 h-3" />
            Gerar PDF
          </button>
        </div>
      </div>

      <div className="relative w-full h-[230px] min-h-[230px] min-w-0" style={{ width: '100%', height: '230px', minHeight: '230px', minWidth: '0px' }}>
        {isLoading ? (
          <div className="w-full h-full bg-slate-50 rounded-2xl animate-pulse flex items-center justify-center">
            <span className="text-slate-400 text-xs font-bold uppercase tracking-wider">Carregando dados...</span>
          </div>
        ) : isChartReady && expenseData.length > 0 ? (
          <ResponsiveContainer width="100%" height={230} minWidth={0}>
            <AreaChart data={expenseData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
              <XAxis
                dataKey="name"
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#0f172a', fontSize: 13, fontWeight: 800 }}
                dy={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: '#0f172a', fontSize: 13, fontWeight: 800 }}
                tickFormatter={(val) => `R$${val}`}
              />
              <RechartsTooltip
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                labelStyle={{ fontWeight: 800, marginBottom: '4px', color: '#1e293b' }}
                itemStyle={{ color: '#0f172a', fontWeight: 800 }}
                formatter={(value: number) => [formatCurrency(value), 'Valor da Nota']}
              />
              <Area
                type="monotone"
                dataKey="valor"
                stroke="#4f46e5"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#colorExpense)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="w-full h-full bg-slate-50 rounded-2xl flex flex-col items-center justify-center p-8 text-center border-2 border-dashed border-slate-200">
            <AlertCircle className="w-12 h-12 text-slate-300" />
            <p className="text-slate-500 font-bold text-xs uppercase tracking-wide mt-2">Nenhum dado encontrado no intervalo selecionado</p>
            <p className="text-slate-400 text-[10px] uppercase tracking-wider mt-1">Importe novos arquivos XML para visualizar os gastos.</p>
          </div>
        )}
      </div>
    </div>
  );
};
