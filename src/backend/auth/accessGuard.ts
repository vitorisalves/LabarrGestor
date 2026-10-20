/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { requiredPermission, userCan, isAdminUser, ADMIN_ONLY_GET } from '../../shared/permissions.js';
import type { Identity } from './identity.js';

export type StoredUser = { role?: string; status?: string; permissions?: string[]; email?: string } | null;

export interface Decision {
  ok: boolean;
  admin?: boolean;
  status?: 401 | 403;
  error?: 'unauthorized' | 'forbidden';
  message?: string;
  permission?: string | null;
}

const PUBLIC_GET = ['/health', '/notifications/vapid-key'];

/** Admin supremo: só com a variável configurada e o e-mail Google verificado. */
export function isSuperAdmin(identity: Identity | null, superAdminEmail: string | undefined): boolean {
  const wanted = (superAdminEmail ?? '').trim().toLowerCase();
  return !!identity && !!wanted && identity.emailVerified && identity.provider === 'google.com' && identity.email === wanted;
}

const deny = (status: 401 | 403, message: string, permission?: string | null): Decision => ({
  ok: false, status, error: status === 401 ? 'unauthorized' : 'forbidden', message, permission,
});

/** Decide se a requisição passa. `path` é o caminho sem o prefixo /api. */
export function decideAccess(input: {
  method: string;
  path: string;
  identity: Identity | null;
  stored: StoredUser;
  superAdminEmail?: string;
}): Decision {
  const { method, path, identity, stored, superAdminEmail } = input;
  const isRead = method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

  if (isRead && PUBLIC_GET.includes(path)) return { ok: true, admin: false };

  if (!identity || !identity.emailVerified || identity.provider !== 'google.com') {
    return deny(401, 'Sessão expirada. Entre com sua conta Google.');
  }

  if (isSuperAdmin(identity, superAdminEmail)) return { ok: true, admin: true };

  if (path.startsWith('/auth/')) return { ok: true, admin: false };

  if (!stored || stored.status !== 'approved') {
    return deny(403, 'Seu acesso ainda não foi aprovado.');
  }

  const admin = isAdminUser(stored);

  if (isRead) {
    if (ADMIN_ONLY_GET.some(p => path.startsWith(p)) && !admin) {
      return deny(403, 'Você não tem permissão para acessar este recurso.', 'admin');
    }
    return { ok: true, admin };
  }

  const rule = requiredPermission(path);
  if (admin || rule === null) return { ok: true, admin };
  if (rule !== 'admin' && userCan(stored, rule)) return { ok: true, admin };
  return deny(403, 'Você não tem permissão para realizar esta ação.', rule);
}
