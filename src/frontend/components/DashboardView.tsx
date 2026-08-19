/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  TrendingUp,
  Calendar as CalendarIcon,
  AlertCircle,
  Clock,
  RefreshCcw,
  Upload,
  FileText,
  Trash2,
  XCircle,
  FileCheck2,
  HelpCircle,
  Briefcase,
  Search,
  ShoppingCart,
  CheckCircle2
} from 'lucide-react';
import { format, isWithinInterval, startOfMonth, endOfMonth, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { domToCanvas } from 'modern-screenshot';

import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, getDocs } from 'firebase/firestore';
import { formatCurrency, safeStringify, handleFirestoreError, OperationType } from '../utils';
import { SavedList } from '../types';
import { useTestMode } from '../context/TestModeContext';
import { analyzePrices } from '../utils/priceAnalysis';
import { DashboardStatsCards } from './dashboard/DashboardStatsCards';
import { SystemLogsPanel } from './dashboard/SystemLogsPanel';
import { MonthlySpendChart } from './dashboard/MonthlySpendChart';
import { CategoryPieChart } from './dashboard/CategoryPieChart';
import { BatchImportPreviewModal } from './dashboard/BatchImportPreviewModal';
import { PriceIncreasesTable } from './dashboard/PriceIncreasesTable';
import { PriceAnalysisPanel } from './dashboard/PriceAnalysisPanel';

const parseDateSafe = (dateStr: any): Date | null => {
  if (!dateStr) return null;
  if (dateStr instanceof Date) return isNaN(dateStr.getTime()) ? null : dateStr;
  if (typeof dateStr !== 'string') return null;

  const cleanStr = dateStr.trim();
  if (!cleanStr) return null;

  const dateOnlyMatch = cleanStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (dateOnlyMatch) {
    const year = parseInt(dateOnlyMatch[1], 10);
    const month = parseInt(dateOnlyMatch[2], 10) - 1;
    const day = parseInt(dateOnlyMatch[3], 10);
    return new Date(year, month, day, 12, 0, 0);
  }

  const parsedISO = parseISO(cleanStr);
  if (!isNaN(parsedISO.getTime())) return parsedISO;

  const fallback = new Date(cleanStr);
  if (!isNaN(fallback.getTime())) return fallback;

  return null;
};

interface DashboardViewProps {
  savedLists?: SavedList[];
  categories?: any[];
}

export const DashboardView: React.FC<DashboardViewProps> = ({ savedLists, categories: propCategories = [] }) => {
  const { isTestMode } = useTestMode();
  const [startDate, setStartDate] = useState<string>(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState<string>(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
  const [isChartReady, setIsChartReady] = useState(false);
  
  // Real-time XML Spendings State with localStorage caching
  const [xmlSpendings, setXmlSpendings] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('cached_dashboard_xml_spendings');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(() => {
    try {
      const cached = localStorage.getItem('cached_dashboard_xml_spendings');
      return cached ? false : true;
    } catch {
      return true;
    }
  });
  
  // Upload state
  const [isUploading, setIsUploading] = useState(false);
  const [xmlLogs, setXmlLogs] = useState<{ type: 'success' | 'warning' | 'error', text: string }[]>([]);
  const [batchPreview, setBatchPreview] = useState<any[]>([]);
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState(false);
  const [categories, setCategories] = useState<any[]>([]);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [bulkCategory, setBulkCategory] = useState<string>('');


  const [selectedChartCategory, setSelectedChartCategory] = useState<string>('');
  const [pieSearchQuery, setPieSearchQuery] = useState('');
  const [pieCategoryFilter, setPieCategoryFilter] = useState('ALL');
  const [showPieProductList, setShowPieProductList] = useState(false);

  const [productMemory, setProductMemory] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('dashboard_product_memory') || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    fetch('/api/xml/categories').then(res => res.json()).then(data => setCategories(Array.isArray(data) ? data : data.data || [])).catch(console.error);
  }, []);

  const normalizedCategories = useMemo(() => {
    const defaults = ['Embalagens', 'Ingredientes', 'Limpeza', 'Escritório', 'Fornecedor', 'Insumos', 'Loja', 'Fábrica'];
    const map = new Map<string, { id: string, name: string }>();

    defaults.forEach(d => {
      map.set(d.toLowerCase(), { id: d, name: d });
    });

    const listsToMerge = [...propCategories, ...(Array.isArray(categories) ? categories : [])];
    listsToMerge.forEach((item: any) => {
      if (!item) return;
      if (typeof item === 'string') {
        if (item.trim()) map.set(item.trim().toLowerCase(), { id: item.trim(), name: item.trim() });
      } else if (typeof item === 'object') {
        const name = item.name || item.id || '';
        const id = item.id || item.name || '';
        if (name) map.set(String(name).trim().toLowerCase(), { id: String(id), name: String(name) });
      }
    });

    return Array.from(map.values());
  }, [categories, propCategories]);


  // States of invoices and suppliers for pricing dashboard
  const [invoices, setInvoices] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('cached_dashboard_invoices');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [suppliers, setSuppliers] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('cached_dashboard_suppliers');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [isPriceLoading, setIsPriceLoading] = useState(false);
  const [priceSearchQuery, setPriceSearchQuery] = useState('');
  const [priceSearchYear, setPriceSearchYear] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Logs do Sistema
  const [systemLogs, setSystemLogs] = useState<Array<{ id: string; timestamp: string; type: 'category' | 'delete' | 'info'; message: string }>>([]);

  const addSystemLog = (type: 'category' | 'delete' | 'info', message: string) => {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    console.log(`[LOG DO SISTEMA - ${type.toUpperCase()}] ${timestamp}: ${message}`);
    setSystemLogs(prev => [
      { id: Date.now().toString() + '_' + Math.random().toString(36).substring(2, 6), timestamp, type, message },
      ...prev.slice(0, 49) // Limite de 50 registros
    ]);
  };

  // Alertas de Aumento de Preço (Nova Tabela Temporária)
  const [priceIncreases, setPriceIncreases] = useState<any[]>([]);
  const [isPriceIncreasesLoading, setIsPriceIncreasesLoading] = useState(false);
  const [selectedIncreases, setSelectedIncreases] = useState<string[]>([]);

  const fetchPriceIncreases = async () => {
    setIsPriceIncreasesLoading(true);
    try {
      const res = await fetch('/api/xml/price-increases');
      if (res.ok) {
        const data = await res.json();
        setPriceIncreases(data);
      }
    } catch (err) {
      console.error("Erro ao buscar aumentos de preço:", err);
    } finally {
      setIsPriceIncreasesLoading(false);
    }
  };

  const handleDeleteIncrease = async (id: string) => {
    try {
      const res = await fetch('/api/xml/price-increases/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: [id] })
      });
      if (res.ok) {
        setPriceIncreases(prev => prev.filter(item => item.id !== id));
        setSelectedIncreases(prev => prev.filter(item => item !== id));
      }
    } catch (err) {
      console.error("Erro ao deletar aumento de preço:", err);
    }
  };

  const handleBulkDeleteIncreases = async () => {
    if (selectedIncreases.length === 0) return;
    try {
      const res = await fetch('/api/xml/price-increases/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: selectedIncreases })
      });
      if (res.ok) {
        setPriceIncreases(prev => prev.filter(item => !selectedIncreases.includes(item.id)));
        setSelectedIncreases([]);
      }
    } catch (err) {
      console.error("Erro ao deletar aumentos em lote:", err);
    }
  };

  const handleToggleSelectAll = () => {
    if (selectedIncreases.length === priceIncreases.length) {
      setSelectedIncreases([]);
    } else {
      setSelectedIncreases(priceIncreases.map(item => item.id));
    }
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIncreases(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  // --- PRODUTOS PENDENTES DE LISTAS DE COMPRAS ---
  const [pendingListProducts, setPendingListProducts] = useState<any[]>([]);
  const [isPendingLoading, setIsPendingLoading] = useState(false);
  const [selectedPendingIds, setSelectedPendingIds] = useState<string[]>([]);
  const [bulkPendingCategory, setBulkPendingCategory] = useState('');
  const [bulkPendingPrice, setBulkPendingPrice] = useState('');
  const [deletePendingConfirmModal, setDeletePendingConfirmModal] = useState<{
    open: boolean;
    idsToDelete: string[];
    isBulk: boolean;
  }>({ open: false, idsToDelete: [], isBulk: false });

  const [deleteProductConfirmModal, setDeleteProductConfirmModal] = useState<{
    open: boolean;
    productKey?: string;
    invKey?: string;
    productName?: string;
    productCode?: string;
    supplierName?: string;
    invNumber?: string;
    dateStr?: string;
    totalNet?: number;
    productIndex?: number;
  }>({ open: false });

  const confirmDeleteProductItem = async () => {
    if (!deleteProductConfirmModal.invKey) return;

    const targetInvKey = deleteProductConfirmModal.invKey;
    const targetIndex = deleteProductConfirmModal.productIndex;
    const targetCode = String(deleteProductConfirmModal.productCode || "").trim();
    const normStr = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const targetName = normStr(deleteProductConfirmModal.productName || "");

    let invoicesChanged = false;
    const nextInvoices = invoices.map((inv: any) => {
      const invKey = inv.chNFe || inv.nfeKey || inv.id;
      if (invKey === targetInvKey || inv.id === targetInvKey || (targetInvKey && invKey && String(invKey).includes(targetInvKey))) {
        let invChanged = false;
        const updatedProducts = (inv.products || []).map((p: any, idx: number) => {
          const pCode = String(p.code !== undefined && p.code !== null && p.code !== "" ? p.code : (p.cProd !== undefined && p.cProd !== null ? p.cProd : "")).trim();
          const pName = normStr(p.name || p.xProd || "");

          const matchesIndex = targetIndex !== undefined && idx === targetIndex;
          const matchesIdentity = (targetCode && pCode && targetCode === pCode) || (targetName && pName && targetName === pName);

          if (matchesIndex || matchesIdentity) {
            invChanged = true;
            invoicesChanged = true;
            return { ...p, deleted: true };
          }
          return p;
        });

        if (invChanged) {
          return { ...inv, products: updatedProducts };
        }
      }
      return inv;
    });

    if (invoicesChanged) {
      setInvoices(nextInvoices);
      localStorage.setItem("cached_dashboard_invoices", JSON.stringify(nextInvoices));
    }

    if (!isTestMode) {
      try {
        await fetch("/api/xml/products/delete-item", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            invKey: targetInvKey,
            productIndex: targetIndex,
            code: targetCode,
            name: deleteProductConfirmModal.productName
          })
        }).catch(console.error);
      } catch (err) {
        console.error("Erro ao enviar exclusão do item para o servidor:", err);
      }
    }

    addSystemLog('delete', `Produto "${deleteProductConfirmModal.productName}" removido da Nota Fiscal ${deleteProductConfirmModal.invNumber || ''} (${deleteProductConfirmModal.supplierName || ''}).`);
    setDeleteProductConfirmModal({ open: false });
  };

  const fetchPendingListProducts = async (force = false) => {
    setIsPendingLoading(true);
    try {
      const url = force ? '/api/xml/pending-list-products?fresh=true' : '/api/xml/pending-list-products';
      const res = await fetch(url, force ? { headers: { 'Cache-Control': 'no-cache' } } : undefined);
      if (res.ok) {
        const data = await res.json();
        setPendingListProducts(data || []);
      }
    } catch (err) {
      console.error("Erro ao buscar produtos pendentes das listas:", err);
    } finally {
      setIsPendingLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingListProducts();
  }, []);

  const handlePendingPriceChange = async (id: string, newPrice: number) => {
    const updated = pendingListProducts.map(p => p.id === id ? { ...p, price: newPrice } : p);
    setPendingListProducts(updated);
    const target = updated.find(p => p.id === id);
    if (target) {
      await fetch('/api/xml/pending-list-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: target })
      }).catch(console.error);
    }
  };

  const handlePendingQuantityChange = async (id: string, newQuantity: number) => {
    const qty = Math.max(1, newQuantity || 1);
    const updated = pendingListProducts.map(p => p.id === id ? { ...p, quantity: qty } : p);
    setPendingListProducts(updated);
    const target = updated.find(p => p.id === id);
    if (target) {
      await fetch('/api/xml/pending-list-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: target })
      }).catch(console.error);
    }
  };

  const handlePendingCategoryChange = async (id: string, newCategory: string) => {
    const updated = pendingListProducts.map(p => p.id === id ? { ...p, category: newCategory } : p);
    setPendingListProducts(updated);
    const target = updated.find(p => p.id === id);
    if (target) {
      await fetch('/api/xml/pending-list-products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ item: target })
      }).catch(console.error);
    }
  };

  const handleToggleSelectAllPending = () => {
    if (selectedPendingIds.length === pendingListProducts.length) {
      setSelectedPendingIds([]);
    } else {
      setSelectedPendingIds(pendingListProducts.map(p => p.id));
    }
  };

  const handleToggleSelectPending = (id: string) => {
    setSelectedPendingIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleApplyBulkPendingCategory = async () => {
    if (!bulkPendingCategory || selectedPendingIds.length === 0) return;
    const updatedItems: any[] = [];
    const nextList = pendingListProducts.map(p => {
      if (selectedPendingIds.includes(p.id)) {
        const item = { ...p, category: bulkPendingCategory };
        updatedItems.push(item);
        return item;
      }
      return p;
    });
    setPendingListProducts(nextList);
    setBulkPendingCategory('');
    await fetch('/api/xml/pending-list-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: updatedItems })
    }).catch(console.error);
  };

  const handleApplyBulkPendingPrice = async () => {
    const priceNum = parseFloat(bulkPendingPrice);
    if (isNaN(priceNum) || priceNum < 0 || selectedPendingIds.length === 0) return;
    const updatedItems: any[] = [];
    const nextList = pendingListProducts.map(p => {
      if (selectedPendingIds.includes(p.id)) {
        const item = { ...p, price: priceNum };
        updatedItems.push(item);
        return item;
      }
      return p;
    });
    setPendingListProducts(nextList);
    setBulkPendingPrice('');
    await fetch('/api/xml/pending-list-products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: updatedItems })
    }).catch(console.error);
  };

  const handlePromptDeletePending = (id: string) => {
    setDeletePendingConfirmModal({
      open: true,
      idsToDelete: [id],
      isBulk: false
    });
  };

  const handlePromptBulkDeletePending = () => {
    if (selectedPendingIds.length === 0) return;
    setDeletePendingConfirmModal({
      open: true,
      idsToDelete: selectedPendingIds,
      isBulk: true
    });
  };

  const executeDeletePending = async () => {
    const ids = deletePendingConfirmModal.idsToDelete;
    if (ids.length === 0) return;

    try {
      const res = await fetch('/api/xml/pending-list-products/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids })
      });
      if (res.ok) {
        setPendingListProducts(prev => prev.filter(p => !ids.includes(p.id)));
        setSelectedPendingIds(prev => prev.filter(id => !ids.includes(id)));
        addSystemLog('delete', `${ids.length} produto(s) pendente(s) removido(s) da lista do dashboard.`);
      }
    } catch (err) {
      console.error("Erro ao deletar produto(s) pendente(s):", err);
    } finally {
      setDeletePendingConfirmModal({ open: false, idsToDelete: [], isBulk: false });
    }
  };

  const handleConfirmPendingProducts = async () => {
    const itemsToConfirm = selectedPendingIds.length > 0
      ? pendingListProducts.filter(p => selectedPendingIds.includes(p.id))
      : pendingListProducts;

    if (itemsToConfirm.length === 0) return;

    try {
      setIsUploading(true);
      const res = await fetch('/api/xml/pending-list-products/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: itemsToConfirm })
      });

      if (res.ok) {
        const data = await res.json();
        const confirmedIds = itemsToConfirm.map(p => p.id);
        setPendingListProducts(prev => prev.filter(p => !confirmedIds.includes(p.id)));
        setSelectedPendingIds(prev => prev.filter(id => !confirmedIds.includes(id)));

        addSystemLog('info', `${data.confirmedCount || itemsToConfirm.length} produto(s) de listas de compras confirmado(s) e adicionado(s) aos gráficos.`);

        // Refresh all charts & invoices instantly
        await fetchPricingData(true);
        await fetchSpendings(true);
        await fetchPendingListProducts(true);
      } else {
        const errData = await res.json().catch(() => ({}));
        alert(`Erro ao confirmar produtos: ${errData.message || errData.error || res.statusText}`);
      }
    } catch (err: any) {
      console.error("Erro ao confirmar produtos das listas:", err);
      alert("Falha na comunicação ao confirmar os produtos.");
    } finally {
      setIsUploading(false);
    }
  };

  const fetchPricingData = async (force = false) => {
    const now = Date.now();

    setIsPriceLoading(true);
    try {
      const urlInvoices = force ? '/api/xml/invoices?fresh=true' : '/api/xml/invoices';
      const urlSuppliers = force ? '/api/xml/suppliers?fresh=true' : '/api/xml/suppliers';
      const fetchOpts = force ? { headers: { 'Cache-Control': 'no-cache' } } : undefined;

      // Fetch invoices from backend cache
      const invoicesRes = await fetch(urlInvoices, fetchOpts);
      let invoicesData: any[] = [];
      if (invoicesRes.ok) {
        invoicesData = await invoicesRes.json();
      }

      // Fetch suppliers from backend cache with client-side fallback
      let suppliersData: any[] = [];
      try {
        const suppliersRes = await fetch(urlSuppliers, fetchOpts);
        if (suppliersRes.ok) {
          suppliersData = await suppliersRes.json();
        } else {
          const errData = await suppliersRes.json().catch(() => ({}));
          throw new Error(`Backend suppliers failed: ${errData.message || errData.error || suppliersRes.statusText}`);
        }
      } catch (backendErr) {
        console.warn("Falling back to client-side Firestore for suppliers:", backendErr);
        const suppSnap = await getDocs(collection(db, 'suppliers'));
        suppSnap.forEach(doc => {
          suppliersData.push({ id: doc.id, ...doc.data() });
        });
      }

      setInvoices(invoicesData);
      setSuppliers(suppliersData);
      localStorage.setItem('cached_dashboard_invoices', JSON.stringify(invoicesData));
      localStorage.setItem('cached_dashboard_suppliers', JSON.stringify(suppliersData));
      localStorage.setItem('dashboard_last_fetch', String(now));
    } catch (err) {
      console.error("Erro ao carregar dados de preços:", err);
    } finally {
      setIsPriceLoading(false);
    }
  };

  useEffect(() => {
    fetchPricingData();
    fetchPriceIncreases();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsChartReady(true);
    }, 150);
    return () => clearTimeout(timer);
  }, []);

  // Fetch xml_spendings with caching
  const fetchSpendings = async (force = false) => {
    const cached = localStorage.getItem('cached_dashboard_xml_spendings');
    const now = Date.now();

    setIsLoading(true);
    try {
      let items: any[] = [];
      try {
        const url = force ? '/api/xml/spendings?fresh=true' : '/api/xml/spendings';
        const fetchOpts = force ? { headers: { 'Cache-Control': 'no-cache' } } : undefined;
        const spendingsRes = await fetch(url, fetchOpts);
        if (spendingsRes.ok) {
          items = await spendingsRes.json();
        } else {
          const errData = await spendingsRes.json().catch(() => ({}));
          throw new Error(`Backend spendings failed: ${errData.message || errData.error || spendingsRes.statusText}`);
        }
      } catch (backendErr) {
        console.warn("Falling back to client-side Firestore for spendings:", backendErr);
        const q = collection(db, 'xml_spendings');
        const snapshot = await getDocs(q);
        snapshot.forEach((doc) => {
          items.push({ id: doc.id, ...doc.data() });
        });
      }

      setXmlSpendings(items);
      localStorage.setItem('cached_dashboard_xml_spendings', JSON.stringify(items));
      localStorage.setItem('xml_spendings_last_fetch', String(now));
    } catch (err: any) {
      console.error("Erro ao carregar dados XML de gastos:", err);
      if (cached) {
        try {
          setXmlSpendings(JSON.parse(cached));
        } catch (e) {
          console.error(e);
        }
      }
      handleFirestoreError(err, OperationType.GET, 'xml_spendings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSpendings();
  }, []);

  const expenseChartRef = useRef<HTMLDivElement>(null);

  // Parse XML Function
  const parseNFeXml = (xmlText: string, fileName: string) => {
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(xmlText, "text/xml");

    const parserError = xmlDoc.getElementsByTagName("parsererror");
    if (parserError.length > 0) {
      throw new Error(`Erro ao parsing do XML de ${fileName}`);
    }

    // Identificação da Nota (nfeKey) para prevenção de duplicidade
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

    // Identificar Data de Emissão (dhEmi)
    const ideEl = xmlDoc.getElementsByTagName("ide")[0];
    const dhEmiRaw = ideEl?.getElementsByTagName("dhEmi")[0]?.textContent || 
                     xmlDoc.getElementsByTagName("dhEmi")[0]?.textContent || 
                     ideEl?.getElementsByTagName("dEmi")[0]?.textContent || 
                     xmlDoc.getElementsByTagName("dEmi")[0]?.textContent || 
                     new Date().toISOString();

    let dhEmi = dhEmiRaw;
    if (dhEmiRaw.includes("T")) {
      dhEmi = dhEmiRaw.split("T")[0];
    }

    // Identificar Valor Total da Nota, preferindo vNF (Valor da Nota) para o Gasto Mensal Real
    const vTotTribText = xmlDoc.getElementsByTagName("vNF")[0]?.textContent || 
                         xmlDoc.getElementsByTagName("vTotTrib")[0]?.textContent || 
                         "0";
    const vTotTrib = parseFloat(vTotTribText.replace(",", ".")) || 0;

    const emitEl = xmlDoc.getElementsByTagName("emit")[0];
    const supplierName = emitEl?.getElementsByTagName("xNome")[0]?.textContent || 
                         xmlDoc.getElementsByTagName("xNome")[0]?.textContent || 
                         "FORNECEDOR XML";


    const products: any[] = [];
    const detEls = xmlDoc.getElementsByTagName("det");
    for (let i = 0; i < detEls.length; i++) {
      const prodEl = detEls[i].getElementsByTagName("prod")[0];
      if (prodEl) {
        const code = prodEl.getElementsByTagName("cProd")[0]?.textContent || "N/A";
        const name = prodEl.getElementsByTagName("xProd")[0]?.textContent || "N/A";
        
        const vUnComStr = prodEl.getElementsByTagName("vUnCom")[0]?.textContent || prodEl.getElementsByTagName("vUnTrib")[0]?.textContent || "0";
        const vUnCom = parseFloat(vUnComStr.replace(',', '.')) || 0;
        
        const qTribStr = prodEl.getElementsByTagName("qTrib")[0]?.textContent || prodEl.getElementsByTagName("qCom")[0]?.textContent || "1";
        const qTrib = parseFloat(qTribStr.replace(',', '.')) || 1;
        
        products.push({
          code,
          name,
          vUnCom,
          quantity: qTrib,
          categoryId: productMemory[code] || '',
          deleted: false
        });
      }
    }

    return { nfeKey, dhEmi, vTotTrib, supplierName, products };

  };

  const processXmlFiles = async (files: File[]) => {
    setIsUploading(true);
    const previews: any[] = [];
    const logs: { type: 'success' | 'warning' | 'error', text: string }[] = [];

    // Detecção de duplicados localmente antes da pré-visualização consolidada
    const tempKeys = new Set<string>();

    for (const file of files) {
      try {
        if (!file.name.toLowerCase().endsWith('.xml')) {
          logs.push({ type: 'error', text: `Arquivo "${file.name}" inválido. Não é um arquivo XML.` });
          continue;
        }

        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = () => reject(new Error("Falha ao ler arquivo"));
          reader.readAsText(file);
        });

        const parsed = parseNFeXml(text, file.name);

        // Prevenção de duplicidade na própria seleção local
        if (tempKeys.has(parsed.nfeKey)) {
          logs.push({ type: 'warning', text: `Arquivo duplicado ignorado na seleção: ${file.name}` });
          continue;
        }
        tempKeys.add(parsed.nfeKey);

        const alreadyExists = xmlSpendings.some(item => item.id === parsed.nfeKey);

        previews.push({
          ...parsed,
          xmlText: text,
          fileName: file.name,
          alreadyExists
        });

      } catch (err: any) {
        logs.push({ type: 'error', text: `Erro em ${file.name}: ${err.message}` });
      }
    }

    if (logs.length > 0) {
      setXmlLogs(prev => [...logs, ...prev]);
    }

    if (previews.length > 0) {
      setBatchPreview(previews);
      setIsPreviewModalOpen(true);
    }
    setIsUploading(false);
  };


  const handleProductCategoryChange = (invoiceIdx: number, productIdx: number, categoryId: string) => {
    setBatchPreview(prev => {
      const next = [...prev];
      next[invoiceIdx].products[productIdx].categoryId = categoryId;
      return next;
    });
    
    // Update memory
    const prodCode = batchPreview[invoiceIdx].products[productIdx].code;
    setProductMemory(prev => {
      const nm = { ...prev, [prodCode]: categoryId };
      localStorage.setItem('dashboard_product_memory', JSON.stringify(nm));
      return nm;
    });
  };

  const handleToggleProductDeletion = (invoiceIdx: number, productIdx: number) => {
    setBatchPreview(prev => {
      const next = [...prev];
      next[invoiceIdx].products[productIdx].deleted = !next[invoiceIdx].products[productIdx].deleted;
      return next;
    });
  };

  const handleBulkCategorize = () => {
    if (!bulkCategory) return;
    setBatchPreview(prev => {
      const next = [...prev];
      selectedProducts.forEach(id => {
        const [iIdx, pIdx] = id.split('-').map(Number);
        next[iIdx].products[pIdx].categoryId = bulkCategory;
        
        const prodCode = next[iIdx].products[pIdx].code;
        setProductMemory(pm => {
          const nm = { ...pm, [prodCode]: bulkCategory };
          localStorage.setItem('dashboard_product_memory', JSON.stringify(nm));
          return nm;
        });
      });
      return next;
    });
    setSelectedProducts([]);
    setBulkCategory('');
  };

  const handleBulkDelete = () => {
    setBatchPreview(prev => {
      const next = [...prev];
      selectedProducts.forEach(id => {
        const [iIdx, pIdx] = id.split('-').map(Number);
        next[iIdx].products[pIdx].deleted = true;
      });
      return next;
    });
    setSelectedProducts([]);
  };

  const toggleProductSelection = (id: string) => {
    setSelectedProducts(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const toggleAllProducts = () => {
    const allIds: string[] = [];
    batchPreview.forEach((inv, iIdx) => inv.products.forEach((_, pIdx) => allIds.push(`${iIdx}-${pIdx}`)));
    if (selectedProducts.length === allIds.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(allIds);
    }
  };

  
  const handleConfirmBatchImport = async () => {
    if (batchPreview.length === 0) return;
    setIsUploading(true);
    const logs: { type: 'success' | 'warning' | 'error', text: string }[] = [];
    let earliestDate: Date | null = null;
    let latestDate: Date | null = null;

    try {
      const payloads = batchPreview.map(p => {
        const overrides: Record<string, { categoryId?: string, deleted?: boolean }> = {};
        p.products.forEach((prod: any) => {
          overrides[prod.code] = { categoryId: prod.categoryId, deleted: prod.deleted };
        });
        return { xmlText: p.xmlText, overrides };
      });
      const res = await fetch('/api/xml/process-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payloads })
      });


      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || errData.error || "Erro no processamento do lote pelo servidor.");
      }

      const { results } = await res.json();

      results.forEach((r: any) => {
        if (r.status === 'error') {
          logs.push({ type: 'error', text: `Erro ao importar arquivo: ${r.error}` });
        } else {
          logs.push({
            type: r.status === 'updated' ? 'warning' : 'success',
            text: `Sucesso: Nota de "${r.supplierName}" (R$ ${r.vTotTrib.toFixed(2)}) ${r.status === 'updated' ? 'atualizada' : 'importada'}.`
          });

        }
      });

      setXmlLogs(prev => [...logs, ...prev]);
      setIsPreviewModalOpen(false);
      setBatchPreview([]);

      // Força a atualização simultânea e imediata de todos os dashboards, incluindo o GASTO MENSAL
      await fetchPricingData(true);
      await fetchSpendings(true);
      await fetchPriceIncreases();

    } catch (err: any) {
      console.error("Erro na importação em lote:", err);
      logs.push({ type: 'error', text: `Falha na importação em lote: ${err.message || err}` });
      setXmlLogs(prev => [...logs, ...prev]);
    } finally {
      setIsUploading(false);
    }
  };

  const handleDeleteXmlSpending = async (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este registro de gasto?")) return;
    try {
      if (!isTestMode) {
        await deleteDoc(doc(db, 'xml_spendings', id));
        try {
          await fetch(`/api/xml/invoices/${id}`, {
            method: 'DELETE'
          });
        } catch (apiErr) {
          console.error("Erro ao deletar fatura do banco de preços central:", apiErr);
        }
      }
      setXmlSpendings(prev => prev.filter(item => item.id !== id));
      setInvoices(prev => prev.filter(item => item.id !== id));
      await fetchPricingData(true);
      await fetchSpendings(true);
    } catch (err) {
      console.error("Erro ao deletar gasto XML:", err);
      handleFirestoreError(err, OperationType.DELETE, `xml_spendings/${id}`);
    }
  };

  // Filtered expense data within selected dates
  
  const expenseData = useMemo(() => {
    const dayMap = new Map<string, number>();
    
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    
    // Initialize interval days list
    let current = new Date(start);
    while (current <= end) {
      dayMap.set(format(current, 'dd/MM'), 0);
      current.setDate(current.getDate() + 1);
    }

    // We will use invoices to calculate category breakdown, and fallback to xmlSpendings
    const processedInvoiceIds = new Set<string>();

    invoices.forEach(inv => {
      const dateStr = inv.date || inv.dhEmi || inv.createdAt;
      if (!dateStr) return;
      const spendingDate = parseDateSafe(dateStr);
      if (spendingDate && isWithinInterval(spendingDate, { start, end })) {
        if (inv.id) processedInvoiceIds.add(inv.id);
        const dateKey = format(spendingDate, 'dd/MM');
        
        let validSpend = 0;
        const invTotal = typeof inv.vTotTrib === 'number' && inv.vTotTrib > 0 ? inv.vTotTrib : (inv.vNF || inv.total || 0);
        
        if (selectedChartCategory) {
          // Calculate sum of products in that category with discount factor
          const allProds = (inv.products || []).filter((p: any) => !p.deleted);
          const prodGrossTotal = allProds.reduce((acc: number, p: any) => acc + ((p.vUnComGross || p.vUnCom || p.price || 0) * (p.quantity || 1)), 0);
          const discountRatio = (prodGrossTotal > 0 && invTotal > 0 && invTotal < prodGrossTotal)
            ? (invTotal / prodGrossTotal)
            : 1;

          const normalizeCatStr = (str: string) =>
            String(str || '')
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim();

          const selCatNorm = normalizeCatStr(selectedChartCategory);
          const selCatObj = normalizedCategories.find(c =>
            c.id === selectedChartCategory ||
            c.name === selectedChartCategory ||
            normalizeCatStr(c.id) === selCatNorm ||
            normalizeCatStr(c.name) === selCatNorm
          );
          const selCatNameNorm = selCatObj ? normalizeCatStr(selCatObj.name) : selCatNorm;
          const selCatIdNorm = selCatObj ? normalizeCatStr(selCatObj.id) : selCatNorm;

          const catProds = allProds.filter((p: any) => {
            const pCatVal = p.categoryId || p.category;
            if (!pCatVal) return false;
            const pCatNorm = normalizeCatStr(pCatVal);
            const foundCat = normalizedCategories.find(c =>
              c.id === pCatVal ||
              c.name === pCatVal ||
              normalizeCatStr(c.id) === pCatNorm ||
              normalizeCatStr(c.name) === pCatNorm
            );
            const foundNameNorm = foundCat ? normalizeCatStr(foundCat.name) : '';
            const foundIdNorm = foundCat ? normalizeCatStr(foundCat.id) : '';

            return pCatNorm === selCatNorm ||
                   pCatNorm === selCatNameNorm ||
                   pCatNorm === selCatIdNorm ||
                   (foundNameNorm && (foundNameNorm === selCatNameNorm || foundNameNorm === selCatNorm)) ||
                   (foundIdNorm && (foundIdNorm === selCatIdNorm || foundIdNorm === selCatNorm));
          });
          validSpend = catProds.reduce((acc: number, p: any) => {
            if (p.totalNet !== undefined) return acc + p.totalNet;
            if (p.discount !== undefined) return acc + Math.max(0, ((p.vUnComGross || p.vUnCom || 0) * (p.quantity || 1)) - p.discount);
            const baseVal = (p.vUnCom || p.price || 0) * (p.quantity || 1);
            return acc + (baseVal * discountRatio);
          }, 0);
        } else {
          // If no category selected, use the invoice total
          validSpend = invTotal > 0
            ? invTotal
            : (inv.products || []).reduce((acc: number, p: any) => acc + (p.totalNet || (p.vUnCom || p.price || 0) * (p.quantity || 1)), 0);
        }

        const currentVal = dayMap.get(dateKey) || 0;
        dayMap.set(dateKey, currentVal + validSpend);
      }
    });

    // Fallback: If no category filter is active, also sum items in xmlSpendings that were not found in invoices
    if (!selectedChartCategory) {
      xmlSpendings.forEach(spending => {
        if (spending.id && processedInvoiceIds.has(spending.id)) return;
        const dateStr = spending.dhEmi || spending.date || spending.createdAt;
        if (!dateStr) return;
        const spendingDate = parseDateSafe(dateStr);
        if (spendingDate && isWithinInterval(spendingDate, { start, end })) {
          const dateKey = format(spendingDate, 'dd/MM');
          const val = Number(spending.vTotTrib || spending.vNF || spending.total || 0);
          const currentVal = dayMap.get(dateKey) || 0;
          dayMap.set(dateKey, currentVal + val);
        }
      });
    }

    return Array.from(dayMap.entries()).map(([name, valor]) => ({ name, valor }));
  }, [invoices, xmlSpendings, startDate, endDate, selectedChartCategory, normalizedCategories]);

  const categoryPieData = useMemo(() => {
    const catMap = new Map<string, number>();
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');

    invoices.forEach(inv => {
      const dateStr = inv.date || inv.dhEmi || inv.createdAt;
      if (!dateStr) return;
      const spendingDate = parseDateSafe(dateStr);
      if (spendingDate && isWithinInterval(spendingDate, { start, end })) {
        const prods = (inv.products || []).filter((p: any) => !p.deleted);
        
        // Calculate gross sum of products in invoice to check for unallocated invoice-level discount
        const prodGrossTotal = prods.reduce((acc: number, p: any) => acc + ((p.vUnComGross || p.vUnCom || p.price || 0) * (p.quantity || 1)), 0);
        const invTotal = typeof inv.vTotTrib === 'number' && inv.vTotTrib > 0 ? inv.vTotTrib : (inv.vNF || inv.total || 0);
        const discountRatio = (prodGrossTotal > 0 && invTotal > 0 && invTotal < prodGrossTotal)
          ? (invTotal / prodGrossTotal)
          : 1;

        prods.forEach((p: any) => {
          const normalizeCatStr = (str: string) =>
            String(str || '')
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim();

          const rawCatVal = p.categoryId || p.category || '';
          const pCatNorm = rawCatVal ? normalizeCatStr(rawCatVal) : '';
          const foundCat = normalizedCategories.find(c =>
            c.id === rawCatVal ||
            c.name === rawCatVal ||
            (pCatNorm && normalizeCatStr(c.id) === pCatNorm) ||
            (pCatNorm && normalizeCatStr(c.name) === pCatNorm)
          );
          const catName = foundCat ? foundCat.name : (rawCatVal || 'Sem Categoria');
          
          let val = 0;
          if (p.totalNet !== undefined) {
            val = p.totalNet;
          } else if (p.discount !== undefined) {
            val = Math.max(0, ((p.vUnComGross || p.vUnCom || 0) * (p.quantity || 1)) - p.discount);
          } else {
            const baseVal = (p.vUnCom || p.price || 0) * (p.quantity || 1);
            val = baseVal * discountRatio;
          }

          catMap.set(catName, (catMap.get(catName) || 0) + val);
        });
      }
    });

    const result = Array.from(catMap.entries()).map(([name, value]) => ({ name, value }));
    return result.filter(r => r.value > 0).sort((a, b) => b.value - a.value);
  }, [invoices, startDate, endDate, normalizedCategories]);


  const rangeProducts = useMemo(() => {
    const start = new Date(startDate + "T00:00:00");
    const end = new Date(endDate + "T23:59:59");

    const items: any[] = [];

    invoices.forEach((inv: any, invIdx: number) => {
      const dateStr = inv.date || inv.dhEmi || inv.createdAt;
      if (!dateStr) return;
      const spendingDate = parseDateSafe(dateStr);
      if (spendingDate && isWithinInterval(spendingDate, { start, end })) {
        const suppName = inv.supplierName || inv.emitName || inv.fornecedor || "Fornecedor";
        const invNumber = inv.nNF || inv.invoiceNumber || inv.number || inv.chNFe?.substring(25, 34) || (inv.id ? String(inv.id).slice(-8) : `NF-${invIdx + 1}`);
        const invKey = inv.chNFe || inv.nfeKey || inv.id || `inv_${invIdx}`;
        const formattedDate = format(spendingDate, 'dd/MM/yyyy');

        (inv.products || []).filter((p: any) => !p.deleted).forEach((p: any, pIdx: number) => {
          const name = String(p.name || p.xProd || "Produto sem nome");
          const code = String(p.code ?? p.cProd ?? "");
          const rawCat = p.categoryId || p.category || "";
          
          const normalizeCatStr = (str: string) =>
            String(str || "")
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .trim();
              
          const pCatNorm = rawCat ? normalizeCatStr(rawCat) : "";
          const foundCat = normalizedCategories.find(c =>
            c.id === rawCat ||
            c.name === rawCat ||
            (pCatNorm && normalizeCatStr(c.id) === pCatNorm) ||
            (pCatNorm && normalizeCatStr(c.name) === pCatNorm)
          );
          const cat = foundCat ? foundCat.name : (rawCat || "Sem Categoria");

          let baseVal = 0;
          if (p.totalNet !== undefined) {
            baseVal = p.totalNet;
          } else if (p.discount !== undefined) {
            baseVal = Math.max(0, ((p.vUnComGross || p.vUnCom || 0) * (p.quantity || 1)) - p.discount);
          } else {
            baseVal = (p.vUnCom || p.price || 0) * (p.quantity || 1);
          }

          const qty = p.quantity || p.qCom || 1;
          const unitPrice = p.vUnCom || p.price || (qty ? baseVal / qty : baseVal);

          items.push({
            key: `${invKey}_p_${pIdx}_${code || name}`,
            invId: inv.id || invKey,
            invKey,
            invNumber,
            dateStr: formattedDate,
            rawDate: spendingDate,
            code,
            name,
            category: cat,
            supplierName: suppName,
            quantity: qty,
            unitPrice,
            totalNet: baseVal,
            productIndexInInvoice: pIdx,
            invoiceObj: inv
          });
        });
      }
    });

    return items.sort((a, b) => b.rawDate.getTime() - a.rawDate.getTime() || b.totalNet - a.totalNet);
  }, [invoices, startDate, endDate, normalizedCategories]);

  const uncategorizedCount = useMemo(() => {
    return rangeProducts.filter(p => !p.category || p.category === "Sem Categoria").length;
  }, [rangeProducts]);

  const filteredPieProducts = useMemo(() => {
    return rangeProducts.filter(p => {
      const q = pieSearchQuery.toLowerCase().trim();
      const pName = String(p.name || "").toLowerCase();
      const pCode = String(p.code || "").toLowerCase();
      const pCat = String(p.category || "").toLowerCase();
      const pSupp = String(p.supplierName || "").toLowerCase();
      const pInv = String(p.invNumber || "").toLowerCase();
      const pDate = String(p.dateStr || "").toLowerCase();

      const matchQuery = !q || 
        pName.includes(q) || 
        pCode.includes(q) || 
        pCat.includes(q) || 
        pSupp.includes(q) ||
        pInv.includes(q) ||
        pDate.includes(q);

      if (!matchQuery) return false;

      if (pieCategoryFilter === "ALL") return true;
      if (pieCategoryFilter === "SEM_CATEGORIA") {
        return !p.category || p.category === "Sem Categoria";
      }
      return pCat === pieCategoryFilter.toLowerCase();
    });
  }, [rangeProducts, pieSearchQuery, pieCategoryFilter]);

  const handleUpdateProductCategory = async (code: string, name: string, newCategory: string) => {
    if (!newCategory) return;
    const normStr = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const targetCode = String(code || "").trim();
    const targetName = normStr(name);

    let updatedProductsCount = 0;
    let updatedInvoicesCount = 0;

    // 1. Update Invoices state
    let invoicesChanged = false;
    const nextInvoices = invoices.map(inv => {
      let invChanged = false;
      const updatedProducts = (inv.products || []).map((p: any) => {
        const pCode = String(p.code !== undefined && p.code !== null && p.code !== "" ? p.code : (p.cProd !== undefined && p.cProd !== null ? p.cProd : "")).trim();
        const pName = normStr(p.name || p.xProd || "");

        const codeMatches = targetCode && pCode && targetCode === pCode;
        const nameMatches = targetName && pName && (targetName === pName || targetName.includes(pName) || pName.includes(targetName));

        if (codeMatches || nameMatches) {
          invChanged = true;
          invoicesChanged = true;
          updatedProductsCount++;
          return {
            ...p,
            categoryId: newCategory,
            category: newCategory
          };
        }
        return p;
      });

      if (invChanged) {
        updatedInvoicesCount++;
        return { ...inv, products: updatedProducts };
      }
      return inv;
    });

    if (invoicesChanged) {
      setInvoices(nextInvoices);
      localStorage.setItem("cached_dashboard_invoices", JSON.stringify(nextInvoices));
    }

    // 2. Update Suppliers state
    let suppliersChanged = false;
    const nextSuppliers = suppliers.map(s => {
      let suppChanged = false;
      const updatedProducts = (s.products || []).map((p: any) => {
        const pCode = String(p.code !== undefined && p.code !== null && p.code !== "" ? p.code : (p.cProd !== undefined && p.cProd !== null ? p.cProd : "")).trim();
        const pName = normStr(p.name || "");

        const codeMatches = targetCode && pCode && targetCode === pCode;
        const nameMatches = targetName && pName && (targetName === pName || targetName.includes(pName) || pName.includes(targetName));

        if (codeMatches || nameMatches) {
          suppChanged = true;
          suppliersChanged = true;
          return {
            ...p,
            category: newCategory
          };
        }
        return p;
      });

      if (suppChanged) {
        return { ...s, products: updatedProducts };
      }
      return s;
    });

    if (suppliersChanged) {
      setSuppliers(nextSuppliers);
      localStorage.setItem("cached_dashboard_suppliers", JSON.stringify(nextSuppliers));
    }

    // 3. Register Category if new
    const catExists = normalizedCategories.some(c => normStr(c.name) === normStr(newCategory));
    if (!catExists) {
      const catId = newCategory.toLowerCase().replace(/\s+/g, "_");
      setCategories(prev => [...prev, { id: catId, name: newCategory }]);
    }

    if (targetCode) {
      setProductMemory(prev => {
        const next = { ...prev, [targetCode]: newCategory };
        localStorage.setItem('dashboard_product_memory', JSON.stringify(next));
        return next;
      });
    }

    // Log do Sistema
    const logDetails = `Categoria do produto "${name}" ${targetCode ? `(Cód: ${targetCode})` : ''} alterada para "${newCategory}". ${updatedProductsCount} item(ns) em ${updatedInvoicesCount} nota(s) fiscal(is) atualizados.`;
    addSystemLog('category', logDetails);

    // 4. Send to backend if normal mode
    if (!isTestMode) {
      try {
        await fetch("/api/xml/products/update-category", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: targetCode, name, category: newCategory })
        });
      } catch (err) {
        console.error("Erro ao salvar categoria no servidor:", err);
      }
    }
  };

  const handleDeleteProduct = async (code: string, name: string) => {
    if (!window.confirm(`Tem certeza que deseja excluir o produto "${name}"? Esta ação removerá o produto do período e das análises.`)) {
      return;
    }

    const normStr = (s: string) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const targetCode = String(code || "").trim();
    const targetName = normStr(name);

    let deletedProductsCount = 0;
    let deletedInvoicesCount = 0;

    // 1. Mark as deleted in Invoices state
    let invoicesChanged = false;
    const nextInvoices = invoices.map(inv => {
      let invChanged = false;
      const updatedProducts = (inv.products || []).map((p: any) => {
        const pCode = String(p.code !== undefined && p.code !== null && p.code !== "" ? p.code : (p.cProd !== undefined && p.cProd !== null ? p.cProd : "")).trim();
        const pName = normStr(p.name || p.xProd || "");

        const codeMatches = targetCode && pCode && targetCode === pCode;
        const nameMatches = targetName && pName && (targetName === pName || targetName.includes(pName) || pName.includes(targetName));

        if (codeMatches || nameMatches) {
          invChanged = true;
          invoicesChanged = true;
          deletedProductsCount++;
          return {
            ...p,
            deleted: true
          };
        }
        return p;
      });

      if (invChanged) {
        deletedInvoicesCount++;
        return { ...inv, products: updatedProducts };
      }
      return inv;
    });

    if (invoicesChanged) {
      setInvoices(nextInvoices);
      localStorage.setItem("cached_dashboard_invoices", JSON.stringify(nextInvoices));
    }

    // 2. Remove from Suppliers state
    let suppliersChanged = false;
    const nextSuppliers = suppliers.map(s => {
      let suppChanged = false;
      const updatedProducts = (s.products || []).filter((p: any) => {
        const pCode = String(p.code !== undefined && p.code !== null && p.code !== "" ? p.code : (p.cProd !== undefined && p.cProd !== null ? p.cProd : "")).trim();
        const pName = normStr(p.name || "");

        const codeMatches = targetCode && pCode && targetCode === pCode;
        const nameMatches = targetName && pName && (targetName === pName || targetName.includes(pName) || pName.includes(targetName));

        if (codeMatches || nameMatches) {
          suppChanged = true;
          suppliersChanged = true;
          return false;
        }
        return true;
      });

      if (suppChanged) {
        return { ...s, products: updatedProducts };
      }
      return s;
    });

    if (suppliersChanged) {
      setSuppliers(nextSuppliers);
      localStorage.setItem("cached_dashboard_suppliers", JSON.stringify(nextSuppliers));
    }

    // Log do Sistema
    const logDetails = `Produto "${name}" ${targetCode ? `(Cód: ${targetCode})` : ''} foi excluído do sistema. ${deletedProductsCount} item(ns) em ${deletedInvoicesCount} nota(s) marcado(s) como excluído(s).`;
    addSystemLog('delete', logDetails);

    // 3. Send to backend if normal mode
    if (!isTestMode) {
      try {
        await fetch("/api/xml/products/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: targetCode, name })
        });
      } catch (err) {
        console.error("Erro ao deletar produto no servidor:", err);
      }
    }
  };

  // Totals calculations
  const selectedCategoryObj = useMemo(() => {
    if (!selectedChartCategory) return null;
    const normalizeCatStr = (str: string) =>
      String(str || '')
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim();
    const selNorm = normalizeCatStr(selectedChartCategory);
    return normalizedCategories.find(c =>
      c.id === selectedChartCategory ||
      c.name === selectedChartCategory ||
      normalizeCatStr(c.id) === selNorm ||
      normalizeCatStr(c.name) === selNorm
    );
  }, [selectedChartCategory, normalizedCategories]);

  const selectedCategoryName = selectedCategoryObj ? selectedCategoryObj.name : selectedChartCategory;

  const totalExpense = useMemo(() => {
    return expenseData.reduce((acc, item) => acc + item.valor, 0);
  }, [expenseData]);

  const activeInvoicesCount = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    
    return xmlSpendings.filter(spending => {
      const dateStr = spending.dhEmi || spending.date || spending.createdAt;
      if (!dateStr) return false;
      const spendingDate = parseDateSafe(dateStr);
      return spendingDate ? isWithinInterval(spendingDate, { start, end }) : false;
    }).length;
  }, [xmlSpendings, startDate, endDate]);

  const averageInvoiceValue = useMemo(() => {
    return activeInvoicesCount > 0 ? totalExpense / activeInvoicesCount : 0;
  }, [totalExpense, activeInvoicesCount]);

  // List of invoices inside range
  const invoicesInRange = useMemo(() => {
    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T23:59:59');
    
    return xmlSpendings.filter(spending => {
      const dateStr = spending.dhEmi || spending.date || spending.createdAt;
      if (!dateStr) return false;
      const spendingDate = parseDateSafe(dateStr);
      return spendingDate ? isWithinInterval(spendingDate, { start, end }) : false;
    }).sort((a, b) => {
      const da = parseDateSafe(a.dhEmi || a.date)?.getTime() || 0;
      const db = parseDateSafe(b.dhEmi || b.date)?.getTime() || 0;
      return db - da;
    });
  }, [xmlSpendings, startDate, endDate]);

  // Generate PDF Report
  const generateReport = async () => {
    if (!expenseChartRef.current) return;

    try {
      const canvas = await domToCanvas(expenseChartRef.current, {
        scale: 2,
        backgroundColor: '#ffffff'
      });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      
      pdf.setFontSize(20);
      pdf.setTextColor(30, 41, 59);
      pdf.text('Relatório de Gastos Mensais - XML', 20, 20);
      
      pdf.setFontSize(10);
      pdf.setTextColor(100, 116, 139);
      pdf.text(`Período: ${format(parseISO(startDate), 'dd/MM/yyyy')} até ${format(parseISO(endDate), 'dd/MM/yyyy')}`, 20, 28);
      pdf.text(`Gerado em: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 20, 33);
      
      const imgWidth = pageWidth - 40;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;
      pdf.addImage(imgData, 'PNG', 20, 45, imgWidth, imgHeight);
      
      const tableData = invoicesInRange.map(inv => [
        inv.supplierName,
        format(parseISO(inv.dhEmi), 'dd/MM/yyyy'),
        inv.id,
        formatCurrency(inv.vTotTrib)
      ]);
      
      const tableHeaders = ['Fornecedor', 'Emissão', 'Chave de Acesso', 'Valor Total'];

      autoTable(pdf, {
        startY: imgHeight + 60,
        head: [tableHeaders],
        body: tableData,
        theme: 'striped',
        headStyles: { fillColor: [79, 70, 229] },
        margin: { left: 20, right: 20 }
      });
      
      const finalY = (pdf as any).lastAutoTable.finalY + 15;
      pdf.setFontSize(14);
      pdf.setTextColor(30, 41, 59);
      pdf.text(`Gasto Total no Período (XML): ${formatCurrency(totalExpense)}`, 20, finalY);

      pdf.save(`relatorio-gastos-xml-${format(new Date(), 'yyyy-MM-dd')}.pdf`);
    } catch (error) {
      console.error('Erro ao gerar relatório jspdf:', error);
    }
  };

  const availableYears = useMemo(() => {
    const years = new Set<string>();
    invoices.forEach(inv => {
      const dateStr = inv.dhEmi || inv.date;
      if (dateStr && dateStr.length >= 4) {
        years.add(dateStr.substring(0, 4));
      }
    });
    return Array.from(years).sort((a, b) => b.localeCompare(a));
  }, [invoices]);

  // Pricing Engine - Processes all invoices & suppliers to build price history and increases
  const priceAnalysis = useMemo(() => {
    let filteredInvoices = invoices;
    if (priceSearchYear !== 'all') {
      filteredInvoices = invoices.filter(inv => {
        const dateStr = inv.dhEmi || inv.date;
        if (!dateStr) return false;
        return dateStr.startsWith(priceSearchYear);
      });
    }
    return analyzePrices(filteredInvoices, suppliers);
  }, [invoices, suppliers, priceSearchYear]);

  const parsedSearchSuggestions = useMemo(() => {
    if (!priceSearchQuery.trim()) return [];
    const lower = priceSearchQuery.toLowerCase();
    return priceAnalysis.allProducts
      .filter(p => String(p.name || "").toLowerCase().includes(lower))
      .slice(0, 5);
  }, [priceSearchQuery, priceAnalysis]);

  return (
    <div className="w-full max-w-[1800px] mx-auto space-y-8 pb-24">
      <BatchImportPreviewModal
        isOpen={isPreviewModalOpen}
        batchPreview={batchPreview}
        onClose={() => {
          setIsPreviewModalOpen(false);
          setBatchPreview([]);
        }}
        onProductCategoryChange={handleProductCategoryChange}
        onToggleProductDeletion={handleToggleProductDeletion}
        onBulkCategorize={handleBulkCategorize}
        onBulkDelete={handleBulkDelete}
        onConfirm={handleConfirmBatchImport}
        categories={normalizedCategories}
        bulkCategory={bulkCategory}
        setBulkCategory={setBulkCategory}
        selectedProducts={selectedProducts}
        setSelectedProducts={setSelectedProducts}
        toggleProductSelection={toggleProductSelection}
        toggleAllProducts={toggleAllProducts}
        isUploading={isUploading}
      />

      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 bg-white p-6 rounded-3xl border border-slate-100 shadow-sm animate-in fade-in slide-in-from-top-4 duration-500">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase flex items-center gap-3">
            <TrendingUp className="w-8 h-8 text-indigo-700 animate-pulse" />
            Dashboard XML
          </h1>
          <p className="text-slate-700 text-sm font-bold mt-1">Análise de gastos reais baseado exclusivamente nos XMLs importados.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-2xl border border-slate-100 shadow-inner">
              <div className="flex items-center gap-2 px-3">
                <CalendarIcon className="w-4 h-4 text-indigo-500" />
                <input 
                  type="date" 
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="bg-transparent border-0 text-sm font-black text-slate-900 focus:outline-none uppercase cursor-pointer"
                />
              </div>
              <div className="w-px h-6 bg-slate-200" />
              <div className="flex items-center gap-2 px-3">
                <CalendarIcon className="w-4 h-4 text-indigo-500" />
                <input 
                  type="date" 
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="bg-transparent border-0 text-sm font-black text-slate-900 focus:outline-none uppercase cursor-pointer"
                />
              </div>
            </div>
            <button
              onClick={() => {
                const allItems = [...invoices, ...xmlSpendings];
                if (allItems.length > 0) {
                  let minD: string | null = null;
                  let maxD: string | null = null;
                  allItems.forEach((inv: any) => {
                    const dateVal = inv.date || inv.dhEmi || inv.createdAt;
                    if (!dateVal) return;
                    const d = dateVal.includes('T') ? dateVal.split('T')[0] : dateVal;
                    if (!minD || d < minD) minD = d;
                    if (!maxD || d > maxD) maxD = d;
                  });
                  if (minD && maxD) {
                    setStartDate(minD);
                    setEndDate(maxD);
                  }
                }
              }}
              className="px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-black uppercase rounded-xl transition-colors cursor-pointer border-0 font-bold"
              title="Ajustar filtro para abranger todas as notas importadas"
            >
              Ver Todas as Datas
            </button>
          </div>

          <input
            type="file"
            accept=".xml"
            multiple
            onChange={(e) => e.target.files && processXmlFiles(Array.from(e.target.files))}
            className="hidden"
            id="dashboard-xml-file-picker"
          />
          <label 
            htmlFor="dashboard-xml-file-picker" 
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black uppercase rounded-2xl transition-all shadow-sm cursor-pointer whitespace-nowrap font-bold"
          >
            <Upload className="w-4 h-4" />
            Importar XML
          </label>
        </div>
      </div>

      <DashboardStatsCards
        totalExpense={totalExpense}
        activeInvoicesCount={activeInvoicesCount}
        averageInvoiceValue={averageInvoiceValue}
        isLoading={isLoading}
        selectedCategoryName={selectedCategoryName}
        xmlSpendings={xmlSpendings}
      />

      {/* SEÇÃO: PRODUTOS PENDENTES DAS LISTAS DE COMPRAS */}
      <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-6 animate-in fade-in duration-300">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 rounded-2xl border border-amber-100 text-amber-600">
              <ShoppingCart className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                  Produtos das Listas de Compras
                </h2>
                {pendingListProducts.length > 0 && (
                  <span className="px-2.5 py-0.5 bg-amber-100 text-amber-800 text-xs font-black rounded-full">
                    {pendingListProducts.length} pendente(s)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-bold mt-0.5">
                Produtos checados em "Minhas Listas". Configure a categoria e o valor para confirmar e incluir nos gráficos de gastos.
              </p>
            </div>
          </div>

          {pendingListProducts.length > 0 && (
            <button
              type="button"
              onClick={handleConfirmPendingProducts}
              disabled={isUploading}
              className="px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase rounded-2xl transition-all shadow-md flex items-center gap-2 cursor-pointer disabled:opacity-50 font-bold"
            >
              <CheckCircle2 className="w-4 h-4" />
              {selectedPendingIds.length > 0
                ? `Confirmar ${selectedPendingIds.length} Selecionado(s)`
                : `Confirmar Todos os ${pendingListProducts.length} Produtos`}
            </button>
          )}
        </div>

        {isPendingLoading ? (
          <div className="py-8 text-center text-xs font-bold text-slate-400">
            Carregando produtos das listas...
          </div>
        ) : pendingListProducts.length === 0 ? (
          <div className="py-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-200">
            <CheckCircle2 className="w-8 h-8 text-slate-300 mx-auto mb-2" />
            <p className="text-xs font-black text-slate-500 uppercase">Nenhum produto pendente de confirmação</p>
            <p className="text-[11px] text-slate-400 font-bold mt-1">
              Ao dar check num item em "Minhas Listas", ele aparecerá aqui para você definir a categoria, valor e confirmar a entrada nos gráficos.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Controles em Lote */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedPendingIds.length > 0 && selectedPendingIds.length === pendingListProducts.length}
                    onChange={handleToggleSelectAllPending}
                    className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                  />
                  <span>Selecionar Todos ({selectedPendingIds.length}/{pendingListProducts.length})</span>
                </label>

                <div className="h-4 w-px bg-slate-200 hidden sm:block" />

                {/* Alteração em Lote: Categoria */}
                <div className="flex items-center gap-2">
                  <select
                    value={bulkPendingCategory}
                    onChange={(e) => setBulkPendingCategory(e.target.value)}
                    className="bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500"
                  >
                    <option value="">-- Categoria em Lote --</option>
                    {normalizedCategories.map((c: any) => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleApplyBulkPendingCategory}
                    disabled={!bulkPendingCategory || selectedPendingIds.length === 0}
                    className="px-3 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-40 text-xs font-black uppercase rounded-xl transition-colors cursor-pointer"
                  >
                    Aplicar Categoria
                  </button>
                </div>

                {/* Alteração em Lote: Valor */}
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    step="0.01"
                    placeholder="Valor R$ em lote"
                    value={bulkPendingPrice}
                    onChange={(e) => setBulkPendingPrice(e.target.value)}
                    className="w-32 bg-white border border-slate-200 text-slate-700 text-xs font-bold rounded-xl px-3 py-1.5 outline-none focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleApplyBulkPendingPrice}
                    disabled={!bulkPendingPrice || selectedPendingIds.length === 0}
                    className="px-3 py-1.5 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 disabled:opacity-40 text-xs font-black uppercase rounded-xl transition-colors cursor-pointer"
                  >
                    Aplicar Valor
                  </button>
                </div>
              </div>

              {/* Excluir em Lote */}
              <button
                type="button"
                onClick={handlePromptBulkDeletePending}
                disabled={selectedPendingIds.length === 0}
                className="px-3.5 py-1.5 bg-rose-100 text-rose-700 hover:bg-rose-200 disabled:opacity-40 text-xs font-black uppercase rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer ml-auto"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Excluir Selecionados
              </button>
            </div>

            {/* Tabela de Produtos Pendentes */}
            <div className="overflow-x-auto border border-slate-100 rounded-2xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-100 text-[11px] font-black uppercase text-slate-500 tracking-wider">
                    <th className="p-3.5 w-10 text-center">
                      <input
                        type="checkbox"
                        checked={selectedPendingIds.length > 0 && selectedPendingIds.length === pendingListProducts.length}
                        onChange={handleToggleSelectAllPending}
                        className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                      />
                    </th>
                    <th className="p-3.5">Produto</th>
                    <th className="p-3.5">Fornecedor</th>
                    <th className="p-3.5">Origem</th>
                    <th className="p-3.5 w-24">Qtd</th>
                    <th className="p-3.5 w-36">Valor Unit. (R$)</th>
                    <th className="p-3.5 w-36">Total (R$)</th>
                    <th className="p-3.5 w-48">Categoria</th>
                    <th className="p-3.5 w-16 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs">
                  {pendingListProducts.map((p) => {
                    const isSelected = selectedPendingIds.includes(p.id);
                    const qty = Number(p.quantity || 1);
                    const unitPrice = Number(p.price || 0);
                    const totalPrice = qty * unitPrice;

                    return (
                      <tr key={p.id} className={`hover:bg-slate-50/80 transition-colors ${isSelected ? 'bg-indigo-50/40' : ''}`}>
                        <td className="p-3.5 text-center">
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelectPending(p.id)}
                            className="w-4 h-4 text-indigo-600 rounded border-slate-300"
                          />
                        </td>
                        <td className="p-3.5 font-bold text-slate-900">{p.productName}</td>
                        <td className="p-3.5 text-slate-600 font-medium">{p.supplierName}</td>
                        <td className="p-3.5 text-slate-500 font-medium text-[11px]">{p.listName || 'Minhas Listas'}</td>
                        <td className="p-3.5 font-bold text-slate-800">
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={p.quantity !== undefined ? p.quantity : 1}
                            onChange={(e) => handlePendingQuantityChange(p.id, parseInt(e.target.value, 10) || 1)}
                            className="w-16 bg-white border border-slate-200 text-slate-800 font-bold rounded-lg px-2 py-1 text-xs outline-none focus:border-indigo-500 text-center"
                          />
                        </td>
                        <td className="p-3.5">
                          <input
                            type="number"
                            step="0.01"
                            value={p.price !== undefined ? p.price : ''}
                            onChange={(e) => handlePendingPriceChange(p.id, parseFloat(e.target.value) || 0)}
                            className="w-28 bg-white border border-slate-200 text-slate-800 font-bold rounded-lg px-2.5 py-1 text-xs outline-none focus:border-indigo-500"
                          />
                        </td>
                        <td className="p-3.5 font-black text-indigo-700">
                          {formatCurrency(totalPrice)}
                        </td>
                        <td className="p-3.5">
                          <select
                            value={p.category || ''}
                            onChange={(e) => handlePendingCategoryChange(p.id, e.target.value)}
                            className="w-full bg-white border border-slate-200 text-slate-800 font-bold rounded-lg px-2.5 py-1 text-xs outline-none focus:border-indigo-500"
                          >
                            <option value="">-- Selecionar --</option>
                            {normalizedCategories.map((c: any) => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="p-3.5 text-center">
                          <button
                            type="button"
                            onClick={() => handlePromptDeletePending(p.id)}
                            title="Excluir produto pendente"
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border-0 bg-transparent"
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
      </div>

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO DE PRODUTO PENDENTE (REGRA 11) */}
      {deletePendingConfirmModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white max-w-md w-full p-6 rounded-3xl shadow-xl border border-slate-100 space-y-5 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-rose-600">
              <div className="p-3 bg-rose-50 rounded-2xl">
                <Trash2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-black text-slate-900 uppercase tracking-tight">
                Confirmar Exclusão
              </h3>
            </div>
            <p className="text-xs text-slate-600 font-medium leading-relaxed">
              {deletePendingConfirmModal.isBulk
                ? `Tem certeza que deseja excluir os ${deletePendingConfirmModal.idsToDelete.length} produto(s) selecionado(s) da lista pendente? Esta ação removerá os itens permanentemente da fila.`
                : `Tem certeza que deseja excluir este produto da lista pendente do dashboard?`}
            </p>
            <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setDeletePendingConfirmModal({ open: false, idsToDelete: [], isBulk: false })}
                className="px-4 py-2.5 text-slate-600 hover:bg-slate-100 rounded-xl text-xs font-bold uppercase transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={executeDeletePending}
                className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-black uppercase transition-colors shadow-sm cursor-pointer"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Uploading & Logs Panel */}
      {(isUploading || xmlLogs.length > 0) && (
        <div className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm space-y-4 animate-in fade-in duration-300">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-800 uppercase tracking-wider">Histórico de Importação de XMLs</span>
              {isUploading && (
                <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 rounded-full">
                  <RefreshCcw className="w-3 h-3 text-indigo-600 animate-spin" />
                  <span className="text-[9px] font-black uppercase text-indigo-700">Processando e Analisando Arquivos XML...</span>
                </div>
              )}
            </div>
            {xmlLogs.length > 0 && (
              <button 
                onClick={() => setXmlLogs([])}
                className="text-[10px] font-bold text-slate-400 hover:text-slate-600 border-0 bg-transparent uppercase cursor-pointer"
              >
                Limpar Log
              </button>
            )}
          </div>

          {/* Barra de Carregamento Animada */}
          {isUploading && (
            <div className="space-y-2 bg-indigo-50/60 p-3.5 rounded-2xl border border-indigo-100/80">
              <div className="flex items-center justify-between text-[11px] font-bold text-indigo-900">
                <span className="flex items-center gap-1.5">
                  <Upload className="w-3.5 h-3.5 text-indigo-600 animate-bounce" />
                  Importando e processando notas fiscais XML...
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600">Aguarde...</span>
              </div>
              <div className="w-full bg-indigo-100/70 h-2.5 rounded-full overflow-hidden relative">
                <div className="h-full bg-gradient-to-r from-indigo-500 via-indigo-600 to-indigo-500 rounded-full w-full animate-pulse relative overflow-hidden">
                  <div className="absolute inset-0 bg-white/30 skew-x-12 animate-[shimmer_1.5s_infinite_linear]" style={{ backgroundImage: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.6), transparent)' }} />
                </div>
              </div>
            </div>
          )}
          
          {xmlLogs.length > 0 && (
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 max-h-48 overflow-y-auto space-y-2">
              {xmlLogs.map((log, idx) => (
                <div 
                  key={idx} 
                  className={`text-[10px] font-semibold leading-relaxed border-b border-slate-100 last:border-b-0 pb-1.5 flex items-start gap-2 ${
                    log.type === 'error' 
                      ? 'text-rose-600' 
                      : log.type === 'warning' 
                        ? 'text-amber-600 font-bold' 
                        : 'text-emerald-700'
                  }`}
                >
                  {log.type === 'error' && <XCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                  {log.type === 'warning' && <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0 animate-bounce" />}
                  {log.type === 'success' && <FileCheck2 className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                  <span>{log.text}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Main content sequence layout */}
      <div className="space-y-8">
        <MonthlySpendChart
          expenseData={expenseData}
          isLoading={isLoading}
          isChartReady={isChartReady}
          selectedChartCategory={selectedChartCategory}
          setSelectedChartCategory={setSelectedChartCategory}
          normalizedCategories={normalizedCategories}
          generateReport={generateReport}
          expenseChartRef={expenseChartRef}
        />

        {/* Chart 2: Pie Chart (Gastos por Categoria) - Positioned below Area Chart */}
        <div className="bg-white p-8 rounded-3xl border border-slate-100 shadow-sm flex flex-col space-y-6">
          <CategoryPieChart
            categoryPieData={categoryPieData}
            selectedChartCategory={selectedChartCategory}
            setSelectedChartCategory={setSelectedChartCategory}
            uncategorizedCount={uncategorizedCount}
            showPieProductList={showPieProductList}
            setShowPieProductList={setShowPieProductList}
            setPieCategoryFilter={setPieCategoryFilter}
          />

          {/* Painel Integrado de Busca e Edição de Categorias de Produtos */}
          {(showPieProductList || pieSearchQuery.trim().length > 0 || pieCategoryFilter !== "ALL") && (
            <div className="mt-6 pt-6 border-t border-slate-100 space-y-4 animate-fadeIn">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                  <input
                    type="text"
                    value={pieSearchQuery}
                    onChange={e => setPieSearchQuery(e.target.value)}
                    placeholder="Buscar produto por nome, código, fornecedor ou categoria..."
                    className="w-full pl-10 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                  />
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[10px] font-black uppercase text-slate-400">Filtrar Categoria:</span>
                  <select
                    value={pieCategoryFilter}
                    onChange={e => setPieCategoryFilter(e.target.value)}
                    className="py-2 px-3 text-xs bg-slate-50 border border-slate-200 rounded-2xl font-bold text-slate-700 outline-none focus:ring-2 focus:ring-emerald-500 cursor-pointer"
                  >
                    <option value="ALL">Todas ({rangeProducts.length})</option>
                    <option value="SEM_CATEGORIA">⚠️ Sem Categoria ({uncategorizedCount})</option>
                    {normalizedCategories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="bg-[#1e293b] rounded-2xl border border-slate-800 p-4 max-h-[380px] overflow-y-auto space-y-2">
                {filteredPieProducts.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
                    Nenhum produto encontrado para o filtro digitado
                  </div>
                ) : (
                  filteredPieProducts.map((p) => {
                    const isUncat = !p.category || p.category === "Sem Categoria";
                    return (
                      <div
                        key={p.key}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border transition-all ${
                          isUncat 
                            ? "bg-[#1e293b] border-amber-500/50" 
                            : "bg-[#1e293b] border-slate-700 hover:border-slate-600"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-black text-slate-100 truncate" title={p.name}>
                              {p.name}
                            </span>
                            {p.code && (
                              <span className="text-[10px] font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                                Ref: {p.code}
                              </span>
                            )}
                            <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800/60">
                              NF: {p.invNumber}
                            </span>
                          </div>

                          <div className="flex items-center gap-2.5 mt-1.5 text-[11px] text-slate-400 font-medium flex-wrap">
                            <span>🏢 <strong className="text-slate-300">{p.supplierName}</strong></span>
                            <span>•</span>
                            <span>📅 <strong className="text-slate-300">{p.dateStr}</strong></span>
                            <span>•</span>
                            <span>📦 Qtd: <strong className="text-slate-200">{p.quantity}</strong></span>
                            <span>•</span>
                            <span>💰 Un: <strong className="text-slate-200">{formatCurrency(p.unitPrice)}</strong></span>
                            <span>•</span>
                            <span>Total: <strong className="text-emerald-400">{formatCurrency(p.totalNet)}</strong></span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2.5 shrink-0">
                          <span className="text-[10px] font-extrabold uppercase text-slate-400">
                            Categoria:
                          </span>
                          <select
                            value={normalizedCategories.some(c => c.name === p.category) ? p.category : (p.category !== "Sem Categoria" ? "__CUSTOM__" : "Sem Categoria")}
                            onChange={(e) => {
                              const val = e.target.value;
                              if (val === "__ADD_NEW__") {
                                const customCat = prompt("Digite o nome da nova categoria:");
                                if (customCat && customCat.trim()) {
                                  handleUpdateProductCategory(p.code, p.name, customCat.trim());
                                }
                              } else if (val !== "__CUSTOM__") {
                                handleUpdateProductCategory(p.code, p.name, val);
                              }
                            }}
                            className={`text-xs font-black px-3 py-1.5 rounded-xl border outline-none cursor-pointer ${
                              isUncat
                                ? "bg-amber-950/80 text-amber-300 border-amber-700/80 focus:ring-2 focus:ring-amber-500"
                                : "bg-slate-800 text-slate-200 border-slate-700 focus:ring-2 focus:ring-emerald-500"
                            }`}
                          >
                            <option value="Sem Categoria">⚠️ Sem Categoria</option>
                            {normalizedCategories.map(c => (
                              <option key={c.id} value={c.name}>{c.name}</option>
                            ))}
                            {!normalizedCategories.some(c => c.name === p.category) && p.category && p.category !== "Sem Categoria" && (
                              <option value="__CUSTOM__">{p.category}</option>
                            )}
                            <option value="__ADD_NEW__">＋ Criar Nova Categoria...</option>
                          </select>

                          <button
                            type="button"
                            onClick={() => {
                              setDeleteProductConfirmModal({
                                open: true,
                                productKey: p.key,
                                invKey: p.invKey,
                                productName: p.name,
                                productCode: p.code,
                                supplierName: p.supplierName,
                                invNumber: p.invNumber,
                                dateStr: p.dateStr,
                                totalNet: p.totalNet,
                                productIndex: p.productIndexInInvoice
                              });
                            }}
                            title="Excluir este lançamento de produto da NF"
                            className="p-2 text-rose-400 hover:text-rose-200 hover:bg-rose-900/60 rounded-xl transition-all border border-rose-800/60 bg-slate-800 cursor-pointer flex items-center justify-center shrink-0"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <SystemLogsPanel systemLogs={systemLogs} onClearLogs={() => setSystemLogs([])} />
        </div>

        <PriceIncreasesTable
          priceIncreases={priceIncreases}
          isPriceIncreasesLoading={isPriceIncreasesLoading}
          selectedIncreases={selectedIncreases}
          onToggleSelectAll={handleToggleSelectAll}
          onToggleSelect={handleToggleSelect}
          onDeleteIncrease={handleDeleteIncrease}
          onBulkDeleteIncreases={handleBulkDeleteIncreases}
          fetchPriceIncreases={fetchPriceIncreases}
        />

        <PriceAnalysisPanel
          priceAnalysis={priceAnalysis}
          priceSearchQuery={priceSearchQuery}
          setPriceSearchQuery={setPriceSearchQuery}
          priceSearchYear={priceSearchYear}
          setPriceSearchYear={setPriceSearchYear}
          selectedProduct={selectedProduct}
          setSelectedProduct={setSelectedProduct}
          showSearchDropdown={showSearchDropdown}
          setShowSearchDropdown={setShowSearchDropdown}
          parsedSearchSuggestions={parsedSearchSuggestions}
          availableYears={availableYears}
          isPriceLoading={isPriceLoading}
          fetchPricingData={fetchPricingData}
        />
      </div>

      {deleteProductConfirmModal.open && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[300] flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#1e293b] border border-slate-700 w-full max-w-md rounded-2xl p-6 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="w-10 h-10 rounded-xl bg-rose-950/80 border border-rose-800/60 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5 text-rose-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-100">Confirmar Exclusão de Item</h3>
                <p className="text-xs text-slate-400">Remover lançamento específico de Nota Fiscal</p>
              </div>
            </div>

            <div className="text-xs text-slate-300 space-y-2 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
              <p className="font-semibold text-slate-200">Tem certeza que deseja remover este lançamento do produto?</p>
              <div className="mt-2 text-xs text-slate-300 space-y-1.5 border-t border-slate-800 pt-2.5">
                <p>📌 <strong className="text-slate-100">Produto:</strong> {deleteProductConfirmModal.productName}</p>
                <p>🏢 <strong className="text-slate-100">Fornecedor:</strong> {deleteProductConfirmModal.supplierName}</p>
                <p>📄 <strong className="text-slate-100">Nota Fiscal:</strong> {deleteProductConfirmModal.invNumber}</p>
                <p>📅 <strong className="text-slate-100">Data da Compra:</strong> {deleteProductConfirmModal.dateStr}</p>
                <p>💰 <strong className="text-slate-100">Valor Total:</strong> <span className="text-emerald-400 font-bold">{formatCurrency(deleteProductConfirmModal.totalNet || 0)}</span></p>
              </div>
              <p className="text-[11px] text-amber-400 font-semibold mt-2.5">
                ⚠️ Lançamentos deste mesmo produto em outras notas fiscais serão mantidos.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setDeleteProductConfirmModal({ open: false })}
                className="px-4 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmDeleteProductItem}
                className="px-4 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-500 rounded-xl transition-colors shadow-lg shadow-rose-950/50 cursor-pointer"
              >
                Sim, Excluir Lançamento
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
