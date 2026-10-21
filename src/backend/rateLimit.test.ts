import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter, isHeavyPath, rateLimitMessage } from './rateLimit.ts';

test('permite até o máximo na janela e bloqueia o excedente com tempo de espera', () => {
  let t = 1000;
  const rl = new RateLimiter({ windowMs: 60_000, max: 3 }, () => t);
  assert.equal(rl.check('a').allowed, true);
  assert.equal(rl.check('a').allowed, true);
  assert.equal(rl.check('a').allowed, true);
  const blocked = rl.check('a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfterSec >= 1 && blocked.retryAfterSec <= 60);
});

test('chaves diferentes não se afetam', () => {
  const rl = new RateLimiter({ windowMs: 60_000, max: 1 }, () => 0);
  assert.equal(rl.check('a').allowed, true);
  assert.equal(rl.check('b').allowed, true);
  assert.equal(rl.check('a').allowed, false);
});

test('a janela reinicia depois do tempo', () => {
  let t = 0;
  const rl = new RateLimiter({ windowMs: 1000, max: 1 }, () => t);
  assert.equal(rl.check('a').allowed, true);
  assert.equal(rl.check('a').allowed, false);
  t = 1001;
  assert.equal(rl.check('a').allowed, true);
});

test('rotas pesadas: IA, importação e planilha', () => {
  for (const p of ['/ai/process-document', '/xml/process', '/xml/process-batch', '/omie-direct/products', '/excel-sync', '/xml/suppliers/import']) {
    assert.equal(isHeavyPath(p), true, p);
  }
  for (const p of ['/xml/invoices', '/health', '/auth/session']) assert.equal(isHeavyPath(p), false, p);
});

test('mensagem em português com os segundos', () => {
  assert.match(rateLimitMessage(7), /7 segundos/);
  assert.match(rateLimitMessage(1), /1 segundo/);
});

test('a memória é podada: chaves expiradas saem quando o mapa cresce', () => {
  let t = 0;
  const rl = new RateLimiter({ windowMs: 1000, max: 1 }, () => t);
  for (let i = 0; i < 5100; i++) rl.check('k' + i);
  t = 2000;
  rl.check('novo');
  assert.ok((rl as any).hits.size < 10);
});
