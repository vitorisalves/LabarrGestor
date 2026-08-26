/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Supplier, Product, CartItem, AuthorizedUser } from '../types';

import { SupplierModal } from './modals/SupplierModal';
import { CartModal } from './modals/CartModal';
import { SettingsModal } from './modals/SettingsModal';
import { ConfirmationModal } from './modals/ConfirmationModal';
import { ImportModal } from './modals/ImportModal';

interface ModalsProps {
  isAdding: boolean;
  setIsAdding: (open: boolean) => void;
  isProductOnlyMode: boolean;
  setIsProductOnlyMode: (v: boolean) => void;
  editingSupplierId: string | null;
  newName: string;
  setNewName: (name: string) => void;
  newPhone: string;
  setNewPhone: (phone: string) => void;
  productList: Product[];
  newProductName: string;
  setNewProductName: (name: string) => void;
  newProductPrice: string;
  setNewProductPrice: (price: string) => void;
  newProductCode: string;
  setNewProductCode: (code: string) => void;
  newProductCategories: string[];
  setNewProductCategories: (cats: string[]) => void;
  newProductLastPurchaseDate: string;
  setNewProductLastPurchaseDate: (date: string) => void;
  newProductPaymentMethod: string;
  setNewProductPaymentMethod: (method: string) => void;
  categories: string[];
  editingProductIndex: number | null;
  productNameRef: React.RefObject<HTMLInputElement>;
  addProduct: () => void;
  handleEditProduct: (index: number | null) => void;
  removeProduct: (index: number) => void;
  handleAddSupplier: (e: React.FormEvent) => void;
  resetForm: () => void;

  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  cart: CartItem[];
  listName: string;
  setListName: (name: string) => void;
  shippingFee: number;
  setShippingFee: (fee: number) => void;
  updateCartQuantity: (name: string, supplier: string, delta: number) => void;
  setCartQuantity?: (name: string, supplier: string, quantity: number) => void;
  updateProductPrice: (name: string, supplier: string, newPrice: number) => void;
  removeFromCart: (name: string, supplier: string) => void;
  finalizeList: () => void;
  isFinalizing?: boolean;
  isEditingList?: boolean;
  clearCart: () => void;

  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  newCategoryName: string;
  setNewCategoryName: (name: string) => void;
  handleAddCategory: () => void;
  setores: string[];
  newSetorName: string;
  setNewSetorName: (name: string) => void;
  handleAddSetor: () => void;
  authorizedUsers: AuthorizedUser[];
  updateUserStatus: (uid: string, status: 'approved' | 'denied') => void;
  removeUserRequest?: (uid: string) => void;
  isDarkMode?: boolean;
  setIsDarkMode?: (dark: boolean) => void;
  isAdmin?: boolean;

  supplierToDelete: string | null;
  setSupplierToDelete: (id: string | null) => void;
  confirmDelete: () => void;

  listToDelete: string | null;
  setListToDelete: (id: string | null) => void;
  confirmDeleteList: () => void;

  reminderToDelete: string | null;
  setReminderToDelete: (id: string | null) => void;
  confirmDeleteReminder: () => void;

  categoryToDelete: string | null;
  setCategoryToDelete: (id: string | null) => void;
  confirmDeleteCategory: () => void;

  setorToDelete: string | null;
  setSetorToDelete: (id: string | null) => void;
  confirmDeleteSetor: () => void;

  userToDelete: string | null;
  setUserToDelete: (id: string | null) => void;
  confirmDeleteUser: () => void;

  pendingImportData: Record<string, Supplier> | null;
  setPendingImportData: (data: Record<string, Supplier> | null) => void;
  handlePerformImport: (replace: boolean) => void;
  isImporting: boolean;
  isSaving: boolean;
}

export const Modals: React.FC<ModalsProps> = (props) => {
  return (
    <>
      <SupplierModal
        isOpen={props.isAdding}
        onClose={() => { props.setIsAdding(false); props.resetForm(); props.setIsProductOnlyMode(false); }}
        isProductOnlyMode={props.isProductOnlyMode}
        editingSupplierId={props.editingSupplierId}
        name={props.newName}
        setName={props.setNewName}
        phone={props.newPhone}
        setPhone={props.setNewPhone}
        productList={props.productList}
        productName={props.newProductName}
        setProductName={props.setNewProductName}
        productPrice={props.newProductPrice}
        setProductPrice={props.setNewProductPrice}
        productCode={props.newProductCode}
        setProductCode={props.setNewProductCode}
        productCategories={props.newProductCategories}
        setProductCategories={props.setNewProductCategories}
        productLastPurchaseDate={props.newProductLastPurchaseDate}
        setProductLastPurchaseDate={props.setNewProductLastPurchaseDate}
        productPaymentMethod={props.newProductPaymentMethod}
        setProductPaymentMethod={props.setNewProductPaymentMethod}
        categories={props.categories}
        editingProductIndex={props.editingProductIndex}
        productNameRef={props.productNameRef}
        onAddProduct={props.addProduct}
        onEditProduct={props.handleEditProduct}
        onRemoveProduct={props.removeProduct}
        onSave={props.handleAddSupplier}
        isSaving={props.isSaving}
      />

      <CartModal 
        isOpen={props.isCartOpen}
        onClose={() => props.setIsCartOpen(false)}
        cart={props.cart}
        listName={props.listName}
        setListName={props.setListName}
        shippingFee={props.shippingFee}
        setShippingFee={props.setShippingFee}
        updateCartQuantity={props.updateCartQuantity}
        setCartQuantity={props.setCartQuantity}
        updateProductPrice={props.updateProductPrice}
        removeFromCart={props.removeFromCart}
        finalizeList={props.finalizeList}
        isFinalizing={!!props.isFinalizing}
        isEditingList={!!props.isEditingList}
        clearCart={props.clearCart}
      />

      <SettingsModal 
        isOpen={props.isSettingsOpen}
        onClose={() => props.setIsSettingsOpen(false)}
        categories={props.categories}
        newCategoryName={props.newCategoryName}
        setNewCategoryName={props.setNewCategoryName}
        handleAddCategory={props.handleAddCategory}
        setores={props.setores}
        newSetorName={props.newSetorName}
        setNewSetorName={props.setNewSetorName}
        handleAddSetor={props.handleAddSetor}
        authorizedUsers={props.authorizedUsers}
        updateUserStatus={props.updateUserStatus}
        setCategoryToDelete={props.setCategoryToDelete}
        setSetorToDelete={props.setSetorToDelete}
        setUserToDelete={props.setUserToDelete}
        isDarkMode={props.isDarkMode}
        setIsDarkMode={props.setIsDarkMode}
        isAdmin={props.isAdmin}
      />

      <ConfirmationModal 
        isOpen={!!props.supplierToDelete}
        onClose={() => props.setSupplierToDelete(null)}
        onConfirm={props.confirmDelete}
        title="Excluir Fornecedor?"
        message="Esta ação não pode ser desfeita e removerá todos os produtos associados."
      />

      <ConfirmationModal 
        isOpen={!!props.listToDelete}
        onClose={() => props.setListToDelete(null)}
        onConfirm={props.confirmDeleteList}
        title="Excluir Lista?"
        message="A lista será removida permanentemente do seu histórico."
      />

      <ConfirmationModal 
        isOpen={!!props.reminderToDelete}
        onClose={() => props.setReminderToDelete(null)}
        onConfirm={props.confirmDeleteReminder}
        title="Excluir Lembrete?"
        message="O lembrete será removido e você não receberá mais a notificação."
      />

      <ConfirmationModal 
        isOpen={!!props.categoryToDelete}
        onClose={() => props.setCategoryToDelete(null)}
        onConfirm={props.confirmDeleteCategory}
        title="Excluir Categoria?"
        message={`Deseja remover a categoria "${props.categoryToDelete}"? Isso não afetará os produtos já cadastrados.`}
      />

      <ConfirmationModal
        isOpen={!!props.setorToDelete}
        onClose={() => props.setSetorToDelete(null)}
        onConfirm={props.confirmDeleteSetor}
        title="Excluir Setor?"
        message={`Deseja remover o setor "${props.setorToDelete}"? Isso não afetará compras já registradas.`}
      />

      <ConfirmationModal
        isOpen={!!props.userToDelete}
        onClose={() => props.setUserToDelete(null)}
        onConfirm={props.confirmDeleteUser}
        title="Remover Usuário?"
        message="O usuário perderá o acesso ao sistema imediatamente."
      />

      <ImportModal 
        pendingImportData={props.pendingImportData}
        onClose={() => props.setPendingImportData(null)}
        onPerformImport={props.handlePerformImport}
        isImporting={props.isImporting}
      />
    </>
  );
};
