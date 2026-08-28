/**
 * Seed do Supabase a partir dos snapshots `firestore_cache_*.json` da raiz do repo.
 *
 * USO: quando a cota do Firestore está esgotada e o backfill ao vivo
 * (`migrate.ts`) não pode rodar. Popula o Postgres com uma cópia possivelmente
 * defasada, boa o suficiente para testar o app num deploy de preview.
 *
 * NÃO é autoritativo. Antes da virada de produção, rode `migrate.ts` (lê o
 * Firestore ao vivo) para reconciliar.
 *
 *   npx tsx scripts/supabase/seed-from-cache.ts            # arquivos firestore_cache_<coll>.json  -> schema public
 *   npx tsx scripts/supabase/seed-from-cache.ts --test     # arquivos firestore_cache_test_<coll>.json -> schema test
 *   npx tsx scripts/supabase/seed-from-cache.ts --only=suppliers,invoices
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { normalizeTimestamps } from '../../src/backend/data/supabaseRepo.js';

// --- carregador de .env inline (sem dependência) ---
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const k = t.slice(0, eq).trim();
    const v = t.slice(eq + 1).trim();
    if (!(k in process.env)) process.env[k] = v;
  }
}

const COLLECTIONS = [
  'invoices', 'xml_spendings', 'price_increases', 'suppliers', 'categories', 'setores',
  'product_categories', 'product_setores', 'authorized_users', 'delivered_products',
  'reminders', 'shopping_lists', 'purchase_orders', 'pending_list_products',
  'setor_limits', 'push_subscriptions',
];

const args = process.argv.slice(2);
const useTest = args.includes('--test');
const only = args.find(a => a.startsWith('--only='))?.split('=')[1]?.split(',').map(s => s.trim()).filter(Boolean);
const schema = useTest ? 'test' : 'public';
const filePrefix = useTest ? 'firestore_cache_test_' : 'firestore_cache_';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Faltam SUPABASE_URL / SUPABASE_SERVICE_KEY no .env');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema } });

async function run() {
  const list = only ?? COLLECTIONS;
  const report: Record<string, { cache: number; supabase: number | null; note?: string }> = {};

  for (const coll of list) {
    // no schema public os arquivos test_ têm o prefixo embutido no nome; no schema
    // test o nome do arquivo é firestore_cache_test_<coll>.json e queremos a tabela <coll>.
    const file = path.join(process.cwd(), `${filePrefix}${coll}.json`);
    if (!fs.existsSync(file)) {
      report[coll] = { cache: 0, supabase: null, note: 'sem arquivo de cache — pulado' };
      console.log(`  ${coll}: (sem ${path.basename(file)})`);
      continue;
    }

    let parsed: any;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e: any) {
      report[coll] = { cache: 0, supabase: null, note: `JSON inválido: ${e.message}` };
      continue;
    }

    const docs: Array<{ id: string; data: any }> = Array.isArray(parsed?.docs) ? parsed.docs : [];
    const rows = docs
      .filter(d => d && typeof d.id === 'string' && d.id.length > 0)
      .map(d => ({ id: d.id, data: normalizeTimestamps(d.data ?? {}), updated_at: new Date().toISOString() }));

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await sb.from(coll).upsert(chunk);
      if (error) throw new Error(`upsert ${schema}.${coll}: ${error.message}`);
    }

    const { count, error: countErr } = await sb.from(coll).select('*', { count: 'exact', head: true });
    if (countErr) throw new Error(`count ${schema}.${coll}: ${countErr.message}`);
    report[coll] = { cache: rows.length, supabase: count ?? null };
    console.log(`  ${coll}: cache=${rows.length} supabase=${count}`);
  }

  const mismatches = Object.entries(report).filter(
    ([, v]) => v.supabase !== null && v.cache !== v.supabase,
  );
  console.log('');
  if (mismatches.length) {
    console.log(`⚠ divergências: ${mismatches.map(([k]) => k).join(', ')}`);
  } else {
    console.log('✓ contagens conferem com o cache (lembrete: o cache pode estar defasado — rode migrate.ts depois)');
  }
}

run().catch(e => {
  console.error(e);
  process.exit(1);
});
