/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { auth } from '../firebase';

// Disparado quando o servidor recusa uma gravação por falta de permissão/sessão.
export const PERMISSION_DENIED_EVENT = 'app:permission-denied';

const isSameOriginApi = (url: string) => {
  if (url.startsWith('/api/')) return true;
  try {
    const u = new URL(url, window.location.origin);
    return u.origin === window.location.origin && u.pathname.startsWith('/api/');
  } catch {
    return false;
  }
};

// Faz todo pedido à API levar o token do Firebase (login Google), que é como o servidor sabe
// quem está pedindo e confere as permissões. Só /api/health e a chave pública do push dispensam
// o token. Também avisa a tela quando o servidor recusa por falta de permissão.
const PUBLIC_API_PATHS = ['/api/health', '/api/notifications/vapid-key'];
const isPublicApi = (url: string) => {
  try {
    return PUBLIC_API_PATHS.includes(new URL(url, window.location.origin).pathname);
  } catch {
    return false;
  }
};
export function installApiAuthFetch() {
  if (typeof window === 'undefined' || (window as any).__apiAuthFetchInstalled) return;
  (window as any).__apiAuthFetchInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = (init?.method || (isRequest ? (input as Request).method : 'GET') || 'GET').toUpperCase();

    if (!isSameOriginApi(url) || isPublicApi(url)) {
      return originalFetch(input, init);
    }

    const headers = new Headers(init?.headers || (isRequest ? (input as Request).headers : undefined));
    let hadToken = headers.has('Authorization');
    if (!hadToken) {
      const token = await auth.currentUser?.getIdToken().catch(() => undefined);
      if (token) { headers.set('Authorization', `Bearer ${token}`); hadToken = true; }
    }

    const res = await originalFetch(input, { ...init, headers });

    // Sem sessão ainda (tela de login), um 401 é esperado e não deve acusar permissão negada.
    if (hadToken && (res.status === 403 || res.status === 401)) {
      try {
        const body = await res.clone().json();
        if (body?.error === 'forbidden' || body?.error === 'unauthorized') {
          window.dispatchEvent(new CustomEvent(PERMISSION_DENIED_EVENT, { detail: { message: body.message, status: res.status } }));
        }
      } catch {
        // resposta sem JSON: nada a avisar
      }
    }
    return res;
  };
}
