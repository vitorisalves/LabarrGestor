/**
 * One-shot backfill: Firestore -> Supabase (Postgres).
 *
 * Uso:
 *   npx tsx scripts/supabase/migrate.ts                 # coleções sem prefixo -> schema public
 *   npx tsx scripts/supabase/migrate.ts --test          # coleções test_*      -> schema test
 *   npx tsx scripts/supabase/migrate.ts --only=suppliers,categories
 *   npx tsx scripts/supabase/migrate.ts --truncate      # apaga cada tabela alvo antes de reinserir
 *                                                       # (backfill autoritativo — remove órfãos de um seed anterior)
 *
 * Pré-condições:
 *   - `.env` (ou ambiente) com SUPABASE_URL e SUPABASE_SERVICE_KEY.
 *   - Rodar LOCALMENTE com GOOGLE_APPLICATION_CREDENTIALS apontando para o
 *     JSON de uma service account do Firebase com acesso de leitura ao Firestore.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getFirebaseConfig } from '../../src/backend/config.js';
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
const doTruncate = args.includes('--truncate');
const only = args.find(a => a.startsWith('--only='))?.split('=')[1]?.split(',').map(s => s.trim()).filter(Boolean);
const schema = useTest ? 'test' : 'public';
const prefix = useTest ? 'test_' : '';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Faltando SUPABASE_URL e/ou SUPABASE_SERVICE_KEY (defina no .env ou no ambiente).');
  process.exit(1);
}

const GAC = process.env.GOOGLE_APPLICATION_CREDENTIALS;
if (!GAC || !fs.existsSync(GAC)) {
  console.error('GOOGLE_APPLICATION_CREDENTIALS ausente ou aponta para arquivo inexistente.');
  console.error('Baixe uma chave de service account do Firebase (Configurações do projeto -> Contas de serviço) e aponte esta variável para o .json.');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, { db: { schema } });

async function run() {
  const serviceAccount = JSON.parse(fs.readFileSync(GAC!, 'utf8'));
  const cfg = await getFirebaseConfig();
  const databaseId = cfg.firestoreDatabaseId || '(default)';
  const app = initializeApp({ credential: cert(serviceAccount), projectId: serviceAccount.project_id });
  const db = getFirestore(app, databaseId);

  const list = only ?? COLLECTIONS;
  const report: Record<string, { firestore: number; supabase: number }> = {};

  console.log(`Backfill schema=${schema} prefix="${prefix}" db="${databaseId}" coleções=${list.length}${doTruncate ? ' (com --truncate)' : ''}`);

  for (const coll of list) {
    const srcName = prefix + coll;
    const snap = await db.collection(srcName).get();
    const rows = snap.docs.map((d) => ({
      id: d.id,
      data: normalizeTimestamps(d.data()),
      updated_at: new Date().toISOString(),
    }));

    if (doTruncate) {
      // PostgREST exige um filtro no delete; `id >= ''` casa todas as linhas (id é text).
      const { error: delErr } = await sb.from(coll).delete().gte('id', '');
      if (delErr) throw new Error(`truncate ${coll}: ${delErr.message}`);
    }

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
