/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { Product } from '../../types';
import { getProductCategories } from '../../utils/productCategories';

interface PurchaseCategoryPickerProps {
  product: Product;
  categories: string[];
  value: string;
  onChange: (category: string) => void;
}

export const PurchaseCategoryPicker: React.FC<PurchaseCategoryPickerProps> = ({ product, categories, value, onChange }) => {
  React.useEffect(() => {
    if (value) return;
    const productCats = getProductCategories(product);
    const fallback = productCats[0] || categories[0] || '';
    if (fallback) onChange(fallback);
  }, [product, categories]);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-bold text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
      title="Categoria desta compra"
    >
      {categories.length === 0 && <option value="">Sem categorias cadastradas</option>}
      {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
    </select>
  );
};
