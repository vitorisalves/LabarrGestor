/**
 * Semeia o ambiente de TESTE local com notas e um fornecedor para validar a estimativa de preços.
 * Uso (servidor local no ar, .env com DISABLE_PERMISSION_ENFORCEMENT=1):
 *   npx tsx scripts/dev/seed-test-invoices.ts
 * Tudo vai com o cabeçalho x-test-mode: true, ou seja, para as coleções de TESTE.
 */

const BASE = process.env.SEED_BASE_URL || 'http://localhost:3000';
const HEADERS = { 'Content-Type': 'application/json', 'x-test-mode': 'true' };
const SUPPLIER = 'FORNECEDOR TESTE SEED';

const daysAgo = (days: number): string => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10) + 'T10:00:00-03:00';
};

interface Scenario { code: string; name: string; prices: number[]; lastDaysAgo: number; stepDays: number }

// prices em ordem cronológica; a última nota fica a `lastDaysAgo` dias, as anteriores a cada `stepDays`.
const SCENARIOS: Scenario[] = [
  { code: 'SEED-ARROZ', name: 'ARROZ TIPO 1 5KG', prices: [20, 21, 22, 23, 24, 25], lastDaysAgo: 20, stepDays: 30 },
  { code: 'SEED-LEITE', name: 'LEITE INTEGRAL 1L', prices: [6.0, 5.8, 5.6, 5.4, 5.2, 5.0], lastDaysAgo: 20, stepDays: 30 },
  { code: 'SEED-OVO', name: 'OVOS BRANCOS CX 30', prices: [10, 14, 9, 15, 10, 14], lastDaysAgo: 20, stepDays: 30 },
  { code: 'SEED-SAL', name: 'SAL REFINADO 1KG', prices: [3, 3, 3, 3, 3, 3], lastDaysAgo: 20, stepDays: 30 },
  { code: 'SEED-AZEITE', name: 'AZEITE EXTRA VIRGEM 500ML', prices: [32], lastDaysAgo: 10, stepDays: 30 },
  { code: 'SEED-FARINHA', name: 'FARINHA ESPECIAL 1KG', prices: [8], lastDaysAgo: 120, stepDays: 30 },
];

let counter = 0;
const buildXml = (s: Scenario, price: number, daysBack: number): string => {
  counter += 1;
  const key = `SEED${String(Date.now()).slice(-8)}${String(counter).padStart(4, '0')}`;
  const qty = 10;
  const total = (price * qty).toFixed(2);
  return `<nfeProc><NFe><infNFe Id="NFe${key}"><ide><nNF>${counter}</nNF><dhEmi>${daysAgo(daysBack)}</dhEmi></ide>
<emit><CNPJ>00000000000191</CNPJ><xNome>${SUPPLIER}</xNome></emit>
<det nItem="1"><prod><cProd>${s.code}</cProd><xProd>${s.name}</xProd><qCom>${qty}</qCom><vUnCom>${price.toFixed(2)}</vUnCom><vProd>${total}</vProd></prod></det>
<total><ICMSTot><vNF>${total}</vNF></ICMSTot></total></infNFe></NFe></nfeProc>`;
};

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: HEADERS, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`${path} -> HTTP ${res.status}: ${await res.text()}`);
}

async function main() {
  for (const s of SCENARIOS) {
    for (let i = 0; i < s.prices.length; i++) {
      const daysBack = s.lastDaysAgo + (s.prices.length - 1 - i) * s.stepDays;
      await post('/api/xml/process', { xmlData: buildXml(s, s.prices[i], daysBack) });
    }
    console.log(`notas: ${s.name} (${s.prices.length})`);
  }

  const lastPurchase = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };
  const catalog = [
    ...SCENARIOS.map(s => ({ code: s.code, name: s.name, price: s.prices[s.prices.length - 1], categories: ['Ingredientes'], setor: '', lastPurchaseDate: lastPurchase(s.lastDaysAgo) })),
    { code: 'SEED-CAFE', name: 'CAFE TORRADO 500G', price: 18, categories: ['Ingredientes'], setor: '', lastPurchaseDate: lastPurchase(45) },
    { code: 'SEED-NOVO', name: 'PRODUTO NOVO SEM NADA', price: 0, categories: ['Ingredientes'], setor: '' },
  ];
  await post('/api/xml/suppliers', { id: 'seed-fornecedor', name: SUPPLIER, phone: '11999999999', products: catalog });
  console.log(`fornecedor: ${SUPPLIER} (${catalog.length} produtos)`);
}

main().catch(err => { console.error(err); process.exit(1); });
