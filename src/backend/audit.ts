/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DataRepo } from './data/types.js';

export interface AuditEntry {
  action: string;
  actor: { uid?: string; email?: string; name?: string };
  target: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}

export function buildAuditRecord(entry: AuditEntry, now: Date, rand: () => string = () => Math.random().toString(36).slice(2, 8)) {
  const at = now.toISOString();
  return {
    id: `${at}_${rand()}`,
    data: {
      at,
      action: entry.action,
      actor: entry.actor,
      target: entry.target,
      before: entry.before ?? null,
      after: entry.after ?? null,
      meta: entry.meta ?? {},
    } as Record<string, unknown>,
  };
}

/** Registra a ação. Falha de auditoria vai para o log e nunca impede a ação em si. */
export async function recordAudit(repo: DataRepo, entry: AuditEntry): Promise<void> {
  try {
    const { id, data } = buildAuditRecord(entry, new Date());
    await repo.set(await repo.doc('audit_log', id), data, 'audit_log/' + id);
  } catch (err: any) {
    console.error('[Audit] não foi possível registrar:', entry.action, entry.target, err?.message || err);
  }
}
