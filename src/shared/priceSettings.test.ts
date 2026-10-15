import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRICE_PARAMS } from './priceEstimation';
import { normalizeParams, validateParams, diffParams } from './priceSettings';

test('normalizeParams completa com os valores iniciais e converte números', () => {
  const p = normalizeParams({ defaultBase: '7' as any, baseByCategory: { Ingredientes: '9' as any, vazio: 'x' as any } });
  assert.equal(p.defaultBase, 7);
  assert.deepEqual(p.baseByCategory, { Ingredientes: 9 });
  assert.equal(p.windowMonths, DEFAULT_PRICE_PARAMS.windowMonths);
  assert.deepEqual(normalizeParams(null), DEFAULT_PRICE_PARAMS);
});

test('validateParams aceita os iniciais e recusa valores fora da faixa', () => {
  assert.deepEqual(validateParams(DEFAULT_PRICE_PARAMS), []);
  const bad = validateParams({ ...DEFAULT_PRICE_PARAMS, minMargin: 30, maxMargin: 10, windowMonths: 0, leadDays: 1.5 });
  assert.ok(bad.length >= 3);
  assert.ok(bad.some(m => m.includes('mínima')));
});

test('diffParams lista só o que mudou, inclusive por categoria', () => {
  const before = DEFAULT_PRICE_PARAMS;
  const after = { ...before, defaultBase: 6, baseByCategory: { Limpeza: 10 } };
  assert.deepEqual(diffParams(before, after), [
    { field: 'defaultBase', before: 5, after: 6 },
    { field: 'baseByCategory.Limpeza', before: null, after: 10 },
  ]);
  assert.deepEqual(diffParams(before, before), []);
});
