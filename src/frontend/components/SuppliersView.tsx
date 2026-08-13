/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { motion } from 'framer-motion';
import { 
  Plus, 
  Search, 
  Building2, 
  Phone, 
  Package, 
  Pencil, 
  Trash2, 
  ChevronDown, 
  ChevronUp,
  Download,
  Upload,
  RefreshCcw,
  Copy,
  ExternalLink,
  FileText,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';
import { Supplier, Product } from '../types';
import { formatCurrency, normalizeText, copyToClipboard } from '../utils';

interface SuppliersViewProps {
  suppliers: Supplier[];
  allSuppliers: Supplier[];
  categories?: string[];
  isLoading?: boolean;
  onRefresh?: () => void;
  searchTerm: string;
  setSearchTerm: (term: string) => void;
  setIsAdding: (adding: boolean) => void;
  handleEditSupplier: (supplier: Supplier) => void;
  setSupplierToDelete: (id: string | null) => void;
  addToCart: (product: Product, supplierName: string, quantity: number) => void;
  handleExportExcel: () => void;
  handleImportExcel: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSyncSheets?: () => void;
  activeTab?: 'fornecedores' | 'mercado' | 'materiais' | 'importar_xml';
  onTabChange?: (tab: 'fornecedores' | 'mercado' | 'materiais' | 'importar_xml') => void;
  addNotification?: (message: string, count: number, type?: 'cart' | 'info') => void;
  onEditProduct: (product: Product, supplierName: string) => void;
  saveSupplier: (supplier: Supplier) => Promise<void>;
}

export const SuppliersView: React.FC<SuppliersViewProps> = ({
  suppliers,
  allSuppliers,
  categories = [],
  isLoading,
  onRefresh,
  searchTerm,
  setSearchTerm,
  setIsAdding,
  handleEditSupplier,
  setSupplierToDelete,
  addToCart,
  handleExportExcel,
  handleImportExcel,
  handleSyncSheets,
  activeTab: externalTab,
  onTabChange,
  addNotification,
  onEditProduct,
  saveSupplier
}) => {
  const [internalTab, setInternalTab] = React.useState<'fornecedores' | 'mercado' | 'materiais' | 'importar_xml'>('fornecedores');
  const activeSubTab = externalTab || internalTab;
  const setActiveSubTab = onTabChange || setInternalTab;

  const availableCategories = React.useMemo(() => {
    const defaults = ['Ingredientes', 'Embalagens', 'Limpeza', 'Escritório', 'Fornecedor'];
    if (categories && Array.isArray(categories) && categories.length > 0) {
      const combined = [...categories, ...defaults];
      return Array.from(new Set(combined.filter(Boolean)));
    }
    return defaults;
  }, [categories]);

  // --- ESTADOS E FUNÇÕES PARA IMPORTAÇÃO DE XML ---
  interface ImportRow {
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
    targetCategory: string;
  }

  const [importRows, setImportRows] = React.useState<ImportRow[]>([]);
  const [isAnalyzing, setIsAnalyzing] = React.useState(false);
  const [xmlLogs, setXmlLogs] = React.useState<string[]>([]);
  const [dragActive, setDragActive] = React.useState(false);
  const [deletingRowId, setDeletingRowId] = React.useState<string | null>(null);
  const xmlContentsRef = React.useRef<Record<string, string>>({});

  const parseNFeXml = (xmlText: string, fileName: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    const parserError = xmlDoc.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
      throw new Error(`Erro ao analisar a estrutura XML de ${fileName}`);
    }

    const infNFeEl = xmlDoc.getElementsByTagName("infNFe")[0];
    let nfeKey = infNFeEl?.getAttribute("Id") || "";
    if (nfeKey.startsWith("NFe")) {
      nfeKey = nfeKey.substring(3);
    }
    if (!nfeKey) {
      nfeKey = xmlDoc.getElementsByTagName("chNFe")[0]?.textContent || "";
    }
    if (!nfeKey) {
      const cNPJ = xmlDoc.getElementsByTagName("CNPJ")[0]?.textContent || "";
      const nNF = xmlDoc.getElementsByTagName("nNF")[0]?.textContent || "";
      nfeKey = cNPJ && nNF ? `${cNPJ}_${nNF}` : `${fileName}_${Date.now()}`;
    }

    const ideEl = xmlDoc.getElementsByTagName("ide")[0];
    const dhEmiRaw = ideEl?.getElementsByTagName("dhEmi")[0]?.textContent || 
                     ideEl?.getElementsByTagName("dEmi")[0]?.textContent || 
                     xmlDoc.getElementsByTagName("dhEmi")[0]?.textContent || 
                     xmlDoc.getElementsByTagName("dEmi")[0]?.textContent || 
                     new Date().toISOString();

    let dhEmi = dhEmiRaw;
    if (dhEmiRaw.includes("T")) {
      dhEmi = dhEmiRaw.split("T")[0];
    }

    const emitEl = xmlDoc.getElementsByTagName("emit")[0];
    const xNome = emitEl?.getElementsByTagName("xNome")[0]?.textContent || 
                  xmlDoc.getElementsByTagName("xNome")[0]?.textContent || 
                  "FORNECEDOR XML";

    const results: { cProd: string; xProd: string; qTrib: number; vUnCom: number; dhEmi: string; nfeKey: string; fileName: string; xNome: string }[] = [];
    const detEls = xmlDoc.getElementsByTagName("det");

    for (let i = 0; i < detEls.length; i++) {
      const det = detEls[i];
      const prodEl = det.getElementsByTagName("prod")[0];
      if (prodEl) {
        const cProd = prodEl.getElementsByTagName("cProd")[0]?.textContent || "";
        const xProd = prodEl.getElementsByTagName("xProd")[0]?.textContent || "";
        
        const qTribText = prodEl.getElementsByTagName("qTrib")[0]?.textContent || "0";
        const qTrib = parseFloat(qTribText.replace(",", ".")) || 0;

        const vUnTribEl = prodEl.getElementsByTagName("vUnTrib")[0];
        const vUnComEl = prodEl.getElementsByTagName("vUnCom")[0];
        const vUnComText = (vUnTribEl && parseFloat(vUnTribEl.textContent?.replace(",", ".") || "0") > 0)
          ? vUnTribEl.textContent || "0"
          : vUnComEl?.textContent || "0";
        const vUnCom = parseFloat(vUnComText.replace(",", ".")) || 0;

        results.push({
          cProd,
          xProd,
          qTrib,
          vUnCom,
          dhEmi,
          nfeKey,
          fileName,
          xNome
        });
      }
    }

    return results;
  };

  const findExactMatch = (cProd: string, xProd: string) => {
    if (!cProd) return null;
    for (const s of allSuppliers) {
      const matchedProduct = s.products.find(p => p.code === cProd);
      if (matchedProduct) {
        return { supplier: s, product: matchedProduct };
      }
    }
    for (const s of allSuppliers) {
      const matchedProduct = s.products.find(p => p.name && normalizeText(p.name) === normalizeText(xProd));
      if (matchedProduct) {
        return { supplier: s, product: matchedProduct };
      }
    }
    return null;
  };

  const handleXmlFiles = async (files: FileList | File[]) => {
    setIsAnalyzing(true);
    const newRows: ImportRow[] = [];
    const logs: string[] = [];
    
    const storedProcessedKeys = localStorage.getItem('processed_nfe_keys');
    const processedKeysList: string[] = storedProcessedKeys ? JSON.parse(storedProcessedKeys) : [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = (e) => reject(new Error("Erro ao ler o arquivo"));
          reader.readAsText(file);
        });

        const productsParsed = parseNFeXml(text, file.name);
        if (productsParsed.length === 0) {
          logs.push(`Aviso: Nenhum produto encontrado no arquivo ${file.name}`);
          continue;
        }

        const key = productsParsed[0].nfeKey;
        xmlContentsRef.current[key] = text;
        if (processedKeysList.includes(key)) {
          logs.push(`Aviso: XML ${file.name} (Chave: ${key}) já foi importado anteriormente.`);
        }

        productsParsed.forEach((parsedP, index) => {
          const matched = findExactMatch(parsedP.cProd, parsedP.xProd);
          
          let reconciliationType: 'exact' | 'manual' | 'new' = 'new';
          let associatedSupplierId = '';
          let associatedSupplierName = '';
          let associatedProductCode = '';

          if (matched) {
            reconciliationType = 'exact';
            associatedSupplierId = matched.supplier.id || '';
            associatedSupplierName = matched.supplier.name;
            associatedProductCode = matched.product.code || matched.product.name || '';
          }

          newRows.push({
            id: `${key}_${index}_${Date.now()}`,
            cProd: parsedP.cProd,
            xProd: parsedP.xProd,
            qTrib: parsedP.qTrib,
            vUnCom: parsedP.vUnCom,
            dhEmi: parsedP.dhEmi,
            nfeKey: key,
            fileName: file.name,
            xNome: parsedP.xNome,
            reconciliationType,
            associatedSupplierId,
            associatedSupplierName,
            associatedProductCode,
            targetType: 'suppliers',
            targetCategory: matched?.product?.category || 'Ingredientes'
          });
        });

        logs.push(`Sucesso: ${file.name} processado (${productsParsed.length} produtos de det/prod)`);
      } catch (err: any) {
        logs.push(`Erro ao processar ${file.name}: ${err.message}`);
      }
    }

    setImportRows(prev => {
      const ids = new Set(prev.map(r => r.id));
      const filteredNew = newRows.filter(r => !ids.has(r.id));
      return [...prev, ...filteredNew];
    });
    setXmlLogs(prev => [...prev, ...logs]);
    setIsAnalyzing(false);
    
    if (addNotification && newRows.length > 0) {
      addNotification(`Processados ${files.length} arquivos XML.`, newRows.length, 'info');
    }
  };

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

  const updateRow = (id: string, updates: Partial<ImportRow>) => {
    setImportRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  };

  const handleSaveImport = async () => {
    if (importRows.length === 0) return;
    setIsAnalyzing(true);
    
    try {
      let workingSuppliers = [...allSuppliers];
      const newlyImportedNfeKeys = new Set<string>();

      for (const row of importRows) {
        newlyImportedNfeKeys.add(row.nfeKey);

        const newPrice = row.vUnCom;
        const newDate = row.dhEmi;

        if (row.reconciliationType === 'exact' || row.reconciliationType === 'manual') {
          const suppId = row.associatedSupplierId;
          const targetRef = row.associatedProductCode; // Pode ser código ou nome selecionado na UI

          let matchedProductCode = targetRef || '';
          let matchedProductName = targetRef || '';

          if (suppId) {
            const matchedSupp = allSuppliers.find(s => s.id === suppId || s.name === suppId || s.name === row.associatedSupplierName);
            if (matchedSupp) {
              const matchedP = matchedSupp.products.find(p => p.code === targetRef || p.name === targetRef);
              if (matchedP) {
                matchedProductCode = matchedP.code || '';
                matchedProductName = matchedP.name || '';
              }
            }
          }

          workingSuppliers = workingSuppliers.map(s => {
            let supplierChanged = false;
            const updatedProducts = s.products.map(p => {
              const isTargetSupplier = s.id === suppId || s.name === suppId || s.name === row.associatedSupplierName;
              const matchesTargetProduct = isTargetSupplier && (p.code === targetRef || p.name === targetRef);

              const matchesCode = (matchedProductCode && p.code === matchedProductCode) || (row.cProd && p.code === row.cProd);
              const matchesName = (matchedProductName && normalizeText(p.name) === normalizeText(matchedProductName)) ||
                                  (row.xProd && normalizeText(p.name) === normalizeText(row.xProd));

              if (matchesTargetProduct || matchesCode || matchesName) {
                supplierChanged = true;
                const updatedProduct = {
                  ...p,
                  price: newPrice,
                  lastPurchaseDate: newDate,
                  ...(row.targetCategory ? { category: row.targetCategory } : {})
                };
                if (!p.code && row.cProd) {
                  updatedProduct.code = row.cProd;
                } else if (!p.code && matchedProductCode) {
                  updatedProduct.code = matchedProductCode;
                }
                return updatedProduct;
              }
              return p;
            });
            return supplierChanged ? { ...s, products: updatedProducts } : s;
          });

          // Propagação simultânea de preço, data e categoria para todas as entidades
          if (row.targetCategory) {
            const newCat = row.targetCategory;
            workingSuppliers = workingSuppliers.map(s => {
              let changed = false;
              const updatedProducts = s.products.map(p => {
                const codeMatches = (row.cProd && p.code === row.cProd) || (matchedProductCode && p.code === matchedProductCode);
                const nameMatches = (row.xProd && normalizeText(p.name) === normalizeText(row.xProd)) || (matchedProductName && normalizeText(p.name) === normalizeText(matchedProductName));
                if (codeMatches || nameMatches) {
                  changed = true;
                  return {
                    ...p,
                    price: newPrice,
                    lastPurchaseDate: newDate,
                    category: newCat
                  };
                }
                return p;
              });
              return changed ? { ...s, products: updatedProducts } : s;
            });
          }

        } else {
          const targetType = row.targetType;
          let targetSupplierName = '';

          if (targetType === 'mercado') {
            targetSupplierName = 'MERCADO';
          } else if (targetType === 'materiais') {
            targetSupplierName = 'MATERIAIS';
          } else {
            if (row.targetSupplierId && row.targetSupplierId !== 'novo') {
              const existingS = workingSuppliers.find(s => s.id === row.targetSupplierId);
              targetSupplierName = existingS ? existingS.name : (row.xNome || 'FORNECEDOR XML');
            } else {
              targetSupplierName = row.xNome || 'FORNECEDOR XML';
            }
          }

          const newProduct: Product = {
            code: row.cProd || `XML_${row.nfeKey.substring(0, 4)}_${row.id.substring(0, 4)}`,
            name: row.xProd,
            price: newPrice,
            category: row.targetCategory || 'Ingredientes',
            lastPurchaseDate: newDate
          };

          let supplierIndex = workingSuppliers.findIndex(s => s.name.toUpperCase() === targetSupplierName.toUpperCase());
          
          if (supplierIndex === -1) {
            const newSupplier: Supplier = {
              id: `XML_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              name: targetSupplierName,
              phone: '00000000000',
              products: [newProduct]
            };
            workingSuppliers.push(newSupplier);
          } else {
            const existingS = workingSuppliers[supplierIndex];
            const existingPIndex = existingS.products.findIndex(p => normalizeText(p.name) === normalizeText(newProduct.name));
            if (existingPIndex === -1) {
              const updatedS = {
                ...existingS,
                products: [...existingS.products, newProduct]
              };
              workingSuppliers[supplierIndex] = updatedS;
            } else {
              const updatedProducts = [...existingS.products];
              updatedProducts[existingPIndex] = {
                ...updatedProducts[existingPIndex],
                price: newPrice,
                lastPurchaseDate: newDate,
                code: newProduct.code
              };
              workingSuppliers[supplierIndex] = {
                ...existingS,
                products: updatedProducts
              };
            }
          }

          workingSuppliers = workingSuppliers.map(s => {
            if (s.name.toUpperCase() === targetSupplierName.toUpperCase()) return s;
            
            let changed = false;
            const updatedProducts = s.products.map(p => {
              const codeMatches = newProduct.code && p.code === newProduct.code;
              const nameMatches = newProduct.name && normalizeText(p.name) === normalizeText(newProduct.name);
              if (codeMatches || nameMatches) {
                changed = true;
                return {
                  ...p,
                  price: newPrice,
                  lastPurchaseDate: newDate
                };
              }
              return p;
            });
            return changed ? { ...s, products: updatedProducts } : s;
          });
        }
      }

      const modifiedSuppliers = workingSuppliers.filter(supplier => {
        const original = allSuppliers.find(s => s.id === supplier.id || s.name === supplier.name);
        if (!original) return true; // É um novo fornecedor
        
        // Compara produtos individuais de forma robusta
        if (original.products.length !== supplier.products.length) return true;
        for (let i = 0; i < original.products.length; i++) {
          const op = original.products[i];
          const sp = supplier.products[i];
          if (
            op.code !== sp.code ||
            op.name !== sp.name ||
            op.price !== sp.price ||
            op.lastPurchaseDate !== sp.lastPurchaseDate ||
            op.category !== sp.category
          ) {
            return true;
          }
        }
        return false;
      });

      await Promise.all(modifiedSuppliers.map(supplier => saveSupplier(supplier)));

      // Sincroniza todas as notas fiscais XML novas com o banco central de faturas/invoices do Dashboard
      const syncPromises = Array.from(newlyImportedNfeKeys).map(async (nfeKey) => {
        const rawXml = xmlContentsRef.current[nfeKey];
        if (rawXml) {
          try {
            await fetch('/api/xml/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ xmlData: rawXml })
            });
          } catch (apiErr) {
            console.error(`Erro ao sincronizar nota ${nfeKey} com banco central:`, apiErr);
          }
        }
      });
      await Promise.all(syncPromises);

      const storedProcessedKeys = localStorage.getItem('processed_nfe_keys');
      const processedKeysList: string[] = storedProcessedKeys ? JSON.parse(storedProcessedKeys) : [];
      newlyImportedNfeKeys.forEach(k => processedKeysList.push(k));
      localStorage.setItem('processed_nfe_keys', JSON.stringify(processedKeysList));

      if (addNotification) {
        addNotification("Importação finalizada! Preços e datas de compra propagados simultaneamente.", importRows.length, 'info');
      }

      setImportRows([]);
      setXmlLogs([]);
    } catch (error: any) {
      console.error("Erro ao persistir importação XML:", error);
      if (addNotification) {
        addNotification(`Erro ao persistir: ${error.message}`, 0);
      }
    } finally {
      setIsAnalyzing(false);
    }
  };

  const [expandedSupplier, setExpandedSupplier] = React.useState<string | null>(null);
  const [quantities, setQuantities] = React.useState<Record<string, string>>({});

  const marketSupplier = allSuppliers.find(s => s.name.toUpperCase() === 'MERCADO');
  const materialsSupplier = allSuppliers.find(s => s.name.toUpperCase() === 'MATERIAIS');

  const handleAddChannelProduct = (channel: 'MERCADO' | 'MATERIAIS') => {
    const existingSupplier = allSuppliers.find(s => s.name.toUpperCase() === channel);
    if (existingSupplier) {
      handleEditSupplier(existingSupplier);
    } else {
      // Create a virtual supplier for this channel if it doesn't exist
      handleEditSupplier({
        id: `CHANNEL_${channel}`,
        name: channel,
        phone: '00000000000',
        products: []
      });
    }
  };

  const handleQuantityChange = (key: string, value: string) => {
    // Permite vazio, números inteiros ou decimais com ponto ou vírgula
    if (value === '' || /^\d*[.,]?\d*$/.test(value)) {
      setQuantities(prev => ({ ...prev, [key]: value }));
    }
  };

  const handleQuantityBlur = (key: string) => {
    // Se estiver vazio ou inválido volta para 1
    const val = quantities[key];
    if (val === undefined || val === null || val === '') {
      setQuantities(prev => ({ ...prev, [key]: '1' }));
      return;
    }
    const num = parseFloat(val.replace(',', '.'));
    if (isNaN(num) || num <= 0) {
      setQuantities(prev => ({ ...prev, [key]: '1' }));
    }
  };

  const adjustQuantity = (key: string, delta: number) => {
    setQuantities(prev => {
      const val = prev[key];
      const current = (val && !isNaN(parseFloat(val.replace(',', '.')))) ? parseFloat(val.replace(',', '.')) : 1;
      const newVal = Math.max(0, current + delta);
      return { ...prev, [key]: Number(newVal.toFixed(3)).toString().replace('.', ',') };
    });
  };

  const onAddToCart = (product: any, supplierName: string, key: string) => {
    const val = quantities[key] || '1';
    let qty = parseFloat(val.replace(',', '.'));
    if (isNaN(qty) || qty <= 0) {
      qty = 1;
    }
    addToCart(product, supplierName, qty);
    setQuantities(prev => ({ ...prev, [key]: '1' }));
  };

  const handleCopy = async (text: string, type: string) => {
    const success = await copyToClipboard(text);
    if (success && addNotification) {
      addNotification(`${type} copiado!`, 1, 'info');
    }
  };

  const isLink = (text: string) => {
    return text.includes('http://') || text.includes('https://') || text.includes('www.');
  };

  const filteredSuppliers = suppliers
    .filter(s => {
      const normalizedSearch = normalizeText(searchTerm);
      return normalizeText(s.name).includes(normalizedSearch) ||
        s.products.some(p => normalizeText(p.name).includes(normalizedSearch));
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="space-y-8"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl md:text-4xl font-black text-slate-900 tracking-tight mb-1 md:mb-2 text-balance">Gestão de Compras</h1>
            <p className="text-sm md:text-base text-slate-500 font-medium">Controle de fornecedores e itens por canal</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 overflow-x-auto pb-3 scrollbar-hide -mx-4 px-4 md:mx-0 md:px-0">
          {[
          { id: 'fornecedores', label: 'Fornecedores' },
          { id: 'mercado', label: 'Mercado' },
          { id: 'materiais', label: 'Materiais' },
          { id: 'importar_xml', label: 'Importar XML' }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveSubTab(tab.id as any)}
            className={`px-6 py-2 rounded-xl font-bold uppercase text-[10px] tracking-widest transition-all whitespace-nowrap ${
              activeSubTab === tab.id 
                ? 'bg-indigo-600 text-white shadow-md' 
                : 'bg-white text-slate-400 hover:text-slate-600 border border-slate-100'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeSubTab === 'fornecedores' && (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <h2 className="text-xl md:text-2xl font-black text-slate-900 uppercase tracking-tight">Lista de Fornecedores</h2>
            <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
              <button
                onClick={handleSyncSheets}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-indigo-50 border-2 border-indigo-100 text-indigo-600 rounded-xl font-bold hover:bg-indigo-100 transition-all shadow-sm text-xs"
              >
                <RefreshCcw className="w-4 h-4" />
                Atualizar Planilha
              </button>
              <button
                onClick={handleExportExcel}
                className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm text-xs"
              >
                <Download className="w-4 h-4" />
                Exportar
              </button>
              <label className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-3 bg-white border-2 border-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-50 transition-all shadow-sm cursor-pointer text-xs">
                <Upload className="w-4 h-4" />
                Importar
                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleImportExcel} />
              </label>
              <button
                onClick={() => setIsAdding(true)}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95 text-xs"
              >
                <Plus className="w-4 h-4" />
                Novo
              </button>
            </div>
          </div>

          <div className="relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input
              type="text"
              placeholder="Buscar..."
              className="w-full pl-14 pr-4 py-4 bg-white border border-slate-200 focus:border-indigo-500 rounded-2xl outline-none transition-all shadow-sm text-base font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-4">
            {filteredSuppliers.map((supplier, sIdx) => (
              <motion.div
                layout
                key={`${supplier.id || 's'}-${sIdx}`}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden transition-all hover:border-indigo-100"
              >
                <div 
                  onClick={() => setExpandedSupplier(expandedSupplier === supplier.id ? null : supplier.id)}
                  className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/50 transition-colors"
                >
                    <div className="flex items-center gap-5">
                      <div className="w-12 h-12 md:w-14 md:h-14 bg-slate-900 rounded-xl flex items-center justify-center border border-slate-800 shadow-sm">
                        <Building2 className="w-6 h-6 md:w-7 md:h-7 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 
                            className={`text-xl font-bold mb-0.5 md:mb-1 tracking-tight uppercase ${isLink(supplier.name) ? 'text-indigo-600 hover:underline cursor-pointer' : 'text-slate-800'}`}
                            onClick={(e) => {
                              if (isLink(supplier.name)) {
                                e.stopPropagation();
                                handleCopy(supplier.name, 'Link');
                              }
                            }}
                          >
                            {supplier.name}
                          </h3>
                        </div>
                        <div className="flex items-center gap-3 text-slate-400 font-bold text-[10px] uppercase tracking-tight">
                          <span 
                            className="flex items-center gap-1 hover:text-indigo-500 transition-colors cursor-pointer"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleCopy(supplier.phone, 'Telefone');
                            }}
                            title="Clique para copiar"
                          >
                            <Phone className="w-3 h-3" />
                            {supplier.phone}
                          </span>
                          <span className="flex items-center gap-1">
                            <Package className="w-3 h-3" />
                            {supplier.products.length} itens
                          </span>
                        </div>
                      </div>
                    </div>
                  
                  <div className="flex items-center justify-between md:justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleEditSupplier(supplier)}
                        className="p-2.5 text-black hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                      >
                        <Pencil className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => setSupplierToDelete(supplier.id)}
                        className="p-2.5 text-black hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                    <button
                      onClick={() => setExpandedSupplier(expandedSupplier === supplier.id ? null : supplier.id)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold uppercase text-[10px] transition-all border ${
                        expandedSupplier === supplier.id 
                          ? 'bg-slate-100 border-slate-200 text-slate-700' 
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
                      }`}
                    >
                      {expandedSupplier === supplier.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      {expandedSupplier === supplier.id ? 'Ocultar' : 'Produtos'}
                    </button>
                  </div>
                </div>

                <motion.div
                  initial={false}
                  animate={{ height: expandedSupplier === supplier.id ? 'auto' : 0 }}
                  className="overflow-hidden bg-slate-50/20"
                >
                  <div className="p-6 pt-0 border-t border-slate-50">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 mt-6">
                      {supplier.products
                        .filter(p => {
                          if (!searchTerm) return true;
                          const normalizedSearch = normalizeText(searchTerm);
                          return normalizeText(p.name).includes(normalizedSearch) || 
                            normalizeText(p.category).includes(normalizedSearch) ||
                            normalizeText(supplier.name).includes(normalizedSearch);
                        })
                        .sort((a, b) => a.name.localeCompare(b.name))
                        .map((product, idx) => {
                          const qKey = `${supplier.id || 'sup'}-${String(product.name)}-${idx}`;
                          return (
                            <div key={qKey} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:border-indigo-200 transition-all">
                              <div>
                                <div className="flex justify-between items-start mb-3">
                                  <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase tracking-wider">
                                    {product.category}
                                  </span>
                                  <div className='flex gap-2 items-center'>
                                    <button onClick={() => onEditProduct(product, supplier.name)} className='p-1 hover:bg-slate-100 rounded-md'>
                                      <Pencil className="w-3 h-3 text-slate-400 hover:text-indigo-600" />
                                    </button>
                                    <span className="text-xl font-black text-indigo-600">
                                      {formatCurrency(product.price)}
                                    </span>
                                  </div>
                                </div>
                                <h4 
                                  className={`font-bold mb-3 transition-colors ${isLink(product.name) ? 'text-indigo-600 hover:underline cursor-pointer' : 'text-slate-900'}`}
                                  onClick={(e) => {
                                    if (isLink(product.name)) {
                                      e.stopPropagation();
                                      handleCopy(product.name, 'Link');
                                    }
                                  }}
                                >
                                  {product.name}
                                </h4>
                                <div className="space-y-1.5 mb-6">
                                  <div className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${product.code ? 'bg-indigo-50/50 border-indigo-100/50 text-indigo-700' : 'bg-amber-50/50 border-amber-150 text-amber-700'}`}>
                                    <div className={`w-1.5 h-1.5 rounded-full ${product.code ? 'bg-indigo-500 animate-pulse' : 'bg-amber-500'}`} />
                                    <span className="text-[11px] font-bold uppercase">Código:</span>
                                    <span className="text-[11px] font-mono font-bold uppercase tracking-wider">{product.code || 'Não associado'}</span>
                                  </div>
                                  {product.lastPurchaseDate && (
                                    <div className="flex items-center gap-2 bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100/50">
                                      <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                                      <span className="text-[11px] text-slate-500 font-bold uppercase">Última Compra:</span>
                                      <span className="text-[11px] text-indigo-700 font-black">{product.lastPurchaseDate}</span>
                                    </div>
                                  )}
                                  {product.paymentMethod && (
                                    <div className="flex items-center gap-2 bg-emerald-50/50 px-2 py-1 rounded-lg border border-emerald-100/50">
                                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                                      <span className="text-[11px] text-slate-500 font-bold uppercase">Pagamento:</span>
                                      <span className="text-[11px] text-emerald-700 font-black">{product.paymentMethod}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="flex flex-col sm:flex-row gap-2 mt-auto">
                                <div className="flex items-center bg-slate-100 rounded-xl border-2 border-transparent focus-within:border-indigo-600 transition-all overflow-hidden shrink-0 h-11">
                                  <button 
                                    id={`dec-${qKey}`}
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      adjustQuantity(qKey, -1);
                                    }}
                                    className="w-9 h-full text-slate-400 hover:text-indigo-600 hover:bg-slate-200 transition-all active:scale-90 flex items-center justify-center"
                                  >
                                    <ChevronDown className="w-4 h-4 font-black" />
                                  </button>
                                  <input
                                    id={`qty-${qKey}`}
                                    type="text"
                                    value={quantities[qKey] ?? '1'}
                                    onChange={(e) => handleQuantityChange(qKey, e.target.value)}
                                    onBlur={() => handleQuantityBlur(qKey)}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        onAddToCart(product, supplier.name, qKey);
                                      } else if (e.key === 'Backspace') {
                                        const currentVal = quantities[qKey] ?? '1';
                                        if (currentVal === '1') {
                                          e.preventDefault();
                                          setQuantities(prev => ({ ...prev, [qKey]: '' }));
                                        }
                                      }
                                    }}
                                    className="w-10 h-full bg-transparent text-center font-bold text-slate-900 outline-none text-sm"
                                    placeholder="Qtd"
                                  />
                                  <button 
                                    id={`inc-${qKey}`}
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      adjustQuantity(qKey, 1);
                                    }}
                                    className="w-9 h-full text-slate-400 hover:text-indigo-600 hover:bg-slate-200 transition-all active:scale-90 flex items-center justify-center"
                                  >
                                    <ChevronUp className="w-4 h-4 font-black" />
                                  </button>
                                </div>
                                <button
                                  id={`add-${qKey}`}
                                  onClick={() => onAddToCart(product, supplier.name, qKey)}
                                  className="flex-1 h-11 bg-slate-900 text-white rounded-xl font-bold text-[10px] sm:text-xs hover:bg-indigo-600 transition-all active:scale-95"
                                >
                                  Adicionar
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            ))}
          </div>
        </div>
      )}

      {activeSubTab === 'mercado' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Produtos de Mercado</h2>
            <button
              onClick={() => handleAddChannelProduct('MERCADO')}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 text-xs"
            >
              <Plus className="w-4 h-4" />
              Gerenciar Produtos
            </button>
          </div>

          <div className="relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input
              type="text"
              placeholder="Buscar produtos no mercado..."
              className="w-full pl-14 pr-4 py-4 bg-white border border-slate-200 focus:border-indigo-500 rounded-2xl outline-none transition-all shadow-sm text-base font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {!marketSupplier || marketSupplier.products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white border border-dashed border-slate-200 rounded-2xl">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                <Package className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 uppercase tracking-tight mb-2">Canal Mercado</h3>
              <p className="text-slate-500 text-sm">Nenhum produto cadastrado no mercado ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {marketSupplier.products
                .filter(p => {
                  const normalizedSearch = normalizeText(searchTerm);
                  return normalizeText(p.name).includes(normalizedSearch) || 
                    normalizeText(p.category).includes(normalizedSearch);
                })
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((product, idx) => {
                  const qKey = `MERCADO-${String(product.name)}-${idx}`;
                  return (
                    <div key={qKey} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:border-indigo-200 transition-all">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <span className="px-3 py-1 bg-slate-50 text-slate-400 border border-slate-100 rounded-lg text-[9px] font-bold uppercase tracking-wider">
                            {product.category}
                          </span>
                          <div className='flex gap-2 items-center'>
                            <button onClick={() => onEditProduct(product, 'MERCADO')} className='p-1 hover:bg-slate-100 rounded-md'>
                              <Pencil className="w-3 h-3 text-slate-400 hover:text-indigo-600" />
                            </button>
                            <span className="text-xl font-black text-indigo-600">
                              {formatCurrency(product.price)}
                            </span>
                          </div>
                        </div>
                        <h4 
                          className={`text-lg font-bold mb-3 uppercase tracking-tight transition-colors ${isLink(product.name) ? 'text-indigo-600 hover:underline cursor-pointer' : 'text-slate-700'}`}
                          onClick={(e) => {
                            if (isLink(product.name)) {
                              e.stopPropagation();
                              handleCopy(product.name, 'Link');
                            }
                          }}
                        >
                          {product.name}
                        </h4>
                        <div className="space-y-1.5 mb-6">
                          <div className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${product.code ? 'bg-indigo-50/50 border-indigo-100/50 text-indigo-700' : 'bg-amber-50/50 border-amber-150 text-amber-700'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${product.code ? 'bg-indigo-500 animate-pulse' : 'bg-amber-500'}`} />
                            <span className="text-[11px] font-bold uppercase">Código:</span>
                            <span className="text-[11px] font-mono font-bold uppercase tracking-wider">{product.code || 'Não associado'}</span>
                          </div>
                          {product.lastPurchaseDate && (
                            <div className="flex items-center gap-2 bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100/50">
                              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                              <span className="text-[11px] text-slate-500 font-bold uppercase">Última Compra:</span>
                              <span className="text-[11px] text-indigo-700 font-black">{product.lastPurchaseDate}</span>
                            </div>
                          )}
                          {product.paymentMethod && (
                            <div className="flex items-center gap-2 bg-emerald-50/50 px-2 py-1 rounded-lg border border-emerald-100/50">
                              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                              <span className="text-[11px] text-slate-500 font-bold uppercase">Pagamento:</span>
                              <span className="text-[11px] text-emerald-700 font-black">{product.paymentMethod}</span>
                            </div>
                          )}
                        </div>
                      </div>
                        <div className="flex flex-col sm:flex-row gap-2 mt-auto">
                          <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200 focus-within:border-indigo-500 transition-all overflow-hidden h-11 shrink-0">
                            <button 
                              id={`dec-${qKey}`}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                adjustQuantity(qKey, -1);
                              }}
                              className="w-10 h-full text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <input
                              id={`qty-${qKey}`}
                              type="text"
                              value={quantities[qKey] ?? '1'}
                              onChange={(e) => handleQuantityChange(qKey, e.target.value)}
                              onBlur={() => handleQuantityBlur(qKey)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  onAddToCart(product, 'MERCADO', qKey);
                                } else if (e.key === 'Backspace') {
                                  const currentVal = quantities[qKey] ?? '1';
                                  if (currentVal === '1') {
                                    e.preventDefault();
                                    setQuantities(prev => ({ ...prev, [qKey]: '' }));
                                  }
                                }
                              }}
                              className="w-10 h-full bg-transparent text-center font-bold text-slate-700 outline-none text-sm"
                              placeholder="Qtd"
                            />
                            <button 
                              id={`inc-${qKey}`}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                adjustQuantity(qKey, 1);
                              }}
                              className="w-10 h-full text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                          </div>
                          <button
                            id={`add-${qKey}`}
                            onClick={() => onAddToCart(product, 'MERCADO', qKey)}
                            className="flex-1 h-11 bg-slate-900 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-indigo-600 transition-all shadow-sm"
                          >
                            Adicionar
                          </button>
                        </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'materiais' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-slate-800 uppercase tracking-tight">Produtos de Materiais</h2>
            <button
              onClick={() => handleAddChannelProduct('MATERIAIS')}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 text-white rounded-xl font-bold hover:bg-indigo-700 transition-all shadow-md active:scale-95 text-xs"
            >
              <Plus className="w-4 h-4" />
              Gerenciar Produtos
            </button>
          </div>

          <div className="relative group">
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-indigo-500 transition-colors" />
            <input
              type="text"
              placeholder="Buscar materiais..."
              className="w-full pl-14 pr-4 py-4 bg-white border border-slate-200 focus:border-indigo-500 rounded-2xl outline-none transition-all shadow-sm text-base font-medium"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {!materialsSupplier || materialsSupplier.products.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white border border-dashed border-slate-200 rounded-2xl">
              <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-6">
                <Package className="w-8 h-8 text-slate-300" />
              </div>
              <h3 className="text-xl font-bold text-slate-800 uppercase tracking-tight mb-2">Canal Materiais</h3>
              <p className="text-slate-500 text-sm">Nenhum produto cadastrado em materiais ainda.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {materialsSupplier.products
                .filter(p => {
                  const normalizedSearch = normalizeText(searchTerm);
                  return normalizeText(p.name).includes(normalizedSearch) || 
                    normalizeText(p.category).includes(normalizedSearch);
                })
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((product, idx) => {
                  const qKey = `MATERIAIS-${String(product.name)}-${idx}`;
                  return (
                    <div key={qKey} className="bg-white p-6 rounded-2xl border border-slate-100 shadow-sm flex flex-col justify-between group hover:border-indigo-100 transition-all">
                      <div>
                        <div className="flex justify-between items-start mb-4">
                          <span className="px-3 py-1 bg-slate-50 text-slate-400 border border-slate-100 rounded-lg text-[9px] font-bold uppercase tracking-wider">
                            {product.category}
                          </span>
                          <div className='flex gap-2 items-center'>
                            <button onClick={() => onEditProduct(product, 'MATERIAIS')} className='p-1 hover:bg-slate-100 rounded-md'>
                              <Pencil className="w-3 h-3 text-slate-400 hover:text-indigo-600" />
                            </button>
                            <span className="text-xl font-black text-indigo-600">
                              {formatCurrency(product.price)}
                            </span>
                          </div>
                        </div>
                        <h4 
                          className={`text-lg font-bold mb-3 uppercase tracking-tight transition-colors ${isLink(product.name) ? 'text-indigo-600 hover:underline cursor-pointer' : 'text-slate-700'}`}
                          onClick={(e) => {
                            if (isLink(product.name)) {
                              e.stopPropagation();
                              handleCopy(product.name, 'Link');
                            }
                          }}
                        >
                          {product.name}
                        </h4>
                        <div className="space-y-1.5 mb-6">
                          <div className={`flex items-center gap-2 px-2 py-1 rounded-lg border ${product.code ? 'bg-indigo-50/50 border-indigo-100/50 text-indigo-700' : 'bg-amber-50/50 border-amber-150 text-amber-700'}`}>
                            <div className={`w-1.5 h-1.5 rounded-full ${product.code ? 'bg-indigo-500 animate-pulse' : 'bg-amber-500'}`} />
                            <span className="text-[11px] font-bold uppercase">Código:</span>
                            <span className="text-[11px] font-mono font-bold uppercase tracking-wider">{product.code || 'Não associado'}</span>
                          </div>
                          {product.lastPurchaseDate && (
                            <div className="flex items-center gap-2 bg-indigo-50/50 px-2 py-1 rounded-lg border border-indigo-100/50">
                              <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                              <span className="text-[11px] text-slate-500 font-bold uppercase">Última Compra:</span>
                              <span className="text-[11px] text-indigo-700 font-black">{product.lastPurchaseDate}</span>
                            </div>
                          )}
                          {product.paymentMethod && (
                            <div className="flex items-center gap-2 bg-emerald-50/50 px-2 py-1 rounded-lg border border-emerald-100/50">
                              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                              <span className="text-[11px] text-slate-500 font-bold uppercase">Pagamento:</span>
                              <span className="text-[11px] text-emerald-700 font-black">{product.paymentMethod}</span>
                            </div>
                          )}
                        </div>
                      </div>
                        <div className="flex flex-col sm:flex-row gap-2 mt-auto">
                          <div className="flex items-center bg-slate-50 rounded-xl border border-slate-200 focus-within:border-indigo-500 transition-all overflow-hidden h-11 shrink-0">
                            <button 
                              id={`dec-${qKey}`}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                adjustQuantity(qKey, -1);
                              }}
                              className="w-10 h-full text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                            <input
                              id={`qty-${qKey}`}
                              type="text"
                              value={quantities[qKey] ?? '1'}
                              onChange={(e) => handleQuantityChange(qKey, e.target.value)}
                              onBlur={() => handleQuantityBlur(qKey)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  onAddToCart(product, 'MATERIAIS', qKey);
                                } else if (e.key === 'Backspace') {
                                  const currentVal = quantities[qKey] ?? '1';
                                  if (currentVal === '1') {
                                    e.preventDefault();
                                    setQuantities(prev => ({ ...prev, [qKey]: '' }));
                                  }
                                }
                              }}
                              className="w-10 h-full bg-transparent text-center font-bold text-slate-700 outline-none text-sm"
                              placeholder="Qtd"
                            />
                            <button 
                              id={`inc-${qKey}`}
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                adjustQuantity(qKey, 1);
                              }}
                              className="w-10 h-full text-slate-400 hover:text-indigo-600 hover:bg-slate-100 transition-all active:scale-95 flex items-center justify-center"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                          </div>
                          <button
                            id={`add-${qKey}`}
                            onClick={() => onAddToCart(product, 'MATERIAIS', qKey)}
                            className="flex-1 h-11 bg-slate-900 text-white rounded-xl font-bold uppercase text-[10px] tracking-widest hover:bg-indigo-600 transition-all shadow-sm"
                          >
                            Adicionar
                          </button>
                        </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {activeSubTab === 'importar_xml' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
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

          {importRows.length > 0 ? (
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
                      const isAutoLinked = row.reconciliationType === 'exact';
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
                            {/* Option list */}
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

                            {/* Details based on choices */}
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
                                    
                                    {/* 1. Selecionar o Grupo */}
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

                                    {/* 2. Selecionar o Fornecedor Específico (apenas se for grupo Fornecedor) */}
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

                                    {/* 3. Selecionar o Produto do Fornecedor Ativo */}
                                    {activeSupp && (
                                      <select
                                        value={row.associatedProductCode || ''}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          const matchedP = activeSupp.products.find(p => p.code === val || p.name === val);
                                          updateRow(row.id, {
                                            associatedProductCode: val,
                                            ...(matchedP?.category ? { targetCategory: matchedP.category } : {})
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

                                    {/* 4. Escolha de Categoria para o Dashboard */}
                                    <div className="flex flex-col gap-1 mt-1 pt-1.5 border-t border-indigo-100">
                                      <span className="font-extrabold text-indigo-900 text-[9px] uppercase tracking-wider">
                                        📁 Categoria (Dashboard):
                                      </span>
                                      <select
                                        value={availableCategories.includes(row.targetCategory) ? row.targetCategory : (row.targetCategory ? '__CUSTOM__' : 'Ingredientes')}
                                        onChange={(e) => {
                                          const val = e.target.value;
                                          if (val === '__ADD_NEW__') {
                                            const customCat = prompt("Digite o nome da nova categoria:");
                                            if (customCat && customCat.trim()) {
                                              updateRow(row.id, { targetCategory: customCat.trim() });
                                            }
                                          } else if (val !== '__CUSTOM__') {
                                            updateRow(row.id, { targetCategory: val });
                                          }
                                        }}
                                        className="w-full text-[10px] font-bold bg-white text-slate-800 border border-indigo-200 rounded-lg p-1.5 outline-none focus:ring-1 focus:ring-indigo-500"
                                      >
                                        {availableCategories.map(cat => (
                                          <option key={cat} value={cat}>{cat}</option>
                                        ))}
                                        {!availableCategories.includes(row.targetCategory) && row.targetCategory && (
                                          <option value="__CUSTOM__">{row.targetCategory}</option>
                                        )}
                                        <option value="__ADD_NEW__">＋ Criar Nova Categoria...</option>
                                      </select>
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
                                      className="w-full text-[10px] bg-white border border-slate-200 p-1.5 rounded-lg outline-none font-bold text-slate-700"
                                    >
                                      <option value="novo">Criar novo fornecedor do XML</option>
                                      {allSuppliers.filter(s => !['MERCADO', 'MATERIAIS'].includes(s.name.toUpperCase())).map(s => (
                                        <option key={s.id || s.name} value={s.id}>{s.name}</option>
                                      ))}
                                    </select>
                                  )}

                                  <div className="flex flex-col gap-1 mt-1 pt-1 border-t border-amber-200/60">
                                    <span className="font-extrabold text-amber-900 text-[9px] uppercase tracking-wider">
                                      📁 Categoria (Dashboard):
                                    </span>
                                    <select
                                      value={availableCategories.includes(row.targetCategory) ? row.targetCategory : (row.targetCategory ? '__CUSTOM__' : 'Ingredientes')}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '__ADD_NEW__') {
                                          const customCat = prompt("Digite o nome da nova categoria:");
                                          if (customCat && customCat.trim()) {
                                            updateRow(row.id, { targetCategory: customCat.trim() });
                                          }
                                        } else if (val !== '__CUSTOM__') {
                                          updateRow(row.id, { targetCategory: val });
                                        }
                                      }}
                                      className="w-full text-[10px] bg-white border border-slate-200 p-1.5 rounded-lg outline-none font-bold text-slate-700 focus:ring-1 focus:ring-amber-500"
                                    >
                                      {availableCategories.map(cat => (
                                        <option key={cat} value={cat}>{cat}</option>
                                      ))}
                                      {!availableCategories.includes(row.targetCategory) && row.targetCategory && (
                                        <option value="__CUSTOM__">{row.targetCategory}</option>
                                      )}
                                      <option value="__ADD_NEW__">＋ Criar Nova Categoria...</option>
                                    </select>
                                  </div>
                                </div>
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center">
                            <button
                              type="button"
                              onClick={() => setDeletingRowId(row.id)}
                              className="p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-all"
                              title="Excluir produto da lista de conciliação"
                            >
                              <Trash2 className="w-5 h-5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="bg-slate-50 px-6 py-4 flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveImport}
                  disabled={isAnalyzing}
                  className="px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold uppercase text-xs tracking-wider transition-all shadow-md active:scale-95"
                >
                  Concluir e Salvar Todas as Conciliações ({importRows.length})
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-16 bg-white border border-dashed border-slate-200 rounded-2xl dark:border-slate-800">
              <FileText className="w-12 h-12 text-slate-300 mb-4" />
              <p className="text-sm font-bold text-slate-500">Nenhum produto importado por XML no momento</p>
              <p className="text-xs text-slate-400 mt-1">Carregue Notas Fiscais no botão acima para iniciar a conciliação</p>
            </div>
          )}
        </div>
      )}

      {deletingRowId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-3xl p-6 max-w-sm w-full border border-slate-100 shadow-2xl animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 mb-4 text-amber-600">
              <AlertTriangle className="w-6 h-6 animate-pulse" />
              <h3 className="font-bold text-slate-800 text-lg uppercase tracking-tight">Confirmar Exclusão</h3>
            </div>
            <p className="text-sm text-slate-500 mb-6 font-medium leading-relaxed">
              Tem certeza que deseja excluir este produto da lista de importação XML? Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setDeletingRowId(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold uppercase text-[10px] tracking-wider rounded-xl transition-all"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  setImportRows(prev => prev.filter(r => r.id !== deletingRowId));
                  setDeletingRowId(null);
                  if (addNotification) {
                    addNotification("Item removido com sucesso.", 1, "info");
                  }
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-bold uppercase text-[10px] tracking-wider rounded-xl transition-all shadow-md shadow-rose-100"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
};
