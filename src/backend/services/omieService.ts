import axios, { AxiosInstance } from "axios";
import { EXTERNAL_API_CONFIG } from "../config.js";

/**
 * Serviço de Integração com API Externa (Omie/Proxy)
 */
export class OmieService {
  private static api: AxiosInstance = axios.create({
    timeout: 30000,
    validateStatus: () => true,
  });

  private static getHeaders() {
    return {
      'Content-Type': 'application/json',
      ...(EXTERNAL_API_CONFIG.appKey ? { 'x-omie-app-key': EXTERNAL_API_CONFIG.appKey } : {}),
      ...(EXTERNAL_API_CONFIG.appSecret ? { 'x-omie-app-secret': EXTERNAL_API_CONFIG.appSecret } : {}),
    };
  }

  /**
   * Busca páginas de forma recursiva/paginada
   */
  static async fetchAllPages(endpoint: string): Promise<any[]> {
    const pageSize = 100;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    
    const baseUrlsToTry = [
      EXTERNAL_API_CONFIG.baseUrl,
      EXTERNAL_API_CONFIG.baseUrl.replace(/\/v1$/, ''),
      EXTERNAL_API_CONFIG.baseUrl.replace(/\/v1$/, '/api/v1'),
    ].filter((v, i, a) => a.indexOf(v) === i);

    for (const baseUrl of baseUrlsToTry) {
      const fullUrl = `${baseUrl}${cleanEndpoint}`;
      const firstUrl = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}${new URLSearchParams({ page: '1', pageSize: String(pageSize) }).toString()}`;
      
      const firstRes = await this.api.get(firstUrl, { headers: this.getHeaders() });
      
      if (firstRes.status < 400) {
        const { data: firstData } = firstRes;
        const results = Array.isArray(firstData) ? [...firstData] : [...(firstData.data || [])];
        const { total = 0, pageSize: actualSize = pageSize } = firstData.meta || {};

        if (total > actualSize) {
          const totalPages = Math.ceil(total / actualSize);
          const pageNumbers = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);
          
          for (let i = 0; i < pageNumbers.length; i += 5) {
            const batch = pageNumbers.slice(i, i + 5);
            const batchResults = await Promise.all(batch.map(async (page) => {
              try {
                const pUrl = `${fullUrl}${fullUrl.includes('?') ? '&' : '?'}${new URLSearchParams({ page: String(page), pageSize: String(actualSize) }).toString()}`;
                const res = await this.api.get(pUrl, { headers: this.getHeaders() });
                return Array.isArray(res.data) ? res.data : (res.data.data || []);
              } catch (e) { return []; }
            }));
            batchResults.forEach(list => results.push(...list));
          }
        }
        return results;
      }
    }
    return [];
  }

  /**
   * Proxy genérico para a API
   */
  static async proxyRequest(method: string, subPath: string, body: any, queryString: string) {
    const { baseUrl } = EXTERNAL_API_CONFIG;
    let apiUrl = `${baseUrl}/${subPath}${queryString}`;

    let response = await this.api({
      method,
      url: apiUrl,
      data: body,
      headers: this.getHeaders()
    });
    
    if (response.status === 404 && subPath.startsWith('omie/')) {
      apiUrl = `${baseUrl}/${subPath.replace(/^omie\//, '')}${queryString}`;
      response = await this.api({
        method,
        url: apiUrl,
        data: body,
        headers: this.getHeaders()
      });
    }
    
    return response;
  }
}
