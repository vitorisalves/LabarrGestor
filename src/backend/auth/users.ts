/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { userCan, isAdminUser } from '../../shared/permissions.js';
import type { StoredUser } from './accessGuard.js';

export type UserAction = 'approve' | 'deny' | 'delete' | 'permissions';

export interface UserActionResult {
  ok: boolean;
  status?: 403 | 404;
  message?: string;
}

const forbid = (message: string): UserActionResult => ({ ok: false, status: 403, message });

/** A conta do admin supremo (por e-mail) nunca pode ser alterada, recusada ou removida. */
export function isProtectedUser(target: StoredUser, superAdminEmail: string | undefined): boolean {
  const wanted = (superAdminEmail ?? '').trim().toLowerCase();
  return !!target && !!wanted && String(target.email ?? '').trim().toLowerCase() === wanted;
}

/** Quem pode ver a lista de cadastros (que inclui e-mails e CPFs). */
export function canViewUsers(caller: StoredUser): boolean {
  return isAdminUser(caller) || userCan(caller, 'users.approve') || userCan(caller, 'users.manage');
}

/**
 * Decide se `caller` pode executar `action` sobre `target`. `caller` já vem com o papel efetivo
 * (o admin supremo chega como admin aprovado).
 */
export function authorizeUserAction(input: {
  action: UserAction;
  callerUid: string;
  caller: StoredUser;
  targetUid: string;
  target: StoredUser;
  superAdminEmail?: string;
}): UserActionResult {
  const { action, callerUid, caller, targetUid, target, superAdminEmail } = input;
  const self = callerUid === targetUid;

  if (!target) {
    return action === 'delete' ? { ok: true } : { ok: false, status: 404, message: 'Usuário não encontrado' };
  }
  if (isProtectedUser(target, superAdminEmail)) {
    return forbid('A conta do admin supremo não pode ser alterada.');
  }
  if (isAdminUser(target) && !isAdminUser(caller) && !(action === 'delete' && self)) {
    return forbid('Somente admin pode alterar um admin.');
  }

  switch (action) {
    case 'approve':
      return userCan(caller, 'users.approve') ? { ok: true } : forbid('Você não tem permissão para aprovar acessos.');
    case 'deny':
      if (!userCan(caller, 'users.approve')) return forbid('Você não tem permissão para aprovar acessos.');
      // Recusar alguém já aprovado é remover acesso.
      if (target.status === 'approved' && !userCan(caller, 'users.manage')) {
        return forbid('Você não tem permissão para remover um acesso já aprovado.');
      }
      return { ok: true };
    case 'delete':
      if (self || userCan(caller, 'users.manage')) return { ok: true };
      return forbid('Você não tem permissão para remover acessos.');
    case 'permissions':
      return userCan(caller, 'users.manage') ? { ok: true } : forbid('Você não tem permissão para gerenciar permissões.');
  }
}
