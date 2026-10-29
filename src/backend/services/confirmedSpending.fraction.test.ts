import test from 'node:test';
import assert from 'node:assert/strict';
import { buildConfirmedSpending } from './confirmedSpending.ts';

test('quantidade fracionada: 0,5 de um produto de 30,00 entra como 15,00', () => {
  const sp = buildConfirmedSpending({ id: 'a', productName: 'Queijo', price: 30, quantity: 0.5 }, new Date());
  assert.equal(sp.total, 15);
  assert.equal(sp.products[0].quantity, 0.5);
});

test('quantidade fracionada fecha em centavos', () => {
  const sp = buildConfirmedSpending({ id: 'b', productName: 'X', price: 0.1, quantity: 3 }, new Date());
  assert.equal(sp.total, 0.3);
});
