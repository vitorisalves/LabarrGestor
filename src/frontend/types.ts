/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Product {
  code: string;
  name: string;
  price: number;
  category: string;
  lastPurchaseDate?: string;
  paymentMethod?: string;
}

export interface Supplier {
  id?: string;
  name: string;
  phone: string;
  products: Product[];
}

export interface UINotification {
  id: string;
  name: string;
  quantity: number;
  type?: 'cart' | 'info';
}

export interface AppNotification {
  id: string;
  title: string;
  message: string;
  date: string;
  read: boolean;
  type?: 'forecast' | 'default';
}

export interface CartItem extends Product {
  supplierName: string;
  quantity: number;
}

export interface SavedList {
  id: string;
  name: string;
  date: string;
  items: (Product & { supplierName: string; bought: boolean; quantity: number, deliveryId?: string, invoiceId?: string, boughtAt?: string })[];
  total: number;
  shippingFee: number;
  createdBy?: string;
}

export interface DeliveredProduct {
  id: string;
  name: string;
  supplierName: string;
  purchaseDate: string;
  delivered: boolean;
  deliveryDate?: string;
  forecastDate?: string;
  quantity?: number;
  deliveryTimeDays?: number;
  deliveredAt?: string;
}

export interface Reminder {
  id: string;
  productName: string;
  date: string;
  notified: boolean;
}

export interface AuthorizedUser {
  uid?: string;
  cpf: string;
  name: string;
  status: 'pending' | 'approved' | 'denied';
  requestDate?: string;
  lastLogin?: string;
  role?: 'admin' | 'user';
}

// --- DRE & SALES TYPES ---
export interface SalesRecord {
  id: string;
  date?: string;
  channel: 'Loja' | 'Comercial' | 'Evento' | 'Site' | 'Outro';
  value: number;
  description?: string;
  reference?: string;
}

export interface DREDadoRow {
  id: string;
  descricao: string;
  codigo: string;
  qtdTotal: number;
  cmcUnitario: number;
  cmcTotal: number;
  qtdTotalNfProduto: number;
  totalMercadoria?: number;
  totalNotaFiscal?: number;
  vendedor?: string;
  setor: 'Loja' | 'Comercial' | 'Evento' | 'Site' | '';
  mes: string; // "YYYY-MM"
  origemArquivo?: string;
  notaFiscalId?: string;
  invoices?: { id: string; val: number }[];
}

export interface DRESalesData {
  records: SalesRecord[];
  totals: {
    Loja: number;
    Comercial: number;
    Evento: number;
    Site: number;
    Total: number;
  };
  counts: {
    Loja: number;
    Comercial: number;
    Evento: number;
    Site: number;
    Total: number;
  };
}

