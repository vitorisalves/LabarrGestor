import React, { useState, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Sparkles, 
  Upload, 
  FileText, 
  Camera, 
  FileCode, 
  X, 
  Check, 
  ArrowRight,
  Plus,
  ListChecks,
  AlertCircle,
  Building2,
  Tag,
  Loader2,
  ChevronRight,
  Save,
  Pencil,
  Link as LinkIcon,
  Link2Off,
  Search,
  Trash2
} from 'lucide-react';
import { AIActionType, AIResponse, processCommandWithAI, ExtractedProduct } from '../../services/geminiService';
import { DeliveredProduct, Product, Supplier } from '../types';
import { formatCurrency, extractErrorMessage, normalizeText } from '../utils';
import { ConfirmationModal } from './modals/ConfirmationModal';
import { getProductCategories } from '../utils/productCategories';

interface AIViewProps {
  suppliers: Supplier[];
  categories: string[];
  deliveredProducts: DeliveredProduct[];
  saveSupplier: (s: Supplier) => Promise<void>;
  updateForecastDate: (id: string, date: string) => Promise<void>;
  updateProductPriceInLists: (productName: string, supplierName: string, newPrice: number) => Promise<void>;
  addToCart: (product: Product, supplierName: string, quantity: number, category: string) => void;
  addNotification: (msg: string, qty: number, type?: 'cart' | 'info') => void;
}

interface MatchResult {
  extracted: ExtractedProduct;
  originalReadName: string;
  existingProduct?: Product;
  supplier?: Supplier;
  isNew: boolean;
  selectedContext?: 'suppliers' | 'mercado' | 'materiais';
  selectedSupplierId?: string;
  selectedCategories?: string[];
  newSupplierName?: string;
}

export const AIView: React.FC<AIViewProps> = ({
  suppliers,
  categories,
  deliveredProducts,
  saveSupplier,
  updateForecastDate,
  updateProductPriceInLists,
  addToCart,
  addNotification
}) => {
  const [command, setCommand] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [quotaError, setQuotaError] = useState(false);
  const [matchResults, setMatchResults] = useState<MatchResult[]>([]);
  const [discoveredSuppliers, setDiscoveredSuppliers] = useState<string[]>([]);
  const [aiResponse, setAiResponse] = useState<AIResponse | null>(null);
  const [editableAIData, setEditableAIData] = useState<any>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [searchProductQuery, setSearchProductQuery] = useState('');
  const [linkingIndex, setLinkingIndex] = useState<number | null>(null);
  const [itemToRemoveIndex, setItemToRemoveIndex] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const flatProducts = useMemo(() => {
    return suppliers.flatMap(s => s.products.map(p => ({ ...p, supplier: s })));
  }, [suppliers]);

  const filteredSearchProducts = useMemo(() => {
    if (!searchProductQuery.trim()) return [];
    const normalizedQuery = normalizeText(searchProductQuery);
    return flatProducts
      .filter(p => normalizeText(p.name).includes(normalizedQuery))
      .slice(0, 10);
  }, [flatProducts, searchProductQuery]);

  const stringSimilarity = (s1: string, s2: string): number => {
    const v1 = normalizeText(s1).trim();
    const v2 = normalizeText(s2).trim();
    if (v1 === v2) return 1;
    if (!v1 || !v2) return 0;
    if (v1.includes(v2) || v2.includes(v1)) {
      return Math.min(v1.length, v2.length) / Math.max(v1.length, v2.length) * 0.9;
    }
    const words1 = v1.split(/\s+/).filter(w => w.length > 2);
    const words2 = v2.split(/\s+/).filter(w => w.length > 2);
    if (words1.length === 0 || words2.length === 0) return 0;
    const common = words1.filter(w => words2.some(w2 => w2.includes(w) || w.includes(w2)));
    return common.length / Math.max(words1.length, words2.length);
  };

  const processAI = async () => {
    if (!command && !selectedFile) return;
    setIsProcessing(true);
    setQuotaError(false);
    setAiResponse(null);
    setMatchResults([]);

    try {
      let fileData;
      if (selectedFile) {
        const b64 = await fileToBase64(selectedFile);
        fileData = {
          mimeType: selectedFile.type,
          data: b64
        };
      }

      const response = await processCommandWithAI(command, {
        suppliers,
        deliveredProducts,
        fileData
      });

      setAiResponse(response);
      setEditableAIData(response.data);

      // Identificar fornecedores sugeridos pela IA que não existem ainda no banco
      const discSet = new Set<string>();
      if (response.data?.supplierName) {
        const sName = response.data.supplierName.trim();
        const exists = suppliers.some(s => s.name.toUpperCase() === sName.toUpperCase());
        if (!exists && sName) {
          discSet.add(sName);
        }
      }
      const extractedProducts = response.data?.products || [];
      extractedProducts.forEach((item: any) => {
        if (item.supplierName) {
          const sName = item.supplierName.trim();
          const exists = suppliers.some(s => s.name.toUpperCase() === sName.toUpperCase());
          if (!exists && sName) {
            discSet.add(sName);
          }
        }
      });
      const discList = Array.from(discSet);
      setDiscoveredSuppliers(discList);

      // Se a ação for UPDATE_PRICES, CREATE_PRODUCTS ou CREATE_SHOPPING_LIST, processamos os matchResults
      if (response.action === 'UPDATE_PRICES' || response.action === 'CREATE_PRODUCTS' || response.action === 'CREATE_SHOPPING_LIST') {
        const results: MatchResult[] = extractedProducts.map(item => {
          let matchedProduct: Product | undefined;
          let matchedSupplier: Supplier | undefined;
          let bestScore = 0;
          const originalName = item.rawName || item.name;

          const normalizedItemName = normalizeText(item.name);
          for (const s of suppliers) {
            const p = s.products.find(p => normalizeText(p.name) === normalizedItemName);
            if (p) {
              matchedProduct = p;
              matchedSupplier = s;
              bestScore = 1;
              break;
            }
          }

          if (!matchedProduct) {
            for (const s of suppliers) {
              for (const p of s.products) {
                const score = stringSimilarity(p.name, item.name);
                if (score > 0.6 && score > bestScore) {
                  bestScore = score;
                  matchedProduct = p;
                  matchedSupplier = s;
                }
              }
            }
          }

          const suggestedSupplierName = item.supplierName?.trim() || response.data?.supplierName?.trim();
          let selectedSupplierId = matchedSupplier?.id;
          let selectedContext: 'suppliers' | 'mercado' | 'materiais' = 
            matchedSupplier?.name.toUpperCase() === 'MERCADO' ? 'mercado' : 
            matchedSupplier?.name.toUpperCase() === 'MATERIAIS' ? 'materiais' : 'suppliers';
          let newSupplierName = undefined;

          if (!matchedSupplier && suggestedSupplierName) {
            const isMercado = suggestedSupplierName.toUpperCase() === 'MERCADO';
            const isMateriais = suggestedSupplierName.toUpperCase() === 'MATERIAIS';
            
            if (isMercado) {
              selectedContext = 'mercado';
              const mSup = suppliers.find(s => s.name.toUpperCase() === 'MERCADO');
              selectedSupplierId = mSup?.id || 'MERCADO';
            } else if (isMateriais) {
              selectedContext = 'materiais';
              const mSup = suppliers.find(s => s.name.toUpperCase() === 'MATERIAIS');
              selectedSupplierId = mSup?.id || 'MATERIAIS';
            } else {
              selectedContext = 'suppliers';
              const existingMatch = suppliers.find(s => s.name.toUpperCase() === suggestedSupplierName.toUpperCase());
              if (existingMatch) {
                selectedSupplierId = existingMatch.id;
              } else {
                selectedSupplierId = `NEW:${suggestedSupplierName}`;
                newSupplierName = suggestedSupplierName;
              }
            }
          }

          return {
            extracted: item,
            originalReadName: originalName,
            existingProduct: matchedProduct,
            supplier: matchedSupplier,
            isNew: !matchedProduct || bestScore < 0.85,
            selectedContext,
            selectedSupplierId,
            newSupplierName,
            selectedCategories: matchedProduct ? getProductCategories(matchedProduct) : (categories.length > 0 ? [categories[0]] : ['Fornecedor'])
          };
        });

        setMatchResults(results);
      }

      // Limpar campos após processamento
      setCommand('');
      setSelectedFile(null);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    } catch (error) {
      const errorMsg = extractErrorMessage(error);
      console.error("AI Error:", errorMsg);
      if (errorMsg.includes('quota') || errorMsg.includes('429')) {
        setQuotaError(true);
      } else {
        addNotification(`Erro na IA: ${errorMsg}`, 0, 'info');
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const handleUpdate = async () => {
    const updatedSuppliers = new Map<string, Supplier>();

    for (const res of matchResults) {
      // Determina qual fornecedor alvo usar baseado no contexto
      let targetSupplier: Supplier | undefined;
      
      if (res.selectedContext === 'mercado') {
        targetSupplier = suppliers.find(s => s.name.toUpperCase() === 'MERCADO');
        if (!targetSupplier) {
           targetSupplier = { id: 'MERCADO', name: 'MERCADO', phone: '', products: [] };
        }
      } else if (res.selectedContext === 'materiais') {
        targetSupplier = suppliers.find(s => s.name.toUpperCase() === 'MATERIAIS');
        if (!targetSupplier) {
           targetSupplier = { id: 'MATERIAIS', name: 'MATERIAIS', phone: '', products: [] };
        }
      } else {
        if (res.selectedSupplierId === 'CREATE_NEW_MANUAL' && res.newSupplierName?.trim()) {
          const name = res.newSupplierName.trim();
          targetSupplier = suppliers.find(s => s.name.toUpperCase() === name.toUpperCase());
          if (!targetSupplier) {
            targetSupplier = { name, phone: '', products: [] };
          }
        } else if (res.selectedSupplierId?.startsWith('NEW:')) {
          const name = res.selectedSupplierId.substring(4).trim();
          targetSupplier = suppliers.find(s => s.name.toUpperCase() === name.toUpperCase());
          if (!targetSupplier) {
            targetSupplier = { name, phone: '', products: [] };
          }
        } else {
          targetSupplier = suppliers.find(s => s.id === res.selectedSupplierId);
        }
      }

      if (targetSupplier) {
        const sId = targetSupplier.id || `NEW_${targetSupplier.name}`;
        // Clone products to avoid mutating React state references directly
        const s = updatedSuppliers.get(sId) || { 
          ...targetSupplier, 
          products: targetSupplier.products ? targetSupplier.products.map(p => ({ ...p })) : [] 
        };
        
        if (!s.products) {
          s.products = [];
        }

        if (!res.isNew && res.existingProduct) {
          const pIdx = s.products.findIndex(p => p.name === res.existingProduct?.name);
          if (pIdx !== -1) {
            s.products[pIdx] = { 
              ...s.products[pIdx], 
              name: res.extracted.name,
              price: res.extracted.price,
              categories: res.selectedCategories && res.selectedCategories.length > 0 ? res.selectedCategories : s.products[pIdx].categories,
              lastPurchaseDate: res.extracted.lastPurchaseDate || s.products[pIdx].lastPurchaseDate,
              paymentMethod: res.extracted.paymentMethod || s.products[pIdx].paymentMethod
            };
          } else {
            s.products.push({
              name: res.extracted.name,
              price: res.extracted.price,
              categories: res.selectedCategories && res.selectedCategories.length > 0 ? res.selectedCategories : ['Fornecedor'],
              lastPurchaseDate: res.extracted.lastPurchaseDate,
              paymentMethod: res.extracted.paymentMethod,
              code: ''
            });
          }
        } else {
          // Check for duplicates to prevent adding the same product multiple times under the same supplier
          const pIdx = s.products.findIndex(p => p.name.toUpperCase() === res.extracted.name.toUpperCase());
          if (pIdx !== -1) {
            s.products[pIdx] = {
              ...s.products[pIdx],
              price: res.extracted.price,
              categories: res.selectedCategories && res.selectedCategories.length > 0 ? res.selectedCategories : s.products[pIdx].categories,
              lastPurchaseDate: res.extracted.lastPurchaseDate || s.products[pIdx].lastPurchaseDate,
              paymentMethod: res.extracted.paymentMethod || s.products[pIdx].paymentMethod
            };
          } else {
            s.products.push({
              name: res.extracted.name,
              price: res.extracted.price,
              categories: res.selectedCategories && res.selectedCategories.length > 0 ? res.selectedCategories : ['Fornecedor'],
              lastPurchaseDate: res.extracted.lastPurchaseDate,
              paymentMethod: res.extracted.paymentMethod,
              code: ''
            });
          }
        }
        updatedSuppliers.set(sId, s);
      }
    }

    for (const s of Array.from(updatedSuppliers.values())) {
      const oldSupplier = suppliers.find(sup => sup.id === s.id);
      if (oldSupplier) {
        for (const newProduct of s.products) {
          const oldProduct = oldSupplier.products.find(p => p.name === newProduct.name);
          if (oldProduct && oldProduct.price !== newProduct.price) {
            await updateProductPriceInLists(newProduct.name, s.name, newProduct.price);
          }
        }
      }
      
      const supplierToSave = { ...s };
      if (!supplierToSave.id || supplierToSave.id.startsWith('NEW_') || supplierToSave.id.startsWith('NEW:')) {
        delete supplierToSave.id;
      }
      
      await saveSupplier(supplierToSave);
    }

    addNotification("Sincronização concluída!", matchResults.length, 'info');
    setMatchResults([]);
    setCommand('');
    setSelectedFile(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const updateItemConfig = (index: number, updates: Partial<MatchResult>) => {
    setMatchResults(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const next = { ...item, ...updates };
      if (updates.selectedContext === 'mercado') {
        const s = suppliers.find(sup => sup.name.toUpperCase() === 'MERCADO');
        next.selectedSupplierId = s?.id || 'MERCADO';
      } else if (updates.selectedContext === 'materiais') {
        const s = suppliers.find(sup => sup.name.toUpperCase() === 'MATERIAIS');
        next.selectedSupplierId = s?.id || 'MATERIAIS';
      }
      return next;
    }));
  };

  const updateEditableAIData = (updates: any) => {
    setEditableAIData((prev: any) => ({ ...prev, ...updates }));
  };

  const removeItem = (index: number) => {
    setItemToRemoveIndex(index);
  };

  const confirmRemove = () => {
    if (itemToRemoveIndex !== null) {
      setMatchResults(prev => prev.filter((_, i) => i !== itemToRemoveIndex));
      setItemToRemoveIndex(null);
    }
  };

  const handleConfirmAction = async () => {
    if (!aiResponse || !editableAIData) return;

    try {
      if (aiResponse.action === 'UPDATE_PRICES' || aiResponse.action === 'CREATE_PRODUCTS') {
        await handleUpdate();
      } else if (aiResponse.action === 'UPDATE_DELIVERY_DATES') {
        const updates = editableAIData.deliveryUpdates || [];
        for (const update of updates) {
          await updateForecastDate(update.id, update.forecastDate);
        }
        addNotification("Datas de entrega atualizadas!", updates.length, 'info');
      } else if (aiResponse.action === 'CREATE_SHOPPING_LIST') {
        // Primeiro, cria/atualiza os produtos (se houver)
        if (matchResults.length > 0) {
          await handleUpdate();
        }

        const items = editableAIData.shoppingItems || [];
        for (const item of items) {
          // Tentar encontrar o produto para pegar o ID/obj
          const found = flatProducts.find(p => p.name === item.name && (!item.supplierName || p.supplier.name === item.supplierName));

          if (found) {
            addToCart(found, found.supplier.name, item.quantity, getProductCategories(found)[0] || 'AI');
          } else {
            // Se não existe, cria um "fantasma" para a lista
            addToCart({ name: item.name, price: 0, categories: ['AI'], code: '' }, item.supplierName || 'AI', item.quantity, 'AI');
          }
        }
        addNotification("Operação concluída!", items.length, 'cart');
      }
      
      setAiResponse(null);
      setEditableAIData(null);
      setMatchResults([]);
    } catch (err) {
      console.error("Action Confirm Error:", err);
      addNotification("Erro ao processar ação", 0, 'info');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setQuotaError(false);
    }
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = error => reject(error);
    });
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const validTypes = ['image/jpeg', 'image/png', 'application/pdf', 'text/xml', 'application/xml'];
      
      if (validTypes.includes(file.type) || file.name.endsWith('.xml')) {
        setSelectedFile(file);
        setQuotaError(false);
      } else {
        addNotification("Formato de arquivo não suportado", 0, 'info');
      }
    }
  };

  const renderAIResponseContent = () => {
    if (!aiResponse) return null;

    if (aiResponse.action === 'CHAT') {
      return (
        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
          <p className="text-slate-700 font-medium leading-relaxed">{aiResponse.explanation}</p>
          <button 
            onClick={() => setAiResponse(null)}
            className="mt-6 w-full py-3 bg-slate-100 text-slate-600 font-bold rounded-xl uppercase tracking-widest text-xs hover:bg-slate-200 transition-all"
          >
            Ok, entendi
          </button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="bg-indigo-50 border border-indigo-100 p-6 rounded-3xl">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-10 h-10 bg-indigo-600 text-white rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest leading-none mb-1">Ação Sugerida</p>
              <h3 className="text-lg font-bold text-indigo-900">{aiResponse.action}</h3>
            </div>
          </div>
          <p className="text-indigo-800 font-medium text-sm">{aiResponse.explanation}</p>
        </div>

        {aiResponse.action === 'UPDATE_DELIVERY_DATES' && (
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Produto</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Nova Previsão</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {editableAIData?.deliveryUpdates?.map((u: any, idx: number) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 font-bold text-slate-700 text-sm uppercase">{u.name}</td>
                    <td className="px-6 py-4 text-right">
                      <input 
                        type="date"
                        className="font-black text-indigo-600 text-sm text-right bg-transparent border-b border-indigo-200"
                        value={u.forecastDate.split('/').reverse().join('-')}
                        onChange={(e) => {
                          const newUpdates = [...editableAIData.deliveryUpdates];
                          newUpdates[idx] = { ...newUpdates[idx], forecastDate: e.target.value.split('-').reverse().join('/') };
                          updateEditableAIData({ deliveryUpdates: newUpdates });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {aiResponse.action === 'CREATE_SHOPPING_LIST' && (
          <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
             <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Item</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Qtd</th>
                  <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Fornecedor</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {editableAIData?.shoppingItems?.map((item: any, idx: number) => (
                  <tr key={idx}>
                    <td className="px-6 py-4 font-bold text-slate-700 text-sm uppercase">
                      <input 
                        className="bg-transparent border-b border-slate-200 w-full"
                        value={item.name}
                        onChange={(e) => {
                          const newItems = [...editableAIData.shoppingItems];
                          newItems[idx] = { ...newItems[idx], name: e.target.value };
                          updateEditableAIData({ shoppingItems: newItems });
                        }}
                      />
                    </td>
                    <td className="px-6 py-4">
                      <input 
                        type="number"
                        className="font-black text-indigo-600 text-center w-full bg-transparent border-b border-indigo-200"
                        value={item.quantity}
                        onChange={(e) => {
                          const newItems = [...editableAIData.shoppingItems];
                          newItems[idx] = { ...newItems[idx], quantity: parseInt(e.target.value) || 0 };
                          updateEditableAIData({ shoppingItems: newItems });
                        }}
                      />
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-400 text-xs text-right uppercase">
                      <input 
                        className="bg-transparent border-b border-slate-200 w-full text-right"
                        value={item.supplierName || ''}
                        onChange={(e) => {
                          const newItems = [...editableAIData.shoppingItems];
                          newItems[idx] = { ...newItems[idx], supplierName: e.target.value };
                          updateEditableAIData({ shoppingItems: newItems });
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Note: UPDATE_PRICES and CREATE_PRODUCTS use the existing matchResults rendering flow */}
        {aiResponse.action !== 'UPDATE_PRICES' && aiResponse.action !== 'CREATE_PRODUCTS' && aiResponse.action !== 'CREATE_SHOPPING_LIST' && (
           <div className="flex gap-4">
            <button 
              onClick={() => setAiResponse(null)}
              className="flex-1 py-4 bg-white border border-slate-200 text-slate-400 font-bold rounded-2xl uppercase tracking-widest text-xs hover:bg-slate-50 transition-all"
            >
              Cancelar
            </button>
            <button 
              onClick={handleConfirmAction}
              className="flex-[2] py-4 bg-indigo-600 text-white font-bold rounded-2xl uppercase tracking-widest text-xs hover:bg-indigo-700 shadow-lg shadow-indigo-200 transition-all"
            >
              Confirmar e Executar
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-8 pb-20"
    >
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">I.A. LABARR</h1>
          <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">
            Assistência inteligente para gestão de preços, fornecedores e estoques
          </p>
        </div>
        <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-indigo-100">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
      </div>

      {!aiResponse ? (
        <div className="space-y-8">
          <AnimatePresence>
            {quotaError && (
              <motion.div 
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 32 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                className="overflow-hidden"
              >
                <div className="bg-amber-50 border border-amber-200 p-6 rounded-2xl flex flex-col md:flex-row items-center gap-6 shadow-sm">
                  <div className="w-12 h-12 bg-amber-500 text-white rounded-xl flex items-center justify-center shrink-0">
                    <AlertCircle className="w-6 h-6" />
                  </div>
                  <div className="text-center md:text-left flex-1">
                    <h3 className="text-lg font-bold text-amber-900 uppercase tracking-tight">Limite de IA Atingido</h3>
                    <p className="text-amber-700 text-sm">O Google liberou o uso gratuito, mas há um limite de requisições por minuto. Por favor, aguarde alguns instantes e tente novamente.</p>
                  </div>
                  <button 
                    onClick={() => setQuotaError(false)}
                    className="px-4 py-2 bg-amber-500 text-white font-bold rounded-xl uppercase tracking-widest text-[10px] hover:bg-amber-600 transition-colors"
                  >
                    Entendi
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm focus-within:ring-2 ring-indigo-500/20 transition-all">
              <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-3">
                <FileText className="w-4 h-4 text-indigo-600" />
                Diga o que você precisa
              </h3>
              <textarea
                placeholder="Ex: 'Atualize os preços dessa foto', 'Mude a entrega da Farinha para amanhã', 'Monte uma lista de compras com 10kg de arroz'..."
                className="w-full h-44 p-0 bg-transparent border-none outline-none font-bold text-slate-700 resize-none text-base placeholder:text-slate-300"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
              <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                 <p className="text-[10px] font-medium text-slate-400 truncate max-w-[200px]">Sugestão: "Crie o fornecedor X com produto Y"</p>
                 <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2 text-indigo-600 font-bold uppercase tracking-widest text-[10px] hover:bg-indigo-50 px-3 py-2 rounded-xl transition-all"
                 >
                   <Upload className="w-4 h-4" /> {selectedFile ? 'Trocar Arquivo' : 'Anexar Foto/PDF'}
                 </button>
              </div>
            </div>

            <button
              onClick={processAI}
              disabled={isProcessing || (!command && !selectedFile)}
              className={`w-full py-5 rounded-2xl font-black text-lg uppercase tracking-[0.2em] flex items-center justify-center gap-4 transition-all shadow-xl active:scale-[0.98] ${
                isProcessing 
                  ? 'bg-slate-100 text-slate-400 cursor-not-allowed' 
                  : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-100 hover:shadow-indigo-200'
              }`}
            >
              {isProcessing ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  ANALISANDO...
                </>
              ) : (
                <>
                  <Sparkles className="w-6 h-6" />
                  EXECUTAR COM I.A.
                </>
              )}
            </button>
          </div>

          <div className="space-y-6">
            <div 
              onClick={() => fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`bg-white p-8 h-full rounded-3xl border-2 border-dashed transition-all cursor-pointer group flex flex-col items-center justify-center text-center space-y-4 ${
                isDragging ? 'border-indigo-600 bg-indigo-50 ring-4 ring-indigo-50' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50/50'
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef}
                onChange={handleFileChange}
                className="hidden"
                accept="image/*,application/pdf,text/xml"
              />
              
              {selectedFile ? (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="space-y-4"
                >
                  <div className="w-20 h-20 bg-indigo-600 text-white rounded-3xl flex items-center justify-center mx-auto shadow-lg shadow-indigo-100">
                    {selectedFile.type.includes('image') ? <Camera className="w-10 h-10" /> : <FileCode className="w-10 h-10" />}
                  </div>
                  <div className="w-full px-4 overflow-hidden">
                    <p className="font-black text-slate-900 text-lg break-all uppercase tracking-tight">{selectedFile.name}</p>
                    <p className="text-slate-400 font-bold uppercase tracking-widest text-[9px] mt-1">
                      {(selectedFile.size / 1024).toFixed(1)} KB · PRONTO PARA ANALISAR
                    </p>
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); setSelectedFile(null); }}
                    className="px-4 py-2 bg-red-50 text-red-500 font-black uppercase tracking-widest text-[9px] rounded-full hover:bg-red-500 hover:text-white transition-all"
                  >
                    Remover
                  </button>
                </motion.div>
              ) : (
                <>
                  <div className="w-20 h-20 bg-slate-50 text-slate-300 group-hover:text-indigo-600 group-hover:bg-white group-hover:shadow-lg group-hover:shadow-indigo-50 rounded-3xl flex items-center justify-center transition-all">
                    <Upload className="w-10 h-10" />
                  </div>
                  <div>
                    <p className="font-black text-slate-900 text-xl tracking-tight uppercase">Entrada de Dados</p>
                    <p className="text-slate-400 font-bold text-xs uppercase tracking-widest mt-1">Fotos, Notas Fiscais, PDFs ou XMLs</p>
                  </div>
                  <div className="flex gap-4 pt-4">
                    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest bg-slate-50 px-3 py-2 rounded-xl">
                      <Camera className="w-4 h-4" /> IMG
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest bg-slate-50 px-3 py-2 rounded-xl">
                      <FileText className="w-4 h-4" /> PDF
                    </div>
                    <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest bg-slate-50 px-3 py-2 rounded-xl">
                      <FileCode className="w-4 h-4" /> XML
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      ) : (
        <div className="space-y-8">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-black text-slate-900 uppercase tracking-tight">O que a I.A. encontrou</h2>
            <div className="flex gap-4">
              <button 
                onClick={() => {
                  setAiResponse(null);
                  setMatchResults([]);
                }}
                className="px-6 py-3 bg-white border border-slate-200 font-black uppercase tracking-widest text-[10px] rounded-2xl hover:bg-slate-50 transition-all text-slate-500"
              >
                Cancelar
              </button>
              {(aiResponse.action === 'UPDATE_PRICES' || aiResponse.action === 'CREATE_PRODUCTS' || aiResponse.action === 'CREATE_SHOPPING_LIST') && (
                <button 
                  onClick={handleConfirmAction}
                  className="px-6 py-3 bg-indigo-600 text-white font-black uppercase tracking-widest text-[10px] rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all flex items-center gap-2"
                >
                  <Save className="w-4 h-4" />
                  Confirmar Tudo
                </button>
              )}
            </div>
          </div>

          {renderAIResponseContent()}

          {(aiResponse.action === 'UPDATE_PRICES' || aiResponse.action === 'CREATE_PRODUCTS' || aiResponse.action === 'CREATE_SHOPPING_LIST') && (
            <div className="bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-[900px]">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-100">
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Produto</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-40">Preço</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-24">Qtd</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-44">Contexto</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-56">Fornecedor</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-44">Categoria</th>
                      <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-widest w-16 text-center">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {matchResults.map((res, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 transition-colors">
                        {/* Produto */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2 group">
                              <input 
                                type="text"
                                className="font-bold text-slate-900 text-sm bg-transparent border-b border-transparent hover:border-slate-200 focus:border-indigo-500 outline-none w-full transition-all py-0.5 uppercase"
                                value={res.extracted.name}
                                onChange={(e) => updateItemConfig(i, { extracted: { ...res.extracted, name: e.target.value } })}
                              />
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              {res.isNew ? (
                                <span className="text-[9px] font-black text-indigo-600 uppercase tracking-widest px-1.5 py-0.5 bg-indigo-50 rounded">Novo</span>
                              ) : (
                                <span className="text-[9px] font-black text-emerald-600 uppercase tracking-widest px-1.5 py-0.5 bg-emerald-50 rounded">Vínculo</span>
                              )}
                              
                              <button 
                                onClick={() => {
                                  setLinkingIndex(i);
                                  setSearchProductQuery('');
                                }}
                                className="text-[9px] font-black text-indigo-600 uppercase tracking-widest flex items-center gap-0.5 hover:underline"
                              >
                                <LinkIcon className="w-2.5 h-2.5" />
                                {res.existingProduct ? 'Trocar' : 'Vincular'}
                              </button>

                              {!res.isNew && (
                                <button 
                                  onClick={() => {
                                    updateItemConfig(i, {
                                      existingProduct: undefined,
                                      supplier: undefined,
                                      isNew: true,
                                      extracted: { ...res.extracted, name: res.originalReadName }
                                    });
                                  }}
                                  className="text-[9px] font-black text-red-500 uppercase tracking-widest flex items-center gap-0.5 hover:underline"
                                >
                                  <Link2Off className="w-2.5 h-2.5" />
                                  Desvincular
                                </button>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* Preço */}
                        <td className="px-6 py-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 focus-within:border-indigo-500 transition-colors">
                              <span className="text-slate-400 font-bold text-xs">R$</span>
                              <input
                                type="number"
                                step="0.01"
                                className="w-full font-bold text-slate-700 bg-transparent border-none outline-none text-xs"
                                value={res.extracted.price}
                                onChange={(e) => updateItemConfig(i, { extracted: { ...res.extracted, price: parseFloat(e.target.value) || 0 } })}
                              />
                            </div>
                            {!res.isNew && res.existingProduct && (
                              <span className="text-[9px] text-slate-400 font-medium">
                                Antigo: <span className="line-through">{formatCurrency(res.existingProduct.price)}</span>
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Quantidade */}
                        <td className="px-6 py-4">
                          <input
                            type="number"
                            className="w-full font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-xs outline-none focus:border-indigo-500"
                            value={res.extracted.quantity || 1}
                            onChange={(e) => updateItemConfig(i, { extracted: { ...res.extracted, quantity: parseInt(e.target.value) || 1 } })}
                          />
                        </td>

                        {/* Contexto */}
                        <td className="px-6 py-4">
                          <select 
                            className="text-xs font-bold uppercase tracking-tight outline-none w-full bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg cursor-pointer"
                            value={res.selectedContext}
                            onChange={(e) => updateItemConfig(i, { selectedContext: e.target.value as any })}
                          >
                            <option value="suppliers">Fornecedores</option>
                            <option value="mercado">Mercado</option>
                            <option value="materiais">Materiais</option>
                          </select>
                        </td>

                        {/* Fornecedor */}
                        <td className="px-6 py-4">
                          {res.selectedContext === 'suppliers' ? (
                            <div className="flex flex-col gap-1">
                              <select 
                                className="text-xs font-bold uppercase tracking-tight outline-none w-full bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg cursor-pointer"
                                value={res.selectedSupplierId || ''}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  if (val === 'CREATE_NEW_MANUAL') {
                                    updateItemConfig(i, { selectedSupplierId: 'CREATE_NEW_MANUAL', newSupplierName: '' });
                                  } else if (val.startsWith('NEW:')) {
                                    updateItemConfig(i, { selectedSupplierId: val, newSupplierName: val.substring(4) });
                                  } else {
                                    updateItemConfig(i, { selectedSupplierId: val, newSupplierName: undefined });
                                  }
                                }}
                              >
                                <option value="">Selecionar Fornecedor</option>
                                {suppliers.filter(s => s.name.toUpperCase() !== 'MERCADO' && s.name.toUpperCase() !== 'MATERIAIS').map(s => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                                {discoveredSuppliers.map(ds => (
                                  <option key={`NEW:${ds}`} value={`NEW:${ds}`}>[Novo] {ds}</option>
                                ))}
                                <option value="CREATE_NEW_MANUAL">+ Criar Novo Fornecedor...</option>
                              </select>
                              {res.selectedSupplierId === 'CREATE_NEW_MANUAL' && (
                                <input 
                                  type="text"
                                  placeholder="Nome do Fornecedor..."
                                  value={res.newSupplierName || ''}
                                  onChange={(e) => updateItemConfig(i, { newSupplierName: e.target.value })}
                                  className="w-full text-xs font-bold uppercase p-1.5 border border-slate-200 rounded-lg outline-none focus:border-indigo-500 bg-white"
                                />
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 font-bold uppercase italic">
                              {res.selectedContext === 'mercado' ? 'MERCADO' : 'MATERIAIS'}
                            </span>
                          )}
                        </td>

                        {/* Categoria */}
                        <td className="px-6 py-4">
                          <select
                            className="text-xs font-bold uppercase tracking-tight outline-none w-full bg-slate-50 border border-slate-200 px-2 py-1.5 rounded-lg cursor-pointer"
                            value={res.selectedCategories?.[0] || ''}
                            onChange={(e) => updateItemConfig(i, { selectedCategories: e.target.value ? [e.target.value] : [] })}
                          >
                            <option value="">Selecionar Categoria</option>
                            {Array.from(new Set(categories)).map((c, idx) => <option key={`${c}-${idx}`} value={c}>{c}</option>)}
                          </select>
                        </td>

                        {/* Remover */}
                        <td className="px-6 py-4 text-center">
                          <button 
                            onClick={() => removeItem(i)}
                            className="p-1.5 bg-red-50 text-red-500 rounded-lg border border-red-100 hover:bg-red-500 hover:text-white transition-all shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ... linking modal content ... */}
      <AnimatePresence>
        {linkingIndex !== null && (
          <div className="fixed inset-0 z-[999] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setLinkingIndex(null)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-2xl bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh]"
            >
              <div className="p-6 border-b border-slate-100">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-bold text-slate-800 flex items-center gap-3">
                    <LinkIcon className="w-6 h-6 text-indigo-600" />
                    Vincular Produto Existente
                  </h3>
                  <button onClick={() => setLinkingIndex(null)} className="p-1.5 hover:bg-slate-100 rounded-full transition-colors">
                    <X className="w-5 h-5 text-slate-400" />
                  </button>
                </div>

                <div className="relative">
                  <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input 
                    autoFocus
                    type="text"
                    placeholder="Pesquisar por nome, marca ou fornecedor..."
                    className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 transition-all font-medium text-slate-700"
                    value={searchProductQuery}
                    onChange={(e) => setSearchProductQuery(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
                {filteredSearchProducts.length > 0 ? (
                  filteredSearchProducts.map((p, pIdx) => (
                    <button
                      key={pIdx}
                      onClick={() => {
                        if (linkingIndex !== null) {
                          updateItemConfig(linkingIndex, {
                            extracted: { ...matchResults[linkingIndex].extracted, name: p.name },
                            existingProduct: p,
                            supplier: p.supplier,
                            isNew: false,
                            selectedSupplierId: p.supplier.id,
                            selectedContext: p.supplier.name.toUpperCase() === 'MERCADO' ? 'mercado' : 
                                             p.supplier.name.toUpperCase() === 'MATERIAIS' ? 'materiais' : 'suppliers',
                            selectedCategories: getProductCategories(p)
                          });
                          setLinkingIndex(null);
                        }
                      }}
                      className="w-full flex items-center justify-between p-4 hover:bg-indigo-50 rounded-xl transition-all border border-transparent hover:border-indigo-100 text-left group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white border border-slate-100 rounded-lg flex items-center justify-center text-slate-300 group-hover:text-indigo-600 group-hover:border-indigo-100 transition-all">
                          <Check className="w-5 h-5 opacity-0 group-hover:opacity-100 transition-all" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-700 uppercase text-xs tracking-tight">{p.name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{p.supplier.name}</span>
                            <span className="w-1 h-1 bg-slate-200 rounded-full" />
                            <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest">{getProductCategories(p).join(', ')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-indigo-600 text-base tracking-tight">{formatCurrency(p.price)}</p>
                      </div>
                    </button>
                  ))
                ) : searchProductQuery ? (
                  <div className="py-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-slate-50 text-slate-100 rounded-full flex items-center justify-center mx-auto">
                      <Search className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 text-lg">Nenhum resultado</p>
                      <p className="text-slate-400 text-sm">Tente termos mais genéricos</p>
                    </div>
                  </div>
                ) : (
                  <div className="py-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-slate-50 text-slate-100 rounded-full flex items-center justify-center mx-auto">
                      <ListChecks className="w-8 h-8" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-400">Digite para começar a busca</p>
                    </div>
                  </div>
                )}
              </div>
              
              <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
                <button 
                  onClick={() => setLinkingIndex(null)}
                  className="px-6 py-2 bg-white border border-slate-200 rounded-xl font-bold uppercase tracking-widest text-[10px] shadow-sm hover:shadow-md transition-all"
                >
                  Fechar
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmationModal 
        isOpen={itemToRemoveIndex !== null}
        onClose={() => setItemToRemoveIndex(null)}
        onConfirm={confirmRemove}
        title="Remover Item"
        message="Deseja realmente remover este produto da extração?"
        confirmText="Remover"
        variant="danger"
      />
    </motion.div>
  );
};
