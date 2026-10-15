import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRICE_PARAMS } from '../../shared/priceEstimation';
import {
  buildHistoryIndex, estimateItems, toIsoDate, validateManualPrice, EstimateInputError,
} from './priceEstimationService';

const inv = (id: string, date: string, products: any[], extra: any = {}) => ({ id, date, supplierName: 'Atacadão', products, ...extra });
const ctx = (invoices: any[], suppliers: any[] = []) => ({
  invoices, suppliers, params: DEFAULT_PRICE_PARAMS, today: '2026-07-15', by: 'Maria',
});

test('toIsoDate aceita ISO, ISO com hora e dd/MM/aaaa', () => {
  assert.equal(toIsoDate('2026-06-15T10:00:00-03:00'), '2026-06-15');
  assert.equal(toIsoDate('15/06/2026'), '2026-06-15');
  assert.equal(toIsoDate('lixo'), null);
  assert.equal(toIsoDate(undefined), null);
});

test('histórico: notas reais e "Sem NF" entram; "NF" provisória, excluídos e manual-inv- ficam de fora', () => {
  const invoices = [
    inv('n1', '2026-05-10', [{ code: 'C1', name: 'Açúcar 1kg', vUnCom: 5 }]),
    inv('l1', '2026-06-10', [{ code: 'C1', name: 'Açúcar 1kg', vUnCom: 6 }], { source: 'shopping_list', hasNF: true }),
    inv('l2', '2026-06-12', [{ code: 'C1', name: 'Açúcar 1kg', vUnCom: 60 }], { source: 'shopping_list', hasNF: false }),
    inv('n2', '2026-06-14', [{ code: 'C1', name: 'Açúcar 1kg', vUnCom: 70, deleted: true }]),
    inv('manual-inv-1', '2026-06-15', [{ code: 'C1', name: 'Açúcar 1kg', vUnCom: 80 }]),
  ];
  const index = buildHistoryIndex(invoices);
  assert.deepEqual(index.byCode.get('C1')!.map(p => p.price), [5, 6]);
  assert.equal(index.byCode.get('C1')![0].unit, 'kg');
});

test('estimativa por item: usa o histórico por código, ou por nome quando não há código', () => {
  const invoices = [
    inv('a', '2026-05-15', [{ code: 'C9', name: 'Óleo 900ml', vUnCom: 10 }]),
    inv('b', '2026-06-15', [{ code: 'C9', name: 'Óleo 900ml', vUnCom: 12 }]),
    inv('c', '2026-06-20', [{ code: 'N/A', name: 'Leite Integral 1L', vUnCom: 5 }]),
  ];
  const [byCode, byName] = estimateItems([
    { name: 'Óleo 900ml', code: 'C9', supplierName: 'Atacadão' },
    { name: 'leite integral 1l', supplierName: 'Atacadão' },
  ], ctx(invoices));
  assert.equal(byCode.method, 'trend');
  assert.equal(byCode.lastPrice, 12);
  assert.equal(byName.method, 'single');
  assert.equal(byName.lastPrice, 5);
});

test('sem histórico: usa o preço do cadastro (compra única) e as categorias do cadastro', () => {
  const suppliers = [{ name: 'Atacadão', products: [
    { name: 'Detergente', code: 'D1', price: 3, lastPurchaseDate: '10/07/2026', categories: ['Limpeza'] },
  ] }];
  const params = { ...DEFAULT_PRICE_PARAMS, baseByCategory: { Limpeza: 9 } };
  const [r] = estimateItems([{ name: 'Detergente', code: 'D1', supplierName: 'ATACADÃO' }], { ...ctx([], suppliers), params });
  assert.equal(r.method, 'cadastro');
  assert.equal(r.lastPriceDate, '2026-07-10');
  assert.equal(r.marginPct, 9);
  assert.equal(r.confidence, 'baixa');
});

test('sem nada: sem referência; com cotação válida: usa a cotação e registra quem informou', () => {
  const [none] = estimateItems([{ name: 'Produto Novo', supplierName: 'X' }], ctx([]));
  assert.equal(none.method, 'none');
  assert.equal(none.noReference, true);

  const [quoted] = estimateItems([{
    name: 'Produto Novo', supplierName: 'X',
    manualPrice: { kind: 'quote', value: 25, date: '2026-07-14', supplierName: 'Fornecedor Z' },
  }], ctx([]));
  assert.equal(quoted.method, 'quote');
  assert.equal(quoted.estimatedPrice, 25);
  assert.equal(quoted.reference?.by, 'Maria');
});

test('entrada manual inválida é recusada com erro claro', () => {
  const bad = [
    { kind: 'manual' as const, value: 0, date: '2026-07-10' },
    { kind: 'manual' as const, value: 10, date: '2026-08-01' },
    { kind: 'manual' as const, value: 10, date: 'xx' },
    { kind: 'outro' as any, value: 10, date: '2026-07-10' },
  ];
  for (const b of bad) {
    assert.throws(() => validateManualPrice(b, '2026-07-15'), (e: any) => e instanceof EstimateInputError && e.code === 'manual_invalid');
  }
});
