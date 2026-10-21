import express, { Request, Response, NextFunction } from "express";
import helmet from "helmet";
import { initFirebase } from "./firebase.js";
import { repo } from "./data/index.js";
import { IS_VERCEL, BODY_LIMIT } from "./config.js";
import { PushService } from "./services/pushService.js";
import { startBackgroundReminderWorker } from "./reminderWorker.js";
import { requestContext } from "./context.js";
import { Identity } from "./auth/identity.js";
import { decideAccess, isSuperAdmin } from "./auth/accessGuard.js";
import { RateLimiter, isHeavyPath, rateLimitMessage } from "./rateLimit.js";
import { describeError, isProductionEnv } from "./errors.js";
import { asyncHandler, enforcementDisabled } from "./http.js";
import { getIdentity, getAuthUser } from "./auth/session.js";
import { registerSystemRoutes } from "./routes/system.js";
import { registerAuthRoutes } from "./routes/authRoutes.js";
import { registerXmlImportRoutes } from "./routes/xmlImport.js";
import { registerFinanceRoutes } from "./routes/finance.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerListsRoutes } from "./routes/lists.js";

const app = express();

app.disable('x-powered-by');
app.use(helmet({
  contentSecurityPolicy: false,          // a API só devolve JSON; a CSP do site está no vercel.json
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,        // não interferir no login por popup
  crossOriginResourcePolicy: { policy: 'same-site' },
}));
app.use(express.json({ limit: BODY_LIMIT }));
app.use(express.urlencoded({ limit: BODY_LIMIT, extended: true }));

app.use((req, res, next) => {
  const isTestMode = req.headers['x-test-mode'] === 'true';
  requestContext.run({ isTestMode }, () => {
    next();
  });
});

// --- INICIALIZAÇÃO ---
PushService.init();

async function cleanupManualInvoices() {
  try {
    console.log("[Cleanup] Starting manual-inv- deletion...");
    const snapshot = await repo.getDocs('invoices', 'invoices', true);
    if (snapshot && snapshot.docs) {
      const manualInvoices = snapshot.docs.filter((doc: any) => doc.id.startsWith('manual-inv-'));
      console.log(`[Cleanup] Found ${manualInvoices.length} manual invoices to delete.`);
      for (const docObj of manualInvoices) {
        const docRef = repo.doc('invoices', docObj.id);
        await repo.delete(docRef, `invoices/${docObj.id}`);
      }
      if (manualInvoices.length > 0) {
        repo.invalidateCache('invoices');
        console.log("[Cleanup] Finished deleting manual invoices and invalidated cache.");
      }
    }
  } catch (err) {
    console.error("[Cleanup] Error cleaning up manual invoices:", err);
  }
}

const initialization = process.env.DATA_BACKEND === 'memory' ? Promise.resolve() : initFirebase();
initialization.then(() => {
  if (!IS_VERCEL && process.env.DISABLE_BACKGROUND_WORKER !== '1') {
    cleanupManualInvoices();
    startBackgroundReminderWorker();
  }
}).catch(err => console.error("[App] Erro na inicialização:", err));

// --- ACESSO ---
// Toda a API exige uma pessoa aprovada, inclusive as leituras (exceções: /health e a chave
// pública do push). Quem entra é identificada pelo token do Google; o admin supremo vem da
// variável SUPER_ADMIN_EMAIL. A decisão em si está em auth/accessGuard.ts.
// DISABLE_PERMISSION_ENFORCEMENT=1 desliga o guarda só em desenvolvimento/testes locais: é
// ignorado na Vercel e em produção.
if (process.env.DISABLE_PERMISSION_ENFORCEMENT === '1' && !enforcementDisabled()) {
  console.warn('[Auth] DISABLE_PERMISSION_ENFORCEMENT ignorado: só vale fora de produção/Vercel.');
}

if ((IS_VERCEL || process.env.NODE_ENV === 'production') && !process.env.SUPER_ADMIN_EMAIL) {
  console.warn('[Config] SUPER_ADMIN_EMAIL ausente: ninguém será admin. Defina a variável na Vercel.');
}

// --- LIMITE DE REQUISIÇÕES ---
// Freio por instância (memória): por IP antes do acesso, por pessoa e nas rotas pesadas depois dele.
// RATE_LIMIT_DISABLED=1 só vale fora de produção/Vercel. /api/health fica fora do limite.
app.set('trust proxy', 1);
const num = (v: string | undefined, d: number) => (Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : d);
const ipLimiter = new RateLimiter({ windowMs: 60_000, max: num(process.env.RATE_LIMIT_IP_PER_MIN, 600) });
const userLimiter = new RateLimiter({ windowMs: 60_000, max: num(process.env.RATE_LIMIT_USER_PER_MIN, 300) });
const heavyLimiter = new RateLimiter({ windowMs: 60_000, max: num(process.env.RATE_LIMIT_HEAVY_PER_MIN, 20) });
const rateLimitDisabled = () => process.env.RATE_LIMIT_DISABLED === '1' && !IS_VERCEL && process.env.NODE_ENV !== 'production';
const tooMany = (res: Response, retryAfterSec: number) => {
  res.setHeader('Retry-After', String(retryAfterSec));
  return res.status(429).json({ error: 'rate_limited', message: rateLimitMessage(retryAfterSec) });
};

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (rateLimitDisabled() || req.path === '/health') return next();
  const r = ipLimiter.check(req.ip || 'sem-ip');
  return r.allowed ? next() : tooMany(res, r.retryAfterSec);
});

app.use('/api', asyncHandler(async (req: Request, res: Response, next: NextFunction) => {
  if (enforcementDisabled()) return next();

  const identity = await getIdentity(req.headers.authorization);
  const stored = identity ? await getAuthUser(identity.uid) : null;
  const superEmail = process.env.SUPER_ADMIN_EMAIL;
  const superAdmin = isSuperAdmin(identity, superEmail);

  const decision = decideAccess({ method: req.method, path: req.path, identity, stored, superAdminEmail: superEmail });
  if (!decision.ok) {
    return res.status(decision.status).json({ error: decision.error, message: decision.message, permission: decision.permission });
  }

  res.locals.identity = identity;
  res.locals.isSuperAdmin = superAdmin;
  // Cadastro efetivo de quem chama: o admin supremo é sempre admin aprovado.
  res.locals.caller = superAdmin ? { ...(stored || {}), role: 'admin', status: 'approved', email: identity!.email } : stored;
  res.locals.authUser = res.locals.caller
    ? { ...res.locals.caller, name: res.locals.caller.name || identity?.name || identity?.email }
    : null;
  next();
}));

app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  if (rateLimitDisabled() || req.path === '/health') return next();
  const who = res.locals.identity?.uid || req.ip || 'sem-ip';
  const r1 = userLimiter.check(who);
  if (!r1.allowed) return tooMany(res, r1.retryAfterSec);
  if (isHeavyPath(req.path)) {
    const r2 = heavyLimiter.check(who);
    if (!r2.allowed) return tooMany(res, r2.retryAfterSec);
  }
  next();
});


// --- ROTAS ---
registerSystemRoutes(app);
registerAuthRoutes(app);
registerXmlImportRoutes(app);
registerFinanceRoutes(app);
registerCatalogRoutes(app);
registerListsRoutes(app);

// --- TRATAMENTO DE ERROS ---
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[ErrorHandler]', err.message);
  
  // Se for erro de timeout ou conexão do axios/ai
  if (err.code === 'ECONNABORTED' || err.message?.includes('timeout')) {
    return res.status(504).json({
      error: 'Timeout na requisição',
      message: 'O servidor demorou muito para responder. Tente novamente com um arquivo menor.'
    });
  }

  const described = describeError(err, { production: isProductionEnv() });
  if (described.body.ref) console.error(`[ErrorHandler] ref=${described.body.ref}`, err?.stack || err);
  res.status(described.status).json(described.body);
});

export default app;
