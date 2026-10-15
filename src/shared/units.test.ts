import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWeightKg } from './units';
import { normName } from './text';

test('extractWeightKg lê kg e g do nome', () => {
  assert.equal(extractWeightKg('ARROZ TIPO 1 5KG'), 5);
  assert.equal(extractWeightKg('Farinha 1,5 kg'), 1.5);
  assert.equal(extractWeightKg('SAL 500 G'), 0.5);
  assert.equal(extractWeightKg('LEITE INTEGRAL 1L'), null);
});

test('normName ignora acento, caixa e espaços', () => {
  assert.equal(normName('  Açúcar   Refinado '), 'acucar refinado');
  assert.equal(normName(null), '');
});
