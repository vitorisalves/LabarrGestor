/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface RateRule { windowMs: number; max: number }

/** Contador por instância (memória). Em ambiente serverless cada instância tem o seu: serve como freio, não como cota exata. */
export class RateLimiter {
  private hits = new Map<string, { count: number; resetAt: number }>();
  constructor(private rule: RateRule, private now: () => number = Date.now) {}

  check(key: string): { allowed: boolean; retryAfterSec: number } {
    const t = this.now();
    if (this.hits.size > 5000) {
      for (const [k, v] of this.hits) if (v.resetAt <= t) this.hits.delete(k);
    }
    let h = this.hits.get(key);
    if (!h || h.resetAt <= t) {
      h = { count: 0, resetAt: t + this.rule.windowMs };
      this.hits.set(key, h);
    }
    h.count++;
    if (h.count > this.rule.max) {
      return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((h.resetAt - t) / 1000)) };
    }
    return { allowed: true, retryAfterSec: 0 };
  }
}

const HEAVY_PREFIXES = ['/ai/', '/xml/process', '/omie-direct', '/excel-sync', '/xml/suppliers/import'];
/** `path` relativo ao /api (como em req.path dentro de app.use('/api', ...)). */
export const isHeavyPath = (path: string) => HEAVY_PREFIXES.some(p => path.startsWith(p));

export const rateLimitMessage = (sec: number) =>
  `Muitas requisições em pouco tempo. Aguarde ${sec} ${sec === 1 ? 'segundo' : 'segundos'} e tente de novo.`;
