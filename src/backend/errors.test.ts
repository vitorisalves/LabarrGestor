import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describeError, isProductionEnv } from './errors.ts';

test('produção: erro 500 vira mensagem genérica com código de referência, sem o texto original', () => {
  const r = describeError(new Error('connection to db.supabase.co:5432 refused, password=abc'), { production: true, ref: 'ab12cd' });
  assert.equal(r.status, 500);
  assert.equal(r.body.ref, 'ab12cd');
  assert.match(r.body.message, /ab12cd/);
  assert.doesNotMatch(JSON.stringify(r.body), /supabase|password/);
});

test('desenvolvimento: mantém a mensagem original', () => {
  const r = describeError(new Error('falhou X'), { production: false, ref: 'zz' });
  assert.equal(r.body.message, 'falhou X');
});

test('erro 4xx (validação) sempre mostra a mensagem, inclusive em produção', () => {
  const e: any = new Error('Preço inválido'); e.status = 400; e.name = 'ValidationError';
  const r = describeError(e, { production: true, ref: 'zz' });
  assert.equal(r.status, 400);
  assert.equal(r.body.message, 'Preço inválido');
  assert.equal(r.body.ref, undefined);
});

test('status fora de 400–599 vira 500', () => {
  const e: any = new Error('x'); e.status = 0;
  assert.equal(describeError(e, { production: false }).status, 500);
});

test('isProductionEnv: NODE_ENV=production ou Vercel', () => {
  assert.equal(isProductionEnv({ NODE_ENV: 'production' } as any), true);
  assert.equal(isProductionEnv({ VERCEL: '1' } as any), true);
  assert.equal(isProductionEnv({} as any), false);
});

test('corpo grande (413) vira mensagem em português, também em produção', () => {
  const r = describeError({ type: 'entity.too.large', status: 413, message: 'request entity too large' }, { production: true });
  assert.equal(r.status, 413);
  assert.match(r.body.message, /grande demais/);
  assert.doesNotMatch(r.body.message, /entity/);
});
