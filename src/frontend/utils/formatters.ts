/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(value);
};

export const formatDate = (dateString: string): string => {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const options: Intl.DateTimeFormatOptions = {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  };

  const hasTime = dateString.includes('T') && !dateString.endsWith('T00:00:00') && !dateString.endsWith('T09:00:00');
  
  if (hasTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
  }

  return new Intl.DateTimeFormat('pt-BR', options).format(date);
};

export const generateId = (): string => Math.random().toString(36).substring(2, 11);

export const normalizeText = (text: string): string => {
  if (!text) return '';
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
  
  if (error instanceof Error) return error.message;

  if (error.statusText && error.status) {
    return `Erro ${error.status}: ${error.statusText}`;
  }

  if (error.message && typeof error.message === 'string') return error.message;
  if (error.error) {
    if (typeof error.error === 'string') return error.error;
    if (typeof error.error === 'object') return extractErrorMessage(error.error, fallback);
  }

  if (error.stack && error.message) return error.message;

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
