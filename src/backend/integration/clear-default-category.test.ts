import test from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../testing/harness.ts';

const t = await startTestServer();
test.after(() => t.close());

async function seed(withCategory = false) {
  await t.repo.set(t.repo.doc('suppliers', 's1'), {
    name: 'Forn',
    products: [
      { code: 'A', name: 'Farinha', price: 1, categories: ['Ingredientes'] },
      { code: 'B', name: 'Copo', price: 2, categories: ['Ingredientes', 'Embalagens'] },
      { code: 'C', name: 'Sal', price: 3, category: 'Ingredientes' },
      { code: 'D', name: 'Cabo', price: 4, categories: ['Elétrica'] },
    ],
  }, 'suppliers/s1');
  await t.repo.set(t.repo.doc('pending_list_products', 'p1'), { productName: 'Farinha', category: 'Ingredientes' }, 'pending_list_products/p1');
  if (withCategory) await t.repo.set(t.repo.doc('categories', 'ingredientes'), { name: 'Ingredientes' }, 'categories/ingredientes');
}

async function read(col: string, id: string) {
  const d: any = await t.repo.getDoc(t.repo.doc(col, id), `${col}/${id}`, true);
  return typeof d.data === 'function' ? d.data() : d.data;
}

test('sem "apply" só conta, não grava', async () => {
  await seed();
  const r = await t.api('POST', '/api/xml/maintenance/clear-default-category', {});
  assert.equal(r.status, 200);
  assert.equal(r.body.applied, false);
  assert.equal(r.body.supplierProducts, 3);
  assert.equal(r.body.pendingItems, 1);
  assert.deepEqual((await read('suppliers', 's1')).products[0].categories, ['Ingredientes']);
});

test('com "apply" tira só o Ingredientes e mantém as outras categorias', async () => {
  const r = await t.api('POST', '/api/xml/maintenance/clear-default-category', { apply: true });
  assert.equal(r.body.applied, true);
  const [a, b, c, d] = (await read('suppliers', 's1')).products;
  assert.deepEqual(a.categories, []);
  assert.deepEqual(b.categories, ['Embalagens']);
  assert.equal(c.category, '');
  assert.deepEqual(d.categories, ['Elétrica']);
  assert.equal((await read('pending_list_products', 'p1')).category, '');
});

test('não mexe se Ingredientes for categoria cadastrada nas Configurações', async () => {
  await seed(true);
  const r = await t.api('POST', '/api/xml/maintenance/clear-default-category', { apply: true });
  assert.equal(r.body.status, 'skipped');
  assert.deepEqual((await read('suppliers', 's1')).products[0].categories, ['Ingredientes']);
});
