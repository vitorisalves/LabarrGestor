import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../testing/harness.ts';

let t: Awaited<ReturnType<typeof startTestServer>>;
before(async () => {
  t = await startTestServer({ RATE_LIMIT_IP_PER_MIN: '5' });
});
after(async () => { await t.close(); });

test('429 com Retry-After e mensagem em português depois do limite por IP; /health fica de fora', async () => {
  for (let i = 0; i < 5; i++) {
    const r = await t.api('GET', '/api/xml/setores');
    assert.equal(r.status, 200, `chamada ${i + 1}`);
  }
  const blocked = await t.api('GET', '/api/xml/setores');
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.error, 'rate_limited');
  assert.match(blocked.body.message, /Muitas requisições/);
  assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  const health = await t.api('GET', '/api/health');
  assert.equal(health.status, 200);
});
