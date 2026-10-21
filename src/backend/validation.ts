/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const MAX_PRICE = 1_000_000;
export const MAX_QUANTITY = 100_000;

/** Erro de dado inválido: o tratador de erros devolve 400 com esta mensagem. */
export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const isAbsent = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return NaN;
}

/** Preço/valor em reais: ausente vale 0; preenchido precisa ser número finito, 0 ≤ p ≤ MAX_PRICE. */
export function parsePrice(value: unknown, label = 'Preço'): number {
  if (isAbsent(value)) return 0;
  const n = toNumber(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(`${label} inválido: informe um número maior ou igual a zero.`);
  }
  if (n > MAX_PRICE) {
    throw new ValidationError(`${label} acima do limite permitido (R$ ${MAX_PRICE.toLocaleString('pt-BR')}).`);
  }
  return n;
}

/** Quantidade: ausente vale `fallback`; preenchida precisa ser número finito, 0 < q ≤ MAX_QUANTITY. */
export function parseQuantity(value: unknown, label = 'Quantidade', fallback = 1): number {
  if (isAbsent(value)) return fallback;
  const n = toNumber(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError(`${label} inválida: informe um número maior que zero.`);
  }
  if (n > MAX_QUANTITY) {
    throw new ValidationError(`${label} acima do limite permitido (${MAX_QUANTITY.toLocaleString('pt-BR')}).`);
  }
  return n;
}

/** Confere price/quantity de cada item (só o que veio preenchido). Falha na primeira inconsistência. */
export function validateItems(items: unknown, label = 'Item'): void {
  if (!Array.isArray(items)) throw new ValidationError(`${label}s inválidos: esperada uma lista.`);
  items.forEach((it: any, i: number) => {
    if (!it || typeof it !== 'object') throw new ValidationError(`${label} ${i + 1} inválido.`);
    const nome = String(it.name || it.productName || `${label} ${i + 1}`);
    parsePrice(it.price, `Preço de ${nome}`);
    parseQuantity(it.quantity, `Quantidade de ${nome}`);
  });
}
