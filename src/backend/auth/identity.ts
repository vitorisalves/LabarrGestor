/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Identidade de quem chama a API, lida do ID token do Firebase pela REST `accounts:lookup`
// (sem Admin SDK). Só descreve quem é; a regra de acesso fica em accessGuard.ts.

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

interface LookupDeps {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

export async function lookupIdentity(token: string, deps: LookupDeps): Promise<Identity | null> {
  if (!token) return null;
  const doFetch = deps.fetchImpl ?? fetch;
  try {
    const r = await doFetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${deps.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ idToken: token }),
    });
    if (!r.ok) return null;
    const j: any = await r.json();
    const u = j?.users?.[0];
    if (!u?.localId) return null;
    const providers: any[] = Array.isArray(u.providerUserInfo) ? u.providerUserInfo : [];
    const provider = providers.some(p => p?.providerId === 'google.com')
      ? 'google.com'
      : (providers[0]?.providerId ?? null);
    return {
      uid: String(u.localId),
      email: String(u.email ?? '').trim().toLowerCase(),
      emailVerified: u.emailVerified === true,
      provider,
      name: u.displayName || undefined,
      picture: u.photoUrl || undefined,
    };
  } catch {
    return null;
  }
}
