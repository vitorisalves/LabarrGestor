import { XMLParser } from 'fast-xml-parser';

export class XMLService {
  private parser: XMLParser;

  constructor() {
    this.parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_"
    });
  }

  private getQuantity(val: any): string {
    if (val === undefined || val === null) return "0";
    if (typeof val === 'object') {
      if ("#text" in val) return (val["#text"] || "").toString();
      // Try to return the first value found if it's an object but not #text
      const values = Object.values(val);
      if (values.length > 0) return this.getQuantity(values[0]);
    }
    return val.toString();
  }

  private extractQuantity(prod: any): number {
    if (!prod) return 0;
    
    // Check specific fields that might hold quantity
    const fields = ['qTrib', 'qCom', 'qUnid', 'qVol', 'qBC'];
    for (const field of fields) {
        if (field in prod) {
            const strVal = this.getQuantity(prod[field]);
            const parsed = parseFloat(strVal.replace(',', '.'));
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
    }

    // Fallback: scan all keys
    for (const key in prod) {
        if (key.toLowerCase().startsWith('q')) {
            const strVal = this.getQuantity(prod[key]);
            const parsed = parseFloat(strVal.replace(',', '.'));
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
    }
    
    return 0;
  }

  private getVal(val: any): string {
    if (val === undefined || val === null) return "0";
    if (typeof val === 'object') {
      if ("#text" in val) return (val["#text"] || "").toString();
      const values = Object.values(val);
      if (values.length > 0) return this.getVal(values[0]);
    }
    return val.toString();
  }

  private extractPrice(prod: any): number {
    if (!prod) return 0;
    const fields = ['vUnTrib', 'vUnCom'];
    for (const field of fields) {
        if (field in prod) {
            const strVal = this.getVal(prod[field]);
            const parsed = parseFloat(strVal.replace(',', '.'));
            if (!isNaN(parsed) && parsed > 0) return parsed;
        }
    }
    return 0;
  }

  public parseNFe(xmlData: string) {
    const jsonObj = this.parser.parse(xmlData);
    
    // Find infNFe in deeply nested structure
    let nfe = jsonObj.nfeProc?.NFe?.infNFe || jsonObj.NFe?.infNFe;
    
    // Fallback search
    if (!nfe) {
        const findInfNFe = (obj: any): any => {
            if (obj && typeof obj === 'object') {
                if ('infNFe' in obj) return obj.infNFe;
                for (const key in obj) {
                    const res = findInfNFe(obj[key]);
                    if (res) return res;
                }
            }
            return null;
        }
        nfe = findInfNFe(jsonObj);
    }

    if (!nfe) {
        throw new Error("Não foi possível encontrar a estrutura infNFe no XML.");
    }

    const rawId = nfe["@_Id"] || (nfe.emit?.CNPJ ? `${nfe.emit.CNPJ}_${nfe.ide?.nNF}` : null) || nfe.ide?.nNF || `unknown_${Date.now()}`;
    let id = rawId;
    if (id.startsWith("NFe")) {
      id = id.substring(3);
    }
    const supplierName = nfe.emit?.xNome || "Desconhecido";
    const items = nfe.det;
    
    // Extrai o valor total da NF-e (vNF) e desconto total (vDesc) para gastos mensais e rateio
    let vTotTrib = 0;
    let totalHeaderDiscount = 0;
    try {
      const totalObj = nfe.total || {};
      const icmsTot = totalObj.ICMSTot || {};
      const valStr = String(icmsTot.vNF || icmsTot.vTotTrib || "0");
      vTotTrib = parseFloat(valStr.replace(',', '.')) || 0;
      const descStr = String(icmsTot.vDesc || "0");
      totalHeaderDiscount = parseFloat(descStr.replace(',', '.')) || 0;
    } catch (e) {
      console.warn("Erro ao extrair valor total ou desconto da nota no XMLService:", e);
    }
    
    const rawItems = Array.isArray(items) ? items : items ? [items] : [];

    // 1. Extração bruta dos itens
    const parsedItems = rawItems.map(item => {
      const prod = item.prod || {};
      const quantity = this.extractQuantity(prod);
      const rawVUnCom = parseFloat(this.getVal(prod.vUnCom).replace(',', '.')) || parseFloat(this.getVal(prod.vUnTrib).replace(',', '.')) || 0;
      const rawVUnTrib = parseFloat(this.getVal(prod.vUnTrib).replace(',', '.')) || parseFloat(this.getVal(prod.vUnCom).replace(',', '.')) || 0;
      const rawVProd = parseFloat(this.getVal(prod.vProd).replace(',', '.')) || (quantity * rawVUnCom);
      const itemDiscount = parseFloat(this.getVal(prod.vDesc).replace(',', '.')) || 0;

      return {
        code: prod.cProd || "N/A",
        name: prod.xProd || "N/A",
        quantity,
        qTrib: this.getQuantity(prod.qTrib),
        price: rawVUnCom,
        vUnComGross: rawVUnCom,
        vUnTrib: rawVUnTrib,
        rawVProd,
        itemDiscount
      };
    });

    // 2. Cálculo do total bruto e rateio proporcional de descontos do cabeçalho
    const totalGrossVal = parsedItems.reduce((acc, i) => acc + i.rawVProd, 0);
    const sumItemDiscounts = parsedItems.reduce((acc, i) => acc + i.itemDiscount, 0);
    const unassignedHeaderDiscount = Math.max(0, totalHeaderDiscount - sumItemDiscounts);

    const products = parsedItems.map(item => {
      const share = totalGrossVal > 0 ? (item.rawVProd / totalGrossVal) : (1 / (parsedItems.length || 1));
      const totalDiscountForItem = item.itemDiscount + (unassignedHeaderDiscount * share);
      const netTotalVal = Math.max(0, item.rawVProd - totalDiscountForItem);
      const netVUnCom = item.quantity > 0 ? (netTotalVal / item.quantity) : item.vUnComGross;

      return {
        code: item.code,
        name: item.name,
        quantity: item.quantity,
        qTrib: item.qTrib,
        price: netVUnCom, // Preço unitário líquido com desconto
        vUnCom: netVUnCom, // Preço unitário líquido com desconto
        vUnComGross: item.vUnComGross, // Preço unitário bruto original
        vUnTrib: item.vUnTrib,
        discount: totalDiscountForItem, // Valor do desconto proporcional do item
        totalGross: item.rawVProd,
        totalNet: netTotalVal
      };
    });

    return {
      id,
      supplierName,
      date: nfe.ide?.dhEmi || new Date().toISOString(),
      vTotTrib,
      products
    };
  }
}
