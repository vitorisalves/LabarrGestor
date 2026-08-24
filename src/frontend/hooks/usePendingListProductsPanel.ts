/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';

export const usePendingListProductsPanel = (
  addSystemLog: (type: 'category' | 'delete' | 'info', message: string) => void,
  fetchPricingData: (force?: boolean) => Promise<void>,
  fetchSpendings: (force?: boolean) => Promise<void>,
  setIsUploading: (v: boolean) => void
) => {
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

  const handlePendingSetorChange = async (id: string, newSetor: string) => {
    const updated = pendingListProducts.map(p => p.id === id ? { ...p, setor: newSetor } : p);
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

  return {
    pendingListProducts,
    isPendingLoading,
    selectedPendingIds,
    bulkPendingCategory,
    setBulkPendingCategory,
    bulkPendingPrice,
    setBulkPendingPrice,
    deletePendingConfirmModal,
    setDeletePendingConfirmModal,
    fetchPendingListProducts,
    handlePendingPriceChange,
    handlePendingQuantityChange,
    handlePendingCategoryChange,
    handlePendingSetorChange,
    handleToggleSelectAllPending,
    handleToggleSelectPending,
    handleApplyBulkPendingCategory,
    handleApplyBulkPendingPrice,
    handlePromptDeletePending,
    handlePromptBulkDeletePending,
    executeDeletePending,
    handleConfirmPendingProducts
  };
};
