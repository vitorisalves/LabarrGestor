/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { handleFirestoreError, OperationType } from '../utils';

export function useXmlSpendings() {
  // Real-time XML Spendings State with localStorage caching
  const [xmlSpendings, setXmlSpendings] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('cached_dashboard_xml_spendings');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState(() => {
    try {
      const cached = localStorage.getItem('cached_dashboard_xml_spendings');
      return cached ? false : true;
    } catch {
      return true;
    }
  });

  // States of invoices and suppliers for pricing dashboard
  const [invoices, setInvoices] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('cached_dashboard_invoices');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [suppliers, setSuppliers] = useState<any[]>(() => {
    try {
      const cached = localStorage.getItem('cached_dashboard_suppliers');
      return cached ? JSON.parse(cached) : [];
    } catch {
      return [];
    }
  });

  const [isPriceLoading, setIsPriceLoading] = useState(false);

  const fetchPricingData = async (force = false) => {
    const now = Date.now();

    setIsPriceLoading(true);
    try {
      const urlInvoices = force ? '/api/xml/invoices?fresh=true' : '/api/xml/invoices';
      const urlSuppliers = force ? '/api/xml/suppliers?fresh=true' : '/api/xml/suppliers';
      const fetchOpts = force ? { headers: { 'Cache-Control': 'no-cache' } } : undefined;

      // Fetch invoices from backend cache
      const invoicesRes = await fetch(urlInvoices, fetchOpts);
      let invoicesData: any[] = [];
      if (invoicesRes.ok) {
        invoicesData = await invoicesRes.json();
      }

      // Fetch suppliers from backend cache
      const suppliersRes = await fetch(urlSuppliers, fetchOpts);
      let suppliersData: any[] = [];
      if (suppliersRes.ok) {
        suppliersData = await suppliersRes.json();
      } else {
        const errData = await suppliersRes.json().catch(() => ({}));
        throw new Error(`Backend suppliers failed: ${errData.message || errData.error || suppliersRes.statusText}`);
      }

      setInvoices(invoicesData);
      setSuppliers(suppliersData);
      localStorage.setItem('cached_dashboard_invoices', JSON.stringify(invoicesData));
      localStorage.setItem('cached_dashboard_suppliers', JSON.stringify(suppliersData));
      localStorage.setItem('dashboard_last_fetch', String(now));
    } catch (err) {
      console.error("Erro ao carregar dados de preços:", err);
    } finally {
      setIsPriceLoading(false);
    }
  };

  // Fetch xml_spendings with caching
  const fetchSpendings = async (force = false) => {
    const cached = localStorage.getItem('cached_dashboard_xml_spendings');
    const now = Date.now();

    setIsLoading(true);
    try {
      const url = force ? '/api/xml/spendings?fresh=true' : '/api/xml/spendings';
      const fetchOpts = force ? { headers: { 'Cache-Control': 'no-cache' } } : undefined;
      const spendingsRes = await fetch(url, fetchOpts);
      let items: any[] = [];
      if (spendingsRes.ok) {
        items = await spendingsRes.json();
      } else {
        const errData = await spendingsRes.json().catch(() => ({}));
        throw new Error(`Backend spendings failed: ${errData.message || errData.error || spendingsRes.statusText}`);
      }

      setXmlSpendings(items);
      localStorage.setItem('cached_dashboard_xml_spendings', JSON.stringify(items));
      localStorage.setItem('xml_spendings_last_fetch', String(now));
    } catch (err: any) {
      console.error("Erro ao carregar dados XML de gastos:", err);
      if (cached) {
        try {
          setXmlSpendings(JSON.parse(cached));
        } catch (e) {
          console.error(e);
        }
      }
      handleFirestoreError(err, OperationType.GET, 'xml_spendings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchPricingData();
  }, []);

  useEffect(() => {
    fetchSpendings();
  }, []);

  const handleDeleteXmlSpending = async (id: string) => {
    if (!window.confirm("Tem certeza que deseja excluir este registro de gasto?")) return;
    try {
      await fetch(`/api/xml/spendings/${id}`, { method: 'DELETE' });
      try {
        await fetch(`/api/xml/invoices/${id}`, {
          method: 'DELETE'
        });
      } catch (apiErr) {
        console.error("Erro ao deletar fatura do banco de preços central:", apiErr);
      }
      setXmlSpendings(prev => prev.filter(item => item.id !== id));
      setInvoices(prev => prev.filter(item => item.id !== id));
      await fetchPricingData(true);
      await fetchSpendings(true);
    } catch (err) {
      console.error("Erro ao deletar gasto XML:", err);
      handleFirestoreError(err, OperationType.DELETE, `xml_spendings/${id}`);
    }
  };

  return {
    xmlSpendings,
    suppliers,
    invoices,
    isLoading,
    isPriceLoading,
    fetchSpendings,
    fetchPricingData,
    handleDeleteXmlSpending,
    setXmlSpendings,
    setInvoices,
    setSuppliers,
  };
}
