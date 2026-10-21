import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readSheetAsArrays, readSheetAsObjects, buildXlsx, objectsToRows } from './spreadsheet.ts';

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '__fixtures__');
const load = (name: string) => {
  const b = readFileSync(path.join(dir, name));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};
const golden = (name: string) => JSON.parse(readFileSync(path.join(dir, name), 'utf8'));
// compara como JSON: undefined e null se equivalem; números com tolerância
const norm = (v: any): any => JSON.parse(JSON.stringify(v, (_k, x) => (x === undefined ? null : x)));
function assertSame(actual: any, expected: any) {
  const a = norm(actual); const e = norm(expected);
  assert.equal(JSON.stringify(a, null, 1) === JSON.stringify(e, null, 1) || approxEqual(a, e), true,
    `diferente:\nreal=${JSON.stringify(a)}\nesperado=${JSON.stringify(e)}`);
}
function approxEqual(a: any, e: any): boolean {
  if (typeof a === 'number' && typeof e === 'number') return Math.abs(a - e) < 1e-6;
  if (Array.isArray(a) && Array.isArray(e)) return a.length === e.length && a.every((x, i) => approxEqual(x, e[i]));
  if (a && e && typeof a === 'object' && typeof e === 'object') {
    const ka = Object.keys(a); const ke = Object.keys(e);
    return ka.length === ke.length && ka.every(k => approxEqual(a[k], e[k]));
  }
  return a === e;
}

for (const name of ['fornecedores', 'dre-vendas', 'deslocada']) {
  test(`${name}: leitura como objetos igual à da biblioteca antiga`, async () => {
    assertSame(await readSheetAsObjects(load(`${name}.xlsx`)), golden(`${name}.objects.golden.json`));
  });
  test(`${name}: leitura como matriz igual à da biblioteca antiga`, async () => {
    assertSame(await readSheetAsArrays(load(`${name}.xlsx`)), golden(`${name}.arrays.golden.json`));
  });
}

test('escrever e ler de volta devolve os mesmos dados', async () => {
  const rows = [['Produto', 'Preço'], ['Arroz', 12.5], ['Feijão', 8]];
  const buf = await buildXlsx('Teste', rows, [20, 10]);
  assert.deepEqual(norm(await readSheetAsArrays(buf)), norm(rows));
});

test('objectsToRows usa as chaves do primeiro objeto como cabeçalho, na ordem', () => {
  assert.deepEqual(objectsToRows([{ a: 1, b: 'x' }, { a: 2, b: 'y' }]), [['a', 'b'], [1, 'x'], [2, 'y']]);
  assert.deepEqual(objectsToRows([]), []);
});
