import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePushConfig } from './config.ts';

test('sem variáveis, as chaves VAPID ficam vazias (nenhuma chave embutida no código)', () => {
  const c = resolvePushConfig({} as any);
  assert.equal(c.publicKey, '');
  assert.equal(c.privateKey, '');
});

test('com variáveis, usa os valores e o contato configurável', () => {
  const c = resolvePushConfig({ VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv', VAPID_CONTACT_EMAIL: 'mailto:x@y.com' } as any);
  assert.deepEqual(c, { publicKey: 'pub', privateKey: 'priv', email: 'mailto:x@y.com' });
});

test('contato padrão continua o que já era', () => {
  assert.equal(resolvePushConfig({} as any).email, 'mailto:vitorisalves1@gmail.com');
});
