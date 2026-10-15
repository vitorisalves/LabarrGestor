/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Peso da embalagem em kg a partir do nome ("ARROZ 5KG" -> 5, "SAL 500 G" -> 0.5), ou null. */
export const extractWeightKg = (name: string): number | null => {
  const kgMatch = name.match(/([0-9]+(?:[.,][0-9]+)?)\s*KG\b/i);
  if (kgMatch) {
    return parseFloat(kgMatch[1].replace(',', '.'));
  }
  const gMatch = name.match(/([0-9]+(?:[.,][0-9]+)?)\s*G\b/i);
  if (gMatch) {
    return parseFloat(gMatch[1].replace(',', '.')) / 1000;
  }
  return null;
};
