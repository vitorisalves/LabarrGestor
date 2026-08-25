import React, { useEffect, useState } from 'react';
import { Loader2, ChevronLeft, ChevronRight, Search, Link } from 'lucide-react';
import { motion } from 'framer-motion';
import { Supplier, SavedList } from '../types';

interface Invoice {
    id: string;
    supplierName: string;
    date: string;
    products: { code: string; name: string; quantity?: number }[];
    xmlStatus?: 'Aguardando XML' | 'Confirmado via XML' | 'Sem Código';
    associatedXmlInvoiceId?: string;
}

interface Forecast {
    productCode: string;
    productName: string;
    supplier: string;
    lastPurchase: string;
    avgIntervalDays: number;
    lastQuantity: number;
    predictedNextPurchase: string;
    xmlStatus?: 'Aguardando XML' | 'Confirmado via XML' | 'Sem Código';
}

interface Props {
    suppliers: Supplier[];
    saveSupplier: (supplier: Supplier) => Promise<void>;
    addNotification: (message: string, quantity: number, type?: 'info' | 'cart') => void;
    savedLists?: SavedList[];
}

function areCodesCompatible(c1: any, c2: any): boolean {
    if (!c1 || !c2) return false;
    
    const clean = (c: any) => {
        let s = String(c || '').trim().toLowerCase();
        s = s.replace(/^(manual|cód|cod|codigo|código)[\s-_:]*/g, '');
        s = s.replace(/[^a-z0-9]/g, '');
        s = s.replace(/^0+/, '');
        return s;
    };
    
    const s1 = clean(c1);
    const s2 = clean(c2);
    
    if (!s1 || !s2) return false;
    return s1 === s2;
}

export const PurchaseForecastView: React.FC<Props> = ({ suppliers, saveSupplier, addNotification, savedLists }) => {
    const getTodayDateString = () => {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    const [forecasts, setForecasts] = useState<Forecast[]>([]);
    const [loading, setLoading] = useState(true);
    const [fetchError, setFetchError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterDate, setFilterDate] = useState(getTodayDateString());
    const [productAliases, setProductAliases] = useState<Record<string, string>>({});
    const [supplierAliases, setSupplierAliases] = useState<Record<string, string>>({});
    
    // Association State
    const [associatingForecast, setAssociatingForecast] = useState<Forecast | null>(null);
    const [selectedSupplierId, setSelectedSupplierId] = useState<string>('');
    const [selectedProductName, setSelectedProductName] = useState<string>('');

    const itemsPerPage = 20;

    const fetchData = async (force: boolean = false) => {
        setLoading(true);
        setFetchError(null);
        
        const cacheDuration = 15 * 60 * 1000; // 15 minutes cache
        const lastFetch = localStorage.getItem('forecast_last_fetch');
        const cachedInvoices = localStorage.getItem('cached_invoices');
        const now = Date.now();

        let data: Invoice[] = [];
        let fetchSuccess = false;
        let apiErrMessage = "";

        const useCache = !force && lastFetch && cachedInvoices && (now - Number(lastFetch)) < cacheDuration;

        if (useCache) {
            try {
                data = JSON.parse(cachedInvoices || '[]');
                fetchSuccess = true;
            } catch (err) {
                console.warn("Erro ao ler cache de faturas:", err);
            }
        }

        try {
            if (!useCache || data.length === 0) {
                try {
                    const res = await fetch('/api/xml/invoices?t=' + Date.now());
                    if (res.ok) {
                        data = await res.json();
                        localStorage.setItem('cached_invoices', JSON.stringify(data));
                        localStorage.setItem('forecast_last_fetch', String(now));
                        fetchSuccess = true;
                    } else {
                        apiErrMessage = `Falha ao obter faturas na API (${res.status})`;
                        console.warn(apiErrMessage);
                    }
                } catch (err: any) {
                    apiErrMessage = err?.message || String(err);
                    console.warn("Falha ao comunicar com a API. Usando cache local.", err);
                }
            }

            // Merge cache + local invoice buffer
            const cached = localStorage.getItem('cached_invoices');
            const localUploaded = localStorage.getItem('local_invoices');
            const parsedCached: Invoice[] = cached ? JSON.parse(cached) : [];
            const parsedLocal: Invoice[] = localUploaded ? JSON.parse(localUploaded) : [];

            if (!fetchSuccess) {
                // Fetch failed under 500 or offline, combine locally uploaded and last cached values
                data = [...parsedLocal];
                parsedCached.forEach(c => {
                    if (!data.some(d => d.id === c.id)) {
                        data.push(c);
                    }
                });

                // Only show screen level error to user if absolutely no data is available
                if (data.length === 0) {
                    throw new Error(apiErrMessage || "Não há faturas salvas ou histórico disponível para sugerir previsões.");
                }
            } else {
                // Fetch succeeded, merge locally uploaded ones that have not made it to the database yet
                parsedLocal.forEach(l => {
                    if (!data.some(d => d.id === l.id)) {
                        data.push(l);
                    }
                });
            }

            // Sort by date ASC to ensure we keep the last supplier
            data.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
            
            const productHistory: Record<string, { 
                dates: string[], 
                name: string, 
                supplier: string, 
                lastQuantity: number, 
                code: string,
                xmlStatus?: 'Aguardando XML' | 'Confirmado via XML' | 'Sem Código'
            }> = {};

            const filteredInvoices = data.filter(invoice => !invoice.id.startsWith('manual-inv-'));

            filteredInvoices.forEach(invoice => {
                const date = new Date(invoice.date).toISOString().split('T')[0];
                invoice.products.forEach(product => {
                    const pCode = String(product.code !== undefined && product.code !== null ? product.code : '');
                    
                    // Find if there is an existing entry in productHistory with a compatible code
                    let targetKey = Object.keys(productHistory).find(existingKey => 
                        areCodesCompatible(existingKey, pCode)
                    );
                    
                    if (!targetKey) {
                        targetKey = pCode;
                    }
                    
                    if (!productHistory[targetKey]) {
                        productHistory[targetKey] = { 
                            dates: [], 
                            name: product.name, 
                            supplier: invoice.supplierName, 
                            lastQuantity: 0,
                            code: targetKey || pCode,
                            xmlStatus: 'Confirmado via XML'
                        };
                    }
                    
                    // Always update to the latest values since invoice order is sorted ASC
                    productHistory[targetKey].supplier = invoice.supplierName;
                    productHistory[targetKey].lastQuantity = (product.quantity !== undefined ? product.quantity : 0);
                    productHistory[targetKey].name = product.name;
                    productHistory[targetKey].xmlStatus = 'Confirmado via XML';
                    
                    // Keep the real code instead of "MANUAL-..." if possible
                    if (pCode && !pCode.toUpperCase().startsWith('MANUAL') && String(productHistory[targetKey].code).toUpperCase().startsWith('MANUAL')) {
                        productHistory[targetKey].code = pCode;
                    }
                    
                    if (!productHistory[targetKey].dates.includes(date)) {
                        productHistory[targetKey].dates.push(date);
                    }
                });
            });

            const computedForecasts: Forecast[] = Object.values(productHistory)
                .filter(data => data.dates.length >= 2)
                .map(data => {
                    const dates = data.dates.sort();
                    
                    let avgInterval = 30; // Default fallback interval of 30 days if only 1 purchase
                    if (dates.length >= 2) {
                        let totalInterval = 0;
                        for (let i = 1; i < dates.length; i++) {
                            const diff = (new Date(dates[i]).getTime() - new Date(dates[i-1]).getTime()) / (1000 * 60 * 60 * 24);
                            totalInterval += diff;
                        }
                        avgInterval = totalInterval / (dates.length - 1);
                    }
                    
                    const lastDate = new Date(dates[dates.length - 1]);
                    const nextDate = new Date(lastDate.getTime() + avgInterval * 24 * 60 * 60 * 1000);

                    return {
                        productCode: data.code,
                        productName: data.name,
                        supplier: data.supplier,
                        lastPurchase: dates[dates.length - 1],
                        avgIntervalDays: dates.length >= 2 ? Math.round(avgInterval) : 0,
                        lastQuantity: data.lastQuantity,
                        predictedNextPurchase: nextDate.toISOString().split('T')[0],
                        xmlStatus: data.xmlStatus
                    };
                })
                .sort((a, b) => new Date(a.predictedNextPurchase).getTime() - new Date(b.predictedNextPurchase).getTime());

            setForecasts(computedForecasts);
        } catch (err: any) {
            console.error(err);
            setFetchError(err.message || String(err));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const storedProducts = localStorage.getItem('productAliases');
        if (storedProducts) setProductAliases(JSON.parse(storedProducts));
        const storedSuppliers = localStorage.getItem('supplierAliases');
        if (storedSuppliers) setSupplierAliases(JSON.parse(storedSuppliers));
    }, []);

    useEffect(() => {
        fetchData();
    }, [savedLists]);

    const handleSetProductAlias = (originalName: string, alias: string) => {
        const newAliases = { ...productAliases, [originalName]: alias };
        setProductAliases(newAliases);
        localStorage.setItem('productAliases', JSON.stringify(newAliases));
    };

    const handleSetSupplierAlias = (originalName: string, alias: string) => {
        const newAliases = { ...supplierAliases, [originalName]: alias };
        setSupplierAliases(newAliases);
        localStorage.setItem('supplierAliases', JSON.stringify(newAliases));
    };

    const handleAssociate = async () => {
        if (!associatingForecast || !selectedSupplierId || !selectedProductName) return;
        
        const supplier = suppliers.find(s => s.id === selectedSupplierId);
        if (supplier) {
            const productIndex = supplier.products.findIndex(p => p.name === selectedProductName);
            if (productIndex !== -1) {
                const updatedSupplier = { ...supplier };
                updatedSupplier.products = [...updatedSupplier.products];
                updatedSupplier.products[productIndex] = {
                    ...updatedSupplier.products[productIndex],
                    code: associatingForecast.productCode
                };
                
                try {
                    await saveSupplier(updatedSupplier);
                    addNotification(`Código ${associatingForecast.productCode}`, 1, 'info');
                    setAssociatingForecast(null);
                    setSelectedSupplierId('');
                    setSelectedProductName('');
                } catch (e) {
                    console.error(e);
                }
            }
        }
    };

    const filteredForecasts = forecasts.filter(f => {
        const prodMatchName = productAliases[f.productName] || f.productName;
        const supMatchName = supplierAliases[f.supplier] || f.supplier;
        
        return (prodMatchName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                f.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                supMatchName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                f.supplier.toLowerCase().includes(searchTerm.toLowerCase())) &&
               (filterDate === '' || f.predictedNextPurchase >= filterDate);
    });

    const totalPages = Math.ceil(filteredForecasts.length / itemsPerPage);
    const paginatedForecasts = filteredForecasts.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const formatDate = (date: string) => date.split('-').reverse().join('/');

    const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
        setSearchTerm(e.target.value);
        setCurrentPage(1);
    };

    if (loading) return <div className="p-8"><Loader2 className="animate-spin text-indigo-600" /></div>;

    return (
        <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-8 space-y-8"
        >
            <div className="flex justify-between items-end">
                <div>
                    <h1 className="text-4xl font-black text-slate-900 tracking-tight mb-2">Previsão de Compra</h1>
                    <p className="text-slate-500 font-medium">Produtos sugeridos com base no histórico de compras do Painel Geral.</p>
                </div>
            </div>

            {fetchError && (
                <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                        <p className="font-bold">Não foi possível carregar as previsões de compra no servidor.</p>
                        <p className="text-xs text-rose-600 mt-0.5">{fetchError}</p>
                    </div>
                    <button 
                        onClick={() => fetchData()} 
                        className="bg-white hover:bg-rose-100/50 text-rose-700 border border-rose-200 px-4 py-2 rounded-xl text-xs font-bold transition-colors shadow-sm shrink-0"
                    >
                        Tentar Novamente
                    </button>
                </div>
            )}

            <div className="flex gap-2 justify-end">
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                    <input
                        type="text"
                        placeholder="Pesquisar produto ou fornecedor..."
                        value={searchTerm}
                        onChange={handleSearch}
                        className="pl-10 pr-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none w-64"
                    />
                </div>
                <input
                    type="date"
                    value={filterDate}
                    onChange={(e) => { setFilterDate(e.target.value); setCurrentPage(1); }}
                    className="px-4 py-2 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                />
            </div>
            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse min-w-[640px]">
                    <thead>
                        <tr className="bg-slate-50 text-left">
                            <th className="p-4 text-slate-400 text-xs font-bold uppercase tracking-widest border-b">Produto</th>
                            <th className="p-4 text-slate-400 text-xs font-bold uppercase tracking-widest border-b">Fornecedor</th>
                            <th className="p-4 text-slate-400 text-xs font-bold uppercase tracking-widest border-b">Última Compra</th>
                            <th className="p-4 text-slate-400 text-xs font-bold uppercase tracking-widest border-b">Ciclo Médio</th>
                            <th className="p-4 text-slate-400 text-xs font-bold uppercase tracking-widest border-b font-mono">Qtde na Última Compra</th>
                            <th className="p-4 text-slate-400 text-xs font-bold uppercase tracking-widest border-b text-indigo-600">Previsão</th>
                            <th className="p-4 text-slate-400 text-xs font-bold uppercase tracking-widest border-b text-right">Ação</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedForecasts.length === 0 ? (
                            <tr>
                                <td colSpan={7} className="p-12 text-center text-slate-400 font-medium text-sm">
                                    Nenhuma previsão de compra disponível.
                                    {forecasts.length === 0 && (
                                        <p className="text-xs text-slate-400 mt-2">
                                            Importe arquivos XML das notas fiscais de compra no Painel Geral para gerar previsões de compra automaticamente.
                                        </p>
                                    )}
                                </td>
                            </tr>
                        ) : (
                            paginatedForecasts.map(f => (
                            <tr key={`${f.productName}-${f.supplier}`} className="border-b border-slate-50 hover:bg-slate-50/50">
                                <td className="p-4 font-bold text-slate-800">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span>{f.productName}</span>
                                        {f.xmlStatus === 'Aguardando XML' && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                                Aguardando XML
                                            </span>
                                        )}
                                        {f.xmlStatus === 'Confirmado via XML' && (
                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                                Confirmado via XML
                                            </span>
                                        )}
                                    </div>
                                    <input 
                                        type="text" 
                                        placeholder="Adicionar apelido..."
                                        value={productAliases[f.productName] || ''}
                                        onChange={(e) => handleSetProductAlias(f.productName, e.target.value)}
                                        className="text-xs text-slate-400 mt-1 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none w-full max-w-[200px] placeholder:text-slate-300 transition-colors"
                                    />
                                </td>
                                <td className="p-4 text-sm text-slate-600">
                                    <div>{f.supplier}</div>
                                    <input 
                                        type="text" 
                                        placeholder="Adicionar apelido..."
                                        value={supplierAliases[f.supplier] || ''}
                                        onChange={(e) => handleSetSupplierAlias(f.supplier, e.target.value)}
                                        className="text-xs text-slate-400 mt-1 bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none w-full max-w-[200px] placeholder:text-slate-300 transition-colors"
                                    />
                                </td>
                                <td className="p-4 text-sm text-slate-600">{formatDate(f.lastPurchase)}</td>
                                <td className="p-4 text-sm text-slate-600 font-mono">{f.avgIntervalDays > 0 ? `${f.avgIntervalDays} dias` : 'Única Compra'}</td>
                                <td className="p-4 text-sm text-slate-600 font-mono">{f.lastQuantity}</td>
                                <td className="p-4 text-sm font-black text-indigo-600">{formatDate(f.predictedNextPurchase)}</td>
                                <td className="p-4 text-sm text-right flex justify-end">
                                    <button 
                                        onClick={() => setAssociatingForecast(f)}
                                        className="text-xs flex items-center gap-1 font-bold text-slate-500 hover:text-indigo-600 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition-colors"
                                    >
                                        <Link size={14} />
                                        Associar
                                    </button>
                                </td>
                            </tr>
                        )))}
                    </tbody>
                </table>
              </div>
                {totalPages > 1 && (
                    <div className="p-4 flex items-center justify-between border-t border-slate-100">
                        <button 
                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                            disabled={currentPage === 1}
                            className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 disabled:opacity-30"
                        >
                            <ChevronLeft />
                        </button>
                        <span className="text-sm font-bold text-slate-600">Página {currentPage} de {totalPages}</span>
                        <button 
                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                            disabled={currentPage === totalPages}
                            className="p-2 rounded-xl text-slate-500 hover:text-indigo-600 disabled:opacity-30"
                        >
                            <ChevronRight />
                        </button>
                    </div>
                )}
            </div>
            {associatingForecast && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <motion.div 
                        initial={{ opacity: 0, scale: 0.95 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl relative overflow-hidden"
                    >
                        <h2 className="text-2xl font-black text-slate-900 mb-2">Vincular Código</h2>
                        <p className="text-slate-500 text-sm mb-6">Associe o código rastreável da nota fiscal a um produto do seu Banco de Produtos.</p>
                        
                        <div className="space-y-4">
                            <div className="p-4 bg-slate-50 rounded-xl border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Produto da Previsão</p>
                                <p className="font-bold text-slate-800">{associatingForecast.productName}</p>
                                <p className="text-sm text-slate-500 font-mono mt-1">Ref: {associatingForecast.productCode}</p>
                            </div>
                            
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Selecionar Fornecedor</label>
                                <select 
                                    className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-medium text-slate-700"
                                    value={selectedSupplierId}
                                    onChange={(e) => {
                                        setSelectedSupplierId(e.target.value);
                                        setSelectedProductName('');
                                    }}
                                >
                                    <option value="">Selecione um fornecedor...</option>
                                    {suppliers.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            </div>

                            {selectedSupplierId && (
                                <div>
                                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Selecionar Produto</label>
                                    <select 
                                        className="w-full p-3 bg-white border-2 border-slate-200 rounded-xl focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100 outline-none transition-all font-medium text-slate-700"
                                        value={selectedProductName}
                                        onChange={(e) => setSelectedProductName(e.target.value)}
                                    >
                                        <option value="">Selecione o produto alvo...</option>
                                        {suppliers.find(s => s.id === selectedSupplierId)?.products.map(p => (
                                            <option key={p.name} value={p.name}>{p.name}</option>
                                        ))}
                                    </select>
                                </div>
                            )}

                            <div className="flex gap-3 pt-6">
                                <button
                                    onClick={() => {
                                        setAssociatingForecast(null);
                                        setSelectedSupplierId('');
                                        setSelectedProductName('');
                                    }}
                                    className="flex-1 px-4 py-3 bg-slate-100 text-slate-600 font-bold rounded-xl hover:bg-slate-200"
                                >
                                    Cancelar
                                </button>
                                <button
                                    onClick={handleAssociate}
                                    disabled={!selectedSupplierId || !selectedProductName}
                                    className="flex-1 px-4 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 flex justify-center items-center gap-2"
                                >
                                    <Link size={18} />
                                    Vincular Produto
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </div>
            )}
        </motion.div>
    );
};

