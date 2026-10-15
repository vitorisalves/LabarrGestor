import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderDoc, applyRequisitionApproval, buildListFromOrder, OrderError } from './orderEstimates';

const estimateFor = (price: number, protectedPrice: number) => ({ estimatedPrice: price, protectedPrice } as any);

test('requisição: price vira a estimativa, totais e limite sugerido separados, valores do navegador ignorados', () => {
  const order = buildOrderDoc({
    id: 'po_1', name: 'Semana', createdBy: 'Maria', now: '2026-07-15T12:00:00.000Z', shippingFee: 10,
    items: [
      { name: 'Arroz', supplierName: 'A', quantity: 2, price: 999, manualPrice: { kind: 'manual', value: 1, date: '2026-07-01' } },
      { name: 'Feijão', supplierName: 'A', quantity: 1, price: 999 },
    ],
    estimates: [estimateFor(20, 21), estimateFor(8, 8.4)],
  });
  assert.equal(order.items[0].price, 20);
  assert.equal(order.items[0].estimate.protectedPrice, 21);
  assert.equal('manualPrice' in order.items[0], false);
  assert.equal(order.estimatedTotal, 58); // 2*20 + 8 + 10 de frete
  assert.equal(order.total, 58);
  assert.equal(order.suggestedLimit, 60.4); // 2*21 + 8,4 + 10
  assert.equal(order.status, 'pending');
});

test('requisição: quantidade inválida e itens vazios são recusados', () => {
  const args = { id: 'po', items: [{ name: 'X', quantity: 0 }], estimates: [estimateFor(1, 1)], shippingFee: 0, createdBy: '', now: 'n' };
  assert.throws(() => buildOrderDoc(args), (e: any) => e instanceof OrderError && e.code === 'quantity_invalid');
  assert.throws(() => buildOrderDoc({ ...args, items: [], estimates: [] }), (e: any) => e instanceof OrderError);
});

const sampleOrder = () => buildOrderDoc({
  id: 'po_1', createdBy: 'Maria', now: '2026-07-15T12:00:00.000Z', shippingFee: 0,
  items: [{ name: 'Arroz', supplierName: 'A', quantity: 10 }], estimates: [estimateFor(20, 22)],
});

test('1ª aprovação: sem informar limite confirma o sugerido e registra o histórico', () => {
  const patch: any = applyRequisitionApproval(sampleOrder(), { approvedBy: 'João', now: '2026-07-16T09:00:00.000Z' });
  assert.equal(patch.status, 'requisition_approved');
  assert.equal(patch.approvedLimit, 220);
  assert.equal(patch.limitHistory.length, 1);
  assert.equal(patch.limitHistory[0].reason, 'Limite sugerido confirmado');
});

test('1ª aprovação: mudar o limite exige motivo e fica registrado', () => {
  const order = sampleOrder();
  assert.throws(
    () => applyRequisitionApproval(order, { approvedBy: 'João', approvedLimit: 250, now: 'n' }),
    (e: any) => e instanceof OrderError && e.code === 'limit_reason_required',
  );
  const patch: any = applyRequisitionApproval(order, { approvedBy: 'João', approvedLimit: 250, limitReason: 'Promoção do fornecedor', now: 'n' });
  assert.equal(patch.approvedLimit, 250);
  assert.deepEqual(patch.limitHistory[0], { at: 'n', by: 'João', from: 220, to: 250, reason: 'Promoção do fornecedor' });
});

test('1ª aprovação: limite negativo ou inválido é recusado', () => {
  assert.throws(() => applyRequisitionApproval(sampleOrder(), { approvedBy: 'J', approvedLimit: -1, now: 'n' }), (e: any) => e.code === 'limit_invalid');
  assert.throws(() => applyRequisitionApproval(sampleOrder(), { approvedBy: 'J', approvedLimit: 'abc', now: 'n' }), (e: any) => e.code === 'limit_invalid');
});

test('requisição antiga (sem limite sugerido) aprova como antes, sem campos novos', () => {
  const patch: any = applyRequisitionApproval({ id: 'old', total: 50 }, { approvedBy: 'João', observacao: 'ok', now: 'n' });
  assert.equal(patch.status, 'requisition_approved');
  assert.equal('approvedLimit' in patch, false);
});

test('envio para a lista leva a referência da ordem; requisição antiga não ganha referência', () => {
  const order: any = { ...sampleOrder(), approvedLimit: 230, approvedBy: 'Chefe' };
  const list = buildListFromOrder(order, '2026-07-17T10:00:00.000Z');
  assert.deepEqual(list.orderRef, { orderId: 'po_1', estimatedTotal: 200, suggestedLimit: 220, approvedLimit: 230 });
  assert.equal(list.items[0].estimate.protectedPrice, 22);
  assert.equal(buildListFromOrder({ id: 'old', items: [], total: 1, shippingFee: 0 }, 'n').orderRef, undefined);
});

test('reaprovação: requisição já aprovada ou enviada não tem o limite alterado (409)', () => {
  for (const status of ['requisition_approved', 'approved']) {
    const order = { ...sampleOrder(), status };
    assert.throws(
      () => applyRequisitionApproval(order, { approvedBy: 'João', approvedLimit: 300, limitReason: 'Outro motivo', now: 'n' }),
      (e: any) => e instanceof OrderError && e.code === 'invalid_status' && e.status === 409,
    );
  }
  const pending = applyRequisitionApproval({ ...sampleOrder(), status: 'pending' }, { approvedBy: 'João', now: 'n' }) as any;
  assert.equal(pending.approvedLimit, 220);
  const noStatus: any = { ...sampleOrder() };
  delete noStatus.status;
  assert.equal((applyRequisitionApproval(noStatus, { approvedBy: 'João', now: 'n' }) as any).approvedLimit, 220);
});

test('reaprovação: requisição antiga (sem limite sugerido) mantém o comportamento anterior', () => {
  const patch: any = applyRequisitionApproval({ id: 'old', status: 'requisition_approved', total: 50 }, { approvedBy: 'João', now: 'n' });
  assert.equal(patch.status, 'requisition_approved');
  assert.equal('approvedLimit' in patch, false);
});
