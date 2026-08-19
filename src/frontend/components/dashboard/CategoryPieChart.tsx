/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Search, PieChart as PieChartIcon } from 'lucide-react';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip
} from 'recharts';
import { formatCurrency } from '../../utils';

const PIE_COLORS = ['#4f46e5', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#f97316', '#64748b'];

interface CategoryPieChartProps {
  categoryPieData: any[];
  selectedChartCategory: string;
  setSelectedChartCategory: (value: string) => void;
  uncategorizedCount?: number;
  showPieProductList?: boolean;
  setShowPieProductList?: (value: boolean) => void;
  setPieCategoryFilter?: (value: string) => void;
}

export const CategoryPieChart: React.FC<CategoryPieChartProps> = ({
  categoryPieData,
  selectedChartCategory,
  setSelectedChartCategory,
  uncategorizedCount = 0,
  showPieProductList = false,
  setShowPieProductList = () => {},
  setPieCategoryFilter = () => {}
}) => {
  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h3 className="text-2xl font-bold text-slate-900 uppercase tracking-tight flex items-center gap-2">
            <div className="w-2.5 h-7 bg-emerald-600 rounded-full" />
            Gastos por Categoria
          </h3>
          <p className="text-slate-600 text-[10px] font-black mt-1 uppercase tracking-wider">
            Distribuição proporcional de insumos
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {uncategorizedCount > 0 && (
            <button
              onClick={() => {
                setPieCategoryFilter("SEM_CATEGORIA");
                setShowPieProductList(true);
              }}
              className="bg-amber-100 hover:bg-amber-200 text-amber-900 px-3 py-1.5 rounded-2xl text-xs font-black uppercase flex items-center gap-1.5 border border-amber-300 cursor-pointer transition-colors"
            >
              ⚠️ {uncategorizedCount} Sem Categoria
            </button>
          )}

          <button
            onClick={() => setShowPieProductList(!showPieProductList)}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-black uppercase rounded-2xl transition-colors border-0 cursor-pointer"
          >
            <Search className="w-3.5 h-3.5" />
            {showPieProductList ? "Ocultar Busca / Edição" : "Buscar / Alterar Categorias"}
          </button>
        </div>
      </div>

      {categoryPieData.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8 items-center">
          {/* Legenda das categorias listada à esquerda (5 colunas em desktop) */}
          <div className="md:col-span-5 lg:col-span-5 bg-slate-50/70 dark:bg-[#1e293b] p-5 rounded-2xl border border-slate-100">
            <p className="text-slate-500 font-black text-[11px] uppercase tracking-wider mb-3 px-1">
              Categorias ({categoryPieData.length})
            </p>
            <div className="max-h-[250px] overflow-y-auto pr-2 space-y-2.5">
              {(() => {
                const totalPieVal = categoryPieData.reduce((acc, curr) => acc + curr.value, 0);
                return categoryPieData.map((item, idx) => {
                  const pct = totalPieVal > 0 ? ((item.value / totalPieVal) * 100).toFixed(1) : "0.0";
                  const color = PIE_COLORS[idx % PIE_COLORS.length];
                  const isSelected = selectedChartCategory === item.name;
                  return (
                    <div
                      key={item.name + idx}
                      onClick={() => setSelectedChartCategory(isSelected ? "" : item.name)}
                      className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition-all cursor-pointer ${
                        isSelected
                          ? "bg-indigo-50 border-indigo-300 ring-2 ring-indigo-500/20 shadow-xs"
                          : "bg-white border-slate-100/80 shadow-2xs hover:border-slate-300"
                      }`}
                      title="Clique para filtrar o gráfico de Gasto Mensal por esta categoria"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 pr-2">
                        <span
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <span className="text-xs font-black text-slate-800 uppercase truncate">
                          {item.name}
                        </span>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-black text-slate-900 block">
                          {formatCurrency(item.value)}
                        </span>
                        <span className="text-[10px] font-bold text-slate-500 block">
                          {pct}%
                        </span>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Gráfico de pizza posicionado à direita (7 colunas em desktop) */}
          <div className="md:col-span-7 lg:col-span-7 relative w-full h-[270px] flex items-center justify-center">
            <ResponsiveContainer width="100%" height={270}>
              <PieChart>
                <Pie
                  data={categoryPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={65}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {categoryPieData.map((_entry, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <RechartsTooltip
                  formatter={(value: number) => {
                    const total = categoryPieData.reduce((acc, curr) => acc + curr.value, 0);
                    const pct = total > 0 ? ((value / total) * 100).toFixed(1) : "0.0";
                    return [`${formatCurrency(value)} (${pct}%)`, "Gasto Total"];
                  }}
                  contentStyle={{ borderRadius: "16px", border: "none", boxShadow: "0 10px 15px -3px rgb(0 0 0 / 0.1)", padding: "12px" }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <div className="w-full h-[200px] bg-slate-50 rounded-2xl flex flex-col items-center justify-center p-6 text-center border-2 border-dashed border-slate-200">
          <PieChartIcon className="w-10 h-10 text-slate-300 mb-2" />
          <p className="text-slate-500 font-bold text-xs uppercase">Sem dados de categorias</p>
          <p className="text-slate-400 text-[10px] uppercase mt-1">Categorize os produtos ao importar para ver o gráfico.</p>
        </div>
      )}
    </>
  );
};
