import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSupabaseRepo } from './supabaseRepo.ts';

// Compara apenas a FORMA do retorno para uma coleção vazia — sem tocar a rede.
test('getDocs de coleção inexistente devolve exatamente {docs,empty}', async () => {
  const fake = {
    schema: () => fake,
    from: () => ({
      select: () => ({
        limit: () => Promise.resolve({ data: [], error: null }),
        then: (r: any) => Promise.resolve(r({ data: [], error: null }))
      })
    })
  } as any;
  const sup = makeSupabaseRepo(fake);
  const a = await sup.getDocs('nao_existe', 'nao_existe', true);
  assert.deepEqual(Object.keys(a).sort(), ['docs', 'empty']);
  assert.equal(a.empty, true);
  assert.equal(Array.isArray(a.docs), true);
});
