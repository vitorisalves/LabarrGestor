import { repo } from "../data/index.js";
import { getFirebaseConfig } from "../config.js";
import { verifyIdToken, Identity } from "./identity.js";

// Identidade pelo token do Google (cache curto: evita uma ida à API do Firebase a cada chamada).
const verifiedTokens = new Map<string, { identity: Identity; exp: number }>();
export async function getIdentity(header: string | undefined): Promise<Identity | null> {
  if (!header) return null;
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  const hit = verifiedTokens.get(token);
  if (hit && hit.exp > Date.now()) return hit.identity;
  const { projectId } = await getFirebaseConfig();
  const identity = await verifyIdToken(token, { projectId });
  if (identity) {
    if (verifiedTokens.size > 500) verifiedTokens.clear();
    verifiedTokens.set(token, { identity, exp: Date.now() + 5 * 60 * 1000 });
  }
  return identity;
}
// Cadastro (role/status/permissões) de quem está chamando, com cache curto.
const authUserCache = new Map<string, { user: any | null; exp: number }>();
export async function getAuthUser(uid: string): Promise<any | null> {
  const hit = authUserCache.get(uid);
  if (hit && hit.exp > Date.now()) return hit.user;
  const d = await repo.getDoc(repo.doc('authorized_users', uid), 'authorized_users/' + uid, true);
  const user = d.exists() ? (typeof d.data === 'function' ? d.data() : d.data) : null;
  authUserCache.set(uid, { user, exp: Date.now() + 15 * 1000 });
  return user;
}
export function invalidateAuthUser(uid?: string) {
  if (uid) authUserCache.delete(uid); else authUserCache.clear();
}
