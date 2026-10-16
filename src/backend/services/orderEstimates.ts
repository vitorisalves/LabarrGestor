/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PriceEstimate } from '../../shared/priceEstimation.js';

// Regras puras da requisição com estimativa: montagem do documento, aprovação do limite
// e envio para a lista. app.ts só carrega/grava; as decisões ficam aqui para serem testáveis.

export class OrderError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface BuildOrderArgs {
  id: string;
  name?: string;
  items: any[];
  estimates: PriceEstimate[];
  shippingFee: number;
  createdBy: string;
  now: string;
}

/** Monta a requisição com o snapshot de estimativa congelado em cada item. */
export function buildOrderDoc(args: BuildOrderArgs) {
  const { items, estimates } = args;
  if (!Array.isArray(items) || items.length === 0 || items.length !== estimates.length) {
    throw new OrderError('items_required', 'Itens são obrigatórios');
  }
  const shippingFee = Number(args.shippingFee) > 0 ? Number(args.shippingFee) : 0;
  let estimated = 0;
  let protectedSum = 0;

  const orderItems = items.map((item, i) => {
    const quantity = Number(item.quantity);
    if (!(quantity > 0)) {
      throw new OrderError('quantity_invalid', `Quantidade inválida para "${item.name}".`);
    }
    const estimate = estimates[i];
    estimated += estimate.estimatedPrice * quantity;
    protectedSum += estimate.protectedPrice * quantity;
    const { manualPrice, ...rest } = item;
    return { ...rest, bought: false, price: estimate.estimatedPrice, estimate };
  });

  const estimatedTotal = round2(estimated + shippingFee);
  return {
    id: args.id,
    name: args.name || 'Lista de Compras',
    date: args.now,
    items: orderItems,
    total: estimatedTotal,
    estimatedTotal,
    suggestedLimit: round2(protectedSum + shippingFee),
    shippingFee,
    createdBy: args.createdBy || '',
    status: 'pending',
  };
}

export interface ApprovalArgs {
  approvedBy: string;
  observacao?: string;
  approvedLimit?: unknown;
  limitReason?: string;
  now: string;
}

/**
 * Patch da 1ª aprovação. Com limite sugerido (requisição com estimativa) define o limite
 * aprovado; se o aprovador mudar o valor, o motivo é obrigatório. Requisições antigas
 * (sem limite sugerido) seguem o fluxo de antes.
 */
export function applyRequisitionApproval(order: any, args: ApprovalArgs) {
  const base = {
    status: 'requisition_approved',
    requisitionApprovedBy: args.approvedBy || '',
    requisitionApprovedAt: args.now,
    observacao: args.observacao || '',
  };
  const suggested = order?.suggestedLimit;
  if (typeof suggested !== 'number') return base;

  // O limite é definido na PRIMEIRA aprovação: requisição já processada não pode ser reaprovada.
  const currentStatus = order?.status ?? 'pending';
  if (currentStatus !== 'pending') {
    throw new OrderError('invalid_status', 'Esta requisição já foi processada e não pode ter o limite alterado.', 409);
  }

  const hasLimit = args.approvedLimit !== undefined && args.approvedLimit !== null && args.approvedLimit !== '';
  const limit = hasLimit ? Number(args.approvedLimit) : suggested;
  if (!Number.isFinite(limit) || limit < 0) {
    throw new OrderError('limit_invalid', 'O limite aprovado deve ser um valor maior ou igual a zero.');
  }
  const changed = Math.abs(limit - suggested) > 0.005;
  const reason = String(args.limitReason ?? '').trim();
  if (changed && reason.length < 3) {
    throw new OrderError('limit_reason_required', 'Informe o motivo para alterar o limite sugerido.');
  }
  const entry = {
    at: args.now,
    by: args.approvedBy || '',
    from: suggested,
    to: round2(limit),
    reason: changed ? reason : 'Limite sugerido confirmado',
  };
  return {
    ...base,
    approvedLimit: round2(limit),
    approvedLimitBy: args.approvedBy || '',
    approvedLimitAt: args.now,
    limitHistory: [...(Array.isArray(order.limitHistory) ? order.limitHistory : []), entry],
  };
}

/** Documento da lista de compras criada a partir da requisição. */
export function buildListFromOrder(order: any, now: string) {
  const list: any = {
    name: order.name,
    date: now,
    items: order.items,
    total: order.total,
    shippingFee: order.shippingFee,
    createdBy: order.createdBy,
    approvedBy: order.approvedBy || '',
  };
  if (typeof order.suggestedLimit === 'number') {
    list.orderRef = {
      orderId: order.id,
      estimatedTotal: order.estimatedTotal,
      suggestedLimit: order.suggestedLimit,
      approvedLimit: typeof order.approvedLimit === 'number' ? order.approvedLimit : null,
    };
  }
  return list;
}
