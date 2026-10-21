import { test } from 'node:test';
import assert from 'node:assert/strict';
import { monthValueForRange } from './monthRange.ts';

test('mês inteiro devolve yyyy-MM', () => {
  assert.equal(monthValueForRange('2026-09-01', '2026-09-30'), '2026-09');
  assert.equal(monthValueForRange('2026-10-01', '2026-10-31'), '2026-10');
});

test('fevereiro respeita ano bissexto e não bissexto', () => {
  assert.equal(monthValueForRange('2028-02-01', '2028-02-29'), '2028-02');
  assert.equal(monthValueForRange('2027-02-01', '2027-02-28'), '2027-02');
  assert.equal(monthValueForRange('2027-02-01', '2027-02-27'), '');
});

test('intervalo que não é um mês inteiro volta ao vazio', () => {
  assert.equal(monthValueForRange('2026-09-02', '2026-09-30'), '');
  assert.equal(monthValueForRange('2026-09-01', '2026-09-29'), '');
  assert.equal(monthValueForRange('2026-09-01', '2026-10-31'), '');
  assert.equal(monthValueForRange('2026-09-15', '2026-10-14'), '');
});

test('virada de ano e datas inválidas ou vazias', () => {
  assert.equal(monthValueForRange('2026-12-01', '2026-12-31'), '2026-12');
  assert.equal(monthValueForRange('', '2026-09-30'), '');
  assert.equal(monthValueForRange('2026-09-01', ''), '');
  assert.equal(monthValueForRange('lixo', 'lixo'), '');
  assert.equal(monthValueForRange('2026-13-01', '2026-13-31'), '');
});
