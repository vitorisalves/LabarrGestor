import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../testing/harness.ts';

let t: Awaited<ReturnType<typeof startTestServer>>;
before(async () => {
  t = await startTestServer({ RATE_LIMIT_HEAVY_PER_MIN: '2' });
});
after(async () => { await t.close(); });

test('rota pesada (relativa a /api) tem limite próprio; rota comum não é afetada', async () => {
  for (let i = 0; i < 2; i++) {
    const r = await t.api('POST', '/api/xml/process-batch', { xmls: [] });
    assert.equal(r.status, 400, `chamada ${i + 1}`); // falha de validação também conta
  }
  const blocked = await t.api('POST', '/api/xml/process-batch', { xmls: [] });
  assert.equal(blocked.status, 429);
  assert.match(blocked.body.message, /Muitas requisições/);
  assert.ok(Number(blocked.headers.get('retry-after')) >= 1);
  assert.equal((await t.api('GET', '/api/xml/setores')).status, 200);
});
