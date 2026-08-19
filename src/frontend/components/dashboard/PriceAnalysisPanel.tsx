/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { TrendingUp, RefreshCcw, Search, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { formatCurrency } from '../../utils';

interface PriceAnalysisPanelProps {
  priceAnalysis: any;
  priceSearchQuery: string;
  setPriceSearchQuery: (v: string) => void;
  priceSearchYear: string;
  setPriceSearchYear: (v: string) => void;
  selectedProduct: any | null;
  setSelectedProduct: (p: any | null) => void;
  showSearchDropdown: boolean;
  setShowSearchDropdown: (v: boolean) => void;
  parsedSearchSuggestions: any[];
  availableYears: any[];
  isPriceLoading: boolean;
  fetchPricingData: (force?: boolean) => Promise<void>;
}

export const PriceAnalysisPanel: React.FC<PriceAnalysisPanelProps> = ({
  priceAnalysis,
  priceSearchQuery,
  setPriceSearchQuery,
  priceSearchYear,
  setPriceSearchYear,
  selectedProduct,
  setSelectedProduct,
  showSearchDropdown,
  setShowSearchDropdown,
  parsedSearchSuggestions,
  availableYears,
  isPriceLoading,
  fetchPricingData
}) => {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

      {/* TOP 10 MAIORES AUMENTOS */}
      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <div className="w-2.5 h-6 bg-rose-600 rounded-full" />
                Top 10 Maiores Aumentos (%)
              </h2>
              <p className="text-slate-500 text-[10px] font-bold mt-1 uppercase tracking-wider">
                Produtos com maior aumento histórico baseado nos XMLs
              </p>
            </div>
            {isPriceLoading && <span className="text-[10px] bg-indigo-50 text-indigo-700 px-2 py-1 rounded font-black uppercase tracking-wider animate-pulse">Atualizando...</span>}
          </div>

          {priceAnalysis.topIncreases.length === 0 ? (
            <div className="bg-slate-50 rounded-2xl p-8 text-center flex flex-col items-center justify-center border-2 border-dashed border-slate-200">
              <TrendingUp className="w-10 h-10 text-slate-300" />
              <p className="text-slate-500 font-bold text-[11px] uppercase tracking-wide mt-2">Nenhum aumento de preço detectado ainda</p>
              <p className="text-slate-400 text-[9px] uppercase tracking-wider mt-1">É necessário ter pelo menos 2 compras de um produto com preços diferentes para calcular a variação.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 pb-2">
                    <th className="text-[10px] font-black uppercase text-slate-400 py-3">Produto</th>
                    <th className="text-[10px] font-black uppercase text-slate-400 py-3 text-right">Preço Antigo</th>
                    <th className="text-[10px] font-black uppercase text-slate-400 py-3 text-right">Preço Novo</th>
                    <th className="text-[10px] font-black uppercase text-slate-400 py-3 text-right">Aumento</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {priceAnalysis.topIncreases.map((prod, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/50 transition-colors group">
                      <td className="py-3.5 pr-2">
                        <div className="font-bold text-slate-900 text-sm lines-clamp-1 group-hover:text-indigo-700 transition-colors">
                          {prod.name}
                        </div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                          {prod.suppliers[0] || 'Desconhecido'}
                        </div>
                      </td>
                      <td className="py-3.5 text-right font-mono text-sm text-slate-500">
                        {formatCurrency(prod.oldestPrice)}
                      </td>
                      <td className="py-3.5 text-right font-mono text-sm font-bold text-slate-900">
                        {formatCurrency(prod.currentPrice)}
                      </td>
                      <td className="py-3.5 text-right">
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-red-50 dark:bg-[#1e293b] text-red-700 rounded-lg text-xs font-black tracking-tight">
                          <ArrowUpRight className="w-3.5 h-3.5 text-red-600 shrink-0" />
                          +{prod.totalPercentChange.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-50 flex justify-between items-center mt-6">
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total analisado: {priceAnalysis.allProducts.length} produtos</span>
          <button
            onClick={() => fetchPricingData(true)}
            type="button"
            disabled={isPriceLoading}
            className="flex items-center gap-1.5 text-[10px] font-black text-indigo-700 hover:text-indigo-950 uppercase cursor-pointer bg-transparent border-0 disabled:opacity-50 font-bold transition-colors"
          >
            <RefreshCcw className={`w-3 h-3 ${isPriceLoading ? 'animate-spin' : ''}`} />
            Sincronizar base
          </button>
        </div>
      </div>

      {/* SISTEMA DE PESQUISA E CONSULTA HISTÓRICA */}
      <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between">
        <div>
          <div className="mb-6 flex flex-col md:flex-row md:items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-bold text-slate-900 uppercase tracking-tight flex items-center gap-2">
                <div className="w-2.5 h-6 bg-indigo-700 rounded-full" />
                Pesquisa Histórica de Preço
              </h2>
              <p className="text-slate-500 text-[10px] font-bold mt-1 uppercase tracking-wider">
                Consulte a oscliação de qualquer produto nas últimas 5 compras
              </p>
            </div>
            <div className="flex flex-col gap-1 md:items-end">
              <label className="text-[10px] font-black text-slate-500 uppercase">Filtrar por Ano</label>
              <select
                className="h-9 text-xs font-bold bg-slate-50 border border-slate-200 text-slate-700 rounded-xl px-3 outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition-all uppercase"
                value={priceSearchYear}
                onChange={(e) => setPriceSearchYear(e.target.value)}
              >
                <option value="all">Todos os Anos</option>
                {availableYears.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Barra de Busca de Preços */}
          <div className="relative mb-6">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </div>
            <input
              type="text"
              placeholder="DIGITE O NOME DO PRODUTO PARA BUSCAR..."
              value={priceSearchQuery}
              onChange={(e) => {
                const value = e.target.value;
                setPriceSearchQuery(value);
                if (!value) {
                  setSelectedProduct(null);
                  setShowSearchDropdown(false);
                } else {
                  setShowSearchDropdown(true);
                }
              }}
              onFocus={() => {
                if (priceSearchQuery.trim()) {
                  setShowSearchDropdown(true);
                }
              }}
              onBlur={() => {
                // Small delay to allow clicking suggestions before hiding dropdown
                setTimeout(() => {
                  setShowSearchDropdown(false);
                }, 200);
              }}
              className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs font-bold text-slate-850 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 uppercase tracking-wide transition-all"
            />

            {/* Dropdown de sugestões */}
            {showSearchDropdown && parsedSearchSuggestions.length > 0 && (
              <div className="absolute z-10 w-full mt-2 bg-white border border-slate-100 rounded-2xl shadow-xl overflow-hidden max-h-60 overflow-y-auto">
                {parsedSearchSuggestions.map((prod, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault(); // Previne o desfoque imediato que causa o fechamento precoce do dropdown
                      setSelectedProduct(prod);
                      setPriceSearchQuery(prod.name);
                      setShowSearchDropdown(false);
                    }}
                    className="w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors border-b border-slate-50 last:border-b-0 flex justify-between items-center group cursor-pointer"
                  >
                    <div className="truncate max-w-[70%]">
                      <div className="font-bold text-slate-800 text-xs truncate group-hover:text-indigo-700">
                        {prod.name}
                      </div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 truncate">
                        {prod.suppliers.join(', ')}
                      </div>
                    </div>
                    <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg whitespace-nowrap ${
                      prod.totalPercentChange > 0
                        ? 'bg-red-50 dark:bg-[#1e293b] text-red-700'
                        : prod.totalPercentChange < 0
                          ? 'bg-emerald-50 dark:bg-[#1e293b] text-emerald-700'
                          : 'bg-slate-100 dark:bg-[#1e293b] text-slate-600'
                    }`}>
                      {prod.totalPercentChange > 0 ? '+' : ''}
                      {prod.totalPercentChange.toFixed(1)}%
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Tabela das 5 Últimas compras do produto selecionado */}
          {selectedProduct ? (
            <div className="space-y-4">
              <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
                <div className="max-w-[70%]">
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Produto Selecionado</div>
                  <div className="font-black text-slate-900 text-sm mt-0.5 truncate">{selectedProduct.name}</div>
                  <div className="text-[11px] text-slate-500 font-bold mt-1 uppercase truncate">Fornecedores: {selectedProduct.suppliers.join(', ')}</div>
                </div>
                <div className="text-right whitespace-nowrap">
                  <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Variação Geral</div>
                  <div className={`text-lg font-black tracking-tight mt-0.5 ${
                    selectedProduct.totalPercentChange > 0
                      ? 'text-red-600'
                      : selectedProduct.totalPercentChange < 0
                        ? 'text-emerald-700'
                        : 'text-slate-600'
                  }`}>
                    {selectedProduct.totalPercentChange > 0 ? '▲ +' : selectedProduct.totalPercentChange < 0 ? '▼ ' : ''}
                    {selectedProduct.totalPercentChange.toFixed(1)}%
                  </div>
                </div>
              </div>

              <div>
                <div className="text-[11px] font-black text-slate-400 uppercase tracking-wider mb-2">Histórico (Até 5 últimas compras)</div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 pb-1">
                        <th className="text-[10px] font-black uppercase text-slate-400 py-2">Data</th>
                        <th className="text-[10px] font-black uppercase text-slate-400 py-2">Fornecedor</th>
                        <th className="text-[10px] font-black uppercase text-slate-400 py-2 text-right">Qtd</th>
                        <th className="text-[10px] font-black uppercase text-slate-400 py-2 text-right">Preço Un.</th>
                        <th className="text-[10px] font-black uppercase text-slate-400 py-2 text-right">Var %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {selectedProduct.history.slice(-5).reverse().map((hist: any, hIdx: number) => {
                        let formattedDate = hist.date;
                        try {
                          if (hist.date) {
                            const datePart = hist.date.split('T')[0];
                            const parts = datePart.split('-');
                            if (parts.length === 3) {
                              formattedDate = `${parts[2]}/${parts[1]}/${parts[0]}`;
                            }
                          }
                        } catch {}

                        return (
                          <tr key={hIdx} className="hover:bg-slate-50/35 transition-colors">
                            <td className="py-2.5 font-bold text-slate-800 text-xs whitespace-nowrap">{formattedDate}</td>
                            <td className="py-2.5 text-slate-600 text-xs truncate max-w-[120px]">{hist.supplierName}</td>
                            <td className="py-2.5 text-right text-slate-500 font-mono text-xs">{hist.quantity}</td>
                            <td className="py-2.5 text-right text-slate-900 font-mono font-bold text-sm">{formatCurrency(hist.price)}</td>
                            <td className="py-2.5 text-right pr-1">
                              {hist.percentChange === 0 ? (
                                <span className="text-xs font-black text-slate-400">-</span>
                              ) : (
                                <span className={`inline-flex items-center gap-0.5 text-xs font-black ${
                                  hist.percentChange > 0
                                    ? 'text-red-600'
                                    : 'text-emerald-700'
                                }`}>
                                  {hist.percentChange > 0 ? (
                                    <>
                                      <ArrowUpRight className="w-3.5 h-3.5 stroke-[2.5]" />
                                      +{hist.percentChange.toFixed(1)}%
                                    </>
                                  ) : (
                                    <>
                                      <ArrowDownRight className="w-3.5 h-3.5 stroke-[2.5]" />
                                      {hist.percentChange.toFixed(1)}%
                                    </>
                                  )}
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-slate-50 rounded-2xl p-10 text-center flex flex-col items-center justify-center border-2 border-dashed border-slate-200">
              <Search className="w-10 h-10 text-slate-300 animate-bounce" />
              <p className="text-slate-500 font-bold text-[11px] uppercase tracking-wide mt-3">Pronto para pesquisar</p>
              <p className="text-slate-400 text-[9px] uppercase tracking-wider mt-1">Busque qualquer produto acima para carregar o histórico de compras.</p>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-slate-50 flex justify-between items-center mt-6">
          <span className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Dica: Selecione as sugestões rápidas enquanto digita</span>
        </div>
      </div>

    </div>
  );
};
