import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, parseQuantity, validateItems, ValidationError, MAX_PRICE, MAX_QUANTITY } from './validation.ts';

test('preço: ausente vira 0; número e texto numérico passam', () => {
  assert.equal(parsePrice(undefined), 0);
  assert.equal(parsePrice(''), 0);
  assert.equal(parsePrice(null), 0);
  assert.equal(parsePrice(12.5), 12.5);
  assert.equal(parsePrice('7.3'), 7.3);
  assert.equal(parsePrice(0), 0);
});

test('preço: negativo, NaN, Infinity, texto e acima do limite dão ValidationError 400', () => {
  for (const bad of [-1, NaN, Infinity, 'abc', true, {}, MAX_PRICE + 1]) {
    assert.throws(() => parsePrice(bad), (e: any) => e instanceof ValidationError && e.status === 400, String(bad));
  }
});

test('quantidade: ausente usa o padrão; zero, negativo e acima do limite falham', () => {
  assert.equal(parseQuantity(undefined), 1);
  assert.equal(parseQuantity(undefined, 'Quantidade', 5), 5);
  assert.equal(parseQuantity(0.5), 0.5);
  for (const bad of [0, -2, NaN, Infinity, 'x', MAX_QUANTITY + 1]) {
    assert.throws(() => parseQuantity(bad), ValidationError, String(bad));
  }
});

test('mensagem cita o campo e está em português', () => {
  assert.throws(() => parsePrice(-3, 'Preço de Arroz'), /Preço de Arroz/);
});

test('validateItems confere price e quantity só quando preenchidos e cita o item', () => {
  assert.doesNotThrow(() => validateItems([{ name: 'a', price: 2, quantity: 3 }, { name: 'b' }]));
  assert.throws(() => validateItems([{ name: 'Arroz', price: -1, quantity: 1 }]), /Arroz/);
  assert.throws(() => validateItems([{ name: 'Feijão', price: 1, quantity: 0 }]), /Feijão/);
  assert.throws(() => validateItems('não é lista' as any), ValidationError);
});
