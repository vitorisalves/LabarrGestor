
import { GoogleGenAI, Type } from "@google/genai";
import { Supplier, DeliveredProduct } from "../frontend/types";

export interface ExtractedProduct {
  name: string;
  rawName: string;
  price: number;
  quantity?: number;
  category?: string;
  supplierName?: string;
  lastPurchaseDate?: string;
  paymentMethod?: string;
}

export type AIActionType = 'UPDATE_PRICES' | 'CREATE_PRODUCTS' | 'UPDATE_DELIVERY_DATES' | 'CREATE_SHOPPING_LIST' | 'CHAT';

export interface AIResponse {
  action: AIActionType;
  explanation: string;
  data?: {
    products?: ExtractedProduct[];
    supplierName?: string;
    listName?: string;
    deliveryUpdates?: Array<{ id: string; forecastDate: string; name: string }>;
    shoppingItems?: Array<{ name: string; quantity: number; supplierName?: string }>;
  };
}

/**
 * AI Instance following skill guidelines
 */
const getAI = () => {
  const apiKey = process.env.GEMINI_API_KEY || "";
  return new GoogleGenAI({ apiKey });
};

/**
 * Compresses and resizes an image before sending to AI to improve speed.
 */
const compressImage = async (base64Str: string, maxWidth = 1024): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.src = base64Str;
    img.onload = () => {
      const canvas = document.createElement('canvas');
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (maxWidth / width) * height;
        width = maxWidth;
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      
      resolve(canvas.toDataURL('image/jpeg', 0.8).split(',')[1]);
    };
  });
};

/**
 * Helper to parse JSON from AI response
 */
const parseJson = (text: string | undefined): any => {
  if (!text) return {};
  
  let cleanText = text.trim();
  if (cleanText.startsWith('```')) {
    const match = cleanText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (match) cleanText = match[1];
  }
  
  try {
    return JSON.parse(cleanText);
  } catch (e) {
    const start = cleanText.indexOf('{');
    const end = cleanText.lastIndexOf('}');
    if (start !== -1 && end !== -1 && end > start) {
      try {
        return JSON.parse(cleanText.substring(start, end + 1));
      } catch (e2) {}
    }
    return {};
  }
};

/**
 * Process document using Gemini AI directly from frontend.
 */
export const processDocumentWithAI = async (
  fileData?: { mimeType: string; data: string },
  promptText?: string,
  existingProductNames?: string[]
): Promise<ExtractedProduct[]> => {
  try {
    const ai = getAI();
    const parts: any[] = [];
    
    if (fileData) {
      let data = fileData.data;
      if (fileData.mimeType.startsWith('image/')) {
        data = await compressImage(`data:${fileData.mimeType};base64,${data}`);
      }
      parts.push({
        inlineData: {
          mimeType: fileData.mimeType.startsWith('image/') ? 'image/jpeg' : fileData.mimeType,
          data
        }
      });
    }

    parts.push({ text: promptText || "Extraia itens e preços." });

    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents: { parts },
      config: {
        systemInstruction: `
          Aja como um extrator de dados ultra-rápido de notas fiscais.
          META: Retornar JSON de produtos com preço unitário.
          ${existingProductNames && existingProductNames.length > 0 ? `\n\nLISTA DE PRODUTOS EXISTENTES (PARA MATCHING):\n${existingProductNames.join(", ")}` : ""}
          REGRAS:
          1. "name": Se o item for similar a um da "LISTA DE PRODUTOS EXISTENTES", use EXATAMENTE o nome da lista. Caso contrário, use o nome lido.
          2. "rawName": Nome bruto como está no documento.
          3. "quantity": Calcule o valor total se o nome contiver unidade de medida (ex: '50g', '1litro') multiplicada pela quantidade de itens (ex: Se 'Pimenta 50g' e quantidade 6, o 'quantity' deve ser 300).
        `,
        responseMimeType: "application/json",
        temperature: 0.0,
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

    const parsed = parseJson(response.text);
    return parsed.products || [];
  } catch (error: any) {
    console.error("Gemini Frontend Error:", error);
    // Fallback to backend if frontend fails (maybe key not set in Vercel public env)
    // but the user says backend is what fails on Vercel. 
    // Let's try to handle the error gracefully.
    const msg = error?.message || String(error);
    if (msg.includes("API key not valid") || msg.includes("not found")) {
      throw new Error("API Key do Gemini não configurada ou inválida.");
    }
    throw error;
  }
};

/**
 * AI Product matching directly from frontend.
 */
export const matchDashboardWithAI = async (
  spreadsheetNames: string[],
  shoppingItemNames: string[]
): Promise<Record<string, string>> => {
  try {
    const ai = getAI();
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
      model: "gemini-3.1-flash-lite",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        temperature: 0.0
      }
    });

    return parseJson(response.text);
  } catch (error) {
    console.error("Match AI Error:", error);
    return {};
  }
};

/**
 * Advanced general-purpose AI assistant
 */
export const processCommandWithAI = async (
  command: string,
  context: {
    suppliers?: Supplier[];
    deliveredProducts?: DeliveredProduct[];
    fileData?: { mimeType: string, data: string };
  }
): Promise<AIResponse> => {
  try {
    const ai = getAI();
    const parts: any[] = [];
    
    if (context.fileData) {
      let data = context.fileData.data;
      if (context.fileData.mimeType.startsWith('image/')) {
        data = await compressImage(`data:${context.fileData.mimeType};base64,${data}`);
      }
      parts.push({
        inlineData: {
          mimeType: context.fileData.mimeType.startsWith('image/') ? 'image/jpeg' : context.fileData.mimeType,
          data
        }
      });
    }

    parts.push({ text: `Comando do usuário: "${command}"` });

    const suppliersSummary = context.suppliers?.map(s => `- ${s.name} (${s.products.length} produtos)`).join('\n') || "Nenhum fornecedor.";
    const deliveredSummary = context.deliveredProducts?.filter(p => !p.delivered).map(p => `- [${p.id}] ${p.name} (Fornecedor: ${p.supplierName}, Previsão: ${p.forecastDate})`).join('\n') || "Nenhuma entrega pendente.";

    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: { parts },
      config: {
        systemInstruction: `
          Você é o cérebro do sistema LABARR. Você deve interpretar o comando do usuário e decidir qual ação tomar.
          
          CONTEXTO DO SISTEMA:
          FORNECEDORES:
          ${suppliersSummary}
          
          ENTREGAS PENDENTES:
          ${deliveredSummary}
          
          AÇÕES DISPONÍVEIS:
          1. UPDATE_PRICES: Use quando o usuário enviar uma nota fiscal (arquivo/foto) para atualizar preços ou quando pedir para mudar o preço de um item específico.
          2. CREATE_PRODUCTS: Use quando o usuário pedir para cadastrar novos produtos. Pode ser para um fornecedor novo ou existente.
          3. UPDATE_DELIVERY_DATES: Use quando o usuário pedir para mudar a previsão de entrega de itens específicos.
          4. CREATE_SHOPPING_LIST: Use quando o usuário pedir para montar uma lista de compras.
          5. CHAT: Use para conversas gerais ou dúvidas sobre o sistema.
          
          REGRAS IMPORTANTES PARA CADASTRO DE FORNECEDORES E PRODUTOS:
          - Se o usuário solicitar a criação de um novo fornecedor ou novos produtos para um fornecedor específico (como "Crie esses produtos no fornecedor ROQUE LIMA..."), você DEVE selecionar a ação "CREATE_PRODUCTS".
          - Extraia o nome exato do fornecedor para a propriedade "supplierName" no objeto principal "data".
          - Extraia todos os produtos informados com seus respectivos preços ("price") e preencha a lista de "products".
          - REQUISITO CRÍTICO DE FORMATAÇÃO DE PREÇOS: O campo "price" deve ser um valor numérico (Type.NUMBER) com separador decimal de ponto (.). Exemplo: se o preço for "R$ 9,99", converta rigorosamente para o número 9.99. Se for "R$ 1.250,50", converta para 1250.50. Nunca coloque strings, símbolos como "R$" ou vírgulas no campo "price".
          - Para cada produto na lista de "products", certifique-se de preencher a propriedade "supplierName" de forma correspondente com o nome do fornecedor fornecido ou detectado.
          
          REGRA DE RESPOSTA: RETORNE APENAS JSON.
        `,
        responseMimeType: "application/json",
        temperature: 0.0,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            action: { type: Type.STRING, enum: ["UPDATE_PRICES", "CREATE_PRODUCTS", "UPDATE_DELIVERY_DATES", "CREATE_SHOPPING_LIST", "CHAT"] },
            explanation: { type: Type.STRING, description: "O que você está fazendo ou resposta ao chat." },
            data: {
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
                      lastPurchaseDate: { type: Type.STRING },
                      paymentMethod: { type: Type.STRING }
                    },
                    required: ["name", "price"]
                  }
                },
                supplierName: { type: Type.STRING },
                listName: { type: Type.STRING },
                deliveryUpdates: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      id: { type: Type.STRING, description: "ID exato do produto entregue do contexto fornecido" },
                      name: { type: Type.STRING },
                      forecastDate: { type: Type.STRING, description: "Nova data no formato DD/MM/AAAA" }
                    },
                    required: ["id", "forecastDate"]
                  }
                },
                shoppingItems: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      name: { type: Type.STRING },
                      quantity: { type: Type.NUMBER },
                      supplierName: { type: Type.STRING }
                    },
                    required: ["name", "quantity"]
                  }
                }
              }
            }
          },
          required: ["action", "explanation"]
        }
      }
    });

    return parseJson(response.text);
  } catch (error) {
    console.error("AI Assistant Error:", error);
    throw error;
  }
};
