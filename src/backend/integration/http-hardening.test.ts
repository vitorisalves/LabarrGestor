import { test, after, before } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer } from '../testing/harness.ts';

let t: Awaited<ReturnType<typeof startTestServer>>;
before(async () => { t = await startTestServer({ BODY_LIMIT: '1kb' }); });
after(async () => { await t.close(); });

test('cabeçalhos de segurança presentes e sem x-powered-by', async () => {
  const r = await t.api('GET', '/api/health');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(r.headers.get('x-powered-by'), null);
});

test('corpo acima do limite devolve 413 com mensagem em português', async () => {
  const r = await t.api('POST', '/api/xml/process', { xmlData: 'x'.repeat(5000) });
  assert.equal(r.status, 413);
  assert.match(r.body.message, /grande demais/);
});

test('sem CORS: origem externa não recebe access-control-allow-origin', async () => {
  const g = await t.api('GET', '/api/health', undefined, { Origin: 'https://evil.example' });
  assert.equal(g.headers.get('access-control-allow-origin'), null);
  const o = await t.api('OPTIONS', '/api/xml/process', undefined, {
    Origin: 'https://evil.example',
    'Access-Control-Request-Method': 'POST',
  });
  assert.equal(o.headers.get('access-control-allow-origin'), null);
});
