import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingNFBalances, NFEntry } from './missingNF';

const list = (month: string, value: number, group?: string): NFEntry => ({ month, kind: 'list', value, group });
const real = (month: string, value: number, group?: string): NFEntry => ({ month, kind: 'real', value, group });
const total = (entries: NFEntry[]) => missingNFBalances(entries).get('') ?? { value: 0, count: 0 };

test('sem nota no mês, nada é descontado: notas de outros meses não abatem', () => {
  const r = total([list('2026-10', 100), real('2026-09', 5000), real('2026-08', 90000)]);
  assert.equal(r.value, 100);
  assert.equal(r.count, 1);
});

test('nota do mesmo mês abate parcialmente', () => {
  assert.equal(total([list('2026-10', 100), real('2026-10', 60)]).value, 40);
});

test('nota maior que o saldo zera o mês e a sobra não vai para outro mês', () => {
  const r = total([list('2026-10', 100), real('2026-10', 150), list('2026-11', 30)]);
  assert.equal(r.value, 30); // outubro zerou (sem crédito); novembro continua devendo 30
});

test('o saldo de cada mês é somado separadamente', () => {
  const r = total([
    list('2026-09', 100), real('2026-09', 0),
    list('2026-10', 50), real('2026-10', 200),
    list('2026-11', 70), real('2026-11', 20),
  ]);
  assert.equal(r.value, 100 + 0 + 50); // set: 100, out: 0, nov: 50
});

test('a contagem de notas faltando também é por mês', () => {
  const r = total([
    list('2026-10', 10), list('2026-10', 10), list('2026-10', 10),
    real('2026-10', 5),
    real('2026-09', 5), real('2026-09', 5),
  ]);
  assert.equal(r.count, 2); // 3 entradas - 1 nota em outubro; as 2 notas de setembro não contam
});

test('sem entradas da lista não há saldo, mesmo com notas reais', () => {
  const r = total([real('2026-10', 999)]);
  assert.equal(r.value, 0);
  assert.equal(r.count, 0);
});

test('agrupa por setor (ou qualquer chave) mantendo a regra mensal', () => {
  const m = missingNFBalances([
    list('2026-10', 100, 'Cozinha'), real('2026-10', 30, 'Cozinha'),
    list('2026-10', 40, 'Loja'), real('2026-09', 500, 'Loja'),
  ]);
  assert.equal(m.get('Cozinha')!.value, 70);
  assert.equal(m.get('Loja')!.value, 40);
  assert.equal(m.has(''), false);
});

test('arredonda para centavos', () => {
  assert.equal(total([list('2026-10', 0.1), list('2026-10', 0.2)]).value, 0.3);
});
