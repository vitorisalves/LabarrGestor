import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../testing/harness.ts';

let t: Awaited<ReturnType<typeof startTestServer>>;
before(async () => { t = await startTestServer(); });
after(async () => { await t.close(); });

const product = (extra: any = {}) => ({ code: 'P1', name: 'Farinha', quantity: 1, price: 10, ...extra });

async function seed() {
  for (const id of ['nota-a', 'nota-b']) {
    await t.repo.set(t.repo.doc('invoices', id), {
      date: '2026-10-01', chNFe: id, supplierName: 'Forn',
      // item 0 já excluído: a posição do item vivo (1) precisa continuar valendo.
      products: [product({ code: 'X', name: 'Outro', deleted: true }), product()],
    }, 'invoices/' + id);
  }
}

async function product1(id: string) {
  const d: any = await t.repo.getDoc(t.repo.doc('invoices', id), 'invoices/' + id, true);
  return (typeof d.data === 'function' ? d.data() : d.data).products[1];
}

test('categoria só de uma compra não muda a outra nota nem volta ao recarregar', async () => {
  await seed();
  // Troca "para todas" primeiro: cria a regra por produto.
  assert.equal((await t.api('POST', '/api/xml/products/update-category', { code: 'P1', name: 'Farinha', category: 'Secos' })).status, 200);
  assert.equal((await product1('nota-a')).category, 'Secos');
  assert.equal((await product1('nota-b')).category, 'Secos');

  // Só a nota A passa para outra categoria.
  const r = await t.api('POST', '/api/xml/products/update-category', { code: 'P1', name: 'Farinha', category: 'Padaria', invKey: 'nota-a', productIndex: 1 });
  assert.equal(r.status, 200);
  assert.equal((await product1('nota-a')).category, 'Padaria');
  assert.equal((await product1('nota-b')).category, 'Secos');

  // A leitura reaplica a regra por produto, mas respeita o item marcado.
  const list = await t.api('GET', '/api/xml/invoices?fresh=true');
  const byId = Object.fromEntries(list.body.map((i: any) => [i.id, i.products[1]]));
  assert.equal(byId['nota-a'].category, 'Padaria');
  assert.equal(byId['nota-b'].category, 'Secos');

  // Trocar "para todas" depois vale de novo em tudo e solta a marca.
  await t.api('POST', '/api/xml/products/update-category', { code: 'P1', name: 'Farinha', category: 'Mercearia' });
  assert.equal((await product1('nota-a')).category, 'Mercearia');
  assert.equal((await product1('nota-b')).category, 'Mercearia');
});

test('setor só de uma compra segue a mesma regra', async () => {
  await t.api('POST', '/api/xml/products/update-setor', { code: 'P1', name: 'Farinha', setor: 'Cozinha' });
  await t.api('POST', '/api/xml/products/update-setor', { code: 'P1', name: 'Farinha', setor: 'Bar', invKey: 'nota-b', productIndex: 1 });
  const list = await t.api('GET', '/api/xml/invoices?fresh=true');
  const byId = Object.fromEntries(list.body.map((i: any) => [i.id, i.products[1]]));
  assert.equal(byId['nota-a'].setor, 'Cozinha');
  assert.equal(byId['nota-b'].setor, 'Bar');
});

test('item que não confere com a posição pedida é recusado sem alterar nada', async () => {
  const bad = await t.api('POST', '/api/xml/products/update-category', { code: 'P1', name: 'Farinha', category: 'Qualquer', invKey: 'nota-a', productIndex: 0 });
  assert.equal(bad.status, 404);
  const out = await t.api('POST', '/api/xml/products/update-category', { code: 'P1', name: 'Farinha', category: 'Qualquer', invKey: 'nota-a', productIndex: 9 });
  assert.equal(out.status, 404);
  assert.notEqual((await product1('nota-a')).category, 'Qualquer');
});
