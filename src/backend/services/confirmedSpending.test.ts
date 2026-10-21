import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmedSpendingId, buildConfirmedSpending } from './confirmedSpending.ts';
import { ValidationError } from '../validation.ts';

test('o ID é estável: o mesmo item sempre gera o mesmo ID', () => {
  assert.equal(confirmedSpendingId({ id: 'p1' }), confirmedSpendingId({ id: 'p1' }));
  assert.equal(confirmedSpendingId({ id: 'p1' }), 'conf_list_p1');
});

test('sem id usa confirmId; sem nenhum dos dois lança ValidationError', () => {
  assert.equal(confirmedSpendingId({ confirmId: 'abc-123' }), 'conf_list_abc-123');
  assert.throws(() => confirmedSpendingId({}), ValidationError);
  assert.throws(() => confirmedSpendingId({ id: '  ' }), ValidationError);
});

test('caracteres estranhos no ID são trocados por _', () => {
  assert.equal(confirmedSpendingId({ id: 'a/b c' }), 'conf_list_a_b_c');
});

test('payload usa o ID estável e calcula o total', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  const a = buildConfirmedSpending({ id: 'p1', productName: 'Arroz', price: 4, quantity: 3, supplierName: 'X' }, now);
  const b = buildConfirmedSpending({ id: 'p1', productName: 'Arroz', price: 4, quantity: 3, supplierName: 'X' }, new Date('2026-10-22T00:00:00.000Z'));
  assert.equal(a.id, 'conf_list_p1');
  assert.equal(a.id, b.id);
  assert.equal(a.total, 12);
  assert.equal(a.vNF, 12);
  assert.equal(a.source, 'shopping_list');
  assert.equal(a.products[0].quantity, 3);
  assert.equal(a.date, now.toISOString());
});

test('valor inválido lança ValidationError', () => {
  assert.throws(() => buildConfirmedSpending({ id: 'p1', price: -1 }, new Date()), ValidationError);
});

test('mesmo id e mesma data geram o mesmo ID (reenvio continua idempotente)', () => {
  const d = '2026-10-05T10:00:00.000Z';
  assert.equal(confirmedSpendingId({ id: 'p1', date: d }), confirmedSpendingId({ id: 'p1', date: d }));
  assert.equal(confirmedSpendingId({ id: 'p1', date: d }), `conf_list_p1_${Date.parse(d)}`);
});

test('mesmo id com datas diferentes geram IDs diferentes', () => {
  assert.notEqual(
    confirmedSpendingId({ id: 'p1', date: '2026-10-05T10:00:00.000Z' }),
    confirmedSpendingId({ id: 'p1', date: '2026-11-05T10:00:00.000Z' })
  );
});

test('sem data (ou data inválida) usa só o id', () => {
  assert.equal(confirmedSpendingId({ id: 'p1' }), 'conf_list_p1');
  assert.equal(confirmedSpendingId({ id: 'p1', date: 'lixo' }), 'conf_list_p1');
});

test('buildConfirmedSpending: mesmo id em datas diferentes não colide', () => {
  const now = new Date('2026-11-06T00:00:00.000Z');
  const a = buildConfirmedSpending({ id: 'p1', price: 4, quantity: 3, date: '2026-10-05T10:00:00.000Z' }, now);
  const b = buildConfirmedSpending({ id: 'p1', price: 5, quantity: 2, date: '2026-11-05T10:00:00.000Z' }, now);
  assert.notEqual(a.id, b.id);
  assert.equal(a.total, 12);
  assert.equal(b.total, 10);
});
