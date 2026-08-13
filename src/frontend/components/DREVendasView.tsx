import React, { useState, useMemo, useEffect } from 'react';
import { get, set, del } from 'idb-keyval';
import { 
  FileUp, 
  TrendingUp, 
  Store, 
  Building2, 
  Layers, 
  Globe, 
  FileSpreadsheet, 
  Calendar,
  Layers3,
  Search,
  Settings,
  Plus,
  Trash2,
  CalendarDays,
  CheckCircle,
  HelpCircle,
  Edit2,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  RefreshCw
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { formatCurrency, safeStringify } from '../utils';
import { DREDadoRow } from '../types';

interface DREVendasViewProps {
  addNotification: (message: string, duration: number, type?: 'cart' | 'info') => void;
}

// Portuguese Name lists for months
const MONTHS_PT = [
  { value: '01', label: 'Janeiro' },
  { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' },
  { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' },
  { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' },
  { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' },
  { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' },
  { value: '12', label: 'Dezembro' }
];

const YEARS = ['2025', '2026', '2027', '2028'];

export const DREVendasView: React.FC<DREVendasViewProps> = ({ addNotification }) => {
  // Tabs: 'dados' | 'gerenciador' | 'vendedor'
  const [activeTab, setActiveTab] = useState<'dados' | 'gerenciador' | 'vendedor'>('dados');
  
  // Vendedor Tab State
  const [vendedorSelected, setVendedorSelected] = useState<string>('');
  const [vendedorYearSelected, setVendedorYearSelected] = useState<string>('');
  const [vendedorMonthSelected, setVendedorMonthSelected] = useState<string>('');
  
  // DRE Records State
  const [dreRecords, setDreRecords] = useState<DREDadoRow[]>([]);
  const [isLoadingDB, setIsLoadingDB] = useState(false);

  useEffect(() => {
    // Completely reset Excel import and selection states on component mount/page re-entry
    setDreRecords([]);
    setSelectedSellers([]);
    setVendedorSelected('');
    setVendedorYearSelected('');
    setVendedorMonthSelected('');
    setIsLoadingDB(false);
    
    // Clear residual stored state to guarantee a pure, clean session
    del('dre_dados_records').catch(() => {});
    localStorage.removeItem('dre_dados_records');
    localStorage.removeItem('dre_selected_sellers');
    localStorage.removeItem('dre_all_known_sellers');
  }, []);

  const updateDreRecords = (newRecords: DREDadoRow[]) => {
    setDreRecords(newRecords);
  };

  const handleManualRefresh = () => {
    addNotification("Dados limpos e redefinidos!", 2000, 'info');
  };

  const handleExportDadosExcel = async (customFilename?: string) => {
    try {
      const defaultName = customFilename || `DRE_DADOS_${filterSector.toUpperCase()}_${filterStartMonth}-${filterStartYear}_A_${filterEndMonth}-${filterEndYear}`;
      const fullName = defaultName.endsWith('.xlsx') ? defaultName : `${defaultName}.xlsx`;

      const headers = [
        ['DRE - CONSOLIDADO DE PRODUTOS E INDICADORES FISCAIS'],
        [`Setor: ${filterSector} | Período: ${MONTHS_PT.find(m => m.value === filterStartMonth)?.label} de ${filterStartYear} até ${MONTHS_PT.find(m => m.value === filterEndMonth)?.label} de ${filterEndYear}`],
        [],
        ['CÓDIGO', 'SABEDORIA / PRODUTO', 'QUANTIDADE TOTAL', 'CMC TOTAL', 'TOTAL MERCADORIA', 'TOTAL DA NOTA FISCAL']
      ];

      const rows = consolidatedProducts.map(rec => [
        rec.codigo,
        rec.descricao,
        Number(rec.qtdTotal) || 0,
        Number(rec.cmcTotal) || 0,
        Number(rec.totalMercadoria || rec.cmcTotal) || 0,
        Number(rec.totalNotaFiscal > 0 ? rec.totalNotaFiscal : rec.qtdTotalNfProduto) || 0
      ]);

      const summaryRow = [
        'TOTAL CONSOLIDADO',
        '',
        Number(totals.qtdTotal) || 0,
        Number(totals.cmcTotal) || 0,
        Number(totals.totalMercadoria || totals.cmcTotal) || 0,
        Number(totals.totalNotaFiscal > 0 ? totals.totalNotaFiscal : totals.qtdTotalNf) || 0
      ];

      const dataForSheet = [...headers, summaryRow, [], ...rows];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(dataForSheet);

      // Auto-size columns to be beautifully laid out
      const maxColWidths = dataForSheet.reduce((acc: number[], row: any[]) => {
        row.forEach((cell, colIdx) => {
          const valStr = cell !== null && cell !== undefined ? String(cell) : '';
          const len = valStr.length;
          const currentMax = acc[colIdx] || 0;
          if (len > currentMax) {
            acc[colIdx] = len;
          }
        });
        return acc;
      }, [] as number[]);
      ws['!cols'] = maxColWidths.map(w => ({ wch: Math.min(Math.max((Number(w) || 0) + 3, 10), 50) }));

      XLSX.utils.book_append_sheet(wb, ws, 'Dados Consolidado');

      let fileSaved = false;
      const excelsheetObj = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([excelsheetObj], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fullName,
            types: [{
              description: 'Pastas de Trabalho do Excel (*.xlsx)',
              accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
            }]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          fileSaved = true;
          addNotification('Arquivo salvo com sucesso no diretório selecionado!', 3000, 'info');
        } catch (err: any) {
          console.warn('showSaveFilePicker falhou ou foi rejeitado:', err);
          if (err.name === 'AbortError') {
            return;
          }
        }
      }

      if (!fileSaved) {
        XLSX.writeFile(wb, fullName);
        addNotification(`Download do arquivo "${fullName}" iniciado! Verifique sua pasta de Downloads.`, 4000, 'info');
      }
    } catch (e) {
      console.error(e);
      addNotification('Erro ao exportar dados para o Excel.', 4000, 'info');
    }
  };

  const handleExportVendedorExcel = async (customFilename?: string) => {
    try {
      if (!vendedorSelected || !vendedorYearSelected || !vendedorMonthSelected) return;

      const monthLabel = MONTHS_PT.find(m => m.value === vendedorMonthSelected)?.label || vendedorMonthSelected;
      const defaultName = customFilename || `CONFERENCIA_${vendedorSelected.toUpperCase()}_${vendedorMonthSelected}-${vendedorYearSelected}`;
      const fullName = defaultName.endsWith('.xlsx') ? defaultName : `${defaultName}.xlsx`;

      const headersv = [
        [`RELATÓRIO DE CONFERÊNCIA DE VENDEDOR - ${vendedorSelected.toUpperCase()}`],
        [`Ano: ${vendedorYearSelected} | Mês: ${monthLabel}`],
        [],
        ['MÊS', 'CÓDIGO', 'DESCRIÇÃO DO PRODUTO', 'QUANTIDADE TOTAL', 'CMC TOTAL', 'TOTAL DA NOTA FISCAL']
      ];

      const rowsv = vendedorFilteredRecords.map(rec => [
        rec.mes,
        rec.codigo,
        rec.descricao,
        Number(rec.qtdTotal) || 0,
        Number(rec.cmcTotal) || 0,
        Number(rec.totalNotaFiscal || 0)
      ]);

      const summaryRowv = [
        'TOTAL CONSOLIDADO',
        '-',
        `CONFERÊNCIA CONSOLIDADA DO VENDEDOR`,
        Number(vendedorTotalQtd) || 0,
        Number(vendedorTotalCmc) || 0,
        Number(vendedorTotalNf) || 0
      ];

      const dataForSheet = [...headersv, summaryRowv, [], ...rowsv];
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet(dataForSheet);

      // Auto-size columns to be beautifully laid out
      const maxColWidths = dataForSheet.reduce((acc: number[], row: any[]) => {
        row.forEach((cell, colIdx) => {
          const valStr = cell !== null && cell !== undefined ? String(cell) : '';
          const len = valStr.length;
          const currentMax = acc[colIdx] || 0;
          if (len > currentMax) {
            acc[colIdx] = len;
          }
        });
        return acc;
      }, [] as number[]);
      ws['!cols'] = maxColWidths.map(w => ({ wch: Math.min(Math.max((Number(w) || 0) + 3, 10), 50) }));

      XLSX.utils.book_append_sheet(wb, ws, 'Conferencia Vendedor');

      let fileSaved = false;
      const excelsheetObj = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
      const blob = new Blob([excelsheetObj], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

      if ('showSaveFilePicker' in window) {
        try {
          const handle = await (window as any).showSaveFilePicker({
            suggestedName: fullName,
            types: [{
              description: 'Pastas de Trabalho do Excel (*.xlsx)',
              accept: { 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'] }
            }]
          });
          const writable = await handle.createWritable();
          await writable.write(blob);
          await writable.close();
          fileSaved = true;
          addNotification('Arquivo salvo com sucesso no diretório selecionado!', 3000, 'info');
        } catch (err: any) {
          console.warn('showSaveFilePicker falhou ou foi rejeitado:', err);
          if (err.name === 'AbortError') {
            return;
          }
        }
      }

      if (!fileSaved) {
        XLSX.writeFile(wb, fullName);
        addNotification(`Download do arquivo "${fullName}" iniciado! Verifique sua pasta de Downloads.`, 4000, 'info');
      }
    } catch (e) {
      console.error(e);
      addNotification('Erro ao exportar conferência para o Excel.', 4000, 'info');
    }
  };

  // Importer Configuration State
  const [importSector, setImportSector] = useState<'Loja' | 'Comercial' | 'Evento' | 'Site'>('Loja');
  const [importMonth, setImportMonth] = useState('06');
  const [importYear, setImportYear] = useState('2026');
  const [isDragging, setIsDragging] = useState(false);
  const [isTableExpanded, setIsTableExpanded] = useState(false);
  const [expandedSeller, setExpandedSeller] = useState<string | null>(null);

  const [sellerSearchQuery, setSellerSearchQuery] = useState('');
  const [selectedSellers, setSelectedSellers] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('dre_selected_sellers');
      if (saved) return JSON.parse(saved);
    } catch (e) {
      console.error("Local storage read error for dre_selected_sellers:", e);
    }
    return [];
  });

  useEffect(() => {
    try {
      localStorage.setItem('dre_selected_sellers', JSON.stringify(selectedSellers));
    } catch (e) {
      console.error("Local storage write error for dre_selected_sellers:", e);
    }
  }, [selectedSellers]);

  // Filters State (Aba Dados)
  const [filterSector, setFilterSector] = useState<'Todos' | 'Loja' | 'Comercial' | 'Evento' | 'Site' | ''>('');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Range Month picker state
  const [filterStartMonth, setFilterStartMonth] = useState('');
  const [filterStartYear, setFilterStartYear] = useState('2026');
  const [filterEndMonth, setFilterEndMonth] = useState('');
  const [filterEndYear, setFilterEndYear] = useState('2026');

  // New manual record modal/form state
  const [showManualForm, setShowManualForm] = useState(false);
  const [manualRecord, setManualRecord] = useState<Partial<DREDadoRow>>({
    descricao: '',
    codigo: '',
    qtdTotal: 0,
    cmcUnitario: 0,
    cmcTotal: 0,
    qtdTotalNfProduto: 0,
    totalMercadoria: 0,
    totalNotaFiscal: 0,
    setor: 'Loja',
    mes: '2026-06'
  });

  // Row editor state
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editFields, setEditFields] = useState<Partial<DREDadoRow>>({});

  const handleSellerSectorChange = (sellerName: string, newSector: 'Loja' | 'Comercial' | 'Evento' | 'Site' | '') => {
    const updated = dreRecords.map(r => {
      if ((r.vendedor || 'Não Identificado') === sellerName) {
        return { ...r, setor: newSector };
      }
      return r;
    });
    updateDreRecords(updated);
    setExpandedSeller(null);
  };

  const handleBulkSellerSectorChange = (newSector: 'Loja' | 'Comercial' | 'Evento' | 'Site' | '') => {
    const updated = dreRecords.map(r => {
      const sName = r.vendedor || 'Não Identificado';
      if (selectedSellers.includes(sName)) {
        return { ...r, setor: newSector };
      }
      return r;
    });
    updateDreRecords(updated);
    setSelectedSellers([]);
    setExpandedSeller(null);
  };

  const handleToggleSellerSelection = (sellerName: string) => {
    setSelectedSellers(prev => 
      prev.includes(sellerName) ? prev.filter(s => s !== sellerName) : [...prev, sellerName]
    );
  };

  const uniqueSellers = useMemo(() => {
    const sellers = new Map<string, string>(); // seller -> current sector (first encountered)
    dreRecords.forEach(r => {
      const sName = r.vendedor || 'Não Identificado';
      if (!sellers.has(sName)) {
        sellers.set(sName, r.setor);
      }
    });
    return Array.from(sellers.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [dreRecords]);

  const filteredUniqueSellers = useMemo(() => {
    if (!sellerSearchQuery) return uniqueSellers;
    const term = sellerSearchQuery.toLowerCase();
    return uniqueSellers.filter(([name]) => name.toLowerCase().includes(term));
  }, [uniqueSellers, sellerSearchQuery]);

  // Synchronize and auto-select all unique sellers on first load or when new ones appear,
  // while preserving custom selections and empty/deselect actions across sessions or mounts.
  useEffect(() => {
    if (uniqueSellers.length > 0) {
      try {
        const savedKnownSellers = localStorage.getItem('dre_all_known_sellers');
        const hasSavedSellers = localStorage.getItem('dre_selected_sellers') !== null;
        
        if (!hasSavedSellers || !savedKnownSellers) {
          // First time running or empty profile: select all and save all as known
          const allNames = uniqueSellers.map(([name]) => name);
          setSelectedSellers(allNames);
          localStorage.setItem('dre_selected_sellers', JSON.stringify(allNames));
          localStorage.setItem('dre_all_known_sellers', JSON.stringify(allNames));
        } else {
          // We have saved state, identify genuinely new sellers (e.g. from a new Excel import)
          const knownSellersList: string[] = JSON.parse(savedKnownSellers);
          const knownSellersSet = new Set(knownSellersList);
          
          const newSellers = uniqueSellers
            .map(([name]) => name)
            .filter(name => !knownSellersSet.has(name));
            
          if (newSellers.length > 0) {
            // Auto-select ONLY newly imported ones and keep the rest of the state
            setSelectedSellers(prev => {
              const currentSet = new Set(prev);
              const added = newSellers.filter(n => !currentSet.has(n));
              const nextSelected = [...prev, ...added];
              localStorage.setItem('dre_selected_sellers', JSON.stringify(nextSelected));
              return nextSelected;
            });
            const updatedKnown = [...knownSellersList, ...newSellers];
            localStorage.setItem('dre_all_known_sellers', JSON.stringify(updatedKnown));
          }
        }
      } catch (err) {
        console.error("Error syncing sellers with localStorage:", err);
      }
    }
  }, [uniqueSellers]);

  const handleSelectAllFiltered = () => {
    if (selectedSellers.length === filteredUniqueSellers.length) {
      setSelectedSellers([]); // Deselect all
    } else {
      setSelectedSellers(filteredUniqueSellers.map(([name]) => name));
    }
  };

  // Parse excel helper
  const handleImportExcel = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Leitura como matriz (array de arrays) para identificar cabeçalho
        const rawArray = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];

        if (rawArray.length === 0) {
          addNotification('A planilha importada não possui linhas válidas.', 3000, 'info');
          return;
        }

        // Descobrir onde está o cabeçalho (ignorando linhas acima com título/info inútil)
        let headerRowIndex = 0;
        for (let i = 0; i < rawArray.length; i++) {
          const rowStr = rawArray[i].map(c => String(c || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")).join(" ");
          
          let matches = 0;
          if (rowStr.includes('descricao') || rowStr.includes('produto') || rowStr.includes('item')) matches++;
          if (rowStr.includes('vendedor') || rowStr.includes('representante')) matches++;
          if (rowStr.includes('quantidade') || rowStr.includes('qtd')) matches++;

          if (matches >= 2) {
            headerRowIndex = i;
            break;
          }
        }

        const headers = rawArray[headerRowIndex] || [];
        const dataRows = rawArray.slice(headerRowIndex + 1);

        // Reconstruindo rawJson com o cabeçalho correto
        const rawJson = dataRows.map(row => {
          const obj: any = {};
          headers.forEach((h, idx) => {
             if (h !== undefined && h !== null && String(h).trim() !== '') {
               obj[h] = row[idx];
             }
          });
          return obj;
        });

        if (rawJson.length === 0) {
          addNotification('Nenhum dado encontrado após o cabeçalho.', 3000, 'info');
          return;
        }

        // Try mapping keys based on typical columns
        const firstRow = rawJson[0] || {};
        
        const findKey = (row: any, keywords: string[]) => {
          const keys = Object.keys(row);
          // 1. Tentar encontrar match exato primeiro (após limpeza)
          for (const kw of keywords) {
            const cleanKW = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const exactMatch = keys.find(k => {
              const cleanK = k.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              return cleanK === cleanKW;
            });
            if (exactMatch) return exactMatch;
          }
          // 2. Se não encontrou exato, tentar match por 'includes'
          for (const kw of keywords) {
            const cleanKW = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            const includesMatch = keys.find(k => {
              const cleanK = k.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              return cleanK.includes(cleanKW);
            });
            if (includesMatch) return includesMatch;
          }
          return undefined;
        };

        const keyDescricao = findKey(firstRow, ['descricao do produto', 'nome do produto', 'descricao', 'produto', 'nome', 'item']);
        const keyCodigo = findKey(firstRow, ['codigo do produto', 'codigo', 'sku', 'ref', 'referencia']);
        const keyQtdTotal = findKey(firstRow, ['quantidade total', 'qtd total', 'quantidade', 'qtd', 'volume', 'vendido']);
        const keyCmcUnitario = findKey(firstRow, ['cmc unitario', 'custo unitario', 'cmc unit', 'custo', 'cmc_unit']);
        const keyCmcTotal = findKey(firstRow, ['soma de cmc total do movimento', 'cmc total', 'custo total']);
        const keyQtdTotalNf = findKey(firstRow, ['qtd total nf', 'qtd total nf produto', 'total nf', 'faturas']);
        const keyTotalMercadoria = findKey(firstRow, ['total mercadoria', 'valor mercadoria', 'valor total mercadoria', 'total de mercadoria', 'mercadoria', 'soma de valor total do movimento']);
        const keyTotalNotaFiscal = findKey(firstRow, ['total da nota fiscal', 'total nota fiscal', 'valor da nota', 'valor nota', 'total nf', 'valor total nf', 'total da nf', 'faturas']);
        const keyNotaFiscalId = findKey(firstRow, ['numero da nota', 'numero nota', 'nf', 'numero nf', 'documento', 'doc', 'fatura', 'nº nf', 'numero doc', 'n_doc', 'nº doc', 'nota fiscal']);
        const keyVendedor = findKey(firstRow, ['vendedor', 'representante', 'vendedores', 'seller']);
        const keyMesExcel = findKey(firstRow, ['data de emissao.mes', 'data de emissao mes', 'mes', 'data emissao', 'data de emissao', 'emissao', 'data']);
        const keyAnoExcel = findKey(firstRow, ['data de saida.ano', 'data de saida ano', 'ano']);

        const referenceMonth = `${importYear}-${importMonth}`;
        const aggregatedData = new Map<string, DREDadoRow>();



        rawJson.forEach((row, idx) => {
          // Mandatory or fallback values with null/undefined safety
          const descVal = (keyDescricao && row[keyDescricao] !== undefined && row[keyDescricao] !== null) ? String(row[keyDescricao]).trim() : '';
          const rawCodVal = (keyCodigo && row[keyCodigo] !== undefined && row[keyCodigo] !== null) ? String(row[keyCodigo]).trim() : '';
          const vendedorVal = (keyVendedor && row[keyVendedor] !== undefined && row[keyVendedor] !== null) ? String(row[keyVendedor]).trim() : '';

          // Normalize zero, null, undefined strings from excel values
          const cleanDesc = (descVal === '0' || descVal.toLowerCase() === 'null' || descVal.toLowerCase() === 'undefined') ? '' : descVal;
          const cleanCod = (rawCodVal === '0' || rawCodVal.toLowerCase() === 'null' || rawCodVal.toLowerCase() === 'undefined') ? '' : rawCodVal;
          const cleanVendedor = (vendedorVal === '0' || vendedorVal.toLowerCase() === 'null' || vendedorVal.toLowerCase() === 'undefined') ? '' : vendedorVal;

          // Skip rows which are summary/total totals lines (no product description, product code/SKU, or seller name present)
          if (!cleanDesc && !cleanCod && !cleanVendedor) {
            return;
          }

          const desc = cleanDesc;
          const cod = cleanCod || `SKU-${idx + 1}`;
          const vendedorInfo = cleanVendedor;
          
          // Normalizer function to convert various month formats (including Portuguese names) and years to YYYY-MM
          const getYearMonthString = (mesVal: string, anoVal: string): string => {
            let year = String(importYear).trim();
            let month = String(importMonth).padStart(2, '0');

            if (anoVal) {
              const cleanedAno = anoVal.replace(/\D/g, '').trim();
              if (cleanedAno.length === 4) {
                year = cleanedAno;
              } else if (cleanedAno.length === 2) {
                year = `20${cleanedAno}`;
              }
            }

            const cleanMes = mesVal.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
            const monthMap: Record<string, string> = {
              'janeiro': '01', 'jan': '01',
              'fevereiro': '02', 'fev': '02',
              'marco': '03', 'mar': '03',
              'abril': '04', 'abr': '04',
              'maio': '05', 'mai': '05',
              'junho': '06', 'jun': '06',
              'julho': '07', 'jul': '07',
              'agosto': '08', 'ago': '08',
              'setembro': '09', 'set': '09',
              'outubro': '10', 'out': '10',
              'novembro': '11', 'nov': '11',
              'dezembro': '12', 'dez': '12'
            };

            if (monthMap[cleanMes]) {
              month = monthMap[cleanMes];
            } else {
              const numericMonth = parseInt(cleanMes.replace(/\D/g, ''), 10);
              if (!isNaN(numericMonth) && numericMonth >= 1 && numericMonth <= 12) {
                month = String(numericMonth).padStart(2, '0');
              } else if (cleanMes.includes('/') || cleanMes.includes('-')) {
                const parts = cleanMes.split(/[\/\-]/);
                const fourDigitPart = parts.find(p => p.length === 4);
                if (fourDigitPart) year = fourDigitPart;
                if (parts.length >= 2) {
                  if (parts[0].length === 4) {
                    const m = parseInt(parts[1], 10);
                    if (!isNaN(m) && m >= 1 && m <= 12) month = String(m).padStart(2, '0');
                  } else {
                    const m = parseInt(parts[1], 10);
                    if (!isNaN(m) && m >= 1 && m <= 12) {
                      month = String(m).padStart(2, '0');
                    } else {
                      const firstAsMonth = parseInt(parts[0], 10);
                      if (!isNaN(firstAsMonth) && firstAsMonth >= 1 && firstAsMonth <= 12) {
                        month = String(firstAsMonth).padStart(2, '0');
                      }
                    }
                  }
                }
              }
            }
            return `${year}-${month}`;
          };

          const mesExcel = keyMesExcel 
            ? getYearMonthString(String(row[keyMesExcel]), keyAnoExcel ? String(row[keyAnoExcel]) : '')
            : referenceMonth;
          
          // Number parsing
          const parseNum = (val: any) => {
            if (typeof val === 'number') return val;
            if (!val) return 0;
            const clean = String(val).replace('R$', '').replace(/\s/g, '').trim();
            if (clean.includes(',')) {
              return parseFloat(clean.replace(/\./g, '').replace(',', '.'));
            }
            return parseFloat(clean) || 0;
          };

          const qtdTotal = keyQtdTotal ? parseNum(row[keyQtdTotal]) : 0;
          const cmcUnitario = keyCmcUnitario ? parseNum(row[keyCmcUnitario]) : 0;
          // Calculate CMC total dynamically if missing
          const cmcTotal = keyCmcTotal ? parseNum(row[keyCmcTotal]) : (qtdTotal * cmcUnitario);
          const qtdTotalNfProduto = keyQtdTotalNf ? parseNum(row[keyQtdTotalNf]) : 0;
          const totalMercadoria = keyTotalMercadoria ? parseNum(row[keyTotalMercadoria]) : 0;
          const totalNotaFiscal = keyTotalNotaFiscal ? parseNum(row[keyTotalNotaFiscal]) : 0;
          const invoiceId = keyNotaFiscalId ? String(row[keyNotaFiscalId] || '').trim() : '';

          // Only add if there is a desc or product code and some quantity/value
          if (desc || cod) {
            const aggKey = `${desc.toUpperCase()}|${vendedorInfo.toUpperCase()}|${mesExcel.toUpperCase()}`;
            
            if (!aggregatedData.has(aggKey)) {
              // Try to reuse the seller's sector assignment if it was mapped in previous imports
              const sellerNameKey = vendedorInfo || 'Não Identificado';
              const existingSector = dreRecords.find(r => 
                (r.vendedor || 'Não Identificado').trim().toUpperCase() === sellerNameKey.trim().toUpperCase()
              )?.setor || '';

              aggregatedData.set(aggKey, {
                id: `dre-${importSector}-${Date.now()}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
                descricao: desc || 'PRODUTO SEM DESCRIÇÃO',
                codigo: cod,
                vendedor: sellerNameKey,
                qtdTotal: 0, // Será somado abaixo
                cmcUnitario: cmcUnitario,
                cmcTotal: 0, // Será somado abaixo
                qtdTotalNfProduto: 0, // Será somado abaixo
                totalMercadoria: 0,
                totalNotaFiscal: 0,
                setor: existingSector || importSector,
                mes: mesExcel || referenceMonth,
                origemArquivo: file.name,
                notaFiscalId: invoiceId || undefined,
                invoices: []
              });
            }

            const existing = aggregatedData.get(aggKey)!;
            existing.qtdTotal += qtdTotal;
            existing.cmcTotal += cmcTotal;
            existing.qtdTotalNfProduto += qtdTotalNfProduto;
            existing.totalMercadoria = (existing.totalMercadoria || 0) + totalMercadoria;
            existing.totalNotaFiscal = (existing.totalNotaFiscal || 0) + totalNotaFiscal;

            if (invoiceId && totalNotaFiscal > 0) {
              if (!existing.invoices) {
                existing.invoices = [];
              }
              if (!existing.invoices.some(inv => inv.id === invoiceId)) {
                existing.invoices.push({ id: invoiceId, val: totalNotaFiscal });
              }
            }
          }
        });

        const parsedRows: DREDadoRow[] = Array.from(aggregatedData.values());

        if (parsedRows.length === 0) {
          addNotification('Não foi possível extrair nenhum produto com descrição ou código válido.', 4000, 'info');
          return;
        }

        // Replace any old session data with the new clean excel import
        updateDreRecords(parsedRows);

        // Auto-select all unique sellers from the newly imported Excel rows to match totals perfectly
        const newlyImportedSellerNames = Array.from(new Set(parsedRows.map(r => r.vendedor || 'Não Identificado')));
        setSelectedSellers(newlyImportedSellerNames);

        // Pre-configure the "Dados" tab filters to immediately fit the imported month, year, and sector
        setFilterSector(importSector);
        setFilterStartMonth(importMonth);
        setFilterStartYear(importYear);
        setFilterEndMonth(importMonth);
        setFilterEndYear(importYear);

        addNotification(`Sucesso! ${parsedRows.length} registros importados de "${file.name}" para [${importSector}] em [${importMonth}/${importYear}].`, 4000, 'info');
      } catch (err) {
        console.error(err);
        addNotification('Erro ao analisar o arquivo excel. Certifique-se de que é uma planilha válida.', 4000, 'info');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleFileDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleImportExcel(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleImportExcel(file);
  };

  // Delete individual record
  const handleDeleteRow = (id: string) => {
    const updated = dreRecords.filter(r => r.id !== id);
    updateDreRecords(updated);
    addNotification('Registro removido com sucesso.', 3000, 'info');
  };

  // Batch delete by sector, month or file
  const handleClearFiltered = (sector: string, monthYear: string) => {
    if (window.confirm(`Tem certeza de que deseja limpar os dados de Setor: ${sector} no Mês/Ano: ${monthYear}?`)) {
      const updated = dreRecords.filter(r => !(r.setor === sector && r.mes === monthYear));
      updateDreRecords(updated);
      addNotification('Registros limpos.', 3000, 'info');
    }
  };

  const handleClearAll = () => {
    if (window.confirm('CUIDADO: Isso removerá TODOS os dados importados de faturamento DRE. Deseja continuar?')) {
      updateDreRecords([]);
      addNotification('Banco de dados DRE resetado.', 3000, 'info');
    }
  };

  // Add Manual Record
  const handleAddManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualRecord.descricao || !manualRecord.codigo) {
      addNotification('Preencha pelo menos Descrição e Código.', 3000, 'info');
      return;
    }

    const calculatedCmcTotal = manualRecord.cmcTotal || ((manualRecord.qtdTotal || 0) * (manualRecord.cmcUnitario || 0));

    const newRow: DREDadoRow = {
      id: `dre-manual-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      descricao: manualRecord.descricao.toUpperCase(),
      codigo: manualRecord.codigo.toUpperCase(),
      qtdTotal: Number(manualRecord.qtdTotal) || 0,
      cmcUnitario: Number(manualRecord.cmcUnitario) || 0,
      cmcTotal: calculatedCmcTotal || 0,
      qtdTotalNfProduto: Number(manualRecord.qtdTotalNfProduto) || 0,
      totalMercadoria: Number(manualRecord.totalMercadoria) || 0,
      totalNotaFiscal: Number(manualRecord.totalNotaFiscal) || 0,
      setor: manualRecord.setor as any || 'Loja',
      mes: manualRecord.mes || '2026-06',
      origemArquivo: 'Lançamento Manual'
    };

    const updated = [newRow, ...dreRecords];
    updateDreRecords(updated);
    setShowManualForm(false);
    setManualRecord({
      descricao: '',
      codigo: '',
      qtdTotal: 0,
      cmcUnitario: 0,
      cmcTotal: 0,
      qtdTotalNfProduto: 0,
      totalMercadoria: 0,
      totalNotaFiscal: 0,
      setor: 'Loja',
      mes: '2026-06'
    });
    addNotification('Registro manual adicionado com sucesso.', 3000, 'info');
  };

  // Start in-row edit
  const startEditing = (row: DREDadoRow) => {
    setEditingRowId(row.id);
    setEditFields({ ...row });
  };

  // Save in-row editing
  const saveEditing = (id: string) => {
    const updated = dreRecords.map(r => {
      if (r.id === id) {
        const fields = editFields;
        return {
          ...r,
          descricao: fields.descricao || r.descricao,
          codigo: fields.codigo || r.codigo,
          qtdTotal: Number(fields.qtdTotal) ?? r.qtdTotal,
          cmcUnitario: Number(fields.cmcUnitario) ?? r.cmcUnitario,
          cmcTotal: Number(fields.cmcTotal) ?? ((Number(fields.qtdTotal) || 0) * (Number(fields.cmcUnitario) || 0)),
          qtdTotalNfProduto: Number(fields.qtdTotalNfProduto) ?? r.qtdTotalNfProduto,
          totalMercadoria: Number(fields.totalMercadoria) ?? r.totalMercadoria,
          totalNotaFiscal: Number(fields.totalNotaFiscal) ?? r.totalNotaFiscal,
          setor: fields.setor as any || r.setor,
          mes: fields.mes || r.mes
        };
      }
      return r;
    });

    updateDreRecords(updated);
    setEditingRowId(null);
    addNotification('Registro de faturamento atualizado.', 2000, 'info');
  };

  // Cancel edit
  const cancelEditing = () => {
    setEditingRowId(null);
  };

  // Filter calculations based on range options & sector picker
  const filteredRecords = useMemo(() => {
    if (!filterSector || !filterStartMonth || !filterEndMonth) {
      return [];
    }
    return dreRecords.filter(rec => {
      // Seller checkbox selection filter
      const sellerName = rec.vendedor || 'Não Identificado';
      if (!selectedSellers.includes(sellerName)) {
        return false;
      }

      // Sector filter
      if (filterSector !== 'Todos' && rec.setor !== filterSector) {
        return false;
      }

      // Range check
      const startKey = `${filterStartYear}-${filterStartMonth}`;
      const endKey = `${filterEndYear}-${filterEndMonth}`;
      
      const recordKey = rec.mes || '2026-06';
      
      if (recordKey < startKey || recordKey > endKey) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const name = rec.descricao.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        const code = rec.codigo.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (!name.includes(query) && !code.includes(query)) {
          return false;
        }
      }

      return true;
    });
  }, [dreRecords, filterSector, filterStartMonth, filterStartYear, filterEndMonth, filterEndYear, searchQuery, selectedSellers]);

  // Consolidated products by code (Step 2 - agrupamento vendedor por vendedor sem duplicatas)
  const consolidatedProducts = useMemo(() => {
    const map = new Map<string, {
      codigo: string;
      descricao: string;
      qtdTotal: number;
      cmcUnitarioMatches: number[];
      cmcTotal: number;
      qtdTotalNfProduto: number;
      totalMercadoria: number;
      totalNotaFiscal: number;
      setor: string;
      mes: string;
      invoices: { id: string; val: number }[];
    }>();

    filteredRecords.forEach(rec => {
      const code = (rec.codigo || 'SEM-CODIGO').trim().toUpperCase();
      const existing = map.get(code);
      if (!existing) {
        map.set(code, {
          codigo: code,
          descricao: rec.descricao,
          qtdTotal: rec.qtdTotal || 0,
          cmcUnitarioMatches: [rec.cmcUnitario || 0],
          cmcTotal: rec.cmcTotal || 0,
          qtdTotalNfProduto: rec.qtdTotalNfProduto || 0,
          totalMercadoria: rec.totalMercadoria || 0,
          totalNotaFiscal: rec.totalNotaFiscal || 0,
          setor: rec.setor,
          mes: rec.mes,
          invoices: rec.invoices ? [...rec.invoices] : []
        });
      } else {
        existing.qtdTotal += (rec.qtdTotal || 0);
        existing.cmcTotal += (rec.cmcTotal || 0);
        existing.qtdTotalNfProduto += (rec.qtdTotalNfProduto || 0);
        existing.totalMercadoria += (rec.totalMercadoria || 0);
        existing.totalNotaFiscal += (rec.totalNotaFiscal || 0);
        existing.cmcUnitarioMatches.push(rec.cmcUnitario || 0);
        if (rec.invoices) {
          rec.invoices.forEach(inv => {
            if (!existing.invoices.some(i => i.id === inv.id)) {
              existing.invoices.push(inv);
            }
          });
        }
        if (rec.descricao && (!existing.descricao || existing.descricao.includes('PRODUTO SEM DESCRIÇÃO') || existing.descricao.includes('SEM DESCRIÇÃO') || existing.descricao.length < rec.descricao.length)) {
          existing.descricao = rec.descricao;
        }
      }
    });

    return Array.from(map.values()).map((item, idx) => {
      const avgCmcUnitario = item.qtdTotal > 0
        ? (item.cmcTotal / item.qtdTotal)
        : (item.cmcUnitarioMatches.reduce((a, b) => a + b, 0) / item.cmcUnitarioMatches.length || 0);

      return {
        id: `consolidated-${item.codigo}-${idx}`,
        codigo: item.codigo,
        descricao: item.descricao,
        qtdTotal: item.qtdTotal,
        cmcUnitario: avgCmcUnitario,
        cmcTotal: item.cmcTotal,
        qtdTotalNfProduto: item.qtdTotalNfProduto,
        totalMercadoria: item.totalMercadoria || 0,
        totalNotaFiscal: item.totalNotaFiscal || 0,
        setor: item.setor,
        mes: item.mes
      };
    });
  }, [filteredRecords]);

  // Totals calculations based on filtered records
  const totals = useMemo(() => {
    let sumQtdNfTotal = 0;
    let sumQtdTotal = 0;
    let sumCmcTotal = 0;
    let sumCostUnit = 0;
    let sumTotalMercadoria = 0;
    let sumTotalNotaFiscal = 0;

    filteredRecords.forEach(r => {
      sumQtdNfTotal += (r.qtdTotalNfProduto || 0);
      sumQtdTotal += (r.qtdTotal || 0);
      sumCmcTotal += (r.cmcTotal || 0);
      sumCostUnit += (r.cmcUnitario || 0);
      sumTotalMercadoria += (r.totalMercadoria || 0);
      sumTotalNotaFiscal += (r.totalNotaFiscal || 0);
    });

    return {
      qtdTotalNf: sumQtdNfTotal,
      qtdTotal: sumQtdTotal,
      cmcTotal: sumCmcTotal,
      avgCmcUnitario: filteredRecords.length > 0 ? (sumCostUnit / filteredRecords.length) : 0,
      totalMercadoria: sumTotalMercadoria,
      totalNotaFiscal: sumTotalNotaFiscal
    };
  }, [filteredRecords]);

  // List unique active imports in Gerenciador
  const uniqueImports = useMemo(() => {
    const map: Record<string, { sector: string, monthYear: string, count: number, totalCmc: number }> = {};
    dreRecords.forEach(r => {
      const key = `${r.setor} | ${r.mes}`;
      if (!map[key]) {
        map[key] = {
          sector: r.setor,
          monthYear: r.mes,
          count: 0,
          totalCmc: 0
        };
      }
      map[key].count += 1;
      map[key].totalCmc += (r.cmcTotal || 0);
    });
    return Object.values(map);
  }, [dreRecords]);

  const totalQtdImportados = dreRecords.reduce((sum, r) => sum + (r.qtdTotal || 0), 0);
  const totalCmcImportados = dreRecords.reduce((sum, r) => sum + (r.cmcTotal || 0), 0);
  const totalNfImportados = dreRecords.reduce((sum, r) => sum + (r.totalNotaFiscal || 0), 0);

  const uniqueSellersImported = useMemo(() => {
    const sellers = dreRecords.map(r => r.vendedor || 'Não Identificado');
    return Array.from(new Set(sellers)).sort((a, b) => a.localeCompare(b));
  }, [dreRecords]);

  const vendedorFilteredRecords = useMemo(() => {
    if (!vendedorSelected) return [];
    return dreRecords.filter(r => {
      const matchSeller = (r.vendedor || 'Não Identificado') === vendedorSelected;
      if (!matchSeller) return false;
      const parts = r.mes.split('-');
      const y = parts[0] || '';
      const m = parts[1] || '';
      if (vendedorYearSelected && y !== vendedorYearSelected) return false;
      if (vendedorMonthSelected && m !== vendedorMonthSelected) return false;
      return true;
    });
  }, [dreRecords, vendedorSelected, vendedorYearSelected, vendedorMonthSelected]);

  const vendedorTotalQtd = vendedorFilteredRecords.reduce((sum, r) => sum + (r.qtdTotal || 0), 0);
  const vendedorTotalCmc = vendedorFilteredRecords.reduce((sum, r) => sum + (r.cmcTotal || 0), 0);
  const vendedorTotalNf = vendedorFilteredRecords.reduce((sum, r) => sum + (r.totalNotaFiscal || 0), 0);

  return (
    <div className="w-full max-w-[1800px] mx-auto space-y-8 pb-24 animate-in fade-in duration-300">
      
      {/* Upper Module Heading Card */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
        <div>
          <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest bg-indigo-50 px-3 py-1.5 rounded-full">Gestão Tributária & DRE</span>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3 mt-3">
            <Layers3 className="w-8 h-8 text-indigo-700" />
            Dados DRE
          </h1>
          <p className="text-slate-600 text-sm font-bold mt-1">
            Console analítico de faturamento estruturado de produtos por canais.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex bg-slate-100 p-1 rounded-2xl border border-slate-200 shadow-inner">
          <button
            onClick={() => setActiveTab('dados')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border-0 cursor-pointer ${
              activeTab === 'dados'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Dados
          </button>
          <button
            onClick={() => setActiveTab('vendedor')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border-0 cursor-pointer ${
              activeTab === 'vendedor'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Vendedor
          </button>
          <button
            onClick={() => setActiveTab('gerenciador')}
            className={`px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider transition-all border-0 cursor-pointer ${
              activeTab === 'gerenciador'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Gerenciador
          </button>
        </div>
      </div>

      {/* --- TAB 1: DADOS --- */}
      {activeTab === 'dados' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          
          {/* Quick Filter Bar & Date Intervals Container */}
          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6">
            <div className={`grid grid-cols-1 ${filterSector !== '' ? 'md:grid-cols-3' : 'md:grid-cols-1'} gap-6 transition-all duration-300`}>
              
              {/* Filter 1: Setor */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Setor</label>
                <select
                  value={filterSector}
                  onChange={(e) => {
                    setFilterSector(e.target.value as any);
                    // Reset selected months when sector changes to guide step 2
                    setFilterStartMonth('');
                    setFilterEndMonth('');
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none uppercase"
                >
                  <option value="">-- SELECIONE UM SETOR --</option>
                  <option value="Todos">TODOS OS SETORES</option>
                  <option value="Loja">LOJA</option>
                  <option value="Comercial">COMERCIAL</option>
                  <option value="Evento">EVENTO</option>
                  <option value="Site">SITE</option>
                </select>
              </div>

              {/* Filter 2: Year/Month Range START - ONLY SHOWN AFTER SETOR SELECTED */}
              {filterSector !== '' && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-300">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Mês Inicial</label>
                  <div className="flex gap-2">
                    <select
                      value={filterStartMonth}
                      onChange={(e) => setFilterStartMonth(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">Selecione o mês...</option>
                      {MONTHS_PT.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <select
                      value={filterStartYear}
                      onChange={(e) => setFilterStartYear(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      {YEARS.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* Filter 3: Year/Month Range END - ONLY SHOWN AFTER SETOR SELECTED */}
              {filterSector !== '' && (
                <div className="animate-in fade-in slide-in-from-top-1 duration-300">
                  <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Mês Final</label>
                  <div className="flex gap-2">
                    <select
                      value={filterEndMonth}
                      onChange={(e) => setFilterEndMonth(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      <option value="">Selecione o mês...</option>
                      {MONTHS_PT.map(m => (
                        <option key={m.value} value={m.value}>{m.label}</option>
                      ))}
                    </select>
                    <select
                      value={filterEndYear}
                      onChange={(e) => setFilterEndYear(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                    >
                      {YEARS.map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

            </div>

            {/* Product Searching & Filters Info - ONLY SHOWN IF BOTH SECTOR AND MONTHS SELECTED */}
            {filterSector !== '' && filterStartMonth !== '' && filterEndMonth !== '' && (
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between pt-4 border-t border-slate-100 animate-in fade-in duration-300">
                <div className="relative w-full sm:max-w-md">
                  <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Pesquisar por Código ou Descrição do Produto..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </div>

                <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto sm:justify-end">
                  <button
                    onClick={handleManualRefresh}
                    disabled={isLoadingDB}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 active:bg-indigo-200 text-indigo-700 disabled:opacity-50 border border-indigo-200/60 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingDB ? 'animate-spin' : ''}`} />
                    {isLoadingDB ? 'Atualizando...' : 'Atualizar Dados'}
                  </button>

                  <div className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-2">
                    <CalendarDays className="w-4 h-4 text-slate-400" />
                    Filtrando de: <span className="text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">{MONTHS_PT.find(m => m.value === filterStartMonth)?.label} de {filterStartYear}</span> até <span className="text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">{MONTHS_PT.find(m => m.value === filterEndMonth)?.label} de {filterEndYear}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Stepper info banner when sector is missing */}
          {filterSector === '' && (
            <div className="bg-indigo-50/50 border border-indigo-100/50 p-12 rounded-3xl text-center space-y-4 animate-in fade-in duration-350">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm text-indigo-600 border border-slate-100">
                <Store className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-slate-900 font-extrabold uppercase text-sm tracking-tight">Etapa 1: Selecione o Setor</h4>
                <p className="text-slate-500 text-xs mt-1.5 max-w-sm mx-auto">
                  Por favor, escolha um dos setores de faturamento no menu dropdown acima para começar a análise de dados.
                </p>
              </div>
            </div>
          )}

          {/* Stepper info banner when sector is selected but month is missing */}
          {filterSector !== '' && (filterStartMonth === '' || filterEndMonth === '') && (
            <div className="bg-indigo-50/50 border border-indigo-100/50 p-12 rounded-3xl text-center space-y-4 animate-in fade-in duration-350">
              <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm text-indigo-600 border border-slate-100">
                <Calendar className="w-8 h-8 animate-pulse text-indigo-600" />
              </div>
              <div>
                <h4 className="text-slate-900 font-extrabold uppercase text-sm tracking-tight">Etapa 2: Selecione o Período</h4>
                <p className="text-slate-500 text-xs mt-1.5 max-w-md mx-auto">
                  O setor <span className="font-black text-indigo-700 uppercase">{filterSector === 'Todos' ? 'Todos os Setores' : filterSector}</span> foi selecionado. Agora, escolha um <strong>mês inicial</strong> e um <strong>mês final</strong> para liberar a visualização dos resultados.
                </p>
              </div>
            </div>
          )}

          {/* Rest of DRE data is conditionally revealed only when both filters are solid */}
          {filterSector !== '' && filterStartMonth !== '' && filterEndMonth !== '' && (
            <div className="space-y-8 animate-in fade-in duration-300">

              {/* QTD-TOTAL-NF Display Counter Block */}
          <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-3xl p-8 border border-indigo-950 shadow-md relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="absolute top-0 right-0 p-12 opacity-5 scale-125">
              <FileSpreadsheet className="w-32 h-32" />
            </div>
            
            <div className="relative z-10 w-full">
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest bg-indigo-950/80 px-3 py-1.5 rounded-xl border border-indigo-900/40">Faturamento DRE Consolidado</span>
              <h3 className="text-4xl md:text-5xl font-black mt-4 tracking-tight uppercase flex flex-col sm:flex-row sm:items-baseline gap-2">
                {totals.totalNotaFiscal > 0 ? formatCurrency(totals.totalNotaFiscal) : totals.qtdTotalNf.toLocaleString('pt-BR')}
                <span className="text-xs text-indigo-400 font-bold uppercase tracking-wider block sm:inline mt-1 sm:mt-0">
                  {totals.totalNotaFiscal > 0 ? 'Faturamento Consolidado (Total das NFs)' : 'Faturamento Consolidado (QTD-TOTAL-NF)'}
                </span>
              </h3>
              <p className="text-xs font-bold text-slate-400 mt-2">
                Estão sendo calculados faturamentos do Setor: <span className="text-white font-extrabold">{filterSector === 'Todos' ? 'Todos os Setores' : filterSector}</span> com total de {consolidatedProducts.length} produtos consolidados ({filteredRecords.length} lançamentos).
              </p>
            </div>
          </div>

          {/* Product DRE Table */}
          <div className="bg-white border border-slate-100 rounded-3xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">Produtos e Indicadores Fiscais</h3>
                <p className="text-slate-400 text-[10px] font-black uppercase tracking-wider mt-1">Acompanhamento consolidado de produtos por código e indicadores de CMC/Nota Fiscal</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-3">
                <span className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-black uppercase text-slate-600">
                  {consolidatedProducts.length} produtos
                </span>
                
                <button
                  onClick={() => handleExportDadosExcel()}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 hover:text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  Exportar Excel
                </button>
              </div>
            </div>

            {consolidatedProducts.length === 0 ? (
              <div className="p-16 text-center space-y-4">
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mx-auto text-slate-400 border border-slate-200">
                  <HelpCircle className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-slate-800 font-black uppercase text-sm">Nenhum dado encontrado</h4>
                  <p className="text-slate-400 text-xs mt-1 max-w-sm mx-auto">
                    Não há registros de faturamento importados que atendam a esse Setor ou Faixa de Mês selecionada. Vá na aba <strong>Gerenciador</strong> para importar.
                  </p>
                </div>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100 text-slate-700 text-[10px] font-black uppercase tracking-widest">
                      <th className="px-6 py-4">Código / Produto</th>
                      <th className="px-6 py-4 text-right">Quantidade Total do Item</th>
                      <th className="px-6 py-4 text-right">CMC Total</th>
                      <th className="px-6 py-4 text-right">Total Mercadoria</th>
                      <th className="px-6 py-4 text-right bg-indigo-50/50 text-indigo-900">Total da Nota Fiscal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                    {consolidatedProducts.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-6 py-4 uppercase font-extrabold max-w-xs truncate text-[11px] text-slate-900">
                          {rec.descricao}
                          <span className="block text-[8px] font-black text-slate-400 tracking-wide mt-1 uppercase">
                            Código: {rec.codigo}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-right font-mono">
                          {rec.qtdTotal ? rec.qtdTotal.toLocaleString('pt-BR') : 0}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-slate-950 font-black">
                          {formatCurrency(rec.cmcTotal)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono text-slate-950">
                          {formatCurrency(rec.totalMercadoria || rec.cmcTotal)}
                        </td>
                        <td className="px-6 py-4 text-right font-mono font-black text-indigo-700 bg-indigo-50/30">
                          {rec.totalNotaFiscal > 0 ? formatCurrency(rec.totalNotaFiscal) : (rec.qtdTotalNfProduto ? rec.qtdTotalNfProduto.toLocaleString('pt-BR') : 0)}
                        </td>
                      </tr>
                    ))}

                    {/* Table Summary Line */}
                    <tr className="bg-slate-50 font-black text-slate-900 uppercase tracking-tight border-t-2 border-slate-200">
                      <td className="px-6 py-4 text-sm">
                        TOTAIS DE PERÍODO / SETORES FILTRADOS
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-sm">
                        {totals.qtdTotal.toLocaleString('pt-BR')}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-sm font-black text-slate-950">
                        {formatCurrency(totals.cmcTotal)}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-sm text-slate-950">
                        {formatCurrency(totals.totalMercadoria || totals.cmcTotal)}
                      </td>
                      <td className="px-6 py-4 text-right font-mono text-sm bg-indigo-50 text-indigo-900 font-extrabold">
                        {totals.totalNotaFiscal > 0 ? formatCurrency(totals.totalNotaFiscal) : totals.qtdTotalNf.toLocaleString('pt-BR')}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          </div>
          )}

        </div>
      )}

      {/* --- TAB: VENDEDOR --- */}
      {activeTab === 'vendedor' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          
          {/* Section Description */}
          <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl flex gap-4">
            <Search className="w-8 h-8 text-indigo-600 shrink-0 mt-1" />
            <div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Painel de Verificação do Vendedor</h4>
              <p className="text-slate-600 text-xs mt-1 font-medium leading-relaxed">
                Selecione o vendedor desejado e em seguida o mês correspondente para auditar os lançamentos e conferir se todos os dados de faturamento estão consistentes.
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              
              {/* Seleção de Vendedor */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Selecionar Vendedor</label>
                <select
                  value={vendedorSelected}
                  onChange={(e) => {
                    setVendedorSelected(e.target.value);
                    setVendedorYearSelected('');
                    setVendedorMonthSelected('');
                  }}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none uppercase"
                >
                  <option value="">-- SELECIONE UM VENDEDOR --</option>
                  {uniqueSellersImported.map(v => (
                    <option key={v} value={v}>{v.toUpperCase()}</option>
                  ))}
                </select>
              </div>

              {/* Seleção de Ano */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Selecionar Ano</label>
                <select
                  value={vendedorYearSelected}
                  onChange={(e) => {
                    setVendedorYearSelected(e.target.value);
                    setVendedorMonthSelected('');
                  }}
                  disabled={!vendedorSelected}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none uppercase disabled:opacity-50"
                >
                  <option value="">-- SELECIONE O ANO --</option>
                  {YEARS.map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              {/* Seleção de Mês */}
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1">Selecionar Mês</label>
                <select
                  value={vendedorMonthSelected}
                  onChange={(e) => setVendedorMonthSelected(e.target.value)}
                  disabled={!vendedorSelected || !vendedorYearSelected}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 focus:ring-1 focus:ring-indigo-500 focus:outline-none uppercase disabled:opacity-50"
                >
                  <option value="">-- SELECIONE O MÊS --</option>
                  {MONTHS_PT.map(m => (
                    <option key={m.value} value={m.value}>{m.label.toUpperCase()}</option>
                  ))}
                </select>
              </div>

            </div>
          </div>

          {vendedorSelected && vendedorYearSelected && vendedorMonthSelected && (
            <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col">
              <div className="pb-6 border-b border-slate-100 mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg font-black tracking-tight mb-1 uppercase text-indigo-900">
                    Vendedor: {vendedorSelected}
                  </h3>
                  <p className="text-xs text-slate-500 font-bold uppercase tracking-wider">
                    Lançamentos para o mês de {MONTHS_PT.find(m => m.value === vendedorMonthSelected)?.label || vendedorMonthSelected} de {vendedorYearSelected}
                  </p>
                </div>
                
                <div className="flex flex-wrap items-center gap-3">
                  <div className="bg-indigo-50 text-indigo-700 px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-widest">
                    {vendedorFilteredRecords.length} Itens
                  </div>
                  
                  <button
                    onClick={() => handleExportVendedorExcel()}
                    disabled={vendedorFilteredRecords.length === 0}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 active:bg-emerald-200 text-emerald-700 hover:text-emerald-800 border border-emerald-200 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer shadow-sm disabled:opacity-50"
                  >
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    Exportar Excel
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto flex-1 custom-scrollbar -mx-6 md:-mx-8 px-6 md:px-8 pb-4">
                {vendedorFilteredRecords.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 min-h-[200px] border-2 border-dashed border-slate-200 rounded-2xl mx-8">
                    <p className="text-sm font-bold uppercase tracking-widest text-center">Nenhum registro encontrado para este mês</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse bg-white">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr className="text-slate-600 text-[10px] font-black uppercase tracking-widest">
                          <th className="py-4 px-5 border-r border-slate-200">Mês</th>
                          <th className="py-4 px-5 border-r border-slate-200 w-1/6">Código</th>
                          <th className="py-4 px-5 border-r border-slate-200">Descrição do Produto</th>
                          <th className="py-4 px-5 text-right border-r border-slate-200 w-[150px]">Qtd Total</th>
                          <th className="py-4 px-5 text-right border-r border-slate-200 w-[150px]">CMC Total</th>
                          <th className="py-4 px-5 text-right w-[150px]">Total Nota Fiscal</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                        {/* Linha de Totais do Vendedor */}
                        <tr className="bg-indigo-50/80 font-black text-indigo-950 border-b border-indigo-100/70 hover:bg-indigo-50 transition-colors">
                          <td className="py-4 px-5 border-r border-indigo-100/50 text-indigo-950 border-l-[3px] border-l-indigo-600">
                            GERAL
                          </td>
                          <td className="py-4 px-5 border-r border-indigo-100/50 font-mono text-[10px] text-indigo-800 text-center">
                            -
                          </td>
                          <td className="py-4 px-5 border-r border-indigo-100/50 text-[11px] font-extrabold uppercase tracking-wide text-indigo-900 bg-indigo-50/40">
                            TOTAL CONSOLIDADO DO VENDEDOR
                          </td>
                          <td className="py-4 px-5 border-r border-indigo-100/50 text-right font-mono text-indigo-950 font-extrabold">
                            {vendedorTotalQtd.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-4 px-5 border-r border-indigo-100/50 text-right font-mono text-indigo-950 font-extrabold">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(vendedorTotalCmc)}
                          </td>
                          <td className="py-4 px-5 text-right font-mono text-indigo-950 font-extrabold">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(vendedorTotalNf)}
                          </td>
                        </tr>

                        {/* Registros Detalhados */}
                        {vendedorFilteredRecords.map(rec => (
                          <tr key={rec.id} className="hover:bg-indigo-50/50 transition-colors">
                            <td className="py-4 px-5 border-r border-slate-100 text-slate-900 border-l-[3px] border-l-transparent hover:border-l-indigo-500">
                              {rec.mes}
                            </td>
                            <td className="py-4 px-5 border-r border-slate-100 font-mono text-[10px] text-slate-600">
                              {rec.codigo}
                            </td>
                            <td className="py-4 px-5 border-r border-slate-100 text-[11px] uppercase tracking-wide">
                              {rec.descricao}
                            </td>
                            <td className="py-4 px-5 border-r border-slate-100 text-right font-mono text-slate-900">
                              {rec.qtdTotal ? rec.qtdTotal.toLocaleString('pt-BR') : 0}
                            </td>
                            <td className="py-4 px-5 border-r border-slate-100 text-right font-mono text-slate-900">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rec.cmcTotal)}
                            </td>
                            <td className="py-4 px-5 text-right font-mono text-slate-900">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rec.totalNotaFiscal || 0)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {!vendedorSelected && (
            <div className="bg-slate-50 border border-dashed border-slate-200 p-12 rounded-3xl text-center text-slate-400">
              <Search className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p className="text-sm font-bold uppercase tracking-wider">Selecione um vendedor, o ano e o mês para carregar os relatórios</p>
            </div>
          )}

          {vendedorSelected && !vendedorYearSelected && (
            <div className="bg-slate-50 border border-dashed border-slate-200 p-12 rounded-3xl text-center text-slate-400">
              <CalendarDays className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p className="text-sm font-bold uppercase tracking-wider">Por favor, selecione o ano correspondente para auditar {vendedorSelected}</p>
            </div>
          )}

          {vendedorSelected && vendedorYearSelected && !vendedorMonthSelected && (
            <div className="bg-slate-50 border border-dashed border-slate-200 p-12 rounded-3xl text-center text-slate-400">
              <CalendarDays className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <p className="text-sm font-bold uppercase tracking-wider">Por favor, selecione um mês para conferir o faturamento detalhado de {vendedorSelected} em {vendedorYearSelected}</p>
            </div>
          )}

        </div>
      )}

      {/* --- TAB 2: GERENCIADOR --- */}
      {activeTab === 'gerenciador' && (
        <div className="space-y-8 animate-in fade-in duration-200">
          
          {/* Section Description */}
          <div className="bg-amber-50 border border-amber-100 p-6 rounded-3xl flex gap-4">
            <Settings className="w-8 h-8 text-amber-600 shrink-0 mt-1" />
            <div>
              <h4 className="text-sm font-black text-slate-900 uppercase tracking-tight">Painel de Gerenciamento e Upload de Lançamentos</h4>
              <p className="text-slate-600 text-xs mt-1 font-medium leading-relaxed">
                Nesta seção você importa planilhas Excel direcionando-as para um <strong>Setor</strong> específico e definindo o <strong>Mês/Ano de referência</strong>. Os dados processados servirão como base de cálculo direta para as visualizações e totalizadores fiscais na aba <strong>Dados</strong>.
              </p>
            </div>
          </div>

          <div className="w-full flex flex-col gap-8">
            
            {/* Import Controls Column */}
            <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600 border border-indigo-100/50">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 uppercase tracking-tight">Importação de Dados</h3>
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-0.5">Faça o upload do seu arquivo Excel</p>
                </div>
              </div>
              
              <label className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-sm cursor-pointer border-0 active:scale-95">
                <FileUp className="w-4 h-4" />
                Selecionar Excel
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>
            </div>

            {/* Sellers Mapping List Column */}
            {uniqueSellers.length > 0 && (
              <div className="bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col gap-6 animate-in fade-in duration-300">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight mb-1">
                      Vendedores
                    </h3>
                    <p className="text-xs text-slate-500 font-bold">Associe cada vendedor a um dos setores para atualizar os registros</p>
                  </div>
                  <div className="relative w-full md:w-64">
                    <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Buscar por nome..."
                      value={sellerSearchQuery}
                      onChange={(e) => setSellerSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 text-xs font-bold text-slate-800 rounded-xl placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* Bulk Actions Panel */}
                {selectedSellers.length > 0 && (
                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in slide-in-from-top-2">
                    <span className="text-xs font-black text-indigo-700 uppercase tracking-wider">
                      {selectedSellers.length} Selecionado(s)
                    </span>
                    <div className="flex items-center gap-3 w-full sm:w-auto">
                      <select
                        onChange={(e) => {
                          handleBulkSellerSectorChange(e.target.value as any);
                          e.target.value = 'default';
                        }}
                        defaultValue="default"
                        className="bg-white border-slate-200 border text-slate-800 text-xs font-bold rounded-xl focus:ring-1 focus:ring-indigo-500 block w-full sm:w-56 p-2 outline-none cursor-pointer"
                      >
                        <option value="default" disabled>Aplicar ação em lote...</option>
                        <option value="Loja">Associar: Loja</option>
                        <option value="Comercial">Associar: Comercial</option>
                        <option value="Evento">Associar: Evento</option>
                        <option value="Site">Associar: Site</option>
                        <option value="">Desassociar</option>
                      </select>
                    </div>
                  </div>
                )}
                
                {/* Select All Checkbox */}
                <div className="flex items-center gap-3 px-2">
                  <input
                    type="checkbox"
                    checked={filteredUniqueSellers.length > 0 && selectedSellers.length === filteredUniqueSellers.length}
                    onChange={handleSelectAllFiltered}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="text-[10px] font-black text-slate-500 uppercase tracking-wider cursor-pointer" onClick={handleSelectAllFiltered}>
                    Selecionar Todos
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {filteredUniqueSellers.map(([sellerName, currentSector]) => (
                    <div key={sellerName} className={`flex items-start gap-3 p-4 rounded-2xl border transition-all duration-200 shadow-sm ${!currentSector ? 'border-dashed border-rose-200 bg-rose-50/5 hover:border-rose-400/60' : 'border-slate-100 bg-white hover:border-indigo-300/80'} ${expandedSeller === sellerName ? 'relative z-50' : 'relative z-10'}`}>
                      
                      <input
                        type="checkbox"
                        checked={selectedSellers.includes(sellerName)}
                        onChange={() => handleToggleSellerSelection(sellerName)}
                        className="mt-2.5 w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />

                      <div className="flex-1 flex flex-col relative">
                        {/* Clickable Header */}
                        <div 
                          className="flex items-center justify-between cursor-pointer group"
                          onClick={() => setExpandedSeller(expandedSeller === sellerName ? null : sellerName)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 shrink-0 rounded-full flex items-center justify-center font-black text-xs uppercase transition-colors ${expandedSeller === sellerName ? 'bg-indigo-600 text-white' : 'bg-indigo-100 text-indigo-700'}`}>
                              {sellerName.substring(0, 2)}
                            </div>
                            <span className="font-extrabold text-sm text-slate-800 uppercase tracking-tight truncate max-w-[120px] sm:max-w-[160px]" title={sellerName}>
                              {sellerName}
                            </span>
                          </div>
                          <div className="flex items-center gap-3">
                            <span className={`px-2.5 py-1 flex items-center justify-center rounded-lg text-[10px] font-black uppercase tracking-wider border min-w-[85px] transition-all duration-200 ${
                              currentSector 
                                ? 'bg-indigo-50 text-indigo-700 border-indigo-100' 
                                : 'bg-rose-50 text-rose-600 border-rose-100/60'
                            }`}>
                              {currentSector || 'SEM SETOR'}
                            </span>
                            {expandedSeller === sellerName ? <ChevronUp className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" /> : <ChevronDown className="w-4 h-4 text-slate-400 group-hover:text-indigo-600" />}
                          </div>
                        </div>

                        {/* Expandable Dropdown Menu with click-away backdrop */}
                        {expandedSeller === sellerName && (
                          <>
                            {/* Backdrop covering screen to dismiss the dropdown on click-away */}
                            <div 
                              className="fixed inset-0 z-[100] cursor-default" 
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandedSeller(null);
                              }}
                            />
                            {/* Floating Dropdown Menu */}
                            <div 
                              className="absolute right-0 top-full mt-2 w-52 z-[110] bg-white rounded-xl border border-slate-200/80 shadow-2xl p-1.5 animate-in fade-in zoom-in-95 duration-150"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="flex flex-col gap-1">
                                <div className="px-3 py-1 text-[9px] font-black text-slate-400 uppercase tracking-wider">
                                  Atribuir Setor
                                </div>
                                {(['Loja', 'Comercial', 'Evento', 'Site'] as const).map(ch => (
                                  <button
                                    key={ch}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleSellerSectorChange(sellerName, ch);
                                    }}
                                    className={`text-left w-full px-3 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                                      currentSector === ch
                                        ? 'bg-indigo-50 text-indigo-700'
                                        : 'text-slate-700 hover:bg-slate-50'
                                    }`}
                                  >
                                    Associar: {ch}
                                  </button>
                                ))}
                                {currentSector && (
                                  <>
                                    <div className="h-px bg-slate-100 my-1 mx-2" />
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleSellerSectorChange(sellerName, '');
                                      }}
                                      className="text-left w-full px-3 py-2 text-xs font-bold text-red-600 rounded-lg hover:bg-red-50 transition-all cursor-pointer"
                                    >
                                      Remover Setor
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* List Panel Column */}
            <div className={`bg-white p-6 md:p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col transition-all ${isTableExpanded ? 'max-h-[800px]' : ''}`}>
              <div 
                className="pb-6 border-b border-slate-100 mb-4 flex items-center justify-between cursor-pointer group"
                onClick={() => setIsTableExpanded(!isTableExpanded)}
              >
                <div>
                  <h3 className="text-lg font-black tracking-tight mb-1 group-hover:text-indigo-600 transition-colors flex items-center gap-2 text-slate-900 uppercase">
                    Registros Importados
                    {isTableExpanded ? <ChevronUp className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" /> : <ChevronDown className="w-5 h-5 text-slate-400 group-hover:text-indigo-600 transition-colors" />}
                  </h3>
                  <p className="text-xs text-slate-500 font-bold">Listagem simples baseada na última importação</p>
                </div>
                <div className="bg-indigo-50 text-indigo-700 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">
                  {dreRecords.length} Itens
                </div>
              </div>

              <div className="overflow-x-auto flex-1 custom-scrollbar -mx-6 md:-mx-8 px-6 md:px-8 pb-4 animate-in fade-in duration-300">
                {dreRecords.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-slate-400 min-h-[200px] border-2 border-dashed border-slate-200 rounded-2xl mx-8">
                    <p className="text-sm font-bold uppercase tracking-widest text-center">Nenhum registro<br/>encontrado</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                    <table className="w-full text-left border-collapse bg-white">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr className="text-slate-600 text-[10px] font-black uppercase tracking-widest">
                          <th className="py-4 px-5 border-r border-slate-200">Mês</th>
                          <th className="py-4 px-5 border-r border-slate-200 w-1/4">Vendedor</th>
                          <th className="py-4 px-5 border-r border-slate-200 w-1/6">Código</th>
                          <th className="py-4 px-5 border-r border-slate-200">Descrição do Produto</th>
                          <th className="py-4 px-5 text-right border-r border-slate-200 w-1/4">Qtd Total</th>
                          <th className="py-4 px-5 text-right w-1/4">CMC Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-800">
                        {/* Linha de Totais do Movimento / Planilha */}
                        <tr className="bg-indigo-50/80 font-black text-indigo-950 border-b border-indigo-100/70 hover:bg-indigo-50 transition-colors">
                          <td className="py-4 px-5 border-r border-indigo-100/50 text-indigo-950 border-l-[3px] border-l-indigo-600">
                            GERAL
                          </td>
                          <td className="py-4 px-5 border-r border-indigo-100/50 text-indigo-950 font-extrabold">
                            TOTAL DO MOVIMENTO
                          </td>
                          <td className="py-4 px-5 border-r border-indigo-100/50 font-mono text-[10px] text-indigo-800 text-center">
                            -
                          </td>
                          <td className="py-4 px-5 border-r border-indigo-100/50 text-[11px] font-extrabold uppercase tracking-wide text-indigo-900 bg-indigo-50/40">
                            Total da Nota Fiscal: {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalNfImportados)}
                          </td>
                          <td className="py-4 px-5 border-r border-indigo-100/50 text-right font-mono text-indigo-950 font-extrabold">
                            {totalQtdImportados.toLocaleString('pt-BR')}
                          </td>
                          <td className="py-4 px-5 text-right font-mono text-indigo-950 font-extrabold">
                            {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(totalCmcImportados)}
                          </td>
                        </tr>

                        {/* Registros Detalhados (Se Expandido) */}
                        {isTableExpanded && dreRecords.map(rec => (
                          <tr key={rec.id} className="hover:bg-indigo-50/50 transition-colors">
                            <td className="py-4 px-5 border-r border-slate-100 text-slate-900 border-l-[3px] border-l-transparent hover:border-l-indigo-500">
                              {rec.mes}
                            </td>
                            <td className="py-4 px-5 border-r border-slate-100 text-slate-900">
                              {rec.vendedor || 'Não Identificado'}
                            </td>
                            <td className="py-4 px-5 border-r border-slate-100 font-mono text-[10px] text-slate-600">
                              {rec.codigo}
                            </td>
                            <td className="py-4 px-5 border-r border-slate-100 text-[11px] uppercase tracking-wide">
                              {rec.descricao}
                            </td>
                            <td className="py-4 px-5 border-r border-slate-100 text-right font-mono text-slate-900">
                              {rec.qtdTotal ? rec.qtdTotal.toLocaleString('pt-BR') : 0}
                            </td>
                            <td className="py-4 px-5 text-right font-mono text-slate-900">
                              {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(rec.cmcTotal)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

          </div>

        </div>
      )}

    </div>
  );
};
