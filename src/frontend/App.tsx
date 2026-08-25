/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCcw, PlusCircle, BellRing, X } from 'lucide-react';
import { db } from './firebase';
import { setDoc, doc, deleteDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { getProductCategories } from './utils/productCategories';

// Hooks
import { useAuth } from './hooks/useAuth';
import { useNotifications } from './hooks/useNotifications';
import { useSuppliers } from './hooks/useSuppliers';
import { useCart } from './hooks/useCart';
import { usePurchaseOrders } from './hooks/usePurchaseOrders';
import { useDeliveredProducts } from './hooks/useDeliveredProducts';
import { useReminders } from './hooks/useReminders';
import { useExcel } from './hooks/useExcel';
import { useSupplierForm } from './hooks/useSupplierForm';
import { useDeletions } from './hooks/useDeletions';
import { usePurchaseForecastNotifications } from './hooks/usePurchaseForecastNotifications';

// Components
import { Login } from './components/Login';
import { Sidebar } from './components/Sidebar';
import { NotificationCenter } from './components/NotificationCenter';
import { Modals } from './components/Modals';
import { Header } from './components/Header';
import { AppLayout } from './components/AppLayout';
import { QuotaBanner } from './components/QuotaBanner';
import { ActiveTargetBanner } from './components/ActiveTargetBanner';
import { PermissionBanner } from './components/PermissionBanner';

// Lazy Loaded Views for Stage 1 Optimization (Lighter & Faster Bundle, on-demand loading)
const DashboardView = React.lazy(() => import('./components/DashboardView').then(m => ({ default: m.DashboardView })));
const PurchaseOrdersView = React.lazy(() => import('./components/PurchaseOrdersView').then(m => ({ default: m.PurchaseOrdersView })));
const SuppliersView = React.lazy(() => import('./components/SuppliersView').then(m => ({ default: m.SuppliersView })));
const ShoppingView = React.lazy(() => import('./components/ShoppingView').then(m => ({ default: m.ShoppingView })));
const HistoryView = React.lazy(() => import('./components/HistoryView').then(m => ({ default: m.HistoryView })));
const DeliveredProductsView = React.lazy(() => import('./components/DeliveredProductsView').then(m => ({ default: m.DeliveredProductsView })));
const RemindersView = React.lazy(() => import('./components/RemindersView').then(m => ({ default: m.RemindersView })));
const AIView = React.lazy(() => import('./components/AIView').then(m => ({ default: m.AIView })));
const PurchaseForecastView = React.lazy(() => import('./components/PurchaseForecastView').then(m => ({ default: m.PurchaseForecastView })));
const DREVendasView = React.lazy(() => import('./components/DREVendasView').then(m => ({ default: m.DREVendasView })));

// Types
import { Product, Supplier } from './types';
import { extractErrorMessage } from './utils';

export default function App() {
  // --- CUSTOM HOOKS ---
  const {
    isLoggedIn,
    isApproved,
    loggedCpf,
    loggedName,
    isAuthReady,
    authorizedUsers,
    loginError,
    setLoginError,
    handleLogin,
    handleLogout,
    updateUserStatus,
    removeUserRequest,
    isAdmin,
    authError
  } = useAuth();

  const {
    notifications,
    appNotifications,
    isNotificationsOpen,
    setIsNotificationsOpen,
    addNotification,
    addAppNotification,
    markAllAsRead,
    clearNotifications,
    requestPermission
  } = useNotifications();

  const {
    suppliers,
    categories,
    setores,
    isLoading: isSuppliersLoading,
    refreshData: refreshSuppliers,
    saveSupplier,
    deleteSupplier,
    deleteAllSuppliers,
    addCategory,
    deleteCategory,
    addSetor,
    deleteSetor,
    error: suppliersError
  } = useSuppliers(isAuthReady, isApproved);

  // Single, consistent list of product-classification category options shared by
  // every category picker/editor in the app (Fazer Compras, Produtos, Fornecedores).
  const availableCategories = React.useMemo(() => {
    const defaults = ['Ingredientes', 'Embalagens', 'Limpeza', 'Escritório', 'Fornecedor'];
    const combined = [...(categories || []), ...defaults];
    return Array.from(new Set(combined.filter(Boolean)));
  }, [categories]);

  const {
    reminders,
    refreshReminders,
    addReminder,
    deleteReminder,
    error: remindersError
  } = useReminders(isAuthReady, isApproved, addAppNotification);

  // Memoized logic for quota check
  const isQuotaExceeded = React.useMemo(() => {
    const errors = [suppliersError, authError, remindersError];
    return errors.some(err => 
      err?.toLowerCase().includes('quota') || err?.toLowerCase().includes('resource-exhausted')
    );
  }, [suppliersError, authError, remindersError]);

  const {
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
  } = useCart(isAuthReady, isApproved, loggedName, addAppNotification);

  const {
    purchaseOrders,
    isLoading: isPurchaseOrdersLoading,
    createPurchaseOrder,
    approveRequisition,
    approveOrder,
    rejectOrder,
    updateObservacao,
    sendToShoppingList: sendPurchaseOrderToShoppingList,
    deleteOrder: deletePurchaseOrder
  } = usePurchaseOrders(loggedName, addAppNotification);

  const sendToShoppingList = React.useCallback(async (id: string) => {
    await sendPurchaseOrderToShoppingList(id);
    await refreshLists();
  }, [sendPurchaseOrderToShoppingList, refreshLists]);

  const {
    deliveredProducts,
    saveDeliveredProduct,
    deleteDeliveredProduct,
    toggleDeliveryStatus,
    updatePurchaseDate,
    updateForecastDate,
    updateDeliveryDate,
    updateDeliveredQuantity
  } = useDeliveredProducts(isAuthReady, isApproved, addAppNotification);

  // Monitoramento automático das datas de previsão de compra
  usePurchaseForecastNotifications(isAuthReady, isApproved, addAppNotification);

  const handleUpdateCartQuantity = React.useCallback((name: string, supplierName: string, delta: number) => {
    // 1. Update cart
    updateCartQuantity(name, supplierName, delta);
    
    const item = cart.find(i => i.name === name && i.supplierName === supplierName);
    if(item) {
       updateDeliveredQuantity(name, supplierName, item.quantity + delta);
    }
  }, [updateCartQuantity, cart, updateDeliveredQuantity]);

  const handleToggleSavedListItemBought = React.useCallback(async (listId: string, productName: string, supplierName: string) => {
    const list = savedLists.find(l => l.id === listId);
    if (!list) return;

    const item = list.items.find(i => i.name === productName && i.supplierName === supplierName);
    if (!item) return;

    // Se o item NÃO estava comprado, ele vai se tornar comprado agora (Check)
    const becomingBought = !item.bought;

    const now = new Date();
    const sanitizeForId = (str: string) => {
      return str
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
    };
    const newDeliveryId = becomingBought ? sanitizeForId(`${productName}-${supplierName}-${now.getTime()}`) : undefined;

    // Ao marcar: guarda a data de compra atual do produto antes de sobrescrevê-la,
    // para poder restaurá-la caso o checkbox seja desmarcado depois.
    const supplierForDate = suppliers.find(s => s.name === supplierName);
    const currentProductLastPurchaseDate = supplierForDate?.products.find(p => p.name === productName)?.lastPurchaseDate;

    // Atualiza o estado da UI instantaneamente (optimistic)
    toggleSavedListItemBought(listId, productName, supplierName, {
      bought: becomingBought,
      deliveryId: newDeliveryId,
      boughtAt: becomingBought ? now.toISOString() : undefined,
      previousLastPurchaseDate: becomingBought ? currentProductLastPurchaseDate : undefined
    });

    if (becomingBought) {
      const day = now.getDate().toString().padStart(2, '0');
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const formattedDate = `${day}/${month}/${now.getFullYear()}`;
      
      // Update supplier's last purchase date if found
      const supplier = suppliers.find(s => s.name === supplierName);
      if (supplier) {
        const productIndex = supplier.products.findIndex(p => p.name === productName);
        if (productIndex !== -1) {
          const updatedSupplier = { ...supplier };
          updatedSupplier.products = [...updatedSupplier.products];
          updatedSupplier.products[productIndex] = {
            ...updatedSupplier.products[productIndex],
            lastPurchaseDate: formattedDate
          };
          
          try {
            saveSupplier(updatedSupplier);
          } catch (err) {
            console.error("Erro ao atualizar data de compra:", err);
          }
        }
      }

      // Always save to delivered products
      try {
        saveDeliveredProduct({
          id: newDeliveryId!,
          name: productName,
          supplierName: supplierName,
          purchaseDate: formattedDate,
          delivered: false,
          quantity: item.quantity
        }).then(() => {
          addNotification(`Enviado para Produtos Entregues`, 1, 'info');
        });
      } catch (err) {
        console.error("Erro ao adicionar aos entregues:", err);
      }

      // Send to pending_list_products for Dashboard confirmation
      try {
        const pendingId = `pending_${sanitizeForId(listId)}_${sanitizeForId(productName)}_${sanitizeForId(supplierName)}`;
        const pendingItem = {
          id: pendingId,
          listId,
          listName: list?.name || 'Lista de Compras',
          productName,
          supplierName,
          quantity: item.quantity || 1,
          price: item.price || 0,
          category: 'Ingredientes',
          setor: (item as any).setor || '',
          date: now.toISOString(),
          status: 'pending'
        };
        fetch('/api/xml/pending-list-products', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ item: pendingItem })
        }).catch(err => console.error("Erro ao enviar produto pendente:", err));
      } catch (err) {
        console.error("Erro ao criar produto pendente:", err);
      }
    } else {
      // Se for desmarcar, restaura a data de compra anterior do produto (guardada ao marcar)
      if (item.previousLastPurchaseDate !== undefined) {
        const supplier = suppliers.find(s => s.name === supplierName);
        if (supplier) {
          const productIndex = supplier.products.findIndex(p => p.name === productName);
          if (productIndex !== -1) {
            const updatedSupplier = { ...supplier };
            updatedSupplier.products = [...updatedSupplier.products];
            updatedSupplier.products[productIndex] = {
              ...updatedSupplier.products[productIndex],
              lastPurchaseDate: item.previousLastPurchaseDate
            };
            try {
              saveSupplier(updatedSupplier);
            } catch (err) {
              console.error("Erro ao restaurar data de compra:", err);
            }
          }
        }
      }

      // Se for desmarcar, remove dos entregues se existir o deliveryId ou se encontrar nos produtos entregues
      const productsToDelete = [];
      if (item.deliveryId) {
        productsToDelete.push(item.deliveryId);
      }
      
      // Também busca por correspondência de nome e fornecedor em produtos entregues
      const matches = deliveredProducts.filter(p => p.name === productName && p.supplierName === supplierName);
      matches.forEach(m => {
        if (!productsToDelete.includes(m.id)) {
          productsToDelete.push(m.id);
        }
      });

      if (productsToDelete.length > 0) {
        try {
          Promise.all(productsToDelete.map(id => deleteDeliveredProduct(id))).then(() => {
            addNotification("Removido dos Entregues", 1, 'info');
          });
        } catch (err) {
          console.error("Erro ao remover dos entregues:", err);
          addNotification("Erro ao remover dos entregues", 0, 'info');
        }
      }

      // Se desmarcou, remove da lista pendente do dashboard se ainda não foi confirmado
      try {
        const pendingId = `pending_${sanitizeForId(listId)}_${sanitizeForId(productName)}_${sanitizeForId(supplierName)}`;
        fetch('/api/xml/pending-list-products/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids: [pendingId] })
        }).catch(err => console.error("Erro ao remover produto pendente:", err));
      } catch (err) {
        console.error("Erro ao remover pendente:", err);
      }
    }
  }, [savedLists, toggleSavedListItemBought, suppliers, deliveredProducts, saveSupplier, addNotification, saveDeliveredProduct, deleteDeliveredProduct, db]);

  const handleReconnect = React.useCallback(async () => {
    const { db, enableNetwork } = await import('./firebase');
    try {
      await enableNetwork(db);
      refreshSuppliers();
      refreshLists();
      refreshReminders();
      addNotification("Reconectando...", 1, 'info');
    } catch (e) {
      console.error("Reconnection failed:", extractErrorMessage(e));
    }
  }, [refreshSuppliers, refreshLists, refreshReminders, addNotification]);

  useEffect(() => {
    if (isQuotaExceeded) {
      import('./firebase').then(({ db, disableNetwork }) => {
        disableNetwork(db).catch(err => console.error(extractErrorMessage(err)));
      });
    }
  }, [isQuotaExceeded]);

  const [activeTargetListId, setActiveTargetListId] = useState<string | null>(null);
  const [activeTargetListName, setActiveTargetListName] = useState<string | null>(null);

  const handleAddToCart = React.useCallback((product: Product, supplierName: string, quantity: number, setor: string) => {
    if (activeTargetListId) {
      addItemToList(activeTargetListId, product, supplierName, quantity, setor);
      addNotification(`Adicionado à lista ${activeTargetListName}`, quantity, 'info');
    } else {
      addToCart(product, supplierName, quantity, setor);
      addNotification(product.name, quantity, 'cart');
    }
  }, [activeTargetListId, activeTargetListName, addItemToList, addNotification, addToCart]);

  const [activeWindow, setActiveWindow] = useState<'compras' | 'dre'>('compras');
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'purchase-orders' | 'suppliers' | 'shopping' | 'history' | 'delivered' | 'reminders' | 'ai' | 'purchase-forecast' | 'vendas'>('dashboard');

  const handleWindowChange = (win: 'compras' | 'dre') => {
    setActiveWindow(win);
    if (win === 'dre') {
      setCurrentPage('vendas');
    } else {
      setCurrentPage('dashboard');
    }
  };
  
  const {
    handleExportExcel,
    handleImportExcel,
    handleSyncSheets,
    performImport
  } = useExcel(suppliers, saveSupplier, addNotification);

  // --- LOCAL UI STATE ---
  const [loginCpf, setLoginCpf] = useState('');
  const [loginName, setLoginName] = useState('');
  const [pendingImportData, setPendingImportData] = useState<Record<string, Supplier> | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('theme_mode') === 'dark';
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme_mode', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme_mode', 'light');
    }
  }, [isDarkMode]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [listName, setListName] = useState('');
  const [shippingFee, setShippingFee] = useState<number>(0);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const { deletions, setDeletion } = useDeletions();
  const [searchTerm, setSearchTerm] = useState('');
  const [shoppingQuantities, setShoppingQuantities] = useState<Record<string, number | string>>({});
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newSetorName, setNewSetorName] = useState('');
  const [reminderProductName, setReminderProductName] = useState('');
  const [reminderDate, setReminderDate] = useState('');

  // Auto-fill name based on CPF
  useEffect(() => {
    const cleanCpf = loginCpf.replace(/\D/g, '');
    if (cleanCpf.length === 11) {
      const user = authorizedUsers.find(u => u.cpf === cleanCpf);
      if (user?.name) {
        setLoginName(user.name);
      }
    } else if (cleanCpf.length === 0) {
      setLoginName('');
    }
  }, [loginCpf, authorizedUsers]);

  const {
    formState,
    setFormState,
    productList,
    setProductList,
    editingSupplierId,
    setEditingSupplierId,
    editingProductIndex,
    setEditingProductIndex,
    isSaving,
    productNameRef,
    resetForm,
    addProduct,
    handleEditProduct,
    removeProduct,
    onAddSupplier,
    onEditSupplier
  } = useSupplierForm(suppliers, saveSupplier, updateProductPriceInLists, addNotification);

  const onLogin = React.useCallback((e: React.FormEvent) => {
    e.preventDefault();
    handleLogin(loginCpf, loginName);
  }, [handleLogin, loginCpf, loginName]);

  const onFinalizeList = React.useCallback(async () => {
    if (isFinalizing) return;
    setIsFinalizing(true);
    try {
      if (editingListId) {
        // Editar uma lista já enviada continua indo direto, sem passar por aprovação de novo
        const updatedList = await finalizeList(listName, editingListId, shippingFee);
        if (updatedList) {
          setListName('');
          setShippingFee(0);
          setEditingListId(null);
          setIsCartOpen(false);
          setCurrentPage('history');
          addNotification('Lista atualizada!', 1);
          addAppNotification('Lista Atualizada', `A lista "${updatedList.name}" foi atualizada com sucesso.`);
        }
      } else {
        // Lista nova: vai para Ordem de Compra aguardando aprovação
        const newOrder = await createPurchaseOrder(listName, cart, shippingFee);
        if (newOrder) {
          setListName('');
          setShippingFee(0);
          clearCart();
          setIsCartOpen(false);
          setCurrentPage('purchase-orders');
          addNotification('Enviado para aprovação!', 1);
        }
      }
    } finally {
      setIsFinalizing(false);
    }
  }, [isFinalizing, finalizeList, createPurchaseOrder, listName, shippingFee, editingListId, cart, clearCart, addNotification, addAppNotification]);

  const onSetActiveTargetList = React.useCallback((id: string | null, name: string | null) => {
    setActiveTargetListId(id);
    setActiveTargetListName(name);
    if (id) {
      setCurrentPage('suppliers');
      addNotification(`Modo de adição para: ${name}`, 1, 'info');
    }
  }, [addNotification]);

  const onEditSavedList = React.useCallback((list: any) => {
    setCart(list.items);
    setListName(list.name);
    setShippingFee(list.shippingFee || 0);
    setEditingListId(list.id);
    setIsCartOpen(true);
  }, [setCart, setListName, setShippingFee, setEditingListId, setIsCartOpen]);

  const onAddCategory = React.useCallback(() => {
    if (newCategoryName.trim()) {
      addCategory(newCategoryName.trim());
      setNewCategoryName('');
    }
  }, [newCategoryName, addCategory]);

  const onAddSetor = React.useCallback(() => {
    if (newSetorName.trim()) {
      addSetor(newSetorName.trim());
      setNewSetorName('');
    }
  }, [newSetorName, addSetor]);

  const onScheduleReminder = React.useCallback(() => {
    if (reminderProductName && reminderDate) {
      let finalDate = reminderDate;
      if (reminderDate.length === 10) {
        finalDate = `${reminderDate}T09:00:00`;
      }
      addReminder(reminderProductName, finalDate);
      setReminderProductName('');
      setReminderDate('');
      addNotification('Lembrete agendado!', 1);
    }
  }, [reminderProductName, reminderDate, addReminder, addNotification]);

  const onImportExcel = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    handleImportExcel(e, (data) => {
      setPendingImportData(data);
    });
  }, [handleImportExcel]);

  const onPerformImport = React.useCallback(async (replace: boolean) => {
    if (!pendingImportData || isImporting) return;
    setIsImporting(true);
    try {
      await performImport(pendingImportData, replace, deleteAllSuppliers);
      setPendingImportData(null);
    } finally {
      setIsImporting(false);
    }
  }, [pendingImportData, isImporting, performImport, deleteAllSuppliers]);

  const onSyncSheets = React.useCallback(async () => {
    await handleSyncSheets((data) => {
      setPendingImportData(data);
    });
  }, [handleSyncSheets]);

  const handleUpdateProductPrice = React.useCallback(async (name: string, supplierName: string, newPrice: number) => {
    // 1. Update cart
    setCart(prev => prev.map(item => item.name === name && item.supplierName === supplierName ? { ...item, price: newPrice } : item));
    
    // 2. Update all saved lists
    await updateProductPriceInLists(name, supplierName, newPrice);
    
    // 3. Update supplier
    const supplier = suppliers.find(s => s.name === supplierName);
    if (supplier) {
      const productIndex = supplier.products.findIndex(p => p.name === name);
      if (productIndex !== -1) {
        const updatedSupplier = { ...supplier };
        updatedSupplier.products = [...updatedSupplier.products];
        updatedSupplier.products[productIndex] = { ...updatedSupplier.products[productIndex], price: newPrice };
        try {
            await saveSupplier(updatedSupplier);
        } catch (err) {
            console.error("Erro ao atualizar preço no fornecedor:", err);
            addNotification("Erro ao atualizar preço", 0, 'info');
        }
      }
    }
  }, [setCart, updateProductPriceInLists, suppliers, saveSupplier, addNotification]);

  const onEditProductFromShopping = React.useCallback((product: Product, supplierName: string) => {
    const supplier = suppliers.find(s => s.name === supplierName);
    if (!supplier) return;
    
    // Set supplier as editing
    setEditingSupplierId(supplier.id);
    setProductList(supplier.products || []);
    
    // Set form state for this product
    setFormState({
        name: supplier.name,
        phone: supplier.phone,
        productName: product.name,
        productPrice: product.price.toString(),
        productCategories: getProductCategories(product),
        productLastPurchaseDate: product.lastPurchaseDate || '',
        productPaymentMethod: product.paymentMethod || '',
        productCode: product.code || ''
    });
    
    // Set editing index
    const productIndex = supplier.products.findIndex(p => p.name === product.name);
    setEditingProductIndex(productIndex);

    setIsAdding(true);
  }, [suppliers, setEditingSupplierId, setProductList, setFormState, setEditingProductIndex, setIsAdding]);

  const onOpenNewProduct = React.useCallback(() => {
    resetForm();
    setIsAdding(true);
  }, [resetForm, setIsAdding]);

  // --- RENDER HELPERS ---
  const mainSuppliers = React.useMemo(() => 
    suppliers.filter(s => 
      !['MERCADO', 'MATERIAIS'].includes(s.name.toUpperCase())
    ), [suppliers]
  );

  const authorizedCpfs = React.useMemo(() => 
    Array.from(new Set(authorizedUsers.map(u => u.cpf))), 
    [authorizedUsers]
  );

  // Common UI styles
  const smallLabelStyle = "text-[10px] font-black uppercase tracking-[0.2em] leading-none opacity-50";

  const [showNativePermissionBanner, setShowNativePermissionBanner] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (Notification.permission === 'default') {
        const timer = setTimeout(() => setShowNativePermissionBanner(true), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, []);

  const handleRequestNativePermission = async () => {
    await requestPermission();
    setShowNativePermissionBanner(false);
  };

  if (!isAuthReady) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
          className="w-12 h-12 border-4 border-indigo-600/30 border-t-indigo-600 rounded-full"
        />
      </div>
    );
  }

  if (!isLoggedIn) {
    return (
      <Login 
        loginCpf={loginCpf}
        setLoginCpf={setLoginCpf}
        loginName={loginName}
        setLoginName={setLoginName}
        loginError={loginError}
        handleLogin={onLogin}
        authorizedCpfs={authorizedCpfs}
      />
    );
  }

  return (
    <AppLayout
      currentPage={currentPage}
      setCurrentPage={setCurrentPage}
      isAdmin={isAdmin}
      setIsSettingsOpen={setIsSettingsOpen}
      handleLogout={handleLogout}
      loggedName={loggedName}
      isSidebarOpen={isSidebarOpen}
      setIsSidebarOpen={setIsSidebarOpen}
      requestPermission={requestPermission}
      notifications={notifications}
      appNotifications={appNotifications}
      isNotificationsOpen={isNotificationsOpen}
      setIsNotificationsOpen={setIsNotificationsOpen}
      markAllAsRead={markAllAsRead}
      clearNotifications={clearNotifications}
      cart={cart}
      setIsCartOpen={setIsCartOpen}
      isOffline={isQuotaExceeded}
      onReconnect={handleReconnect}
      activeWindow={activeWindow}
      onWindowChange={handleWindowChange}
    >
      <PermissionBanner 
        show={showNativePermissionBanner}
        onDismiss={() => setShowNativePermissionBanner(false)}
        onRequest={handleRequestNativePermission}
      />

      <QuotaBanner 
        error={suppliersError}
        isQuotaExceeded={isQuotaExceeded}
        onReconnect={handleReconnect}
      />

      <ActiveTargetBanner 
        name={activeTargetListName}
        onClear={() => onSetActiveTargetList(null, null)}
      />

      <AnimatePresence mode="wait">
        <React.Suspense fallback={
          <div className="flex flex-col items-center justify-center min-h-[400px] gap-3 text-gray-500 bg-white/50 backdrop-blur-sm rounded-2xl border border-gray-100 shadow-sm p-8">
            <RefreshCcw className="animate-spin h-8 w-8 text-indigo-600" />
            <span className="text-sm font-medium">Carregando painel...</span>
          </div>
        }>
          {currentPage === 'dashboard' && (
            <DashboardView
              key="dashboard"
              savedLists={savedLists}
              categories={categories}
              setores={setores}
            />
          )}
          {currentPage === 'purchase-orders' && (
            <PurchaseOrdersView
              key="purchase-orders"
              purchaseOrders={purchaseOrders}
              isLoading={isPurchaseOrdersLoading}
              approveRequisition={approveRequisition}
              approveOrder={approveOrder}
              rejectOrder={rejectOrder}
              updateObservacao={updateObservacao}
              sendToShoppingList={sendToShoppingList}
              deleteOrder={deletePurchaseOrder}
            />
          )}
          {currentPage === 'suppliers' && (
            <SuppliersView
              key={currentPage}
              suppliers={mainSuppliers}
              allSuppliers={suppliers}
              categories={availableCategories}
              setores={setores}
              isLoading={isSuppliersLoading}
              onRefresh={refreshSuppliers}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              setIsAdding={setIsAdding}
              handleEditSupplier={(s) => onEditSupplier(s, setIsAdding)}
              setSupplierToDelete={(id) => setDeletion('supplier', id)}
              addToCart={handleAddToCart}
              handleExportExcel={handleExportExcel}
              handleImportExcel={onImportExcel}
              handleSyncSheets={onSyncSheets}
              addNotification={addNotification}
              onEditProduct={onEditProductFromShopping}
              onOpenNewProduct={onOpenNewProduct}
              saveSupplier={saveSupplier}
            />
          )}
          {currentPage === 'shopping' && (
            <ShoppingView 
              key="shopping"
              suppliers={suppliers}
              searchTerm={searchTerm}
              setSearchTerm={setSearchTerm}
              shoppingQuantities={shoppingQuantities}
              setShoppingQuantities={setShoppingQuantities}
              addToCart={handleAddToCart}
              onEditProduct={onEditProductFromShopping}
              allSetores={setores}
            />
          )}
          {currentPage === 'history' && (
            <HistoryView 
              key="history"
              savedLists={savedLists}
              isLoading={isLoadingLists}
              onRefresh={refreshLists}
              editSavedList={onEditSavedList}
              deleteSavedList={(id) => setDeletion('list', id)}
              toggleSavedListItemBought={handleToggleSavedListItemBought}
              setActiveTargetList={onSetActiveTargetList}
            />
          )}
          {currentPage === 'delivered' && (
            <DeliveredProductsView 
              key="delivered"
              deliveredProducts={deliveredProducts}
              toggleDeliveryStatus={toggleDeliveryStatus}
              deleteDeliveredProduct={deleteDeliveredProduct}
              updatePurchaseDate={updatePurchaseDate}
              updateForecastDate={updateForecastDate}
              updateDeliveryDate={updateDeliveryDate}
            />
          )}
          {currentPage === 'reminders' && (
            <RemindersView 
              key="reminders"
              reminders={reminders}
              onRefresh={refreshReminders}
              reminderProductName={reminderProductName}
              setReminderProductName={setReminderProductName}
              reminderDate={reminderDate}
              setReminderDate={setReminderDate}
              addReminder={onScheduleReminder}
              deleteReminder={(id) => setDeletion('reminder', id)}
            />
          )}
          {currentPage === 'ai' && (
            <AIView 
              key="ai"
              suppliers={suppliers}
              categories={categories}
              deliveredProducts={deliveredProducts}
              saveSupplier={saveSupplier}
              updateForecastDate={updateForecastDate}
              updateProductPriceInLists={updateProductPriceInLists}
              addToCart={handleAddToCart}
              addNotification={addNotification}
            />
          )}
          {currentPage === 'purchase-forecast' && (
            <PurchaseForecastView
              key="purchase-forecast"
              suppliers={suppliers}
              saveSupplier={saveSupplier}
              addNotification={addNotification}
              savedLists={savedLists}
            />
          )}
          {currentPage === 'vendas' && (
            <DREVendasView 
              key="vendas"
              addNotification={addNotification}
            />
          )}
        </React.Suspense>
      </AnimatePresence>

      <Modals 
        isAdding={isAdding}
        setIsAdding={setIsAdding}
        editingSupplierId={editingSupplierId}
        newName={formState.name}
        setNewName={(name) => setFormState(prev => ({ ...prev, name }))}
        newPhone={formState.phone}
        setNewPhone={(phone) => setFormState(prev => ({ ...prev, phone }))}
        productList={productList}
        newProductName={formState.productName}
        setNewProductName={(productName) => setFormState(prev => ({ ...prev, productName }))}
        newProductPrice={formState.productPrice}
        setNewProductPrice={(productPrice) => setFormState(prev => ({ ...prev, productPrice }))}
        newProductCode={formState.productCode}
        setNewProductCode={(productCode) => setFormState(prev => ({ ...prev, productCode }))}
        newProductCategories={formState.productCategories}
        setNewProductCategories={(productCategories) => setFormState(prev => ({ ...prev, productCategories }))}
        newProductLastPurchaseDate={formState.productLastPurchaseDate}
        setNewProductLastPurchaseDate={(productLastPurchaseDate) => setFormState(prev => ({ ...prev, productLastPurchaseDate }))}
        newProductPaymentMethod={formState.productPaymentMethod}
        setNewProductPaymentMethod={(productPaymentMethod) => setFormState(prev => ({ ...prev, productPaymentMethod }))}
        categories={categories}
        editingProductIndex={editingProductIndex}
        productNameRef={productNameRef}
        addProduct={addProduct}
        handleEditProduct={(i) => { handleEditProduct(i); setIsAdding(true); }}
        removeProduct={removeProduct}
        handleAddSupplier={(e) => onAddSupplier(e, setIsAdding)}
        resetForm={resetForm}
        isCartOpen={isCartOpen}
        setIsCartOpen={setIsCartOpen}
        cart={cart}
        listName={listName}
        setListName={setListName}
        shippingFee={shippingFee}
        setShippingFee={setShippingFee}
        updateCartQuantity={handleUpdateCartQuantity}
        setCartQuantity={setCartQuantity}
        updateProductPrice={handleUpdateProductPrice}
        removeFromCart={removeFromCart}
        finalizeList={onFinalizeList}
        isFinalizing={isFinalizing}
        isEditingList={!!editingListId}
        clearCart={clearCart}
        isSettingsOpen={isSettingsOpen}
        setIsSettingsOpen={setIsSettingsOpen}
        newCategoryName={newCategoryName}
        setNewCategoryName={setNewCategoryName}
        handleAddCategory={onAddCategory}
        setores={setores}
        newSetorName={newSetorName}
        setNewSetorName={setNewSetorName}
        handleAddSetor={onAddSetor}
        authorizedUsers={authorizedUsers}
        updateUserStatus={updateUserStatus}
        removeUserRequest={removeUserRequest}
        supplierToDelete={deletions.supplier}
        setSupplierToDelete={(id) => setDeletion('supplier', id)}
        confirmDelete={() => { if (deletions.supplier) { deleteSupplier(deletions.supplier); setDeletion('supplier', null); } }}
        listToDelete={deletions.list}
        setListToDelete={(id) => setDeletion('list', id)}
        confirmDeleteList={() => { if (deletions.list) { deleteSavedList(deletions.list); setDeletion('list', null); } }}
        reminderToDelete={deletions.reminder}
        setReminderToDelete={(id) => setDeletion('reminder', id)}
        confirmDeleteReminder={() => { if (deletions.reminder) { deleteReminder(deletions.reminder); setDeletion('reminder', null); } }}
        categoryToDelete={deletions.category}
        setCategoryToDelete={(id) => setDeletion('category', id)}
        confirmDeleteCategory={() => { if (deletions.category) { deleteCategory(deletions.category); setDeletion('category', null); } }}
        setorToDelete={deletions.setor}
        setSetorToDelete={(id) => setDeletion('setor', id)}
        confirmDeleteSetor={() => { if (deletions.setor) { deleteSetor(deletions.setor); setDeletion('setor', null); } }}
        userToDelete={deletions.user}
        setUserToDelete={(id) => setDeletion('user', id)}
        confirmDeleteUser={async () => { 
          if (deletions.user && removeUserRequest) { 
            await removeUserRequest(deletions.user); 
            setDeletion('user', null); 
            addNotification("Usuário removido", 1, 'info');
          } 
        }}
        pendingImportData={pendingImportData}
        setPendingImportData={setPendingImportData}
        handlePerformImport={onPerformImport}
        isImporting={isImporting}
        isSaving={isSaving}
        isDarkMode={isDarkMode}
        setIsDarkMode={setIsDarkMode}
        isAdmin={isAdmin}
      />
    </AppLayout>
  );
}
