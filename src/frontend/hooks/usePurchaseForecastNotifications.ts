import { useEffect, useRef } from 'react';
import { SavedList } from '../types';

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

export const usePurchaseForecastNotifications = (
    isAuthReady: boolean,
    isApproved: boolean,
    addAppNotification: (title: string, message: string, type?: 'forecast' | 'default') => void
) => {
    const executedRef = useRef(false);

    useEffect(() => {
        if (!isAuthReady || !isApproved) return;

        const checkForecasts = async () => {
            try {
                const cacheDuration = 15 * 60 * 1000; // 15 minutes cache
                const lastCheck = localStorage.getItem('forecast_notification_last_check');
                const cachedInvoices = localStorage.getItem('cached_invoices');
                const now = Date.now();

                let data: Invoice[] = [];
                let fetchSuccess = false;

                const useCache = lastCheck && cachedInvoices && (now - Number(lastCheck)) < cacheDuration;

                if (useCache) {
                    try {
                        data = JSON.parse(cachedInvoices || '[]');
                        fetchSuccess = true;
                    } catch (err) {
                        console.warn("[ForecastNotifications] Erro ao carregar cache de faturas:", err);
                    }
                }

                if (!useCache || data.length === 0) {
                    try {
                        const res = await fetch('/api/xml/invoices?t=' + Date.now());
                        if (res.ok) {
                            data = await res.json();
                            localStorage.setItem('cached_invoices', JSON.stringify(data));
                            localStorage.setItem('forecast_notification_last_check', String(now));
                            fetchSuccess = true;
                        }
                    } catch (err) {
                        console.warn("[ForecastNotifications] Falha ao comunicar com a API. Usando cache local.", err);
                    }
                }

                const cached = localStorage.getItem('cached_invoices');
                const localUploaded = localStorage.getItem('local_invoices');
                const parsedCached: Invoice[] = cached ? JSON.parse(cached) : [];
                const parsedLocal: Invoice[] = localUploaded ? JSON.parse(localUploaded) : [];

                if (!fetchSuccess) {
                    data = [...parsedLocal];
                    parsedCached.forEach(c => {
                        if (!data.some(d => d.id === c.id)) {
                            data.push(c);
                        }
                    });
                } else {
                    parsedLocal.forEach(l => {
                        if (!data.some(d => d.id === l.id)) {
                            data.push(l);
                        }
                    });
                }

                if (data.length === 0) return;

                // Sort ASC
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
                        
                        productHistory[targetKey].supplier = invoice.supplierName;
                        productHistory[targetKey].lastQuantity = (product.quantity !== undefined ? product.quantity : 0);
                        productHistory[targetKey].name = product.name;
                        productHistory[targetKey].xmlStatus = 'Confirmado via XML';
                        
                        if (pCode && !pCode.toUpperCase().startsWith('MANUAL') && String(productHistory[targetKey].code).toUpperCase().startsWith('MANUAL')) {
                            productHistory[targetKey].code = pCode;
                        }
                        
                        if (!productHistory[targetKey].dates.includes(date)) {
                            productHistory[targetKey].dates.push(date);
                        }
                    });
                });

                const computedForecasts: Forecast[] = Object.values(productHistory)
                    .filter(item => item.dates.length >= 2)
                    .map(item => {
                        const dates = item.dates.sort();
                        let avgInterval = 30; // 30 days default
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
                            productCode: item.code,
                            productName: item.name,
                            supplier: item.supplier,
                            lastPurchase: dates[dates.length - 1],
                            avgIntervalDays: dates.length >= 2 ? Math.round(avgInterval) : 0,
                            lastQuantity: item.lastQuantity,
                            predictedNextPurchase: nextDate.toISOString().split('T')[0],
                            xmlStatus: item.xmlStatus
                        };
                    });

                // Let's get list of already notified forecasts
                let notifiedList: string[] = [];
                try {
                    const stored = localStorage.getItem('notified_purchase_forecasts');
                    if (stored) {
                        notifiedList = JSON.parse(stored);
                    }
                } catch (e) {}

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const sevenDaysFromToday = new Date(today);
                sevenDaysFromToday.setDate(today.getDate() + 7);
                sevenDaysFromToday.setHours(23, 59, 59, 999);

                let listChanged = false;

                computedForecasts.forEach(forecast => {
                    const forecastKey = `${forecast.productName}:::${forecast.supplier}:::${forecast.predictedNextPurchase}`;
                    
                    const [yr, dyMonth, dyDay] = forecast.predictedNextPurchase.split('-').map(Number);
                    const forecastDate = new Date(yr, dyMonth - 1, dyDay);
                    forecastDate.setHours(0, 0, 0, 0);

                    // Check if forecast is of today or within the next 7 days
                    if (forecastDate >= today && forecastDate <= sevenDaysFromToday) {
                        const daysDiff = Math.round((forecastDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
                        const formattedDate = forecast.predictedNextPurchase.split('-').reverse().join('/');

                        if (!notifiedList.includes(forecastKey)) {
                            let message = "";
                            if (daysDiff === 0) {
                                message = `O dia estimado para recomprar o produto "${forecast.productName}" (Fornecedor: ${forecast.supplier}) chegou (${formattedDate}).`;
                            } else {
                                message = `Previsão de recompra estimada para o produto "${forecast.productName}" (Fornecedor: ${forecast.supplier}) em ${daysDiff} ${daysDiff === 1 ? 'dia' : 'dias'} (${formattedDate}).`;
                            }

                            addAppNotification(
                                "📅 Previsão de Compra!",
                                message,
                                'forecast'
                            );
                            notifiedList.push(forecastKey);
                            listChanged = true;
                        }
                    }
                });

                if (listChanged) {
                    localStorage.setItem('notified_purchase_forecasts', JSON.stringify(notifiedList));
                }

            } catch (err) {
                console.error("[ForecastNotifications] Erro ao verificar previsões de compra:", err);
            }
        };

        // Run once on load
        if (!executedRef.current) {
            checkForecasts();
            executedRef.current = true;
        }

        // Run every hour to keep it alive
        const interval = setInterval(checkForecasts, 3600000);

        return () => clearInterval(interval);

    }, [isAuthReady, isApproved, addAppNotification]);
};
