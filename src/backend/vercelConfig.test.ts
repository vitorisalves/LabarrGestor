import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const cfg = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8'));

test('vercel.json não mistura "routes" com "headers" no nível raiz (a Vercel recusa o deploy)', () => {
  assert.ok(Array.isArray(cfg.routes));
  assert.equal(cfg.headers, undefined);
});

test('a rota da API vem antes da rota de cabeçalhos e a rota de cabeçalhos continua o processamento', () => {
  const apiIdx = cfg.routes.findIndex((r: any) => r.dest === 'api/index.ts');
  const hdrIdx = cfg.routes.findIndex((r: any) => r.headers);
  assert.ok(apiIdx >= 0 && hdrIdx > apiIdx);
  assert.equal(cfg.routes[hdrIdx].continue, true);
});

test('cabeçalhos essenciais presentes; CSP começa em modo somente relatório', () => {
  const h = cfg.routes.find((r: any) => r.headers).headers;
  assert.equal(h['X-Content-Type-Options'], 'nosniff');
  assert.equal(h['X-Frame-Options'], 'DENY');
  assert.ok(h['Strict-Transport-Security']);
  assert.ok(h['Referrer-Policy']);
  assert.ok(h['Content-Security-Policy-Report-Only']);
  assert.equal(h['Content-Security-Policy'], undefined);
});

test('nenhum cabeçalho COOP que quebre o login por popup', () => {
  const h = cfg.routes.find((r: any) => r.headers).headers;
  assert.equal(h['Cross-Origin-Opener-Policy'], undefined);
});
