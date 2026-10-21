/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type http from 'node:http';

/**
 * Sobe o app real em porta aleatória com repositório em memória, sem worker e sem exigir login.
 * Cada arquivo de teste roda em processo próprio, então as variáveis valem para o arquivo todo.
 */
export async function startTestServer(env: Record<string, string> = {}) {
  process.env.DATA_BACKEND = 'memory';
  process.env.DISABLE_BACKGROUND_WORKER = '1';
  process.env.DISABLE_PERMISSION_ENFORCEMENT = '1';
  Object.assign(process.env, env);
  const { default: app } = await import('../app.ts');
  const { repo } = await import('../data/index.ts');
  const server: http.Server = app.listen(0);
  const base = `http://localhost:${(server.address() as any).port}`;
  const api = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let parsed: any = text;
    try { parsed = JSON.parse(text); } catch { /* texto puro */ }
    return { status: res.status, body: parsed, headers: res.headers };
  };
  const close = () => new Promise<void>(resolve => {
    server.close(() => resolve());
    (server as any).closeAllConnections?.();
  });
  return { base, api, close, repo };
}
