import { useState, useRef, useCallback } from 'react';
import { Product, Supplier } from '../types';

export const useSupplierForm = (
    suppliers: Supplier[],
    saveSupplier: (s: Supplier) => Promise<void>,
    updateProductPriceInLists: (name: string, supplierName: string, newPrice: number) => Promise<void>,
    addNotification: (msg: string, count: number, type?: 'info' | 'cart') => void
) => {
    const [formState, setFormState] = useState({
        name: '',
        phone: '',
        productName: '',
        productCode: '',
        productPrice: '',
        productCategory: '',
        productLastPurchaseDate: '',
        productPaymentMethod: '',
    });
    const [productList, setProductList] = useState<Product[]>([]);
    const [editingSupplierId, setEditingSupplierId] = useState<string | null>(null);
    const [editingProductIndex, setEditingProductIndex] = useState<number | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const productNameRef = useRef<HTMLInputElement>(null);

    const resetForm = useCallback(() => {
        setFormState({
            name: '',
            phone: '',
            productName: '',
            productPrice: '',
            productCategory: '',
            productLastPurchaseDate: '',
            productPaymentMethod: '',
            productCode: '',
        });
        setProductList([]);
        setEditingProductIndex(null);
        setEditingSupplierId(null);
    }, []);

    const parsePrice = (val: string) => {
        if (!val) return 0;
        const normalized = val.replace(',', '.');
        const parsed = parseFloat(normalized);
        return isNaN(parsed) ? 0 : parsed;
    };

    const addProduct = useCallback(() => {
        if (formState.productName.trim()) {
            if (editingProductIndex !== null) {
                const updatedList = [...productList];
                const existing = updatedList[editingProductIndex];
                updatedList[editingProductIndex] = {
                    ...existing,
                    name: formState.productName.trim(),
                    code: formState.productCode.trim(),
                    price: parsePrice(formState.productPrice),
                    category: formState.productCategory.trim() || 'Fornecedor',
                    lastPurchaseDate: formState.productLastPurchaseDate.trim(),
                    paymentMethod: formState.productPaymentMethod.trim()
                };
                setProductList(updatedList);
                setEditingProductIndex(null);
            } else {
                const product: Product = {
                    name: formState.productName.trim(),
                    code: formState.productCode.trim(),
                    price: parsePrice(formState.productPrice),
                    category: formState.productCategory.trim() || 'Fornecedor',
                    lastPurchaseDate: formState.productLastPurchaseDate.trim(),
                    paymentMethod: formState.productPaymentMethod.trim()
                };
                setProductList([...productList, product]);
            }

            setFormState(prev => ({
                ...prev,
                productName: '',
                productCode: '',
                productPrice: '',
                productCategory: '',
                productLastPurchaseDate: '',
                productPaymentMethod: '',
            }));
            productNameRef.current?.focus();
        }
    }, [formState, editingProductIndex, productList]);

    const handleEditProduct = useCallback((i: number | null) => {
        if (i === null || i < 0) {
            setEditingProductIndex(null);
            setFormState(prev => ({
                ...prev,
                productName: '',
                productCode: '',
                productPrice: '',
                productCategory: '',
                productLastPurchaseDate: '',
                productPaymentMethod: ''
            }));
            return;
        }
        const p = productList[i];
        setFormState(prev => ({
            ...prev,
            productName: p.name,
            productCode: p.code || '',
            productPrice: p.price.toString(),
            productCategory: p.category,
            productLastPurchaseDate: p.lastPurchaseDate || '',
            productPaymentMethod: p.paymentMethod || ''
        }));
        setEditingProductIndex(i);
    }, [productList]);

    const removeProduct = useCallback((index: number) => {
        setProductList(prev => prev.filter((_, idx) => idx !== index));
        setEditingProductIndex(prev => {
            if (prev === null) return null;
            if (prev === index) {
                // If the product currently being edited is deleted, clear the product inputs
                setFormState(f => ({
                    ...f,
                    productName: '',
                    productCode: '',
                    productPrice: '',
                    productCategory: '',
                    productLastPurchaseDate: '',
                    productPaymentMethod: '',
                }));
                return null;
            }
            if (prev > index) {
                // Shift down because an item before it was removed
                return prev - 1;
            }
            return prev;
        });
    }, []);

    const onAddSupplier = useCallback(async (e: React.FormEvent, setIsAdding: (v: boolean) => void) => {
        e.preventDefault();

        if (isSaving) return;
        setIsSaving(true);

        try {
            let finalProductList = [...productList];
            if (formState.productName.trim()) {
                const product: Product = {
                    name: formState.productName.trim(),
                    code: formState.productCode.trim(),
                    price: parsePrice(formState.productPrice),
                    category: formState.productCategory.trim() || 'Fornecedor',
                    lastPurchaseDate: formState.productLastPurchaseDate.trim(),
                    paymentMethod: formState.productPaymentMethod.trim()
                };

                if (editingProductIndex !== null) {
                    finalProductList[editingProductIndex] = product;
                } else {
                    finalProductList.push(product);
                }
            }

            if (!formState.name || !formState.phone || finalProductList.length === 0) {
                setIsSaving(false);
                return;
            }

            const supplierId = editingSupplierId || Math.random().toString(36).substring(2, 11);

            // Close modal immediately
            setIsAdding(false);

            // Update prices in lists if editing
            if (editingSupplierId) {
                const oldSupplier = suppliers.find(s => s.id === editingSupplierId);
                if (oldSupplier) {
                    for (const newProduct of finalProductList) {
                        const oldProduct = oldSupplier.products.find(p => p.name === newProduct.name);
                        if (oldProduct && oldProduct.price !== newProduct.price) {
                            await updateProductPriceInLists(newProduct.name, oldSupplier.name, newProduct.price);
                        }
                    }
                }
            }

            await saveSupplier({
                id: supplierId,
                name: formState.name,
                phone: formState.phone,
                products: finalProductList
            });

            addNotification(editingSupplierId ? 'Fornecedor atualizado!' : 'Fornecedor cadastrado!', 1, 'info');
            resetForm();
        } catch (err) {
            console.error("Erro ao salvar fornecedor:", err);
            addNotification("Erro ao salvar", 0, 'info');
        } finally {
            setIsSaving(false);
        }
    }, [productList, formState, editingProductIndex, editingSupplierId, saveSupplier, resetForm, isSaving, addNotification, suppliers, updateProductPriceInLists]);

    const onEditSupplier = useCallback((supplier: Supplier, setIsAdding: (v: boolean) => void) => {
        setEditingSupplierId(supplier.id);
        setFormState({
            name: supplier.name,
            phone: supplier.phone,
            productName: '',
            productPrice: '',
            productCategory: '',
            productLastPurchaseDate: '',
            productPaymentMethod: '',
            productCode: '',
        });
        setProductList(supplier.products);
        setIsAdding(true);
    }, []);

    return {
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
    };
};
