import { Request, Response, NextFunction } from "express";
import { IS_VERCEL } from "./config.js";
import { repo } from "./data/index.js";
import { DEFAULT_PRICE_PARAMS } from "../shared/priceEstimation.js";
import { normalizeParams } from "../shared/priceSettings.js";
import { EstimateInputError } from "./services/priceEstimationService.js";
import { OrderError } from "./services/orderEstimates.js";

export const applyPagination = (req: Request, res: Response, data: any[]) => {
  if (req.query.limit) {
    const limit = parseInt(req.query.limit as string, 10);
    const page = parseInt(req.query.page as string, 10) || 1;
    const startIndex = (page - 1) * limit;
    res.setHeader('X-Total-Count', data.length.toString());
    res.setHeader('X-Total-Pages', Math.ceil(data.length / limit).toString());
    res.setHeader('X-Current-Page', page.toString());
    res.setHeader('Access-Control-Expose-Headers', 'X-Total-Count, X-Total-Pages, X-Current-Page');
    return data.slice(startIndex, startIndex + limit);
  }
  return data;
};

/**
 * Wrapper para rotas assíncronas capturarem erros.
 */
export const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch((err) => {
    console.error(`[AsyncHandler Error] ${req.method} ${req.url}:`, err);
    next(err);
  });
};

export const handleCacheAndEtag = (collectionName: string) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Disable in-memory ETag logic as it breaks on distributed environments (like Vercel)
    // where different instances have different memory states, causing them to incorrectly
    // return 304 Not Modified forever when another instance updates the database.
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
  };
};

// --- ESTIMATIVA DE PREÇOS (Fase 1) ---
// Tudo isto só vale com PRICE_ESTIMATION_ENABLED=1. Desligado, as rotas existentes se comportam como antes.
export const priceEstimationEnabled = () => process.env.PRICE_ESTIMATION_ENABLED === '1';

export const actorName = (req: Request, res: Response): string =>
  String(res.locals.authUser?.name || req.body?.by || 'sistema');

export const auditActor = (res: Response) => ({
  uid: res.locals.identity?.uid,
  email: res.locals.identity?.email,
  name: res.locals.authUser?.name,
});

export async function loadPriceSettings(opts: { strict?: boolean } = {}) {
  try {
    const ref = repo.doc('price_settings', 'default');
    const snap = await repo.getDoc(ref, 'price_settings/default', true, !!opts.strict);
    const exists = typeof snap.exists === 'function' ? snap.exists() : !!snap.exists;
    const data: any = exists ? (typeof snap.data === 'function' ? snap.data() : snap.data) : {};
    return { params: normalizeParams(data.params), history: Array.isArray(data.history) ? data.history : [] };
  } catch (e) {
    if (opts.strict) throw e;
    console.warn('[PriceSettings] usando valores iniciais:', (e as Error).message);
    return { params: DEFAULT_PRICE_PARAMS, history: [] as any[] };
  }
}

export async function loadEstimateContext(by: string) {
  const rows = (snap: any) => snap.docs.map((d: any) => ({ id: d.id, ...(typeof d.data === 'function' ? d.data() : d.data) }));
  const [invoicesSnap, suppliersSnap, settings] = await Promise.all([
    repo.getDocs('invoices', 'invoices', false, true),
    repo.getDocs('suppliers', 'suppliers', false, true),
    loadPriceSettings(),
  ]);
  return {
    invoices: rows(invoicesSnap),
    suppliers: rows(suppliersSnap),
    params: settings.params,
    today: new Date().toISOString().slice(0, 10),
    by,
  };
}

// Erros de regra de negócio viram 4xx com mensagem em português; devolve true se tratou.
export function sendKnownError(res: Response, e: unknown): boolean {
  if (e instanceof OrderError) {
    res.status(e.status).json({ error: e.code, message: e.message });
    return true;
  }
  if (e instanceof EstimateInputError) {
    res.status(400).json({ error: e.code, message: e.message });
    return true;
  }
  return false;
}

export const readDocData = (snap: any): any => (typeof snap.data === 'function' ? snap.data() : snap.data) || {};


export const enforcementDisabled = () =>
  process.env.DISABLE_PERMISSION_ENFORCEMENT === '1' && !IS_VERCEL && process.env.NODE_ENV !== 'production';
