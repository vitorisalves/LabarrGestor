/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { auth } from './firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function cleanObject<T extends object>(obj: T): T {
  const result = { ...obj } as any;
  Object.keys(result).forEach(key => {
    if (result[key] === undefined) {
      delete result[key];
    } else if (typeof result[key] === 'object' && result[key] !== null) {
      if (Array.isArray(result[key])) {
        result[key] = result[key].map((item: any) =>
          typeof item === 'object' && item !== null ? cleanObject(item) : item
        );
      } else {
        result[key] = cleanObject(result[key]);
      }
    }
  });
  return result;
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  const stringified = safeStringify(errInfo);
  
  // Skip throwing for NOT_FOUND / 404
  const errMsgLower = errInfo.error.toLowerCase();
  if (errMsgLower.includes('not found') || errMsgLower.includes('404')) {
    console.warn('Firestore Warn (Not Found): ', stringified);
    return;
  }

  // Skip throwing for Quota Exceeded/Resource Exhaustion
  if (
    errMsgLower.includes('quota') ||
    errMsgLower.includes('resource-exhausted') ||
    errMsgLower.includes('limit') ||
    errMsgLower.includes('exhausted')
  ) {
    console.warn('Firestore Warn (Quota Exceeded): ', stringified);
    return;
  }
  
  console.error('Firestore Error: ', stringified);
  throw new Error(stringified);
}

export const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  };

  // Se a string não contiver hora específica ou for a hora padrão que adicionamos (09:00 ou 00:00)
  // mostramos apenas a data.
  const hasTime = dateString.includes('T') && !dateString.endsWith('T00:00:00') && !dateString.endsWith('T09:00:00');
  
  if (hasTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  return new Intl.DateTimeFormat('pt-BR', options).format(date);
};

export const safeStringify = (obj: any, maxDepth: number = 3): string => {
  try {
    return JSON.stringify(obj);
  } catch (e) {
    if (obj === undefined) return 'undefined';
    if (obj === null) return 'null';
    if (typeof obj !== 'object' && typeof obj !== 'function') return String(obj);
    
    if (obj instanceof Error) return obj.message;

    const seen = new WeakSet();
    
    const handleValue = (val: any, depth: number): any => {
      if (depth > maxDepth) return '[Max Depth]';
      if (val === null || val === undefined) return val;
      
      const type = typeof val;
      if (type !== 'object' && type !== 'function') return val;

      if (val instanceof Date) return val.toISOString();
      if (val instanceof RegExp) return val.toString();
      
      if (typeof window !== 'undefined' && (val === window || val === document || val instanceof Node)) {
        return '[DOM Object]';
      }

      if (seen.has(val)) return '[Circular]';
      seen.add(val);

      try {
        if (Array.isArray(val)) {
          return val.map(item => handleValue(item, depth + 1));
        }

        if (val instanceof Error) {
          return { message: val.message, name: val.name, stack: val.stack };
        }

        const result: any = {};
        const keys = Object.keys(val);
        for (const key of keys) {
          try {
            result[key] = handleValue(val[key], depth + 1);
          } catch (err) {
            result[key] = '[Property Unreadable]';
          }
        }
        return result;
      } catch (err) {
        return '[Unreadable Object]';
      }
    };

    try {
      const safeObj = handleValue(obj, 0);
      return JSON.stringify(safeObj);
    } catch (err) {
      return '[Serialization Error]';
    }
  }
};

export const extractErrorMessage = (error: any, fallback: string = 'Ocorreu um erro desconhecido'): string => {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  
  // Se for um objeto de erro do JS
  if (error instanceof Error) return error.message;

  // Se for resposta de fetch ou algo com status
  if (error.statusText && error.status) {
    return `Erro ${error.status}: ${error.statusText}`;
  }

  // Se for um objeto com propriedade 'message' ou 'error'
  if (error.message && typeof error.message === 'string') return error.message;
  if (error.error) {
    if (typeof error.error === 'string') return error.error;
    if (typeof error.error === 'object') return extractErrorMessage(error.error, fallback);
  }

  // Tratamento específico para erros do Gemini/Google AI
  if (error.stack && error.message) return error.message;

  // Se for um objeto com 'detail' (comum em APIs Python/FastAPI)
  if (error.detail) {
    if (typeof error.detail === 'string') return error.detail;
    if (Array.isArray(error.detail)) {
      return error.detail.map((d: any) => {
        if (typeof d === 'string') return d;
        if (d && d.msg) return d.msg;
        return typeof d === 'object' ? d.message || 'Erro no item' : String(d);
      }).join(', ');
    }
  }

  // Tentar stringificar o objeto de forma segura se nada mais funcionar
  try {
    const stringified = safeStringify(error);
    if (stringified && stringified !== '{}' && stringified !== 'null' && !stringified.startsWith('[Error')) {
      return stringified;
    }
  } catch (e) {
    return fallback;
  }

  return fallback;
};


export const generateId = () => Math.random().toString(36).substr(2, 9);

export const normalizeText = (text: string): string => {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
};

/**
 * Copia um texto para a área de transferência
 */
export const copyToClipboard = async (text: string): Promise<boolean> => {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (err) {
    console.error('Falha ao copiar para o clipboard:', err);
    return false;
  }
};

