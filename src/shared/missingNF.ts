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
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

/** Saldo por grupo: soma, mês a mês, de max(0, entradas da lista - notas reais). */
export function missingNFBalances(entries: NFEntry[]): Map<string, MissingNFBalance> {
  // grupo -> mês -> acumulados
  const buckets = new Map<string, Map<string, { listValue: number; realValue: number }>>();

  for (const entry of entries) {
    const group = entry.group ?? '';
    let months = buckets.get(group);
    if (!months) { months = new Map(); buckets.set(group, months); }
    let b = months.get(entry.month);
    if (!b) { b = { listValue: 0, realValue: 0 }; months.set(entry.month, b); }
    if (entry.kind === 'list') b.listValue += entry.value;
    else b.realValue += entry.value;
  }

  const result = new Map<string, MissingNFBalance>();
  buckets.forEach((months, group) => {
    let value = 0;
    months.forEach(b => {
      value += Math.max(0, b.listValue - b.realValue);
    });
    // Grupo só com notas reais (sem entradas da lista) fica com saldo 0.
    result.set(group, { value: round2(value) });
  });
  return result;
}

export interface TimedNFEntry extends NFEntry {
  /** Momento da entrada (ms). Define a ordem dentro do mês. */
  time: number;
}

/**
 * Saldo "Faltando NF" em ordem cronológica, mês a mês: cada produto confirmado como NF soma no
 * saldo do mês em que foi confirmado; cada nota real, a partir do momento em que entra, desconta
 * do saldo que existe até ali (nunca fica negativo, sem crédito). Uma nota que entrou ANTES de
 * uma confirmação não cancela essa confirmação.
 */
export function missingNFRunning(entries: TimedNFEntry[]): Map<string, MissingNFBalance> {
  const buckets = new Map<string, Map<string, TimedNFEntry[]>>();
  for (const e of entries) {
    const group = e.group ?? '';
    let months = buckets.get(group);
    if (!months) { months = new Map(); buckets.set(group, months); }
    const list = months.get(e.month) ?? [];
    list.push(e);
    months.set(e.month, list);
  }
  const result = new Map<string, MissingNFBalance>();
  buckets.forEach((months, group) => {
    let value = 0;
    months.forEach(list => {
      // Na mesma hora, a confirmação conta antes da nota.
      list.sort((a, b) => a.time - b.time || (a.kind === b.kind ? 0 : a.kind === 'list' ? -1 : 1));
      let bal = 0;
      for (const e of list) bal = e.kind === 'list' ? bal + e.value : Math.max(0, bal - e.value);
      value += bal;
    });
    result.set(group, { value: round2(value) });
  });
  return result;
}
