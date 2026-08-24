/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Product } from '../types';

export const getProductCategories = (product: Product | (Product & { category?: string })): string[] => {
  if (Array.isArray(product.categories) && product.categories.length > 0) {
    return product.categories;
  }
  const legacy = (product as any).category;
  return legacy ? [legacy] : [];
};

export const formatCategories = (categories: string[] | undefined): string => {
  if (!categories || categories.length === 0) return 'Sem Categoria';
  return categories.join(', ');
};
