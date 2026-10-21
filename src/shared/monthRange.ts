/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Se o intervalo [start, end] (datas 'yyyy-MM-dd') é exatamente um mês inteiro, devolve
 * 'yyyy-MM'; caso contrário devolve ''. Usado para o seletor de mês refletir as datas.
 */
export function monthValueForRange(start: string, end: string): string {
  const s = /^(\d{4})-(\d{2})-(\d{2})$/.exec(start || '');
  const e = /^(\d{4})-(\d{2})-(\d{2})$/.exec(end || '');
  if (!s || !e) return '';
  const [sy, sm, sd] = [Number(s[1]), Number(s[2]), Number(s[3])];
  const [ey, em, ed] = [Number(e[1]), Number(e[2]), Number(e[3])];
  if (sm < 1 || sm > 12) return '';
  if (sy !== ey || sm !== em || sd !== 1) return '';
  const lastDay = new Date(sy, sm, 0).getDate(); // dia 0 do mês seguinte = último dia deste mês
  if (ed !== lastDay) return '';
  return `${s[1]}-${s[2]}`;
}
