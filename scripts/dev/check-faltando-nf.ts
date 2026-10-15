/**
 * Confere o "Faltando NF" por mês sobre as notas de um servidor local.
 *   npx tsx scripts/dev/check-faltando-nf.ts 2026-10-01 2026-10-31
 * Só lê (GET /api/xml/invoices); usa a mesma função do Dashboard (src/shared/missingNF.ts).
 */
import { missingNFBalances, NFEntry } from '../../src/shared/missingNF';

const BASE = process.env.BASE || 'http://localhost:3000';
const [from = '2026-10-01', to = '2026-10-31'] = process.argv.slice(2);

async function main() {
  const res = await fetch(`${BASE}/api/xml/invoices?fresh=true`, { headers: { 'Cache-Control': 'no-cache' } });
  const invoices: any[] = await res.json();
  const start = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T23:59:59`);
  const entries: NFEntry[] = [];

  for (const inv of invoices) {
    const raw = inv.dhEmi || inv.date || inv.createdAt;
    if (!raw) continue;
    const d = new Date(raw);
    if (isNaN(d.getTime()) || d < start || d > end) continue;
    const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (inv.source === 'shopping_list' && inv.hasNF !== true) {
      const val = typeof inv.vTotTrib === 'number' && inv.vTotTrib > 0 ? inv.vTotTrib : (inv.vNF || inv.total || 0);
      entries.push({ month, kind: 'list', value: val });
    } else if (inv.source !== 'shopping_list') {
      const gross = (inv.products || []).reduce((a: number, p: any) => a + ((p.vUnComGross || p.vUnCom || p.price || 0) * (p.quantity || 1)), 0);
      const net = typeof inv.vTotTrib === 'number' && inv.vTotTrib > 0 ? inv.vTotTrib : (inv.vNF || inv.total || 0);
      entries.push({ month, kind: 'real', value: gross > 0 ? gross : net });
    }
  }

  const list = entries.filter(e => e.kind === 'list');
  const real = entries.filter(e => e.kind === 'real');
  const balance = missingNFBalances(entries).get('') ?? { value: 0 };
  console.log(JSON.stringify({
    periodo: `${from} a ${to}`,
    entradasListaNF: { qtd: list.length, valor: Math.round(list.reduce((a, e) => a + e.value, 0) * 100) / 100 },
    notasReaisNoPeriodo: { qtd: real.length, valor: Math.round(real.reduce((a, e) => a + e.value, 0) * 100) / 100 },
    faltandoNF: balance,
  }, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
