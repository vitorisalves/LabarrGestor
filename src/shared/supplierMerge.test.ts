import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSuppliersAddOnly } from './supplierMerge';

test('planilha só-adição: existente intacto, produto novo entra, fornecedor novo entra', () => {
  const existing = [
    { id: 'f1', name: 'Atacadão', phone: '111', products: [{ name: 'Arroz 5kg', price: 20, code: 'A1' }] },
  ];
  const incoming = [
    { name: 'ATACADÃO', phone: '999', products: [
      { name: 'arroz 5KG', price: 99 },
      { name: 'Feijão 1kg', price: 8 },
    ] },
    { name: 'Distribuidora Nova', phone: '222', products: [{ name: 'Sal', price: 3 }, { name: 'sal', price: 4 }] },
  ];
  const r = mergeSuppliersAddOnly(existing, incoming, () => 'novo-id');

  assert.equal(r.addedSuppliers, 1);
  assert.equal(r.addedProducts, 2); // Feijão + Sal
  assert.equal(r.skippedProducts, 2); // Arroz (já existia) + sal duplicado na planilha

  const atacadao = r.toSave.find(s => s.id === 'f1')!;
  assert.equal(atacadao.phone, '111');
  assert.equal(atacadao.products[0].price, 20); // preço existente intacto
  assert.deepEqual(atacadao.products.map(p => p.name), ['Arroz 5kg', 'Feijão 1kg']);

  const nova = r.toSave.find(s => s.id === 'novo-id')!;
  assert.deepEqual(nova.products.map(p => p.name), ['Sal']);
  assert.equal(existing[0].products.length, 1); // entrada original não foi mutada
});

test('planilha só-adição: nada novo não grava nada', () => {
  const existing = [{ id: 'f1', name: 'A', products: [{ name: 'X' }] }];
  const r = mergeSuppliersAddOnly(existing, [{ name: 'A', products: [{ name: 'x' }] }], () => 'id');
  assert.deepEqual(r.toSave, []);
  assert.equal(r.skippedProducts, 1);
});

test('planilha só-adição: fornecedor novo duplicado na planilha', () => {
  const r = mergeSuppliersAddOnly([], [
    { name: 'Nova', products: [{ name: 'Produto A', price: 10 }] },
    { name: 'NOVA', products: [{ name: 'Produto B', price: 20 }] },
  ], () => 'novo-id');

  assert.equal(r.addedSuppliers, 1);
  assert.equal(r.addedProducts, 2);
  assert.equal(r.toSave.length, 1);
  assert.equal(r.toSave[0].id, 'novo-id');
  assert.deepEqual(r.toSave[0].products.map(p => p.name), ['Produto A', 'Produto B']);
});

test('planilha só-adição: fornecedor existente duplicado na planilha', () => {
  const existing = [
    { id: 'f1', name: 'Atacadão', phone: '111', products: [{ name: 'Arroz 5kg', price: 20 }] },
  ];
  const r = mergeSuppliersAddOnly(existing, [
    { name: 'ATACADÃO', phone: '999', products: [{ name: 'Feijão 1kg', price: 8 }] },
    { name: 'Atacadão', phone: '888', products: [{ name: 'Sal 1kg', price: 3 }] },
  ], () => 'novo-id');

  assert.equal(r.addedSuppliers, 0);
  assert.equal(r.addedProducts, 2);
  assert.equal(r.toSave.length, 1);
  assert.equal(r.toSave[0].id, 'f1');
  assert.equal(r.toSave[0].phone, '111'); // phone from existing, not overwritten
  assert.deepEqual(r.toSave[0].products.map(p => p.name), ['Arroz 5kg', 'Feijão 1kg', 'Sal 1kg']);
});

test('planilha só-adição: fornecedor novo ignora o id enviado e não sobrescreve existente', () => {
  const existing = [
    { id: 'f1', name: 'Atacadão', phone: '111', products: [{ name: 'Arroz 5kg', price: 20 }] },
  ];
  const r = mergeSuppliersAddOnly(existing, [
    { id: 'f1', name: 'Qualquer', products: [{ name: 'Sal', price: 3 }] },
  ], () => 'novo-id');

  assert.equal(r.addedSuppliers, 1);
  assert.equal(r.toSave.length, 1);
  assert.equal(r.toSave[0].id, 'novo-id');
  assert.equal(r.toSave.some(s => s.id === 'f1'), false); // existente não é regravado
  assert.equal(existing[0].products.length, 1);
});
