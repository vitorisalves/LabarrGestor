import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionOf } from './version.ts';

test('versionOf: ausente, inválido e negativo valem 0; inteiro válido é mantido', () => {
  assert.equal(versionOf(undefined), 0);
  assert.equal(versionOf({}), 0);
  assert.equal(versionOf({ version: 'x' }), 0);
  assert.equal(versionOf({ version: -3 }), 0);
  assert.equal(versionOf({ version: 1.5 }), 0);
  assert.equal(versionOf({ version: 4 }), 4);
});
