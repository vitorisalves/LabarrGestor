import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isRelevantIncrease } from './priceIncrease.ts';

test('aumento menor que 0,1% não conta; 0,1% ou mais conta', () => {
  assert.equal(isRelevantIncrease(0), false);
  assert.equal(isRelevantIncrease(0.02), false);
  assert.equal(isRelevantIncrease(0.049), false);
  assert.equal(isRelevantIncrease(0.1), true);
  assert.equal(isRelevantIncrease(((10.01 - 10) / 10) * 100), true); // 0,0999… arredonda para 0,1
  assert.equal(isRelevantIncrease(12.5), true);
});

test('valores inválidos ou negativos não contam', () => {
  assert.equal(isRelevantIncrease(-3), false);
  assert.equal(isRelevantIncrease(NaN), false);
  assert.equal(isRelevantIncrease(undefined), false);
});
