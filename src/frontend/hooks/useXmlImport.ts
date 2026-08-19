/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useRef, useCallback } from 'react';
import { Supplier, Product } from '../types';
import { normalizeText } from '../utils';
import { ImportRow } from '../components/suppliers/XmlImportTab';

export interface ParsedNFeProduct {
  cProd: string;
  xProd: string;
  qTrib: number;
  vUnCom: number;
  dhEmi: string;
  nfeKey: string;
  fileName: string;
  xNome: string;
}

export const parseNFeXml = (xmlText: string, fileName: string): ParsedNFeProduct[] => {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(xmlText, "text/xml");

  const parserError = xmlDoc.getElementsByTagName("parsererror");
  if (parserError.length > 0) {
    throw new Error(`Erro ao analisar a estrutura XML de ${fileName}`);
  }

  const infNFeEl = xmlDoc.getElementsByTagName("infNFe")[0];
  let nfeKey = infNFeEl?.getAttribute("Id") || "";
  if (nfeKey.startsWith("NFe")) {
    nfeKey = nfeKey.substring(3);
  }
  if (!nfeKey) {
    nfeKey = xmlDoc.getElementsByTagName("chNFe")[0]?.textContent || "";
  }
  if (!nfeKey) {
    const cNPJ = xmlDoc.getElementsByTagName("CNPJ")[0]?.textContent || "";
    const nNF = xmlDoc.getElementsByTagName("nNF")[0]?.textContent || "";
    nfeKey = cNPJ && nNF ? `${cNPJ}_${nNF}` : `${fileName}_${Date.now()}`;
  }

  const ideEl = xmlDoc.getElementsByTagName("ide")[0];
  const dhEmiRaw = ideEl?.getElementsByTagName("dhEmi")[0]?.textContent || 
                   ideEl?.getElementsByTagName("dEmi")[0]?.textContent || 
                   xmlDoc.getElementsByTagName("dhEmi")[0]?.textContent || 
                   xmlDoc.getElementsByTagName("dEmi")[0]?.textContent || 
                   new Date().toISOString();

  let dhEmi = dhEmiRaw;
  if (dhEmiRaw.includes("T")) {
    dhEmi = dhEmiRaw.split("T")[0];
  }

  const emitEl = xmlDoc.getElementsByTagName("emit")[0];
  const xNome = emitEl?.getElementsByTagName("xNome")[0]?.textContent || 
                xmlDoc.getElementsByTagName("xNome")[0]?.textContent || 
                "FORNECEDOR XML";

  const results: ParsedNFeProduct[] = [];
  const detEls = xmlDoc.getElementsByTagName("det");

  for (let i = 0; i < detEls.length; i++) {
    const det = detEls[i];
    const prodEl = det.getElementsByTagName("prod")[0];
    if (prodEl) {
      const cProd = prodEl.getElementsByTagName("cProd")[0]?.textContent || "";
      const xProd = prodEl.getElementsByTagName("xProd")[0]?.textContent || "";
      
      const qTribText = prodEl.getElementsByTagName("qTrib")[0]?.textContent || "0";
      const qTrib = parseFloat(qTribText.replace(",", ".")) || 0;

      const vUnTribEl = prodEl.getElementsByTagName("vUnTrib")[0];
      const vUnComEl = prodEl.getElementsByTagName("vUnCom")[0];
      const vUnComText = (vUnTribEl && parseFloat(vUnTribEl.textContent?.replace(",", ".") || "0") > 0)
        ? vUnTribEl.textContent || "0"
        : vUnComEl?.textContent || "0";
      const vUnCom = parseFloat(vUnComText.replace(",", ".")) || 0;

      results.push({
        cProd,
        xProd,
        qTrib,
        vUnCom,
        dhEmi,
        nfeKey,
        fileName,
        xNome
      });
    }
  }

  return results;
};

export function useXmlImport(
  allSuppliers: Supplier[],
  saveSupplier: (supplier: Supplier) => Promise<void>,
  addNotification?: (message: string, count: number, type?: 'cart' | 'info') => void
) {
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [xmlLogs, setXmlLogs] = useState<string[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [deletingRowId, setDeletingRowId] = useState<string | null>(null);
  const xmlContentsRef = useRef<Record<string, string>>({});

  const findExactMatch = useCallback((cProd: string, xProd: string) => {
    if (!cProd && !xProd) return null;
    if (cProd) {
      for (const s of allSuppliers) {
        const matchedProduct = s.products.find(p => p.code === cProd);
        if (matchedProduct) {
          return { supplier: s, product: matchedProduct };
        }
      }
    }
    if (xProd) {
      for (const s of allSuppliers) {
        const matchedProduct = s.products.find(p => p.name && normalizeText(p.name) === normalizeText(xProd));
        if (matchedProduct) {
          return { supplier: s, product: matchedProduct };
        }
      }
    }
    return null;
  }, [allSuppliers]);

  const handleXmlFiles = useCallback(async (files: FileList | File[]) => {
    setIsAnalyzing(true);
    const newRows: ImportRow[] = [];
    const logs: string[] = [];
    
    const storedProcessedKeys = localStorage.getItem('processed_nfe_keys');
    const processedKeysList: string[] = storedProcessedKeys ? JSON.parse(storedProcessedKeys) : [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const text = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = (e) => reject(new Error("Erro ao ler o arquivo"));
          reader.readAsText(file);
        });

        const productsParsed = parseNFeXml(text, file.name);
        if (productsParsed.length === 0) {
          logs.push(`Aviso: Nenhum produto encontrado no arquivo ${file.name}`);
          continue;
        }

        const key = productsParsed[0].nfeKey;
        xmlContentsRef.current[key] = text;
        if (processedKeysList.includes(key)) {
          logs.push(`Aviso: XML ${file.name} (Chave: ${key}) já foi importado anteriormente.`);
        }

        productsParsed.forEach((parsedP, index) => {
          const matched = findExactMatch(parsedP.cProd, parsedP.xProd);
          
          let reconciliationType: 'exact' | 'manual' | 'new' = 'new';
          let associatedSupplierId = '';
          let associatedSupplierName = '';
          let associatedProductCode = '';

          if (matched) {
            reconciliationType = 'exact';
            associatedSupplierId = matched.supplier.id || '';
            associatedSupplierName = matched.supplier.name;
            associatedProductCode = matched.product.code || matched.product.name || '';
          }

          newRows.push({
            id: `${key}_${index}_${Date.now()}`,
            cProd: parsedP.cProd,
            xProd: parsedP.xProd,
            qTrib: parsedP.qTrib,
            vUnCom: parsedP.vUnCom,
            dhEmi: parsedP.dhEmi,
            nfeKey: key,
            fileName: file.name,
            xNome: parsedP.xNome,
            reconciliationType,
            associatedSupplierId,
            associatedSupplierName,
            associatedProductCode,
            targetType: 'suppliers',
            targetCategory: matched?.product?.category || 'Ingredientes'
          });
        });

        logs.push(`Sucesso: ${file.name} processado (${productsParsed.length} produtos de det/prod)`);
      } catch (err: any) {
        logs.push(`Erro ao processar ${file.name}: ${err.message}`);
      }
    }

    setImportRows(prev => {
      const ids = new Set(prev.map(r => r.id));
      const filteredNew = newRows.filter(r => !ids.has(r.id));
      return [...prev, ...filteredNew];
    });
    setXmlLogs(prev => [...prev, ...logs]);
    setIsAnalyzing(false);
    
    if (addNotification && newRows.length > 0) {
      addNotification(`Processados ${files.length} arquivos XML.`, newRows.length, 'info');
    }
  }, [addNotification, findExactMatch]);

  const updateRow = useCallback((id: string, updates: Partial<ImportRow>) => {
    setImportRows(prev => prev.map(r => r.id === id ? { ...r, ...updates } : r));
  }, []);

  const handleSaveImport = useCallback(async () => {
    if (importRows.length === 0) return;
    setIsAnalyzing(true);
    
    try {
      let workingSuppliers = [...allSuppliers];
      const newlyImportedNfeKeys = new Set<string>();

      for (const row of importRows) {
        newlyImportedNfeKeys.add(row.nfeKey);

        const newPrice = row.vUnCom;
        const newDate = row.dhEmi;

        if (row.reconciliationType === 'exact' || row.reconciliationType === 'manual') {
          const suppId = row.associatedSupplierId;
          const targetRef = row.associatedProductCode;

          let matchedProductCode = targetRef || '';
          let matchedProductName = targetRef || '';

          if (suppId) {
            const matchedSupp = allSuppliers.find(s => s.id === suppId || s.name === suppId || s.name === row.associatedSupplierName);
            if (matchedSupp) {
              const matchedP = matchedSupp.products.find(p => p.code === targetRef || p.name === targetRef);
              if (matchedP) {
                matchedProductCode = matchedP.code || '';
                matchedProductName = matchedP.name || '';
              }
            }
          }

          workingSuppliers = workingSuppliers.map(s => {
            let supplierChanged = false;
            const updatedProducts = s.products.map(p => {
              const isTargetSupplier = s.id === suppId || s.name === suppId || s.name === row.associatedSupplierName;
              const matchesTargetProduct = isTargetSupplier && (p.code === targetRef || p.name === targetRef);

              const matchesCode = (matchedProductCode && p.code === matchedProductCode) || (row.cProd && p.code === row.cProd);
              const matchesName = (matchedProductName && normalizeText(p.name) === normalizeText(matchedProductName)) ||
                                  (row.xProd && normalizeText(p.name) === normalizeText(row.xProd));

              if (matchesTargetProduct || matchesCode || matchesName) {
                supplierChanged = true;
                const updatedProduct = {
                  ...p,
                  price: newPrice,
                  lastPurchaseDate: newDate,
                  ...(row.targetCategory ? { category: row.targetCategory } : {})
                };
                if (!p.code && row.cProd) {
                  updatedProduct.code = row.cProd;
                } else if (!p.code && matchedProductCode) {
                  updatedProduct.code = matchedProductCode;
                }
                return updatedProduct;
              }
              return p;
            });
            return supplierChanged ? { ...s, products: updatedProducts } : s;
          });

          // Propagação simultânea de preço, data e categoria para todas as entidades
          if (row.targetCategory) {
            const newCat = row.targetCategory;
            workingSuppliers = workingSuppliers.map(s => {
              let changed = false;
              const updatedProducts = s.products.map(p => {
                const codeMatches = (row.cProd && p.code === row.cProd) || (matchedProductCode && p.code === matchedProductCode);
                const nameMatches = (row.xProd && normalizeText(p.name) === normalizeText(row.xProd)) || (matchedProductName && normalizeText(p.name) === normalizeText(matchedProductName));
                if (codeMatches || nameMatches) {
                  changed = true;
                  return {
                    ...p,
                    price: newPrice,
                    lastPurchaseDate: newDate,
                    category: newCat
                  };
                }
                return p;
              });
              return changed ? { ...s, products: updatedProducts } : s;
            });
          }

        } else {
          const targetType = row.targetType;
          let targetSupplierName = '';

          if (targetType === 'mercado') {
            targetSupplierName = 'MERCADO';
          } else if (targetType === 'materiais') {
            targetSupplierName = 'MATERIAIS';
          } else {
            if (row.targetSupplierId && row.targetSupplierId !== 'novo') {
              const existingS = workingSuppliers.find(s => s.id === row.targetSupplierId);
              targetSupplierName = existingS ? existingS.name : (row.xNome || 'FORNECEDOR XML');
            } else {
              targetSupplierName = row.xNome || 'FORNECEDOR XML';
            }
          }

          const newProduct: Product = {
            code: row.cProd || `XML_${row.nfeKey.substring(0, 4)}_${row.id.substring(0, 4)}`,
            name: row.xProd,
            price: newPrice,
            category: row.targetCategory || 'Ingredientes',
            lastPurchaseDate: newDate
          };

          let supplierIndex = workingSuppliers.findIndex(s => s.name.toUpperCase() === targetSupplierName.toUpperCase());
          
          if (supplierIndex === -1) {
            const newSupplier: Supplier = {
              id: `XML_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              name: targetSupplierName,
              phone: '00000000000',
              products: [newProduct]
            };
            workingSuppliers.push(newSupplier);
          } else {
            const existingS = workingSuppliers[supplierIndex];
            const existingPIndex = existingS.products.findIndex(p => normalizeText(p.name) === normalizeText(newProduct.name));
            if (existingPIndex === -1) {
              const updatedS = {
                ...existingS,
                products: [...existingS.products, newProduct]
              };
              workingSuppliers[supplierIndex] = updatedS;
            } else {
              const updatedProducts = [...existingS.products];
              updatedProducts[existingPIndex] = {
                ...updatedProducts[existingPIndex],
                price: newPrice,
                lastPurchaseDate: newDate,
                code: newProduct.code
              };
              workingSuppliers[supplierIndex] = {
                ...existingS,
                products: updatedProducts
              };
            }
          }

          workingSuppliers = workingSuppliers.map(s => {
            if (s.name.toUpperCase() === targetSupplierName.toUpperCase()) return s;
            
            let changed = false;
            const updatedProducts = s.products.map(p => {
              const codeMatches = newProduct.code && p.code === newProduct.code;
              const nameMatches = newProduct.name && normalizeText(p.name) === normalizeText(newProduct.name);
              if (codeMatches || nameMatches) {
                changed = true;
                return {
                  ...p,
                  price: newPrice,
                  lastPurchaseDate: newDate
                };
              }
              return p;
            });
            return changed ? { ...s, products: updatedProducts } : s;
          });
        }
      }

      const modifiedSuppliers = workingSuppliers.filter(supplier => {
        const original = allSuppliers.find(s => s.id === supplier.id || s.name === supplier.name);
        if (!original) return true;
        
        if (original.products.length !== supplier.products.length) return true;
        for (let i = 0; i < original.products.length; i++) {
          const op = original.products[i];
          const sp = supplier.products[i];
          if (
            op.code !== sp.code ||
            op.name !== sp.name ||
            op.price !== sp.price ||
            op.lastPurchaseDate !== sp.lastPurchaseDate ||
            op.category !== sp.category
          ) {
            return true;
          }
        }
        return false;
      });

      await Promise.all(modifiedSuppliers.map(supplier => saveSupplier(supplier)));

      // Sincroniza todas as notas fiscais XML novas com o banco central de faturas/invoices do Dashboard
      const syncPromises = Array.from(newlyImportedNfeKeys).map(async (nfeKey) => {
        const rawXml = xmlContentsRef.current[nfeKey];
        if (rawXml) {
          try {
            await fetch('/api/xml/process', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ xmlData: rawXml })
            });
          } catch (apiErr) {
            console.error(`Erro ao sincronizar nota ${nfeKey} com banco central:`, apiErr);
          }
        }
      });
      await Promise.all(syncPromises);

      const storedProcessedKeys = localStorage.getItem('processed_nfe_keys');
      const processedKeysList: string[] = storedProcessedKeys ? JSON.parse(storedProcessedKeys) : [];
      newlyImportedNfeKeys.forEach(k => processedKeysList.push(k));
      localStorage.setItem('processed_nfe_keys', JSON.stringify(processedKeysList));

      if (addNotification) {
        addNotification("Importação finalizada! Preços e datas de compra propagados simultaneamente.", importRows.length, 'info');
      }

      setImportRows([]);
      setXmlLogs([]);
    } catch (error: any) {
      console.error("Erro ao persistir importação XML:", error);
      if (addNotification) {
        addNotification(`Erro ao persistir: ${error.message}`, 0);
      }
    } finally {
      setIsAnalyzing(false);
    }
  }, [importRows, allSuppliers, saveSupplier, addNotification]);

  return {
    importRows,
    setImportRows,
    isAnalyzing,
    xmlLogs,
    setXmlLogs,
    dragActive,
    setDragActive,
    deletingRowId,
    setDeletingRowId,
    handleXmlFiles,
    handleSaveImport,
    updateRow,
    findExactMatch
  };
}
