import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, createSign } from 'node:crypto';
import { verifyIdToken, resetCertCache } from './identity.js';

const PROJECT = 'proj-x';
const NOW = 1_800_000_000_000;
const sec = Math.floor(NOW / 1000);

const pair = () => generateKeyPairSync('rsa', { modulusLength: 2048 });
const good = pair();
const other = pair();
const pem = (k: ReturnType<typeof pair>) => k.publicKey.export({ type: 'spki', format: 'pem' }) as string;

const certsFetch = (keys: Record<string, string>) =>
  (async () => ({ ok: true, json: async () => keys, headers: { get: () => 'public, max-age=3600' } })) as unknown as typeof fetch;
const down = (async () => { throw new Error('rede'); }) as unknown as typeof fetch;

function sign(payload: any, priv = good.privateKey, header: any = { alg: 'RS256', kid: 'k1' }) {
  const h = Buffer.from(JSON.stringify(header)).toString('base64url');
  const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const s = createSign('RSA-SHA256').update(`${h}.${p}`).sign(priv).toString('base64url');
  return `${h}.${p}.${s}`;
}

const claims = (extra: any = {}) => ({
  aud: PROJECT, iss: `https://securetoken.google.com/${PROJECT}`, sub: 'u1',
  iat: sec - 10, exp: sec + 3000, email: 'A@x.com', email_verified: true,
  name: 'Ana', picture: 'p', firebase: { sign_in_provider: 'google.com' }, ...extra,
});

const deps = (fetchImpl = certsFetch({ k1: pem(good) })) => ({ projectId: PROJECT, fetchImpl, now: NOW });

beforeEach(() => resetCertCache());

test('login Google: e-mail em minúsculas, verificado e provedor', async () => {
  const id = await verifyIdToken(sign(claims()), deps());
  assert.deepEqual(id, { uid: 'u1', email: 'a@x.com', emailVerified: true, provider: 'google.com', name: 'Ana', picture: 'p' });
});

test('sessão anônima: sem e-mail, não verificada, sem provedor', async () => {
  const id = await verifyIdToken(sign(claims({ email: undefined, email_verified: undefined, firebase: { sign_in_provider: 'anonymous' } })), deps());
  assert.equal(id?.email, '');
  assert.equal(id?.emailVerified, false);
  assert.equal(id?.provider, null);
});

test('recusa assinatura de outra chave e conteúdo adulterado', async () => {
  assert.equal(await verifyIdToken(sign(claims(), other.privateKey), deps()), null);
  const [h, , s] = sign(claims()).split('.');
  const forged = Buffer.from(JSON.stringify(claims({ sub: 'admin' }))).toString('base64url');
  assert.equal(await verifyIdToken(`${h}.${forged}.${s}`, deps()), null);
});

test('recusa projeto, emissor, validade e emissão inválidos', async () => {
  assert.equal(await verifyIdToken(sign(claims({ aud: 'outro' })), deps()), null);
  assert.equal(await verifyIdToken(sign(claims({ iss: 'https://securetoken.google.com/outro' })), deps()), null);
  assert.equal(await verifyIdToken(sign(claims({ exp: sec - 600 })), deps()), null);
  assert.equal(await verifyIdToken(sign(claims({ iat: sec + 600 })), deps()), null);
  assert.equal(await verifyIdToken(sign(claims({ sub: '' })), deps()), null);
});

test('recusa algoritmo diferente de RS256 e chave desconhecida', async () => {
  assert.equal(await verifyIdToken(sign(claims(), good.privateKey, { alg: 'none', kid: 'k1' }), deps()), null);
  assert.equal(await verifyIdToken(sign(claims(), good.privateKey, { alg: 'RS256', kid: 'zz' }), deps()), null);
});

test('entradas inválidas viram null', async () => {
  assert.equal(await verifyIdToken('', deps()), null);
  assert.equal(await verifyIdToken('a.b', deps()), null);
  assert.equal(await verifyIdToken('a.b.c', deps()), null);
  assert.equal(await verifyIdToken(sign(claims()), { ...deps(), projectId: '' }), null);
});

test('Google fora do ar: sem chaves guardadas recusa; com chaves guardadas segue valendo', async () => {
  assert.equal(await verifyIdToken(sign(claims()), deps(down)), null);

  assert.ok(await verifyIdToken(sign(claims()), deps())); // guarda as chaves
  const later = { projectId: PROJECT, fetchImpl: down, now: NOW + 2 * 3600 * 1000 }; // cache vencido
  assert.ok(await verifyIdToken(sign(claims({ exp: sec + 3 * 3600 })), later));
});
