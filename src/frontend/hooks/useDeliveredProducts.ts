/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  collection,
  getDocs,
  query,
  orderBy
} from 'firebase/firestore';
import { db } from '../firebase';
import { DeliveredProduct } from '../types';
import { extractErrorMessage, handleFirestoreError, OperationType, cleanObject } from '../utils';

export function useDeliveredProducts(
  isAuthReady: boolean, 
  isApproved: boolean, 
  addAppNotification?: (title: string, message: string) => void
) {
  const [deliveredProducts, setDeliveredProducts] = useState<DeliveredProduct[]>(() => {
    const cached = localStorage.getItem('cache_delivered_products');
    return cached ? JSON.parse(cached) : [];
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const notifiedRefs = useRef<Set<string>>(new Set());

  const loadDeliveredProducts = useCallback(async (force: boolean = false) => {
    if (!isAuthReady || !isApproved) {
      setIsLoading(false);
      return;
    }

    const cached = localStorage.getItem('cache_delivered_products');

    // Para otimização extrema, exibimos o cache instantaneamente na tela para zero delay visual
    if (cached && deliveredProducts.length === 0) {
      setDeliveredProducts(JSON.parse(cached));
    }

    setIsLoading(true);
    try {
      let docs: DeliveredProduct[] = [];
      try {
        const url = force ? '/api/xml/delivered_products?fresh=true' : '/api/xml/delivered_products';
        const res = await fetch(url, force ? { headers: { 'Cache-Control': 'no-cache' } } : undefined);
        if (res.ok) {
          docs = await res.json() as DeliveredProduct[];
          // Obter formato DD/MM/AAAA ou ISO e ordenar
          docs.sort((a, b) => {
            try {
              const [d1, m1, y1] = a.purchaseDate.split('/').map(Number);
              const [d2, m2, y2] = b.purchaseDate.split('/').map(Number);
              const date1 = new Date(y1, m1 - 1, d1).getTime();
              const date2 = new Date(y2, m2 - 1, d2).getTime();
              return date2 - date1;
            } catch (e) {
              return b.purchaseDate.localeCompare(a.purchaseDate);
            }
          });
        } else {
          throw new Error("Backend caching route failed");
        }
      } catch (backendErr) {
        console.warn("Backend delivered_products failed, resorting to client-side Firestore:", backendErr);
        const q = query(collection(db, 'delivered_products'), orderBy('purchaseDate', 'desc'));
        const snapshot = await getDocs(q);
        docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as DeliveredProduct));
      }

      setDeliveredProducts(docs);
      localStorage.setItem('cache_delivered_products', JSON.stringify(docs));
      localStorage.setItem('delivered_products_last_fetch', String(Date.now()));
    } catch (err: any) {
      handleFirestoreError(err, OperationType.GET, 'delivered_products');
      console.error("Firestore Error (delivered_products):", err);
      if (cached) {
        setDeliveredProducts(JSON.parse(cached));
      }
      setError(extractErrorMessage(err));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthReady, isApproved]);

  useEffect(() => {
    loadDeliveredProducts(false);
  }, [loadDeliveredProducts]);

  useEffect(() => {
    if (!addAppNotification || deliveredProducts.length === 0) return;

    deliveredProducts.forEach(p => {
      if (!p.delivered && p.forecastDate && !notifiedRefs.current.has(p.id)) {
        try {
          const parts = p.forecastDate.split('/');
          if (parts.length === 3) {
            const [day, month, year] = parts.map(Number);
            const forecast = new Date(year, month - 1, day, 23, 59, 59);
            if (forecast < new Date()) {
              addAppNotification(
                'Entrega Atrasada!',
                `O produto "${p.name}" do fornecedor ${p.supplierName} está com a entrega atrasada (Previsão: ${p.forecastDate}).`
              );
              notifiedRefs.current.add(p.id);
            }
          }
        } catch (e) {
          console.error("Error checking notification for delay:", e);
        }
      }
    });
  }, [deliveredProducts, addAppNotification]);

  const invalidateBackendCache = async (collectionName: string) => {
    try {
      await fetch('/api/xml/cache/invalidate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection: collectionName })
      });
    } catch (err) {
      console.warn("Backend cache invalidation failed:", err);
    }
  };

  const saveDeliveredProduct = useCallback(async (product: DeliveredProduct) => {
    setDeliveredProducts(prev => {
      const index = prev.findIndex(p => p.id === product.id);
      const next = [...prev];
      if (index !== -1) {
        next[index] = product;
      } else {
        next.unshift(product);
      }
      localStorage.setItem('cache_delivered_products', JSON.stringify(next));
      return next;
    });

    try {
      const cleanedData = cleanObject(product);
      await fetch('/api/xml/delivered_products', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cleanedData)
      });
      await invalidateBackendCache('delivered_products');
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `delivered_products/${product.id}`);
      console.error("Error saving delivered product:", err);
      throw err;
    }
  }, []);

  const deleteDeliveredProduct = useCallback(async (id: string) => {
    setDeliveredProducts(prev => {
      const next = prev.filter(p => p.id !== id);
      localStorage.setItem('cache_delivered_products', JSON.stringify(next));
      return next;
    });

    try {
      await fetch('/api/xml/delivered_products/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      await invalidateBackendCache('delivered_products');
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `delivered_products/${id}`);
      console.error("Error deleting delivered product:", err);
      throw err;
    }
  }, []);

  const toggleDeliveryStatus = useCallback(async (id: string) => {
    const product = deliveredProducts.find(p => p.id === id);
    if (!product) return;

    const now = new Date();
    const day = now.getDate().toString().padStart(2, '0');
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const formattedDate = `${day}/${month}/${now.getFullYear()}`;

    let deliveryTimeDays: number | undefined = undefined;

    if (!product.delivered) {
      try {
        const [d, m, y] = product.purchaseDate.split('/').map(Number);
        const purchaseDate = new Date(y, m - 1, d);
        
        // Reset both to midnight for clean day calculation
        const date1 = new Date(purchaseDate.getFullYear(), purchaseDate.getMonth(), purchaseDate.getDate());
        const date2 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const diffTime = Math.abs(date2.getTime() - date1.getTime());
        deliveryTimeDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      } catch (e) {
        console.error("Error calculating delivery time:", e);
      }
    }

    const updatedProduct: DeliveredProduct = {
      ...product,
      delivered: !product.delivered,
    };

    if (updatedProduct.delivered) {
      updatedProduct.deliveryDate = formattedDate;
      updatedProduct.deliveredAt = now.toISOString();
      if (deliveryTimeDays !== undefined) {
        updatedProduct.deliveryTimeDays = deliveryTimeDays;
      }
    } else {
      updatedProduct.deliveryDate = undefined;
      updatedProduct.deliveryTimeDays = undefined;
      updatedProduct.deliveredAt = undefined;
    }

    await saveDeliveredProduct(updatedProduct);
  }, [deliveredProducts, saveDeliveredProduct]);

  const updatePurchaseDate = useCallback(async (id: string, newDate: string) => {
    const product = deliveredProducts.find(p => p.id === id);
    if (!product) return;

    const updatedProduct: DeliveredProduct = {
      ...product,
      purchaseDate: newDate
    };

    await saveDeliveredProduct(updatedProduct);
  }, [deliveredProducts, saveDeliveredProduct]);

  const updateForecastDate = useCallback(async (id: string, newDate: string) => {
    const product = deliveredProducts.find(p => p.id === id);
    if (!product) return;

    const updatedProduct: DeliveredProduct = {
      ...product,
      forecastDate: newDate
    };

    await saveDeliveredProduct(updatedProduct);
  }, [deliveredProducts, saveDeliveredProduct]);

  const updateDeliveryDate = useCallback(async (id: string, newDate: string) => {
    const product = deliveredProducts.find(p => p.id === id);
    if (!product) return;

    let isoDate: string | undefined = undefined;
    try {
      const parts = newDate.split('/');
      if (parts.length === 3) {
        const [day, month, year] = parts;
        isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T12:00:00.000Z`;
      }
    } catch (e) {
      console.error(e);
    }

    const updatedProduct: DeliveredProduct = {
      ...product,
      deliveryDate: newDate,
      deliveredAt: isoDate || new Date().toISOString()
    };

    await saveDeliveredProduct(updatedProduct);
  }, [deliveredProducts, saveDeliveredProduct]);

  const updateDeliveredQuantity = useCallback(async (name: string, supplierName: string, newQuantity: number) => {
    const productsToUpdate = deliveredProducts.filter(p => p.name === name && p.supplierName === supplierName && !p.delivered);
    
    for (const p of productsToUpdate) {
      await saveDeliveredProduct({ ...p, quantity: newQuantity });
    }
  }, [deliveredProducts, saveDeliveredProduct]);

  return {
    deliveredProducts,
    isLoading,
    error,
    saveDeliveredProduct,
    deleteDeliveredProduct,
    toggleDeliveryStatus,
    updatePurchaseDate,
    updateForecastDate,
    updateDeliveryDate,
    updateDeliveredQuantity,
    refreshDeliveredProducts: () => loadDeliveredProducts(true)
  };
}
