import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../testing/harness.ts';

let t: Awaited<ReturnType<typeof startTestServer>>;

before(async () => { t = await startTestServer(); });
after(async () => { await t.close(); });

const COLLS = ['xml_spendings', 'invoices', 'pending_list_products', 'audit_log', 'shopping_lists', 'suppliers'];
const all = async (c: string) => (await t.repo.getDocs(c, c, true)).docs;
const ids = async (c: string) => (await all(c)).map(d => d.id).sort();

beforeEach(async () => {
  for (const c of COLLS) for (const d of await all(c)) await t.repo.delete(t.repo.doc(c, d.id));
});

const item = (over: Record<string, any> = {}) => ({
  id: 'pending_l1_arroz_acme', listId: 'l1', productName: 'Arroz', supplierName: 'ACME',
  quantity: 3, price: 4, date: '2026-10-05T10:00:00.000Z', category: 'Ingredientes', ...over,
});

const NFE_ID = 'NFe35260112345678000199550010000012341000012345';
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc><NFe><infNFe Id="${NFE_ID}">
<ide><nNF>1234</nNF><dhEmi>2026-10-10T09:00:00-03:00</dhEmi></ide>
<emit><CNPJ>12345678000199</CNPJ><xNome>FORNECEDOR TESTE LTDA</xNome></emit>
<det nItem="1"><prod><cProd>P1</cProd><xProd>FARINHA TESTE</xProd><uCom>KG</uCom><qCom>10.0000</qCom><vUnCom>5.0000</vUnCom><vProd>50.00</vProd></prod></det>
<total><ICMSTot><vNF>50.00</vNF></ICMSTot></total>
</infNFe></NFe></nfeProc>`;
const REAL_ID = NFE_ID.substring(3);

test('confirmar item de lista é idempotente e separa ciclos de compra', async () => {
  assert.equal((await t.api('POST', '/api/xml/pending-list-products', { item: item() })).status, 200);
  assert.equal((await all('pending_list_products')).length, 1);

  for (let i = 0; i < 2; i++) {
    const r = await t.api('POST', '/api/xml/pending-list-products/confirm', { items: [item()] });
    assert.equal(r.status, 200);
  }
  const sp = await all('xml_spendings');
  const inv = await all('invoices');
  assert.equal(sp.length, 1);
  assert.equal(inv.length, 1);
  assert.equal(sp[0].data().total, 12);
  assert.equal(sp[0].data().source, 'shopping_list');
  assert.equal(inv[0].data().total, 12);
  assert.equal(inv[0].data().source, 'shopping_list');
  assert.equal((await all('pending_list_products')).length, 0);

  // mesmo id pendente, outro ciclo (data diferente): não sobrescreve
  const r2 = await t.api('POST', '/api/xml/pending-list-products/confirm', { items: [item({ date: '2026-11-05T10:00:00.000Z' })] });
  assert.equal(r2.status, 200);
  assert.equal((await all('xml_spendings')).length, 2);
  assert.equal((await all('invoices')).length, 2);
});

test('valores inválidos são recusados e nada é gravado', async () => {
  const r = await t.api('POST', '/api/xml/pending-list-products/confirm', { items: [item({ price: -5 })] });
  assert.equal(r.status, 400);
  assert.equal((await all('xml_spendings')).length, 0);
  assert.equal((await all('invoices')).length, 0);

  // um item inválido no lote recusa o lote inteiro (sem gravação parcial)
  const r2 = await t.api('POST', '/api/xml/pending-list-products/confirm', { items: [item(), item({ id: 'outro', price: -1 })] });
  assert.equal(r2.status, 400);
  assert.equal((await all('xml_spendings')).length, 0);
});

test('importar nota XML e reimportar', async () => {
  const first = await t.api('POST', '/api/xml/process', { xmlData: xml });
  assert.equal(first.status, 200);
  assert.equal(first.body.status, 'imported');
  assert.equal(first.body.id, REAL_ID);

  const second = await t.api('POST', '/api/xml/process', { xmlData: xml });
  assert.equal(second.body.status, 'duplicate');

  assert.deepEqual(await ids('invoices'), [REAL_ID]);
  assert.equal((await all('invoices'))[0].data().vTotTrib, 50);
  assert.deepEqual(await ids('xml_spendings'), [REAL_ID]);

  const dup = await t.api('GET', '/api/xml/invoices/duplicates');
  assert.equal(dup.status, 200);
  assert.deepEqual(dup.body.groups, []);
});

test('apagar nota registra auditoria', async () => {
  await t.api('POST', '/api/xml/process', { xmlData: xml });
  const r = await t.api('POST', '/api/xml/invoices/delete', { id: REAL_ID });
  assert.equal(r.body.status, 'deleted');
  assert.equal((await all('invoices')).length, 0);
  const audit = (await all('audit_log')).map(d => d.data());
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'invoice.delete');
  assert.equal(audit[0].target, 'invoices/' + REAL_ID);
});

test('resetar gastos das listas exige confirmação e preserva notas reais', async () => {
  await t.api('POST', '/api/xml/process', { xmlData: xml });
  await t.api('POST', '/api/xml/pending-list-products/confirm', { items: [item()] });
  assert.equal((await all('invoices')).length, 2);
  const period = { start: '2026-10-01T00:00:00.000Z', end: '2026-10-31T23:59:59.000Z' };

  const no = await t.api('POST', '/api/xml/list-spendings/reset', period);
  assert.equal(no.status, 400);
  assert.equal((await all('invoices')).length, 2);
  assert.equal((await all('audit_log')).length, 0);

  const yes = await t.api('POST', '/api/xml/list-spendings/reset', { ...period, confirm: true });
  assert.equal(yes.status, 200);
  assert.equal(yes.body.removed, 1);
  assert.deepEqual(await ids('invoices'), [REAL_ID]);
  assert.equal((await all('xml_spendings')).filter(d => d.data().source === 'shopping_list').length, 0);
  assert.deepEqual((await all('audit_log')).map(d => d.data().action), ['list_spendings.reset']);
});

test('controle de versão da lista: conflito devolve 409', async () => {
  const created = await t.api('POST', '/api/xml/shopping_lists', { name: 'Lista', items: [] });
  assert.equal(created.status, 200);
  const { id, version } = created.body;
  assert.equal(version, 1);

  const ok = await t.api('POST', '/api/xml/shopping_lists/update-items', { listId: id, items: [], baseVersion: version });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.version, version + 1);
  assert.equal((await t.repo.getDoc(t.repo.doc('shopping_lists', id))).data().version, version + 1);

  const stale = await t.api('POST', '/api/xml/shopping_lists/update-items', { listId: id, items: [], baseVersion: version });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error, 'version_conflict');
  assert.equal((await t.repo.getDoc(t.repo.doc('shopping_lists', id))).data().version, version + 1);
});

test('apagar todos os fornecedores exige a contagem', async () => {
  await t.repo.set(t.repo.doc('suppliers', 's1'), { name: 'ACME' });
  await t.repo.set(t.repo.doc('suppliers', 's2'), { name: 'BETA' });
  await t.repo.set(t.repo.doc('suppliers', 's3'), { name: 'MERCADO' });

  const bad = await t.api('POST', '/api/xml/suppliers/delete-all', { confirmCount: 5 });
  assert.equal(bad.status, 409);
  assert.equal(bad.body.expected, 2);
  assert.equal((await all('suppliers')).length, 3);
  assert.equal((await all('audit_log')).length, 0);

  const ok = await t.api('POST', '/api/xml/suppliers/delete-all', { confirmCount: 2 });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.count, 2);
  assert.deepEqual(await ids('suppliers'), ['s3']);
  assert.deepEqual((await all('audit_log')).map(d => d.data().action), ['supplier.delete_all']);
});
