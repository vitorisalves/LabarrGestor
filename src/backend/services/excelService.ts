import axios from "axios";
import Papa from 'papaparse';

/**
 * Serviço de Sincronização com Planilhas Google
 */
export class ExcelService {
  /**
   * Busca e processa CSV de uma planilha pública do Google Sheets
   */
  static async syncFromGoogleSheets(sheetId: string) {
    const timestamp = Date.now();
    const urls = [
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&t=${timestamp}`,
      `https://docs.google.com/spreadsheets/d/${sheetId}/pub?output=csv&t=${timestamp}`
    ];
    
    let csvData = "";
    let lastError = "";

    for (const url of urls) {
      try {
        const response = await axios.get(url, { 
          responseType: 'text',
          timeout: 8000, 
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
          }
        });
        
        if (response.status < 400 && typeof response.data === 'string') {
          if (response.data.includes('<!DOCTYPE html>') || response.data.includes('<html')) {
            lastError = "Planilha privada ou requer login.";
            continue;
          }
          csvData = response.data;
          break;
        }
      } catch (e: any) {
        lastError = e.message;
      }
    }

    if (!csvData) throw new Error(lastError || "Falha ao obter CSV");

    const parsed = Papa.parse(csvData, { header: true, skipEmptyLines: true });
    const rawData = Array.isArray(parsed.data) ? parsed.data : [];
    
    if (rawData.length === 0) throw new Error("Planilha vazia");

    const suppliersMap: Record<string, any> = {};

    rawData.forEach((row: any) => {
      const findVal = (row: any, keywords: string[]) => {
        const match = Object.keys(row).find(k => {
          const cleanK = k.toString().trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
          return keywords.some(kw => {
            const cleanKW = kw.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
            return cleanK === cleanKW || cleanK.includes(cleanKW);
          });
        });
        return match ? row[match] : null;
      };

      const sNameRaw = findVal(row, ['Empresa Razão Social', 'Fornecedor', 'Empresa', 'Razão Social']);
      const sPhone = findVal(row, ['Telefone', 'WhatsApp', 'Celular']) || '';
      const pName = findVal(row, ['Produto', 'Nome', 'Descrição', 'Item']);
      const rawPrice = findVal(row, ['Valor Unitário', 'Preço Unitário', 'Preço', 'Custo']);
      const category = findVal(row, ['Categoria', 'Grupo']) || 'Fornecedores';
      const lastPurchaseDate = findVal(row, ['Ultima Data Compra', 'Data Compra', 'Última Data', 'Data', 'Data de Compra', 'Ult. Compra', 'Compra', 'Dt Compra']) || "";
      const paymentMethod = findVal(row, ['Forma de Pagamento', 'Pagamento', 'Pagto', 'Forma Pagto', 'Meio de Pagamento', 'Tipo de Pagamento', 'Condicao', 'Condição de Pagamento']) || "";

      if (sNameRaw && pName) {
        const sName = String(sNameRaw).trim().toUpperCase();
        let pPrice = 0;
        if (typeof rawPrice === 'number') pPrice = rawPrice;
        else if (rawPrice) {
          const str = String(rawPrice).trim().replace('R$', '').replace(/\s/g, '');
          pPrice = str.includes(',') ? parseFloat(str.replace(/\./g, '').replace(',', '.')) : parseFloat(str);
        }

        if (!suppliersMap[sName]) suppliersMap[sName] = { name: sName, phone: sPhone, products: [] };
        suppliersMap[sName].products.push({
          name: pName,
          price: isNaN(pPrice) ? 0 : pPrice,
          category,
          lastPurchaseDate,
          paymentMethod
        });
      }
    });

    return suppliersMap;
  }
}
