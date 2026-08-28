import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSupabaseRepo } from './supabaseRepo.ts';

// Compara apenas a FORMA do retorno para uma coleção vazia — sem tocar a rede.
test('getDocs de coleção inexistente devolve exatamente {docs,empty}', async () => {
  const empty = { data: [] as any[], error: null };
  const fake = {
    schema: () => fake,
    from: () => ({
      select: () => ({
        limit: () => Promise.resolve(empty),
        range: () => Promise.resolve(empty),
        then: (r: any) => Promise.resolve(r(empty))
      })
    })
  } as any;
  const sup = makeSupabaseRepo(fake);
  const a = await sup.getDocs('nao_existe', 'nao_existe', true);
  assert.deepEqual(Object.keys(a).sort(), ['docs', 'empty']);
  assert.equal(a.empty, true);
  assert.equal(Array.isArray(a.docs), true);
});
