import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePrice, DEFAULT_PRICE_PARAMS, HistoryPoint } from './priceEstimation';

const P = DEFAULT_PRICE_PARAMS;
const MONTHLY = ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15'];
const series = (prices: number[], unit: 'kg' | 'un' = 'un'): HistoryPoint[] =>
  prices.map((price, i) => ({ date: MONTHLY[i], price, unit }));
const base = { categories: [] as string[], packageKg: null as number | null, today: '2026-07-15', params: P };

test('1. aumento consistente: tendência limitada pelo teto mensal, confiança alta', () => {
  const r = estimatePrice({ ...base, history: series([10, 11, 12, 13, 14, 15]) });
  assert.equal(r.method, 'trend');
  assert.equal(r.lastPrice, 15);
  assert.equal(r.estimatedPrice, 15.74); // 15 + 0,75/mês (teto de 5%) * 0,986 mês
  assert.equal(r.marginPct, 5.21);
  assert.equal(r.protectedPrice, 16.56);
  assert.equal(r.confidence, 'alta');
  assert.equal(r.sampleSize, 6);
  assert.equal(r.intervalDays, 31);
});

test('2. redução de preços: estimativa abaixo do último preço', () => {
  const r = estimatePrice({ ...base, history: series([15, 14, 13, 12, 11, 10]) });
  assert.equal(r.method, 'trend');
  assert.equal(r.lastPrice, 10);
  assert.equal(r.estimatedPrice, 9.51);
  assert.ok(r.estimatedPrice < r.lastPrice);
  assert.equal(r.confidence, 'alta');
});

test('3. preços oscilantes: margem no teto e confiança média', () => {
  const r = estimatePrice({ ...base, history: series([10, 14, 9, 15, 10, 14]) });
  assert.equal(r.estimatedPrice, 14.49);
  assert.equal(r.marginPct, 25);
  assert.equal(r.protectedPrice, 18.11);
  assert.equal(r.confidence, 'media');
});

test('4. várias notas com preços iguais: sem tendência, margem base, confiança alta', () => {
  const r = estimatePrice({ ...base, history: series([10, 10, 10, 10, 10, 10]) });
  assert.equal(r.estimatedPrice, 10);
  assert.equal(r.marginPct, 5);
  assert.equal(r.protectedPrice, 10.5);
  assert.equal(r.confidence, 'alta');
});

test('5. uma compra recente: preço de referência + margem base, confiança baixa', () => {
  const r = estimatePrice({ ...base, history: [{ date: '2026-07-01', price: 100, unit: 'un' }] });
  assert.equal(r.method, 'single');
  assert.equal(r.estimatedPrice, 100);
  assert.equal(r.marginPct, 5);
  assert.equal(r.protectedPrice, 105);
  assert.equal(r.confidence, 'baixa');
});

test('6. uma compra antiga: a idade aumenta a margem, sem inventar aumento de preço', () => {
  const r = estimatePrice({ ...base, history: [{ date: '2026-04-15', price: 100, unit: 'un' }] });
  assert.equal(r.estimatedPrice, 100);
  assert.equal(r.marginPct, 5.99);
  assert.equal(r.protectedPrice, 105.99);
  assert.equal(r.confidence, 'baixa');
});

test('7. sem histórico, sem cadastro e sem cotação: sem referência, nada inventado', () => {
  const r = estimatePrice({ ...base, history: [] });
  assert.equal(r.method, 'none');
  assert.equal(r.estimatedPrice, 0);
  assert.equal(r.protectedPrice, 0);
  assert.equal(r.confidence, 'sem_referencia');
  assert.equal(r.noReference, true);
  assert.equal(r.marginPct, 5);
});

test('8. sem histórico com cotação e com preço manual', () => {
  const quote = estimatePrice({ ...base, history: [], reference: { kind: 'quote', value: 50, date: '2026-07-10', supplierName: 'X' } });
  assert.equal(quote.method, 'quote');
  assert.equal(quote.estimatedPrice, 50);
  assert.equal(quote.protectedPrice, 52.5);
  assert.equal(quote.confidence, 'baixa');
  assert.equal(quote.reference?.supplierName, 'X');

  const manual = estimatePrice({ ...base, history: [], reference: { kind: 'manual', value: 40, date: '2026-07-14' } });
  assert.equal(manual.method, 'manual');
  assert.equal(manual.protectedPrice, 42);
});

test('8b. cadastro vale como compra única; sem data assume preço desatualizado', () => {
  const dated = estimatePrice({ ...base, history: [], catalogPrice: 30, catalogDate: '2026-06-15' });
  assert.equal(dated.method, 'cadastro');
  assert.equal(dated.estimatedPrice, 30);
  assert.equal(dated.protectedPrice, 31.5);
  assert.equal(dated.confidence, 'baixa');

  const undated = estimatePrice({ ...base, history: [], catalogPrice: 30 });
  assert.equal(undated.marginPct, 7.46);
  assert.equal(undated.protectedPrice, 32.24);
  assert.equal(undated.lastPriceDate, null);
});

test('8c. precedência: cotação vence preço manual, que vence o cadastro', () => {
  const r = estimatePrice({ ...base, history: [], catalogPrice: 30, reference: { kind: 'manual', value: 44, date: '2026-07-10' } });
  assert.equal(r.method, 'manual');
  assert.equal(r.estimatedPrice, 44);
});

test('9. unidades diferentes: só compras do mesmo tipo entram; kg volta para a embalagem pedida', () => {
  const r = estimatePrice({
    ...base,
    packageKg: 5,
    history: [
      { date: '2026-05-15', price: 4, unit: 'kg' },
      { date: '2026-06-15', price: 4.4, unit: 'kg' },
      { date: '2026-06-20', price: 99, unit: 'un' },
    ],
  });
  assert.equal(r.sampleSize, 2);
  assert.equal(r.discardedUnit, 1);
  assert.equal(r.lastPrice, 22); // 4,40/kg * 5 kg
  assert.equal(r.estimatedPrice, 22.48);
  assert.equal(r.confidence, 'media');
});

test('15. dados inconsistentes são descartados e contados', () => {
  const r = estimatePrice({
    ...base,
    history: [
      { date: 'abc', price: 10, unit: 'un' },
      { date: '2026-06-01', price: -5, unit: 'un' },
      { date: '2027-01-01', price: 12, unit: 'un' },
      { date: '2026-06-10', price: 10, unit: 'un' },
    ],
  });
  assert.equal(r.discardedOther, 3);
  assert.equal(r.sampleSize, 1);
  assert.equal(r.method, 'single');
  assert.equal(r.estimatedPrice, 10);
});

test('duas compras: tendência reduzida a 25%', () => {
  const r = estimatePrice({
    ...base,
    history: [{ date: '2026-05-15', price: 10, unit: 'un' }, { date: '2026-06-15', price: 12, unit: 'un' }],
  });
  assert.equal(r.method, 'trend');
  assert.equal(r.estimatedPrice, 12.48);
  assert.equal(r.marginPct, 14.09);
  assert.equal(r.confidence, 'media');
});

test('compras no mesmo dia viram um ponto (média)', () => {
  const r = estimatePrice({
    ...base,
    history: [{ date: '2026-06-15', price: 10, unit: 'un' }, { date: '2026-06-15', price: 12, unit: 'un' }],
  });
  assert.equal(r.sampleSize, 1);
  assert.equal(r.estimatedPrice, 11);
});

test('histórico fora da janela: usa tudo, marca como antigo, projeção limitada a 6 meses', () => {
  const r = estimatePrice({
    ...base,
    history: [{ date: '2025-01-15', price: 10, unit: 'un' }, { date: '2025-03-15', price: 11, unit: 'un' }],
  });
  assert.equal(r.staleHistory, true);
  assert.equal(r.horizonMonths, 6);
  assert.equal(r.estimatedPrice, 11.77);
  assert.equal(r.confidence, 'baixa');
});

test('margem base por categoria: produto com várias categorias usa a maior', () => {
  const r = estimatePrice({
    ...base,
    categories: ['Ingredientes', 'Embalagens'],
    params: { ...P, baseByCategory: { Ingredientes: 8, Embalagens: 12 } },
    history: [{ date: '2026-07-10', price: 100, unit: 'un' }],
  });
  assert.equal(r.marginPct, 12);
  assert.equal(r.protectedPrice, 112);
});

test('reprodutível: mesmos dados e parâmetros dão o mesmo resultado e guardam os parâmetros usados', () => {
  const input = { ...base, history: series([10, 11, 12, 13, 14, 15]) };
  const a = estimatePrice(input);
  const b = estimatePrice(input);
  assert.deepEqual(a, b);
  assert.deepEqual(a.params, P);
  assert.equal(a.computedAt, '2026-07-15');
});
