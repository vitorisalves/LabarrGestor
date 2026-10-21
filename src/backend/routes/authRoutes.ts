/* Rotas movidas de app.ts sem alteração de corpo. Registra direto no app (nunca em Router). */
import type { Express } from "express";
import { Request, Response } from "express";
import { repo } from "../data/index.js";
import { recordAudit } from "../audit.js";
import { PERMISSION_IDS, userCan, isAdminUser } from "../../shared/permissions.js";
import { Identity } from "../auth/identity.js";
import { isSuperAdmin } from "../auth/accessGuard.js";
import { authorizeUserAction, canViewUsers } from "../auth/users.js";
import { internalErrorMessage } from "../errors.js";
import { asyncHandler, applyPagination, handleCacheAndEtag, auditActor, enforcementDisabled } from "../http.js";
import { getAuthUser, invalidateAuthUser } from "../auth/session.js";

export function registerAuthRoutes(app: Express): void {
app.get("/api/xml/authorized_users", handleCacheAndEtag("authorized_users"), asyncHandler(async (req: Request, res: Response) => {
  if (!enforcementDisabled() && !canViewUsers(res.locals.caller)) {
    return res.status(403).json({ error: "forbidden", message: "Você não tem permissão para ver os cadastros." });
  }
  try {
    const forceNoCache = req.query.fresh === 'true' || req.headers['cache-control'] === 'no-cache' || req.headers['pragma'] === 'no-cache';
    const snapshot = await repo.getDocs('authorized_users', 'authorized_users', forceNoCache);
    const data = snapshot.docs.map((doc: any) => {
      const d = typeof doc.data === 'function' ? doc.data() : doc.data;
      return { id: doc.id, ...d };
    });
    res.json(applyPagination(req, res, data));
  } catch (error: any) {
    console.error("Error fetching cached authorized_users:", error);
    res.status(500).json({ error: "Error fetching authorized users", message: internalErrorMessage(error) });
  }
}));

const onlyDigits = (v: any) => String(v ?? '').replace(/\D/g, '');
const withoutUndefined = (o: Record<string, any>) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

// Cadastro do próprio usuário a partir da sessão Google. Quem entra NÃO decide o próprio acesso:
// status, papel e permissões vêm do servidor. Desconhecido entra como pendente; o admin supremo
// (SUPER_ADMIN_EMAIL, e-mail Google verificado) entra como admin aprovado. O CPF é só informativo.
app.post("/api/auth/session", asyncHandler(async (req: Request, res: Response) => {
  const identity = res.locals.identity as Identity | undefined;
  if (!identity) return res.status(401).json({ error: "unauthorized", message: "Sessão expirada. Entre com sua conta Google." });

  invalidateAuthUser(identity.uid);
  const existing: any = await getAuthUser(identity.uid);
  const superAdmin = isSuperAdmin(identity, process.env.SUPER_ADMIN_EMAIL);
  const now = new Date().toISOString();
  const cpf = onlyDigits(req.body?.cpf);

  const record = withoutUndefined({
    ...(existing || {}),
    uid: identity.uid,
    email: identity.email,
    name: identity.name || existing?.name || identity.email,
    picture: identity.picture,
    lastLogin: now,
    requestDate: existing?.requestDate || now,
    role: superAdmin ? 'admin' : (existing?.role === 'admin' ? 'admin' : 'user'),
    status: superAdmin ? 'approved' : (existing?.status || 'pending'),
    permissions: Array.isArray(existing?.permissions) ? existing.permissions : [],
    cpf: existing?.cpf || (cpf.length === 11 ? cpf : undefined),
  });

  await repo.set(repo.doc('authorized_users', identity.uid), record, 'authorized_users/' + identity.uid);
  invalidateAuthUser(identity.uid);
  repo.invalidateCache('authorized_users');
  res.json({ status: "success", user: { id: identity.uid, ...record } });
}));

app.get("/api/auth/users", asyncHandler(async (req: Request, res: Response) => {
  if (!enforcementDisabled() && !canViewUsers(res.locals.caller)) {
    return res.status(403).json({ error: "forbidden", message: "Você não tem permissão para ver os cadastros." });
  }
  const snap = await repo.getDocs('authorized_users', 'authorized_users', req.query.fresh === 'true');
  res.json(snap.docs.map((d: any) => ({ id: d.id, ...(typeof d.data === 'function' ? d.data() : d.data) })));
}));

// Cadastro de quem está chamando (pelo token, nunca por um uid informado).
app.get("/api/auth/users/me", asyncHandler(async (req: Request, res: Response) => {
  const identity = res.locals.identity as Identity | undefined;
  if (!identity) return res.status(401).json({ error: "unauthorized", message: "Sessão expirada. Entre com sua conta Google." });
  const caller = res.locals.caller;
  res.json(caller ? { id: identity.uid, uid: identity.uid, ...caller } : null);
}));

app.post("/api/auth/users/status", asyncHandler(async (req: Request, res: Response) => {
  const { uid, status } = req.body;
  if (!uid || !status) return res.status(400).json({ error: "uid e status são obrigatórios" });
  if (status !== 'approved' && status !== 'denied') return res.status(400).json({ error: "status inválido" });
  const identity = res.locals.identity as Identity;
  invalidateAuthUser(uid);
  const target = await getAuthUser(uid);
  const verdict = authorizeUserAction({
    action: status === 'approved' ? 'approve' : 'deny',
    callerUid: identity.uid, caller: res.locals.caller, targetUid: uid, target,
    superAdminEmail: process.env.SUPER_ADMIN_EMAIL,
  });
  if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.status === 404 ? "not_found" : "forbidden", message: verdict.message });
  if (status === 'denied') await repo.delete(repo.doc('authorized_users', uid), 'authorized_users/' + uid);
  else await repo.update(repo.doc('authorized_users', uid), { status }, 'authorized_users/' + uid);
  invalidateAuthUser(uid);
  repo.invalidateCache('authorized_users');
  await recordAudit(repo, { action: status === 'approved' ? 'user.approve' : 'user.deny', actor: auditActor(res), target: 'authorized_users/' + uid, before: { status: target?.status }, after: { status } });
  res.json({ status: "success" });
}));

app.post("/api/auth/users/delete", asyncHandler(async (req: Request, res: Response) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: "uid ausente." });
  const identity = res.locals.identity as Identity;
  const target = await getAuthUser(uid);
  const verdict = authorizeUserAction({
    action: 'delete', callerUid: identity.uid, caller: res.locals.caller, targetUid: uid, target,
    superAdminEmail: process.env.SUPER_ADMIN_EMAIL,
  });
  if (!verdict.ok) return res.status(verdict.status).json({ error: "forbidden", message: verdict.message });
  await repo.delete(repo.doc('authorized_users', uid), 'authorized_users/' + uid);
  invalidateAuthUser(uid);
  repo.invalidateCache('authorized_users');
  await recordAudit(repo, { action: 'user.delete', actor: auditActor(res), target: 'authorized_users/' + uid, before: { email: target?.email, status: target?.status } });
  res.json({ status: "success" });
}));

// Define as permissões de uma pessoa. Quem não é admin só pode conceder permissões que ele
// mesmo tem e não pode alterar um admin. A conta do admin supremo é intocável.
app.post("/api/auth/users/permissions", asyncHandler(async (req: Request, res: Response) => {
  const { uid, permissions } = req.body || {};
  if (!uid || !Array.isArray(permissions)) return res.status(400).json({ error: "uid e permissions[] são obrigatórios" });
  const identity = res.locals.identity as Identity;
  const caller = res.locals.caller;
  invalidateAuthUser(uid);
  const target = await getAuthUser(uid);
  const verdict = authorizeUserAction({
    action: 'permissions', callerUid: identity.uid, caller, targetUid: uid, target,
    superAdminEmail: process.env.SUPER_ADMIN_EMAIL,
  });
  if (!verdict.ok) return res.status(verdict.status).json({ error: verdict.status === 404 ? "not_found" : "forbidden", message: verdict.message });
  const wanted: string[] = Array.from(new Set(permissions.map(String))).filter(id => PERMISSION_IDS.has(id));
  // Não-admin só mexe no que ele mesmo tem: o resto do que a pessoa já possuía fica como está.
  const kept = isAdminUser(caller) ? [] : (Array.isArray(target!.permissions) ? target!.permissions : []).filter((id: string) => !userCan(caller, id));
  const granted = isAdminUser(caller) ? wanted : Array.from(new Set([...kept, ...wanted.filter(id => userCan(caller, id))]));
  await repo.update(repo.doc('authorized_users', uid), { permissions: granted }, 'authorized_users/' + uid);
  invalidateAuthUser(uid);
  repo.invalidateCache('authorized_users');
  await recordAudit(repo, { action: 'user.permissions', actor: auditActor(res), target: 'authorized_users/' + uid, before: { permissions: target!.permissions }, after: { permissions: granted } });
  res.json({ status: "success", permissions: granted });
}));
}
