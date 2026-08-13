/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { Supplier, Product } from '../types';
import { generateId, extractErrorMessage } from '../utils';

export const useExcel = (suppliers: Supplier[], saveSupplier: (s: Supplier) => Promise<void>, addNotification: any) => {
  const handleExportExcel = () => {
    const exportData = suppliers.flatMap(supplier => 
      supplier.products.map(product => ({
        'Empresa Razão Social': supplier.name,
        'Telefone': supplier.phone,
        'Produto': product.name,
        'Preço': product.price,
        'Categoria': product.category,
        'Ultima Data Compra': product.lastPurchaseDate || '',
        'Forma de Pagamento': product.paymentMethod || ''
      }))
    );

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Fornecedores");
    XLSX.writeFile(workbook, "Labarr_Fornecedores.xlsx");
    addNotification('Exportação concluída!', 0);
  };

  const handleImportExcel = (e: React.ChangeEvent<HTMLInputElement>, onDataLoaded: (data: Record<string, Supplier>) => void) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const rawData = XLSX.utils.sheet_to_json(worksheet) as any[];

        if (rawData.length === 0) {
          addNotification('Arquivo vazio ou inválido', 0);
          return;
        }

        const newSuppliersMap: Record<string, Supplier> = {};

        rawData.forEach((row: any) => {
          const findVal = (row: any, keywords: string[]) => {
            const keys = Object.keys(row);
            const match = keys.find(k => {
              const cleanK = k.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
              return keywords.some(kw => {
                const cleanKW = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                return cleanK === cleanKW || cleanK.includes(cleanKW);
              });
            });
            return match ? row[match] : null;
          };

          const sName = findVal(row, ['Empresa Razão Social', 'Fornecedor', 'Empresa', 'Razão Social', 'Nome da Empresa']);
          const sPhone = findVal(row, ['Telefone', 'WhatsApp', 'Celular', 'Contato']) || '';
          const pName = findVal(row, ['Produto', 'Nome', 'Nome do Produto', 'Descrição', 'Item']);
          
          let pPrice = 0;
          const rawPrice = findVal(row, ['Preço', 'Valor', 'Valor Unitário', 'Preço Unitário', 'Preço de Custo', 'Custo']);
          if (typeof rawPrice === 'number') {
            pPrice = rawPrice;
          } else if (rawPrice) {
            const strPrice = rawPrice.toString().trim();
            if (strPrice.includes(',')) {
              pPrice = parseFloat(strPrice.replace(/\./g, '').replace(',', '.'));
            } else {
              pPrice = parseFloat(strPrice);
            }
          }
          
          const pCat = findVal(row, ['Categoria', 'Grupo', 'Seção']) || 'Fornecedor';
          const pLastDate = findVal(row, ['Ultima Data Compra', 'Data Compra', 'Última Data', 'Data', 'Data de Compra', 'Ult. Compra', 'Compra', 'Dt Compra']) || "";
          const pPayMethod = findVal(row, ['Forma de Pagamento', 'Pagamento', 'Pagto', 'Forma Pagto', 'Meio de Pagamento', 'Tipo de Pagamento', 'Condicao', 'Condição de Pagamento']) || "";

          if ((sName || pName) && pName) {
            const finalSName = (sName || 'DIVERSOS').toString().trim().toUpperCase();

            if (!newSuppliersMap[finalSName]) {
              newSuppliersMap[finalSName] = {
                id: generateId(),
                name: finalSName,
                phone: sPhone.toString(),
                products: []
              };
            }
            newSuppliersMap[finalSName].products.push({
              name: pName.toString(),
              price: pPrice,
              category: pCat.toString(),
              lastPurchaseDate: pLastDate.toString(),
              paymentMethod: pPayMethod.toString(),
              code: ''
            });
          }
        });

        onDataLoaded(newSuppliersMap);
        // Clear input value so same file can be selected again
        e.target.value = '';
      } catch (err) {
        console.error('Erro na importação:', extractErrorMessage(err));
        addNotification('Erro ao processar arquivo Excel', 0);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const performImport = async (data: Record<string, Supplier>, replace: boolean, deleteAllSuppliers: () => Promise<void>) => {
    try {
      if (replace) {
        await deleteAllSuppliers();
      }

      const existingSuppliersMap = new Map(suppliers.map(s => [s.name.trim().toUpperCase(), s]));
      const importedSuppliers = Object.values(data);
      let addedCount = 0;
      let updatedCount = 0;

      for (const supplier of importedSuppliers) {
        const normalizedName = supplier.name.trim().toUpperCase();
        const existingSupplier = existingSuppliersMap.get(normalizedName);

        // Se não for substituir e o fornecedor já existir, mesclamos os produtos
        if (!replace && existingSupplier) {
          const updatedSupplier: Supplier = { ...existingSupplier };
          const pMap = new Map<string, number>(); 
          updatedSupplier.products.forEach((p, idx) => pMap.set(p.name.trim().toUpperCase(), idx));

          let changed = false;
          supplier.products.forEach(newP => {
            const pKey = newP.name.trim().toUpperCase();
            if (pMap.has(pKey)) {
              const existingIdx = pMap.get(pKey)!;
              const oldP = updatedSupplier.products[existingIdx];
              
              // Verifica se houve mudança real nos dados do produto
              if (oldP.price !== newP.price || 
                  oldP.category !== newP.category || 
                  oldP.paymentMethod !== newP.paymentMethod ||
                  oldP.lastPurchaseDate !== newP.lastPurchaseDate) {
                updatedSupplier.products[existingIdx] = { ...newP };
                changed = true;
              }
            } else {
              // Produto novo para fornecedor existente
              updatedSupplier.products.push({ ...newP });
              changed = true;
            }
          });

          if (changed) {
            await saveSupplier(updatedSupplier);
            updatedCount++;
          }
          continue;
        }

        // Se for substituir ou se for um fornecedor totalmente novo
        await saveSupplier(supplier);
        addedCount++;
      }

      if (addedCount === 0 && updatedCount === 0 && !replace) {
        addNotification('Nenhuma alteração necessária. Tudo está atualizado.', 0);
      } else {
        let msg = replace ? 'Lista substituída com sucesso!' : 'Sincronização concluída!';
        if (!replace) {
          msg = `Sincronização: ${addedCount} novos e ${updatedCount} atualizados.`;
        }
        addNotification(msg, addedCount + updatedCount);
      }
    } catch (err) {
      console.error('Erro na execução da importação:', extractErrorMessage(err));
      addNotification('Erro ao salvar dados importados', 0);
    }
  };

  const handleSyncSheets = async (onDataLoaded: (data: Record<string, Supplier>) => void) => {
    const SHEET_ID = "1EarQhvZBT65Ptf-LULWnAfS844WSL7i8mryNRmt-qDY";
    
    const parseCsvData = (csvText: string): Record<string, Supplier> => {
      const parsed = Papa.parse(csvText, { header: true, skipEmptyLines: true });
      const rawData = parsed.data as any[];
      const suppliersMap: Record<string, Supplier> = {};

      const findVal = (row: any, keywords: string[]) => {
        const keys = Object.keys(row);
        const match = keys.find(k => {
          const cleanK = k.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return keywords.some(kw => {
            const cleanKW = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return cleanK === cleanKW || cleanK.includes(cleanKW);
          });
        });
        return match ? row[match] : null;
      };

      rawData.forEach((row: any) => {
        const sNameRaw = findVal(row, ['Empresa Razão Social', 'Fornecedor', 'Empresa', 'Razão Social', 'Nome da Empresa']);
        const sPhone = findVal(row, ['Telefone', 'WhatsApp', 'Celular', 'Contato']) || '';
        const pName = findVal(row, ['Produto', 'Nome', 'Nome do Produto', 'Descrição', 'Item']);
        const rawPrice = findVal(row, ['Valor Unitário', 'Preço Unitário', 'Preço', 'Valor', 'Preço de Custo', 'Custo']);
        const category = findVal(row, ['Categoria', 'Grupo', 'Seção']) || 'Fornecedor';
        const lastPurchaseDate = findVal(row, ['Ultima Data Compra', 'Data Compra', 'Última Data', 'Data', 'Data de Compra', 'Ult. Compra', 'Compra', 'Dt Compra']) || "";
        const paymentMethod = findVal(row, ['Forma de Pagamento', 'Pagamento', 'Pagto', 'Forma Pagto', 'Meio de Pagamento', 'Tipo de Pagamento', 'Condicao', 'Condição de Pagamento']) || "";

        if (sNameRaw && pName) {
          const sName = String(sNameRaw).trim().toUpperCase();
          let pPrice = 0;
          if (typeof rawPrice === 'number') {
            pPrice = rawPrice;
          } else if (rawPrice) {
            const strPrice = String(rawPrice).trim()
              .replace('R$', '')
              .replace(/\s/g, '');
            
            if (strPrice.includes(',') && strPrice.includes('.')) {
              // Formato europeu/brasileiro (ex: 1.234,56)
              pPrice = parseFloat(strPrice.replace(/\./g, '').replace(',', '.'));
            } else if (strPrice.includes(',')) {
              // Formato simples com vírgula (ex: 1234,56)
              pPrice = parseFloat(strPrice.replace(',', '.'));
            } else {
              pPrice = parseFloat(strPrice);
            }
          }

          if (!suppliersMap[sName]) {
            suppliersMap[sName] = {
              id: generateId(),
              name: sName,
              phone: String(sPhone),
              products: []
            };
          }
          suppliersMap[sName].products.push({
            name: String(pName),
            price: isNaN(pPrice) ? 0 : pPrice,
            category: String(category),
            lastPurchaseDate: String(lastPurchaseDate),
            paymentMethod: String(paymentMethod),
            code: ''
          });
        }
      });
      return suppliersMap;
    };

    try {
      addNotification('Sincronizando com Google Sheets...', 0);
      let response = await fetch('/api/excel-sync');
      
      // Fallback: Se o backend retornar 404 ou 500 (provavelmente erro no Vercel ou ambiente sem backend), 
      // tenta buscar diretamente do Google Sheets via Client-Side.
      if (response.status === 404 || response.status === 500) {
        console.warn(`[Sync] Backend retornou ${response.status}. Tentando sincronização direta via Client-Side...`);
        const timestamp = Date.now();
        const urls = [
          `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&t=${timestamp}`,
          `https://docs.google.com/spreadsheets/d/${SHEET_ID}/pub?output=csv&t=${timestamp}`
        ];

        let success = false;
        for (const url of urls) {
          try {
            const res = await fetch(url);
            if (res.ok) {
              const csvText = await res.text();
              if (csvText && !csvText.includes('<!DOCTYPE html>')) {
                const data = parseCsvData(csvText);
                onDataLoaded(data);
                addNotification('Sincronização direta concluída!', 0);
                success = true;
                break;
              }
            }
          } catch (e) {
            console.error(`[SyncDirect] Falha ao acessar ${url}:`, e);
          }
        }

        if (!success) {
          throw new Error('Ambiente sem backend e falha na conexão direta com Google Sheets.');
        }
        return;
      }

      if (!response.ok) {
        let errorMsg = 'Falha na resposta do servidor';
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
          try {
            const body = await response.text();
            if (body) {
              const errData = JSON.parse(body);
              errorMsg = errData.error || errData.message || errorMsg;
            }
          } catch (jsonErr) {
            errorMsg = `Erro ${response.status}: Resposta JSON corrompida`;
          }
        } else {
          try {
            const text = await response.text();
            // Mostra os primeiros 100 caracteres se for HTML para ajudar a diagnosticar
            errorMsg = `Erro ${response.status}: ${text.substring(0, 100)}...`;
          } catch (textErr) {
            errorMsg = `Erro ${response.status}: ${response.statusText || 'Erro desconhecido'}`;
          }
        }
        throw new Error(errorMsg);
      }
      
      const responseBody = await response.text();
      if (!responseBody) {
        throw new Error('Resposta vazia do servidor');
      }
      const resData = JSON.parse(responseBody);
      const { data } = resData;
      if (!data || Object.keys(data).length === 0) {
        addNotification('Nenhum dado encontrado na planilha', 0);
        return;
      }

      // Garantir que todos os fornecedores tenham um ID
      const sanitizedData: Record<string, Supplier> = {};
      Object.entries(data).forEach(([name, supplier]: [string, any]) => {
        sanitizedData[name] = {
          ...supplier,
          id: supplier.id || generateId()
        };
      });

      onDataLoaded(sanitizedData);
    } catch (err) {
      const msg = extractErrorMessage(err);
      console.error('Erro na sincronização:', msg);
      addNotification(`Erro ao sincronizar: ${msg}`, 0);
    }
  };

  return {
    handleExportExcel,
    handleImportExcel,
    handleSyncSheets,
    performImport
  };
};
