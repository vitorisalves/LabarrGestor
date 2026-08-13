import { GoogleGenAI, Type } from "@google/genai";
import { AI_CONFIG } from "../config.js";

/**
 * Serviço de IA utilizando Google Gemini
 */
export class AIService {
  private static instance: GoogleGenAI | null = null;

  private static getInstance() {
    if (!this.instance) {
      if (!AI_CONFIG.apiKey) {
        throw new Error("GEMINI_API_KEY não configurada no servidor.");
      }
      this.instance = new GoogleGenAI({ apiKey: AI_CONFIG.apiKey });
    }
    return this.instance;
  }

  private static parseJson(text: string | undefined): any {
    if (!text) return {};
    
    // Remove markdown code blocks if present
    let cleanText = text.trim();
    if (cleanText.startsWith('```')) {
      const match = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
      if (match) {
        cleanText = match[1];
      }
    }
    
    try {
      return JSON.parse(cleanText);
    } catch (e) {
      console.warn("[AIService] Direct parse failed, trying to find JSON boundaries", e);
      const start = cleanText.indexOf('{');
      const end = cleanText.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) {
        try {
          return JSON.parse(cleanText.substring(start, end + 1));
        } catch (e2) {
          console.error("[AIService] Failed to extract JSON from text:", cleanText);
          return {};
        }
      }
      return {};
    }
  }

  /**
   * Mapeia itens da lista de compras para a planilha de metas
   */
  static async matchDashboard(spreadsheetNames: string[], shoppingItemNames: string[]) {
    const ai = this.getInstance();
    const prompt = `
      Mapeie os nomes dos itens da LISTA DE COMPRAS para os nomes oficiais da PLANILHA DE METAS.
      
      RETORNE APENAS UM JSON no seguinte formato:
      {
        "NOME_NA_LISTA": "NOME_OFICIAL_NA_PLANILHA"
      }

      PLANILHA (Nomes Oficiais):
      ${spreadsheetNames.join('\n')}

      LISTA (Nomes Manuais):
      ${shoppingItemNames.join('\n')}
    `;

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.1
      }
    });

    const text = response.candidates && response.candidates[0]?.content?.parts?.[0]?.text;
    return this.parseJson(text);
  }

  /**
   * Extrai produtos e preços de documentos (Notas Fiscais)
   */
  static async processDocument(
    fileData?: { mimeType: string; data: string },
    promptText?: string,
    existingProductNames?: string[]
  ) {
    const ai = this.getInstance();
    const parts: any[] = [];
    
    if (fileData) {
      parts.push({
        inlineData: {
          mimeType: fileData.mimeType,
          data: fileData.data
        }
      });
    }

    parts.push({ text: promptText || "Extraia itens e preços." });

    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: { parts },
      config: {
        systemInstruction: `
          Aja como um extrator de dados ultra-rápido de notas fiscais.
          META: Retornar JSON de produtos com preço unitário.
          ${existingProductNames && existingProductNames.length > 0 ? `\n\nLISTA DE PRODUTOS EXISTENTES (PARA MATCHING):\n${existingProductNames.join(", ")}` : ""}
          REGRAS:
          1. "name": Se o item for similar a um da "LISTA DE PRODUTOS EXISTENTES", use EXATAMENTE o nome da lista. Caso contrário, use o nome lido.
          2. "rawName": Nome bruto como está no documento.
        `,
        responseMimeType: "application/json",
        temperature: 0.1,
        topP: 0.8,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            products: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  rawName: { type: Type.STRING },
                  price: { type: Type.NUMBER },
                  quantity: { type: Type.NUMBER },
                  category: { type: Type.STRING },
                  supplierName: { type: Type.STRING },
                  lastPurchaseDate: { type: Type.STRING, description: "Data da compra/emissão" },
                  paymentMethod: { type: Type.STRING, description: "Dinheiro, Cartão, Pix, Boleto, etc" }
                },
                required: ["name", "rawName", "price"]
              }
            }
          },
          required: ["products"]
        }
      }
    });

    const text = response.candidates && response.candidates[0]?.content?.parts?.[0]?.text;
    const parsed = this.parseJson(text);
    return parsed.products || [];
  }
}
