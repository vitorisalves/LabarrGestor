/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, getDocs, addDoc, query, orderBy, deleteDoc, doc, updateDoc, limit } from 'firebase/firestore';
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
      try {
        const url = force ? '/api/xml/shopping_lists?fresh=true' : '/api/xml/shopping_lists';
        const res = await fetch(url, force ? { headers: { 'Cache-Control': 'no-cache' } } : undefined);
        if (res.ok) {
          lists = await res.json() as SavedList[];
          lists.sort((a, b) => b.date.localeCompare(a.date));
          // Limit 25
          if (lists.length > 25) {
            lists = lists.slice(0, 25);
          }
        } else {
          throw new Error("Backend caching route failed");
        }
      } catch (backendErr) {
        console.warn("Backend shopping_lists failed, resorting to client-side Firestore:", backendErr);
        const q = query(
          collection(db, 'shopping_lists'), 
          orderBy('date', 'desc'), 
          limit(25)
        );
        const snapshot = await getDocs(q);
        lists = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as SavedList[];
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

  const addToCart = (product: Product, supplierName: string, quantity: number = 1, category: string) => {
    const { categories, ...productWithoutCategories } = product;
    setCart(prev => {
      const existing = prev.find(item => item.name === product.name && item.supplierName === supplierName);
      if (existing) {
        return prev.map(item =>
          item.name === product.name && item.supplierName === supplierName
            ? { ...item, quantity: item.quantity + quantity, category }
            : item
        );
      }
      return [...prev, { ...productWithoutCategories, supplierName, quantity, category }];
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

  const finalizeList = async (listName: string, editingListId: string | null = null, shippingFee: number = 0) => {
    if (cart.length === 0) return null;

    const itemsTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);
    const total = itemsTotal + shippingFee;
    const listData = cleanObject({
      name: listName,
      date: new Date().toISOString(),
      items: cart.map(item => cleanObject({ ...item, bought: !!(item as any).bought })),
      total,
      shippingFee,
      createdBy: loggedName
    });

    if (editingListId) {
      // Optimistic update
      setSavedLists(prev => prev.map(l => l.id === editingListId ? { id: editingListId, ...l, ...listData } : l));
      clearCart();
      
      try {
        await updateDoc(doc(db, 'shopping_lists', editingListId), listData);
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
        const docRef = await addDoc(collection(db, 'shopping_lists'), listData);
        await invalidateBackendCache('shopping_lists');
        // Replace temp ID with real ID
        setSavedLists(prev => prev.map(l => l.id === tempId ? { ...l, id: docRef.id } : l));
        return { id: docRef.id, ...listData };
      } catch (err: any) {
        handleFirestoreError(err, OperationType.WRITE, 'shopping_lists');
        console.warn("Could not sync new list:", err.message);
        return newList;
      }
    }
  };

  const toggleSavedListItemBought = async (listId: string, productName: string, supplierName: string, updates: Partial<{ bought: boolean; deliveryId?: string; invoiceId?: string; boughtAt?: string }> = {}) => {
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
        await updateDoc(doc(db, 'shopping_lists', listId), { items: updatedItems.map(item => cleanObject(item)) });
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
        await deleteDoc(doc(db, 'shopping_lists', id));
        await invalidateBackendCache('shopping_lists');
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.DELETE, `shopping_lists/${id}`);
      console.warn("Cloud delete failed:", err.message);
    }
  };

  const addItemToList = async (listId: string, product: Product, supplierName: string, quantity: number, category: string) => {
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
        category
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

    try {
      if (!listId.startsWith('temp-')) {
        await updateDoc(doc(db, 'shopping_lists', listId), updatedListData);
        await invalidateBackendCache('shopping_lists');
      }
    } catch (err: any) {
      handleFirestoreError(err, OperationType.UPDATE, `shopping_lists/${listId}`);
      console.warn("Cloud update failed:", err.message);
    }

    addAppNotification('Lista Atualizada', `O produto "${product.name}" foi adicionado à lista "${list.name}".`);
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
          await updateDoc(doc(db, 'shopping_lists', list.id), {
            items: list.items,
            total: list.total
          });
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
    finalizeList,
    toggleSavedListItemBought,
    deleteSavedList,
    addItemToList,
    updateProductPriceInLists
  };
};
