/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback } from 'react';
import { CartItem, PurchaseOrder } from '../types';

export const usePurchaseOrders = (loggedName: string) => {
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchPurchaseOrders = useCallback(async (force = false) => {
    setIsLoading(true);
    try {
      const url = force ? '/api/xml/purchase_orders?fresh=true' : '/api/xml/purchase_orders';
      const res = await fetch(url, force ? { headers: { 'Cache-Control': 'no-cache' } } : undefined);
      if (res.ok) {
        const data = await res.json();
        setPurchaseOrders(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Erro ao buscar ordens de compra:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPurchaseOrders();
  }, [fetchPurchaseOrders]);

  const createPurchaseOrder = useCallback(async (name: string, cart: CartItem[], shippingFee: number): Promise<PurchaseOrder | null> => {
    if (cart.length === 0) return null;
    const total = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0) + shippingFee;
    try {
      const res = await fetch('/api/xml/purchase_orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name || 'Lista de Compras',
          items: cart.map(item => ({ ...item, bought: false })),
          total,
          shippingFee,
          createdBy: loggedName
        })
      });
      if (!res.ok) return null;
      const data = await res.json();
      await fetchPurchaseOrders(true);
      return data.order as PurchaseOrder;
    } catch (err) {
      console.error('Erro ao criar ordem de compra:', err);
      return null;
    }
  }, [loggedName, fetchPurchaseOrders]);

  const approveOrder = useCallback(async (id: string, observacao?: string) => {
    setPurchaseOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'approved', approvedBy: loggedName, observacao } : o));
    try {
      await fetch('/api/xml/purchase_orders/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approvedBy: loggedName, observacao })
      });
      await fetchPurchaseOrders(true);
    } catch (err) {
      console.error('Erro ao aprovar ordem de compra:', err);
    }
  }, [loggedName, fetchPurchaseOrders]);

  const rejectOrder = useCallback(async (id: string, observacao?: string) => {
    setPurchaseOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'rejected', rejectedBy: loggedName, observacao } : o));
    try {
      await fetch('/api/xml/purchase_orders/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, rejectedBy: loggedName, observacao })
      });
      await fetchPurchaseOrders(true);
    } catch (err) {
      console.error('Erro ao rejeitar ordem de compra:', err);
    }
  }, [loggedName, fetchPurchaseOrders]);

  const updateObservacao = useCallback(async (id: string, observacao: string) => {
    setPurchaseOrders(prev => prev.map(o => o.id === id ? { ...o, observacao } : o));
    try {
      await fetch('/api/xml/purchase_orders/observacao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, observacao })
      });
    } catch (err) {
      console.error('Erro ao salvar observação:', err);
    }
  }, []);

  const sendToShoppingList = useCallback(async (id: string) => {
    setPurchaseOrders(prev => prev.filter(o => o.id !== id));
    try {
      await fetch('/api/xml/purchase_orders/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
      await fetchPurchaseOrders(true);
    } catch (err) {
      console.error('Erro ao enviar ordem de compra para lista de compras:', err);
    }
  }, [fetchPurchaseOrders]);

  const deleteOrder = useCallback(async (id: string) => {
    setPurchaseOrders(prev => prev.filter(o => o.id !== id));
    try {
      await fetch('/api/xml/purchase_orders/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id })
      });
    } catch (err) {
      console.error('Erro ao excluir ordem de compra:', err);
    }
  }, []);

  return {
    purchaseOrders,
    isLoading,
    fetchPurchaseOrders,
    createPurchaseOrder,
    approveOrder,
    rejectOrder,
    updateObservacao,
    sendToShoppingList,
    deleteOrder
  };
};
