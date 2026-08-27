/**
 * One-shot backfill: Firestore -> Supabase (Postgres).
 *
 * Uso:
 *   npx tsx scripts/supabase/migrate.ts            # coleções sem prefixo -> schema public
 *   npx tsx scripts/supabase/migrate.ts --test     # coleções test_*      -> schema test
 *   npx tsx scripts/supabase/migrate.ts --only=suppliers,categories
 *
 * Pré-condições:
 *   - `.env` (ou ambiente) com SUPABASE_URL e SUPABASE_SERVICE_KEY.
 *   - Rodar LOCALMENTE com credenciais do Firebase Admin SDK
 *     (GOOGLE_APPLICATION_CREDENTIALS ou `gcloud auth application-default login`).
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { getDb, initFirebase } from '../../src/backend/firebase.js';
import { normalizeTimestamps } from '../../src/backend/data/supabaseRepo.js';

// --- carregador de .env minimalista (sem dependência de dotenv) ---
const envPath = path.join(process.cwd(), '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '');
    if (!(key in process.env)) process.env[key] = value;
  }
}

const COLLECTIONS = [
  'invoices', 'xml_spendings', 'price_increases', 'suppliers', 'categories', 'setores',
  'product_categories', 'product_setores', 'authorized_users', 'delivered_products', 'reminders',
  'shopping_lists', 'purchase_orders', 'pending_list_products', 'setor_limits', 'push_subscriptions',
];

const args = process.argv.slice(2);
const useTest = args.includes('--test');
const only = args.find(a => a.startsWith('--only='))?.split('=')[1]?.split(',').map(s => s.trim()).filter(Boolean);
const schema = useTest ? 'test' : 'public';
const prefix = useTest ? 'test_' : '';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Faltando SUPABASE_URL e/ou SUPABASE_SERVICE_KEY (defina no .env ou no ambiente).');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema } });

async function run() {
  await initFirebase();
  const db: any = await getDb();
  if (typeof db?.collection !== 'function') {
    throw new Error('Admin SDK unavailable — run locally with GOOGLE_APPLICATION_CREDENTIALS / application-default credentials');
  }

  const list = only ?? COLLECTIONS;
  const report: Record<string, { firestore: number; supabase: number }> = {};

  console.log(`Backfill schema=${schema} prefix="${prefix}" coleções=${list.length}`);

  for (const coll of list) {
    const srcName = prefix + coll;
    const snap = await db.collection(srcName).get();
    const rows = snap.docs.map((d: any) => ({
      id: d.id,
      data: normalizeTimestamps(d.data()),
      updated_at: new Date().toISOString(),
    }));

    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await sb.from(coll).upsert(chunk);
      if (error) throw new Error(`upsert ${coll}: ${error.message}`);
    }

    const { count, error: countError } = await sb.from(coll).select('*', { count: 'exact', head: true });
    if (countError) throw new Error(`count ${coll}: ${countError.message}`);

    report[coll] = { firestore: rows.length, supabase: count ?? -1 };
    console.log(`  ${coll}: firestore=${rows.length} supabase=${count ?? -1}`);
  }

  const mismatches = Object.entries(report).filter(([, v]) => v.firestore !== v.supabase);
  if (mismatches.length) {
    console.log(`\n⚠ divergências: ${mismatches.map(([k]) => k).join(', ')}`);
    process.exit(1);
  }
  console.log('\n✓ contagens conferem');
  process.exit(0);
}

run().catch(e => { console.error(e); process.exit(1); });
