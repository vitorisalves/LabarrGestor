/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// "Faltando NF": saldo de produtos confirmados pela lista como "NF" (entradas provisórias)
// que ainda esperam a nota fiscal real. O saldo é calculado MÊS A MÊS: as notas reais de um
// mês só abatem as entradas da lista do MESMO mês. Se nenhuma nota entrou em outubro,
// nada é descontado de outubro; e a sobra de um mês (nota maior que o saldo) não vira
// crédito para outro mês.

export interface NFEntry {
  /** Mês da entrada no formato AAAA-MM (o chamador converte a data, no fuso local). */
  month: string;
  /** 'list' = entrada provisória da lista (dívida); 'real' = nota fiscal real (abate). */
  kind: 'list' | 'real';
  /** Valor da entrada (para 'real', o valor bruto que abate a dívida). */
  value: number;
  /** Agrupamento opcional (ex.: setor). Sem grupo, usa a chave ''. */
  group?: string;
}

export interface MissingNFBalance {
  value: number;
  count: number;
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Saldo por grupo: soma, mês a mês, de max(0, entradas da lista - notas reais). */
export function missingNFBalances(entries: NFEntry[]): Map<string, MissingNFBalance> {
  // grupo -> mês -> acumulados
  const buckets = new Map<string, Map<string, { listValue: number; listCount: number; realValue: number; realCount: number }>>();

  for (const entry of entries) {
    const group = entry.group ?? '';
    let months = buckets.get(group);
    if (!months) { months = new Map(); buckets.set(group, months); }
    let b = months.get(entry.month);
    if (!b) { b = { listValue: 0, listCount: 0, realValue: 0, realCount: 0 }; months.set(entry.month, b); }
    if (entry.kind === 'list') { b.listValue += entry.value; b.listCount += 1; }
    else { b.realValue += entry.value; b.realCount += 1; }
  }

  const result = new Map<string, MissingNFBalance>();
  buckets.forEach((months, group) => {
    let value = 0;
    let count = 0;
    months.forEach(b => {
      value += Math.max(0, b.listValue - b.realValue);
      count += Math.max(0, b.listCount - b.realCount);
    });
    // Grupo só com notas reais (sem entradas da lista) não tem saldo.
    result.set(group, { value: round2(value), count });
  });
  return result;
}
