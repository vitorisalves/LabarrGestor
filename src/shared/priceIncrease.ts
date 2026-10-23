/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Menor aumento que vale mostrar/avisar, em % (o que aparece na tela com 1 casa decimal). */
export const MIN_INCREASE_PERCENT = 0.1;

/** Aumento relevante: pelo menos 0,1% já arredondado a 1 casa (o mesmo valor que a tela mostra). */
export function isRelevantIncrease(percent: unknown): boolean {
  const p = Number(percent);
  if (!Number.isFinite(p)) return false;
  return Math.round(p * 10) / 10 >= MIN_INCREASE_PERCENT;
}
