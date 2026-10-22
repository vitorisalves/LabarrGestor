import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../testing/harness.ts';

let t: Awaited<ReturnType<typeof startTestServer>>;
before(async () => { t = await startTestServer(); });
after(async () => { await t.close(); });

const item = (extra: any = {}) => ({
  id: 'p1', productName: 'Farinha', supplierName: 'Forn A', quantity: 2, price: 25,
  category: 'Secos', setor: 'Cozinha', hasNF: true, date: '2026-10-20T10:00:00.000Z', ...extra,
});

async function seedSupplier() {
  await t.repo.set(t.repo.doc('suppliers', 's1'), {
    name: 'Forn A', phone: '',
    products: [
      { code: 'F1', name: 'Farinha', price: 20, categories: ['Ingredientes'], lastPurchaseDate: '20/10/2026' },
      { code: 'A1', name: 'Açúcar', price: 7, categories: ['Ingredientes'], lastPurchaseDate: '01/10/2026' },
    ],
  }, 'suppliers/s1');
}

async function supplier() {
  const d: any = await t.repo.getDoc(t.repo.doc('suppliers', 's1'), 'suppliers/s1', true);
  return typeof d.data === 'function' ? d.data() : d.data;
}

test('concluir "Sem NF": produto recebe preço, setor e categoria; data da última compra não muda', async () => {
  await seedSupplier();
  const r = await t.api('POST', '/api/xml/pending-list-products/confirm', { items: [item()] });
  assert.equal(r.status, 200);
  assert.equal(r.body.productsUpdated, 1);
  const [farinha, acucar] = (await supplier()).products;
  assert.equal(farinha.price, 25);
  assert.equal(farinha.setor, 'Cozinha');
  assert.deepEqual(farinha.categories, ['Secos']);
  assert.equal(farinha.lastPurchaseDate, '20/10/2026');
  assert.equal(acucar.price, 7); // outros produtos intactos
});

test('concluir com NF não mexe no cadastro do produto', async () => {
  await seedSupplier();
  const r = await t.api('POST', '/api/xml/pending-list-products/confirm', { items: [item({ id: 'p2', hasNF: false, price: 99 })] });
  assert.equal(r.status, 200);
  assert.equal(r.body.productsUpdated, 0);
  assert.equal((await supplier()).products[0].price, 20);
});

test('categoria que o produto já tem não é trocada; fornecedor ou produto inexistente não quebra', async () => {
  await seedSupplier();
  await t.repo.set(t.repo.doc('suppliers', 's1'), {
    name: 'Forn A', phone: '',
    products: [{ code: 'F1', name: 'Farinha', price: 20, categories: ['Secos', 'Extra'], lastPurchaseDate: '20/10/2026' }],
  }, 'suppliers/s1');
  const r = await t.api('POST', '/api/xml/pending-list-products/confirm', {
    items: [item({ id: 'p3' }), item({ id: 'p4', supplierName: 'Ninguém' }), item({ id: 'p5', productName: 'Sem cadastro' })],
  });
  assert.equal(r.status, 200);
  assert.equal(r.body.confirmedCount, 3);
  assert.deepEqual((await supplier()).products[0].categories, ['Secos', 'Extra']);
  assert.equal((await supplier()).products[0].price, 25);
});
