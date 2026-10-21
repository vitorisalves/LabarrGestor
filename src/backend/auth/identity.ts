/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createPublicKey, createVerify, KeyObject } from 'node:crypto';

// Identidade de quem chama a API, lida do ID token do Firebase. A assinatura (RS256) é conferida
// aqui mesmo com as chaves públicas do Google, sem chamar a API do Firebase e sem a chave do
// navegador. Só descreve quem é; a regra de acesso fica em accessGuard.ts.

export interface Identity {
  uid: string;
  /** Sempre em minúsculas; vazio para sessões anônimas. */
  email: string;
  emailVerified: boolean;
  /** 'google.com' para login Google; null para sessão anônima. */
  provider: string | null;
  name?: string;
  picture?: string;
}

export const GOOGLE_CERTS_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

interface CertCache { keys: Map<string, KeyObject>; exp: number }
let certCache: CertCache | null = null;

export function resetCertCache() { certCache = null; }

async function loadKeys(doFetch: typeof fetch, now: number): Promise<Map<string, KeyObject> | null> {
  if (certCache && certCache.exp > now) return certCache.keys;
  try {
    const r = await doFetch(GOOGLE_CERTS_URL);
    if (!r.ok) return certCache?.keys ?? null;
    const body = await r.json() as Record<string, string>;
    const keys = new Map<string, KeyObject>();
    // O Google publica certificados X.509 em PEM; createPublicKey extrai a chave deles.
    for (const [kid, pem] of Object.entries(body)) keys.set(kid, createPublicKey(pem));
    const maxAge = /max-age=(\d+)/.exec(r.headers?.get?.('cache-control') ?? '');
    const ttl = (maxAge ? Number(maxAge[1]) : 3600) * 1000;
    certCache = { keys, exp: now + ttl };
    return keys;
  } catch {
    // Google fora do ar: segue com as últimas chaves guardadas, se houver.
    return certCache?.keys ?? null;
  }
}

const decode = (s: string) => Buffer.from(s, 'base64url');

interface VerifyDeps {
  projectId: string;
  fetchImpl?: typeof fetch;
  /** Relógio em ms (para testes). */
  now?: number;
}

export async function verifyIdToken(token: string, deps: VerifyDeps): Promise<Identity | null> {
  if (!token || !deps.projectId) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const header = JSON.parse(decode(parts[0]).toString('utf8'));
    const payload = JSON.parse(decode(parts[1]).toString('utf8'));
    if (header.alg !== 'RS256' || !header.kid) return null;

    const nowMs = deps.now ?? Date.now();
    const keys = await loadKeys(deps.fetchImpl ?? fetch, nowMs);
    const key = keys?.get(header.kid);
    if (!key) return null;

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${parts[0]}.${parts[1]}`);
    if (!verifier.verify(key, decode(parts[2]))) return null;

    const nowSec = Math.floor(nowMs / 1000);
    const skew = 60;
    if (payload.aud !== deps.projectId) return null;
    if (payload.iss !== `https://securetoken.google.com/${deps.projectId}`) return null;
    if (typeof payload.exp !== 'number' || payload.exp <= nowSec - skew) return null;
    if (typeof payload.iat !== 'number' || payload.iat > nowSec + skew) return null;
    if (typeof payload.sub !== 'string' || !payload.sub) return null;

    const signIn = payload.firebase?.sign_in_provider;
    return {
      uid: payload.sub,
      email: String(payload.email ?? '').trim().toLowerCase(),
      emailVerified: payload.email_verified === true,
      provider: signIn && signIn !== 'anonymous' ? String(signIn) : null,
      name: payload.name || undefined,
      picture: payload.picture || undefined,
    };
  } catch {
    return null;
  }
}
