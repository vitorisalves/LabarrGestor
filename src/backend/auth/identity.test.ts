import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lookupIdentity } from './identity.js';

const fakeFetch = (body: any, ok = true) =>
  (async () => ({ ok, json: async () => body })) as unknown as typeof fetch;

test('login Google: devolve e-mail em minúsculas, verificado e provedor', async () => {
  const id = await lookupIdentity('t', {
    apiKey: 'k',
    fetchImpl: fakeFetch({ users: [{ localId: 'u1', email: 'A@x.com', emailVerified: true, displayName: 'Ana', photoUrl: 'p', providerUserInfo: [{ providerId: 'google.com' }] }] }),
  });
  assert.deepEqual(id, { uid: 'u1', email: 'a@x.com', emailVerified: true, provider: 'google.com', name: 'Ana', picture: 'p' });
});

test('sessão anônima: sem e-mail, não verificada, sem provedor', async () => {
  const id = await lookupIdentity('t', { apiKey: 'k', fetchImpl: fakeFetch({ users: [{ localId: 'u2', providerUserInfo: [] }] }) });
  assert.equal(id?.email, '');
  assert.equal(id?.emailVerified, false);
  assert.equal(id?.provider, null);
});

test('falhas viram null', async () => {
  assert.equal(await lookupIdentity('t', { apiKey: 'k', fetchImpl: fakeFetch({}, false) }), null);
  assert.equal(await lookupIdentity('t', { apiKey: 'k', fetchImpl: fakeFetch({ users: [] }) }), null);
  assert.equal(await lookupIdentity('t', { apiKey: 'k', fetchImpl: (async () => { throw new Error('rede'); }) as unknown as typeof fetch }), null);
  assert.equal(await lookupIdentity('', { apiKey: 'k', fetchImpl: fakeFetch({ users: [{ localId: 'x' }] }) }), null);
});
