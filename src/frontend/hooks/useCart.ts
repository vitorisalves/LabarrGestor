/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { Product, SavedList, CartItem } from '../types';
import { extractErrorMessage, safeStringify, handleFirestoreError, OperationType, cleanObject } from '../utils';

export const useCart = (
  isAuthReady: boolean, 
  isApproved: boolean, 
  loggedName: string,
  addAppNotification: (title: string, message: string) => void
) => {
  const [cart, setCart] = useState<CartItem[]>(() => {
    const cached = localStorage.getItem('cache_cart');
    return cached ? JSON.parse(cached) : [];
  });
  const [savedLists, setSavedLists] = useState<SavedList[]>(() => {
    const cached = localStorage.getItem('cache_savedLists');
    return cached ? JSON.parse(cached) : [];
  });
  const [isLoadingLists, setIsLoadingLists] = useState(false);

  useEffect(() => {
    localStorage.setItem('cache_cart', safeStringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem('cache_savedLists', safeStringify(savedLists));
  }, [savedLists]);

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

  const loadLists = async (force: boolean = false) => {
    if (!isAuthReady || !isApproved) return;

    const cachedLists = localStorage.getItem('cache_savedLists');
    
    // Para otimização extrema, exibimos o cache instantaneamente na tela para zero delay visual
    if (cachedLists && savedLists.length === 0) {
      setSavedLists(JSON.parse(cachedLists));
    }

    setIsLoadingLists(true);
    try {
      let lists: SavedList[] = [];
      const url = force ? '/api/xml/shopping_lists?fresh=true' : '/api/xml/shopping_lists';
      const res = await fetch(url, force ? { headers: { 'Cache-Control': 'no-cache' } } : undefined);
      if (!res.ok) {
        throw new Error("Backend caching route failed");
      }
      lists = await res.json() as SavedList[];
      // Equivalente a orderBy('date', 'desc') + limit(25)
      lists.sort((a, b) => b.date.localeCompare(a.date));
      if (lists.length > 25) {
        lists = lists.slice(0, 25);
      }

      setSavedLists(lists);
      localStorage.setItem('cache_savedLists', safeStringify(lists));
      localStorage.setItem('shopping_lists_last_fetch', String(Date.now()));
    } catch (error: any) {
      handleFirestoreError(error, OperationType.GET, 'shopping_lists');
      if (cachedLists) {
        setSavedLists(JSON.parse(cachedLists));
      }
      const isQuota = extractErrorMessage(error).toLowerCase().includes('quota') || extractErrorMessage(error).toLowerCase().includes('resource-exhausted');
      if (!isQuota) console.error("Shopping lists sync error:", extractErrorMessage(error));
    } finally {
      setIsLoadingLists(false);
    }
  };

  useEffect(() => {
    loadLists(false);
  }, [isAuthReady, isApproved]);

  const refreshLists = async () => {
    await loadLists(true);
  };

  const addToCart = (product: Product, supplierName: string, quantity: number = 1, setor: string) => {
    const { categories, ...productWithoutCategories } = product;
    setCart(prev => {
      const existing = prev.find(item => item.name === product.name && item.supplierName === supplierName);
      if (existing) {
        return prev.map(item =>
          item.name === product.name && item.supplierName === supplierName
            ? { ...item, quantity: item.quantity + quantity, setor }
            : item
        );
      }
      return [...prev, { ...productWithoutCategories, supplierName, quantity, setor }];
    });
  };

  const updateCartQuantity = (name: string, supplierName: string, delta: number) => {
    setCart(prev => prev.map(item => {
      if (item.name === name && item.supplierName === supplierName) {
        const newQty = Math.max(0, item.quantity + delta);
        return { ...item, quantity: newQty };
      }
      return item;
    }).filter(item => item.quantity > 0));
  };

  const setCartQuantity = (name: string, supplierName: string, newQuantity: number) => {
    setCart(prev => prev.map(item => {
      if (item.name === name && item.supplierName === supplierName) {
        const qty = Math.max(0, isNaN(newQuantity) ? 0 : newQuantity);
        return { ...item, quantity: qty };
      }
      return item;
    }));
  };

  const removeFromCart = (name: string, supplierName: string) => {
    setCart(prev => prev.filter(item => !(item.name === name && item.supplierName === supplierName)));
  };

  const clearCart = () => setCart([]);
  const setCartManualPrice = (name: string, supplierName: string, manual: CartItem['manualPrice']) => {
    setCart(prev => prev.map(item =>
      item.name === name && item.supplierName === supplierName ? { ...item, manualPrice: manual ?? undefined } : item
    ));
  };

  // `items`: itens próprios (ex.: edição de uma lista salva). Sem eles usa o carrinho.
  const finalizeList = async (listName: string, editingListId: string | null = null, shippingFee: number = 0, items?: CartItem[]) => {
    const source = items ?? cart;
    if (source.length === 0) return null;

    const itemsTotal = source.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const total = itemsTotal + shippingFee;
    const listData = cleanObject({
      name: listName,
      date: new Date().toISOString(),
      items: source.map(item => cleanObject({ ...item, bought: !!(item as any).bought })),
      total,
      shippingFee,
      createdBy: loggedName
    });

    if (editingListId) {
      // Optimistic update
      setSavedLists(prev => prev.map(l => l.id === editingListId ? { id: editingListId, ...l, ...listData } : l));
      if (!items) clearCart(); // com itens próprios, o carrinho de compras não é tocado
      
      try {
        const editRes = await fetch('/api/xml/shopping_lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editingListId, ...listData })
        });
        if (editRes.ok) {
          const editData = await editRes.json().catch(() => ({}));
          if (typeof editData.version === 'number') {
            knownVersions.current.set(editingListId, editData.version);
            setSavedLists(prev => prev.map(l => l.id === editingListId ? { ...l, version: editData.version } : l));
          }
        }
        await invalidateBackendCache('shopping_lists');
      } catch (err: any) {
        handleFirestoreError(err, OperationType.UPDATE, `shopping_lists/${editingListId}`);
        console.warn("Could not sync list update:", err.message);
      }
      return { id: editingListId, ...listData };
    } else {
      // Optimistic local ID
      const tempId = 'temp-' + Date.now();
      const newList = { id: tempId, ...listData };
      setSavedLists(prev => [newList, ...prev]);
      clearCart();

      try {
        const res = await fetch('/api/xml/shopping_lists', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(listData)
        });
        const data = await res.json();
        await invalidateBackendCache('shopping_lists');
        // Replace temp ID with real ID
        const newVersion = res.ok && typeof data.version === 'number' ? data.version : undefined;
        if (newVersion !== undefined) knownVersions.current.set(data.id, newVersion);
        setSavedLists(prev => prev.map(l => l.id === tempId ? { ...l, id: data.id, ...(newVersion !== undefined ? { version: newVersion } : {}) } : l));
        return { id: data.id, ...listData };
      } catch (err: any) {
        handleFirestoreError(err, OperationType.WRITE, 'shopping_lists');
        console.warn("Could not sync new list:", err.message);
        return newList;
      }
    }
  };

  // Salva os itens de uma lista com controle de versão. As gravações da mesma lista saem em fila
  // (uma depende da versão devolvida pela anterior), então cliques seguidos não geram conflito falso.
  const listQueues = useRef(new Map<string, Promise<unknown>>());
  const knownVersions = useRef(new Map<string, number>());

  const saveListItems = (list: SavedList, body: Record<string, unknown>): Promise<boolean> => {
    const previous = listQueues.current.get(list.id) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(async () => {
      const baseVersion = Math.max(knownVersions.current.get(list.id) ?? 0, list.version ?? 0);
      const res = await fetch('/api/xml/shopping_lists/update-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: list.id, baseVersion, ...body })
      });
      if (res.status === 409) {
        knownVersions.current.delete(list.id);
        addAppNotification('Lista alterada', 'Esta lista foi alterada por outra pessoa. Atualizei a tela; refaça a alteração.');
        await refreshLists();
        return false;
      }
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (typeof data.version === 'number') {
          knownVersions.current.set(list.id, data.version);
          setSavedLists(prev => prev.map(l => l.id === list.id ? { ...l, version: data.version } : l));
        }
      }
      return res.ok;
    });
    listQueues.current.set(list.id, run);
    return run;
  };

  const toggleSavedListItemBought = async (listId: string, productName: string, supplierName: string, updates: Partial<{ bought: boolean; deliveryId?: string; invoiceId?: string; boughtAt?: string; previousLastPurchaseDate?: string }> = {}) => {
    const list = savedLists.find(l => l.id === listId);
    if (!list) return;

    const updatedItems = list.items.map(item => {
      if (item.name === productName && item.supplierName === supplierName) {
        return { ...item, ...updates };
      }
      return item;
    });

    // Optimistic update
    setSavedLists(prev => prev.map(l => l.id === listId ? { ...l, items: updatedItems } : l));
    
    try {
      if (!listId.startsWith('temp-')) {
        await saveListItems(list, { items: updatedItems.map(item => cleanObject(item)) });
        await invalidateBackendCache('shopping_lists');
      }
    } catch (e) {
      handleFirestoreError(e, OperationType.UPDATE, `shopping_lists/${listId}`);
      console.error("Error toggling bought status:", extractErrorMessage(e));
    }
  };

  const deleteSavedList = async (id: string) => {
    // Optimistic delete
    setSavedLists(prev => prev.filter(l => l.id !== id));
    
    try {
      if (!id.startsWith('temp-')) {
        await fetch('/api/xml/shopping_lists/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id })
        });
        await invalidateBackendCache('shopping_lists');
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `shopping_lists/${id}`);
      console.warn("Cloud delete failed:", err.message);
    }
  };

  const addItemToList = async (listId: string, product: Product, supplierName: string, quantity: number, setor: string) => {
    const list = savedLists.find(l => l.id === listId);
    if (!list) return;

    const { categories, ...productWithoutCategories } = product;
    const existingItemIndex = list.items.findIndex(item => item.name === product.name && item.supplierName === supplierName);
    let updatedItems = [...list.items];

    if (existingItemIndex !== -1) {
      updatedItems[existingItemIndex] = {
        ...updatedItems[existingItemIndex],
        quantity: updatedItems[existingItemIndex].quantity + quantity
      };
    } else {
      updatedItems.push({
        ...productWithoutCategories,
        supplierName,
        quantity,
        bought: false,
        setor
      });
    }

    const newTotal = updatedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0) + (list.shippingFee || 0);
    const newDate = new Date().toISOString();
    
    const updatedListData = { 
      items: updatedItems,
      total: newTotal,
      date: newDate
    };

    // Optimistic update
    setSavedLists(prev => prev.map(l => l.id === listId ? { ...l, ...updatedListData } : l));

    let saved = true;
    try {
      if (!listId.startsWith('temp-')) {
        saved = await saveListItems(list, { items: updatedItems, total: newTotal, date: newDate });
        await invalidateBackendCache('shopping_lists');
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `shopping_lists/${listId}`);
      console.warn("Cloud update failed:", err.message);
    }

    if (saved) addAppNotification('Lista Atualizada', `O produto "${product.name}" foi adicionado à lista "${list.name}".`);
  };

  const updateProductPriceInLists = async (productName: string, supplierName: string, newPrice: number) => {
    const listsToSync: SavedList[] = [];
    
    const updatedLists = savedLists.map(list => {
      let listAffected = false;
      const updatedItems = list.items.map(item => {
        if (item.name === productName && item.supplierName === supplierName && !item.bought && item.price !== newPrice) {
          listAffected = true;
          return { ...item, price: newPrice };
        }
        return item;
      });

      if (listAffected) {
        const updatedList = {
          ...list,
          items: updatedItems,
          total: updatedItems.reduce((acc, item) => acc + (item.price * item.quantity), 0) + (list.shippingFee || 0)
        };
        listsToSync.push(updatedList);
        return updatedList;
      }
      return list;
    });

    if (listsToSync.length === 0) return;

    setSavedLists(updatedLists);

    // Sync to Firestore
    for (const list of listsToSync) {
      if (!list.id.startsWith('temp-')) {
        try {
          await saveListItems(list, { items: list.items, total: list.total });
        } catch (err: any) {
          if (err.code === 'not-found' || err.message.toLowerCase().includes('not found') || err.message.includes('404')) {
            console.warn("Shopping list document not found in Firestore, skipping update:", list.id);
            continue;
          }
          handleFirestoreError(err, OperationType.UPDATE, `shopping_lists/${list.id}`);
          console.warn("Cloud sync failed during price update:", err.message);
        }
      }
    }
  };

  return {
    cart,
    setCart,
    savedLists,
    isLoadingLists,
    refreshLists,
    addToCart,
    updateCartQuantity,
    setCartQuantity,
    removeFromCart,
    clearCart,
    setCartManualPrice,
    finalizeList,
    toggleSavedListItemBought,
    deleteSavedList,
    addItemToList,
    updateProductPriceInLists
  };
};
