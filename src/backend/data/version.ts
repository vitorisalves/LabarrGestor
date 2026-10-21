/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Versão do documento (campo `version` no JSON). Documentos antigos, sem o campo, valem 0. */
export const versionOf = (data: any): number => {
  const n = Number(data?.version);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};
