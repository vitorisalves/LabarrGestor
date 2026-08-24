import React from 'react';
import { Upload, RefreshCcw, CheckCircle, Trash2 } from 'lucide-react';
import { Supplier } from '../../types';
import { formatCurrency } from '../../utils';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { CategoryMultiSelect } from '../products/CategoryMultiSelect';
import { getProductCategories } from '../../utils/productCategories';

export interface ImportRow {
  id: string;
  cProd: string;
  xProd: string;
  qTrib: number;
  vUnCom: number;
  dhEmi: string;
  nfeKey: string;
  fileName: string;
  xNome: string;
  reconciliationType: 'exact' | 'manual' | 'new';
  associatedSupplierId?: string;
  associatedSupplierName?: string;
  associatedProductCode?: string;
  targetType: 'suppliers' | 'mercado' | 'materiais';
  targetSupplierId?: string;
  targetCategories: string[];
}

interface XmlImportTabProps {
  importRows: ImportRow[];
  setImportRows: React.Dispatch<React.SetStateAction<ImportRow[]>>;
  isAnalyzing: boolean;
  xmlLogs: string[];
  setXmlLogs: React.Dispatch<React.SetStateAction<string[]>>;
  dragActive: boolean;
  setDragActive: (active: boolean) => void;
  handleXmlFiles: (files: FileList | File[]) => Promise<void>;
  handleSaveImport: () => Promise<void>;
  allSuppliers: Supplier[];
  availableCategories: string[];
  addNotification?: (message: string, count: number, type?: 'cart' | 'info') => void;
  updateRow: (id: string, updates: Partial<ImportRow>) => void;
  findExactMatch: (cProd: string, xProd: string) => { supplier: Supplier; product: any } | null;
  deletingRowId: string | null;
  setDeletingRowId: (id: string | null) => void;
}

export const XmlImportTab: React.FC<XmlImportTabProps> = ({
  importRows,
  setImportRows,
  isAnalyzing,
  xmlLogs,
  setXmlLogs,
  dragActive,
  setDragActive,
  handleXmlFiles,
  handleSaveImport,
  allSuppliers,
  availableCategories,
  addNotification,
  updateRow,
  findExactMatch,
  deletingRowId,
  setDeletingRowId
}) => {
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleXmlFiles(Array.from(e.dataTransfer.files));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Importação de NF-e XML</h2>
          <p className="text-xs text-slate-500 font-medium">Faça o upload de diversos arquivos XML para conciliação em lote</p>
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('processed_nfe_keys');
              if (addNotification) {
                addNotification("Histórico de NF-es importadas limpo! Você já pode reimportar os mesmos arquivos XML.", 1, 'info');
              }
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg text-[10px] font-bold uppercase transition-all border border-red-200 mt-2.5 cursor-pointer"
            title="Limpa o registro temporário interno do navegador para permitir reimportar os mesmos XMLs"
          >
            <Trash2 className="w-3 h-3 text-red-600" />
            Limpar Histórico de XMLs Importados
          </button>
        </div>
        {importRows.length > 0 && (
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => {
                setImportRows([]);
                setXmlLogs([]);
              }}
              className="px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-xl font-bold transition-all text-xs uppercase tracking-wider"
            >
              Limpar
            </button>
            <button
              type="button"
              onClick={handleSaveImport}
              disabled={isAnalyzing}
              className="px-6 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-bold transition-all shadow-md text-xs uppercase tracking-wider flex items-center gap-2"
            >
              {isAnalyzing ? (
                <>
                  <RefreshCcw className="w-4 h-4 animate-spin" />
                  Processando...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Salvar Importação ({importRows.length})
                </>
              )}
            </button>
          </div>
        )}
      </div>

      <div
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        className={`cursor-pointer border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center transition-all ${
          dragActive ? "border-indigo-600 bg-indigo-50/50" : "border-slate-200 bg-white hover:border-indigo-400"
        }`}
      >
        <input
          type="file"
          accept=".xml"
          multiple
          onChange={(e) => e.target.files && handleXmlFiles(Array.from(e.target.files))}
          className="hidden"
          id="xml-file-picker"
        />
        <label htmlFor="xml-file-picker" className="cursor-pointer flex flex-col items-center justify-center">
          <Upload className="w-12 h-12 text-indigo-500 mb-4 animate-bounce" />
          <p className="text-sm font-bold text-slate-700">Arrastar & Soltar ou Clique para Selecionar arquivos XML</p>
          <p className="text-xs text-slate-400 mt-1">Selecione uma ou mais Notas Fiscais no padrão SEFAZ</p>
        </label>
      </div>

      {isAnalyzing && (
        <div className="space-y-2 bg-indigo-50/70 p-4 rounded-2xl border border-indigo-100">
          <div className="flex items-center justify-between text-xs font-bold text-indigo-900">
            <span className="flex items-center gap-2">
              <RefreshCcw className="w-3.5 h-3.5 text-indigo-600 animate-spin" />
              Processando e validando notas fiscais XML...
            </span>
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Aguarde...</span>
          </div>
          <div className="w-full bg-indigo-100 h-2.5 rounded-full overflow-hidden relative">
            <div className="h-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-500 rounded-full w-full animate-pulse relative overflow-hidden" />
          </div>
        </div>
      )}

      {xmlLogs.length > 0 && (
        <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 max-h-40 overflow-y-auto font-mono text-[10px] text-slate-600 space-y-1">
          <p className="font-bold text-slate-800 uppercase text-xs mb-1">Logs de Processamento em Lote:</p>
          {xmlLogs.map((log, lIdx) => (
            <div key={lIdx} className={log.startsWith('Erro') ? 'text-red-600' : log.startsWith('Pulado') ? 'text-amber-600' : 'text-slate-600'}>
              &gt; {log}
            </div>
          ))}
        </div>
      )}

      {importRows.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Fornecedor</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Código</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Produto</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Qtd / Valor</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Emissão</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider">Status / Ação de Conciliação</th>
                  <th className="px-6 py-4 text-xs font-black text-slate-400 uppercase tracking-wider text-center">Ações</th>
                </tr>
              </thead>
              <tbody>
                {importRows.map((row) => {
                  return (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors text-sm">
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-semibold text-slate-800 text-sm leading-snug" title={row.nfeKey}>
                            {row.xNome || 'FORNECEDOR XML'}
                          </span>
                          <span className="text-[11px] text-slate-400 font-medium">
                            {row.fileName}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-600 text-sm">{row.cProd}</td>
                      <td className="px-6 py-4 font-semibold text-slate-900 max-w-sm break-words text-sm tracking-normal leading-relaxed">{row.xProd}</td>
                      <td className="px-6 py-4">
                        <div className="font-bold text-slate-800 text-sm">{row.qTrib} un</div>
                        <div className="text-emerald-600 font-bold text-sm">{formatCurrency(row.vUnCom)}</div>
                      </td>
                      <td className="px-6 py-4 font-mono text-slate-600 text-sm">{row.dhEmi}</td>
                      <td className="px-6 py-4 space-y-2 max-w-[190px]">
                        <div className="flex flex-col gap-1">
                          {findExactMatch(row.cProd, row.xProd) && (
                            <button
                              type="button"
                              onClick={() => {
                                const exact = findExactMatch(row.cProd, row.xProd);
                                if (exact) {
                                  updateRow(row.id, {
                                    reconciliationType: 'exact',
                                    associatedSupplierId: exact.supplier.id || '',
                                    associatedSupplierName: exact.supplier.name,
                                    associatedProductCode: exact.product.code || ''
                                  });
                                }
                              }}
                              className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                                row.reconciliationType === 'exact'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200/60'
                              }`}
                            >
                              ✓ Auto-Vínculo Encontrado
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              updateRow(row.id, { reconciliationType: 'manual' });
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                              row.reconciliationType === 'manual'
                                ? 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                                : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200/60'
                              }`}
                          >
                            ✎ Substituir Manual
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              updateRow(row.id, { reconciliationType: 'new' });
                            }}
                            className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                              row.reconciliationType === 'new'
                                ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                : 'bg-slate-50 text-slate-500 hover:bg-slate-100 border border-slate-200/60'
                            }`}
                          >
                            {findExactMatch(row.cProd, row.xProd) ? "✗ Rejeitar Vínculo (Novo)" : "＋ Criar Novo"}
                          </button>
                        </div>

                        {(row.reconciliationType === 'exact' || row.reconciliationType === 'manual') ? (
                          (() => {
                            const isMercadoGroup = row.associatedSupplierName?.toUpperCase() === 'MERCADO';
                            const isMateriaisGroup = row.associatedSupplierName?.toUpperCase() === 'MATERIAIS';
                            const isFornecedorGroup = row.associatedSupplierId && !isMercadoGroup && !isMateriaisGroup;

                            let currentGroupChoice = '';
                            if (isMercadoGroup) currentGroupChoice = 'MERCADO';
                            else if (isMateriaisGroup) currentGroupChoice = 'MATERIAIS';
                            else if (isFornecedorGroup) currentGroupChoice = 'FORNECEDOR';

                            const activeSupp = allSuppliers.find(s => s.id === row.associatedSupplierId || s.name === row.associatedSupplierId || s.name === row.associatedSupplierName);

                            return (
                              <div className="bg-indigo-50/50 p-2.5 border border-indigo-100 rounded-xl text-[10px] flex flex-col gap-1.5">
                                <span className="font-bold text-indigo-700">Integrado a:</span>
                                
                                <select
                                  value={currentGroupChoice}
                                  onChange={(e) => {
                                    const choice = e.target.value;
                                    if (choice === 'MERCADO') {
                                      const merc = allSuppliers.find(s => s.name.toUpperCase() === 'MERCADO');
                                      updateRow(row.id, {
                                        reconciliationType: 'manual',
                                        associatedSupplierId: merc?.id || 'MERCADO',
                                        associatedSupplierName: 'MERCADO',
                                        associatedProductCode: ''
                                      });
                                    } else if (choice === 'MATERIAIS') {
                                      const mat = allSuppliers.find(s => s.name.toUpperCase() === 'MATERIAIS');
                                      updateRow(row.id, {
                                        reconciliationType: 'manual',
                                        associatedSupplierId: mat?.id || 'MATERIAIS',
                                        associatedSupplierName: 'MATERIAIS',
                                        associatedProductCode: ''
                                      });
                                    } else if (choice === 'FORNECEDOR') {
                                      const normalSuppliers = allSuppliers.filter(s => !['MERCADO', 'MATERIAIS'].includes(s.name.toUpperCase()));
                                      const firstSupp = normalSuppliers[0];
                                      updateRow(row.id, {
                                        reconciliationType: 'manual',
                                        associatedSupplierId: firstSupp?.id || firstSupp?.name || '',
                                        associatedSupplierName: firstSupp?.name || '',
                                        associatedProductCode: ''
                                      });
                                    } else {
                                      updateRow(row.id, {
                                        associatedSupplierId: '',
                                        associatedSupplierName: '',
                                        associatedProductCode: ''
                                      });
                                    }
                                  }}
                                  className="w-full text-[10px] font-bold bg-white text-slate-800 border border-slate-200 rounded-lg p-1.5 outline-none"
                                >
                                  <option value="">Selecione Grupo/Tipo...</option>
                                  <option value="FORNECEDOR">🏢 Fornecedor Comum</option>
                                  <option value="MERCADO">🎯 Mercado</option>
                                  <option value="MATERIAIS">🛠️ Materiais</option>
                                </select>

                                {currentGroupChoice === 'FORNECEDOR' && (
                                  <select
                                    value={row.associatedSupplierId || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const matchedSupp = allSuppliers.find(s => s.id === val || s.name === val);
                                      if (matchedSupp) {
                                        updateRow(row.id, {
                                          associatedSupplierId: matchedSupp.id || matchedSupp.name,
                                          associatedSupplierName: matchedSupp.name,
                                          associatedProductCode: ''
                                        });
                                      }
                                    }}
                                    className="w-full text-[10px] font-bold bg-white text-slate-800 border border-slate-200 rounded-lg p-1.5 outline-none"
                                  >
                                    <option value="">Selecione o Fornecedor...</option>
                                    {allSuppliers.filter(s => !['MERCADO', 'MATERIAIS'].includes(s.name.toUpperCase())).map(s => (
                                      <option key={s.id || s.name} value={s.id || s.name}>
                                        {s.name.toUpperCase()}
                                      </option>
                                    ))}
                                  </select>
                                )}

                                {activeSupp && (
                                  <select
                                    value={row.associatedProductCode || ''}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const matchedP = activeSupp.products.find(p => p.code === val || p.name === val);
                                      updateRow(row.id, {
                                        associatedProductCode: val,
                                        targetCategories: matchedP ? getProductCategories(matchedP) : row.targetCategories
                                      });
                                    }}
                                    className="w-full text-[10px] font-bold bg-white text-slate-800 border border-slate-200 rounded-lg p-1.5 outline-none"
                                  >
                                    <option value="">Selecione o Produto...</option>
                                    {activeSupp.products.map((p, idx) => (
                                      <option key={`${p.code || ''}_${p.name}_${idx}`} value={p.code || p.name}>
                                        {p.name} {p.code ? `(Ref: ${p.code})` : '(Sem Ref)'}
                                      </option>
                                    ))}
                                  </select>
                                )}

                                <div className="flex flex-col gap-1 mt-1 pt-1.5 border-t border-indigo-100">
                                  <span className="font-extrabold text-indigo-900 text-[9px] uppercase tracking-wider">
                                    📁 Categoria (Dashboard):
                                  </span>
                                  <CategoryMultiSelect
                                    value={row.targetCategories}
                                    onChange={(next) => updateRow(row.id, { targetCategories: next })}
                                    options={availableCategories}
                                    allowCreate
                                  />
                                </div>
                              </div>
                            );
                          })()
                        ) : (
                          <div className="bg-amber-50/50 p-2.5 border border-amber-100 rounded-xl text-[10px] flex flex-col gap-1.5 font-bold text-amber-800">
                            <div className="flex flex-col gap-1">
                              {findExactMatch(row.cProd, row.xProd) ? (
                                <span className="text-[10px] text-red-600 bg-red-50 p-1 border border-red-100 rounded mb-1">
                                  ⚠️ Associação Rejeitada. Fallback Automático ativo para novo registro.
                                </span>
                              ) : (
                                <span className="text-[10px] text-amber-700 bg-amber-50 p-1 border border-amber-100 rounded mb-1">
                                  ℹ️ Sem Vínculo Prévio. Fallback Automático ativo para novo registro.
                                </span>
                              )}
                              <span className="font-bold text-slate-700 uppercase text-[9px] tracking-wide">Destino do Novo Registro:</span>
                              
                              <select
                                value={row.targetType}
                                onChange={(e) => updateRow(row.id, { targetType: e.target.value as any })}
                                className="w-full text-[10px] bg-white border border-slate-200 p-1.5 rounded-lg outline-none font-bold text-slate-700"
                              >
                                <option value="suppliers">Fornecedores</option>
                                <option value="mercado">Mercado</option>
                                <option value="materiais">Materiais</option>
                              </select>

                              {row.targetType === 'suppliers' && (
                                <select
                                  value={row.targetSupplierId || ''}
                                  onChange={(e) => updateRow(row.id, { targetSupplierId: e.target.value })}
                                  className="w-full text-[10px] bg-white border border-slate-200 p-1.5 rounded-lg outline-none font-bold text-slate-700 mt-1"
                                >
                                  <option value="novo">＋ Criar Fornecedor ({row.xNome || 'XML'})</option>
                                  {allSuppliers.filter(s => !['MERCADO', 'MATERIAIS'].includes(s.name.toUpperCase())).map(s => (
                                    <option key={s.id} value={s.id}>Adicionar em: {s.name}</option>
                                  ))}
                                </select>
                              )}
                            </div>

                            <div className="flex flex-col gap-1 mt-1 pt-1.5 border-t border-amber-200/60">
                              <span className="font-bold text-slate-700 uppercase text-[9px] tracking-wide">Categoria do Produto:</span>
                              <CategoryMultiSelect
                                value={row.targetCategories}
                                onChange={(next) => updateRow(row.id, { targetCategories: next })}
                                options={availableCategories}
                                allowCreate
                              />
                            </div>
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <button
                          type="button"
                          onClick={() => setDeletingRowId(row.id)}
                          className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                          title="Remover este item da importação"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmationModal
        isOpen={!!deletingRowId}
        onClose={() => setDeletingRowId(null)}
        onConfirm={() => {
          if (deletingRowId) {
            setImportRows(prev => prev.filter(r => r.id !== deletingRowId));
            setDeletingRowId(null);
          }
        }}
        title="Remover Item da Importação?"
        message="Deseja remover este produto do lote de importação? Esta ação não afetará os dados cadastrados no banco de dados."
      />
    </div>
  );
};
