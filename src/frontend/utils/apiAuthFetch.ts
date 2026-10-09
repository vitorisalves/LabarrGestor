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

// Faz todo pedido que grava dados (POST/PUT/PATCH/DELETE em /api) levar o token do Firebase,
// que é como o servidor sabe quem está pedindo e confere as permissões. Também avisa a tela
// quando o servidor recusa por falta de permissão.
export function installApiAuthFetch() {
  if (typeof window === 'undefined' || (window as any).__apiAuthFetchInstalled) return;
  (window as any).__apiAuthFetchInstalled = true;

  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const isRequest = typeof Request !== 'undefined' && input instanceof Request;
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as Request).url;
    const method = (init?.method || (isRequest ? (input as Request).method : 'GET') || 'GET').toUpperCase();

    if (method === 'GET' || method === 'HEAD' || !isSameOriginApi(url)) {
      return originalFetch(input, init);
    }

    const headers = new Headers(init?.headers || (isRequest ? (input as Request).headers : undefined));
    if (!headers.has('Authorization')) {
      const token = await auth.currentUser?.getIdToken().catch(() => undefined);
      if (token) headers.set('Authorization', `Bearer ${token}`);
    }

    const res = await originalFetch(input, { ...init, headers });

    if (res.status === 403 || res.status === 401) {
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
