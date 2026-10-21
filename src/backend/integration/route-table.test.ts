import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

process.env.DATA_BACKEND = 'memory';
process.env.DISABLE_BACKGROUND_WORKER = '1';
process.env.DISABLE_PERMISSION_ENFORCEMENT = '1';

const GOLDEN = new URL('./route-table.golden.json', import.meta.url);

type Entry = { method: string; path: string };

async function snapshot() {
  const { default: app } = await import('../app.ts');
  const stack: any[] = (app as any)._router.stack;
  const ordered: Entry[] = [];
  const middleware: string[] = [];
  const regexps: RegExp[] = [];
  const layout: string[] = [];
  for (const layer of stack) {
    if (layer.route) {
      layout.push('R');
      const methods = layer.route.methods._all ? ['ALL'] : Object.keys(layer.route.methods).map(m => m.toUpperCase());
      for (const method of methods) {
        ordered.push({ method, path: String(layer.route.path) });
        regexps.push(layer.regexp);
      }
    } else {
      layout.push('M');
      middleware.push(layer.name || '<anonymous>');
    }
  }
  return { ordered, middleware, regexps, layout: layout.join('').replace(/R+/g, 'R') };
}

const label = (e: Entry) => `${e.method} ${e.path}`;
const sampleUrl = (p: string) => p.replace(/:[A-Za-z0-9_]+/g, 'x').replace(/\*/g, 'x');
const methodsOverlap = (a: string, b: string) => a === b || a === 'ALL' || b === 'ALL';

test('tabela de rotas: conjunto igual ao golden', async () => {
  const { ordered } = await snapshot();
  const actual = ordered.map(label).sort();
  if (process.env.UPDATE_GOLDEN === '1') {
    const snap = await snapshot();
    fs.writeFileSync(GOLDEN, JSON.stringify({
      routes: actual,
      ordered: snap.ordered.map(label),
      middleware: snap.middleware,
      layout: snap.layout,
    }, null, 2) + '\n');
  }
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  assert.deepEqual(actual, golden.routes);
});

test('tabela de rotas: middlewares de aplicação na mesma ordem', async () => {
  const { middleware, layout } = await snapshot();
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  assert.deepEqual(middleware, golden.middleware);
  assert.equal(layout, golden.layout, 'middlewares (acesso/limites) antes das rotas e tratador de erros por último');
});

test('tabela de rotas: rotas que podem casar a mesma URL mantêm a ordem relativa', async () => {
  const { ordered, regexps } = await snapshot();
  const golden = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  const goldenOrder: string[] = golden.ordered;
  const actualOrder = ordered.map(label);
  assert.equal(new Set(actualOrder).size, actualOrder.length, 'rota duplicada');
  const pos = new Map(actualOrder.map((l, i) => [l, i]));
  let checked = 0;
  for (let i = 0; i < ordered.length; i++) {
    for (let j = 0; j < ordered.length; j++) {
      if (i === j || !methodsOverlap(ordered[i].method, ordered[j].method)) continue;
      // a rota i casa a URL de exemplo da rota j?
      if (!regexps[i].test(sampleUrl(ordered[j].path))) continue;
      const a = label(ordered[i]), b = label(ordered[j]);
      const ga = goldenOrder.indexOf(a), gb = goldenOrder.indexOf(b);
      assert.ok(ga >= 0 && gb >= 0, `rota fora do golden: ${a} / ${b}`);
      assert.equal(pos.get(a)! < pos.get(b)!, ga < gb, `ordem mudou entre "${a}" e "${b}"`);
      checked++;
    }
  }
  assert.ok(checked >= 0);
});
