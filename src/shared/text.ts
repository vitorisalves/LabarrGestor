/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Minúsculas, sem acento, espaços colapsados e aparados. Chave de comparação de nomes. */
export const normName = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
