# Estimativa de Preços — Fase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Estimar o preço provável de cada item de uma requisição de compra a partir das notas fiscais, aplicar margem de segurança configurável, mostrar a confiança e definir o valor aprovado (limite) na 1ª aprovação, sem alterar o sistema em produção até a validação.

**Architecture:** Módulo puro compartilhado (`src/shared/priceEstimation.ts`) + camada de serviço no servidor que lê notas/cadastro/configuração e **congela o snapshot** em cada item ao criar a requisição. Tudo atrás do **feature flag `PRICE_ESTIMATION_ENABLED`** (desligado por padrão): com a flag desligada o servidor e a interface se comportam exatamente como hoje.

**Tech Stack:** TypeScript, Express (`src/backend/app.ts`), React + Vite, Node test runner (`tsx --test`), Supabase/Postgres (produção) e Firestore (desenvolvimento local), Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-15-estimativa-de-precos-fase-1-design.md` (visão geral: `docs/superpowers/specs/2026-10-15-estimativa-de-precos-visao-geral.md`)

## Global Constraints

- O **valor gasto do mês do dashboard permanece exatamente como hoje** (notas fiscais + entradas "Sem NF"; "NF" fica em "Faltando NF"). Nada nesta fase altera essa conta.
- **Não inventar preço**: produto sem compra, sem cadastro e sem cotação fica com `estimatedPrice = 0`, confiança `sem_referencia`, e **não bloqueia** a aprovação.
- Preço do **cadastro** do produto vale como referência de compra única (método `cadastro`, confiança `baixa`).
- O **valor aprovado (limite)** é definido na **1ª aprovação** (`approve-requisition`); a 2ª aprovação (`approve`) apenas reconfirma, sem recalcular. Mudar o limite sugerido exige motivo.
- `price` do item da requisição passa a valer a estimativa **sem margem**; `total` = `estimatedTotal`. Requisições antigas (sem `estimate`) continuam abrindo normalmente.
- Mesmos dados e parâmetros produzem sempre o mesmo resultado; o snapshot guarda `params` e `computedAt`.
- O servidor **recalcula** a estimativa e ignora qualquer preço/estimativa enviado pelo navegador (só aceita `manualPrice` validado).
- Planilha de fornecedores: **somente adição**, imposta no servidor; "Substituir lista" é removido.
- Parâmetros iniciais: `windowMonths` 12, `maxMonthlyTrendPct` 5, `maxProjectionMonths` 6, `leadDays` 0, `defaultBase` 5, `volK` 1, `ageStartMonths` 1, `agePctPerMonth` 0.5, `minMargin` 3, `maxMargin` 25, `staleDays` 180.
- Percentuais são guardados como número em pontos percentuais (5 = 5%).
- Novas permissões: `prices.config`. Rotas: `/xml/price-estimates` → qualquer pessoa aprovada (`null`); `/xml/price-settings` → `prices.config`.
- Textos de interface em português do Brasil. Seguir os padrões existentes (Tailwind, `formatCurrency` de `src/frontend/utils`).
- Rodar testes de forma direcionada: `npx tsx --test <arquivos>`. **Não** rodar `npm test` completo: `src/backend/data/routes.reminders.test.ts` importa o app inteiro e não termina.

## Estratégia de desenvolvimento seguro (não substituir o sistema atual)

1. **Worktree isolado**: todo o trabalho acontece em `C:\vscode\labarr-gestor-estimativa`, na branch `feature/estimativa-precos`, criada a partir da `main`. A pasta `C:\vscode\labarr-gestor` (main) continua intacta e pronta para correções urgentes.
2. **Feature flag**: `PRICE_ESTIMATION_ENABLED=1` só existe no `.env` do worktree. No Vercel a variável **não** existe, então mesmo depois do merge a produção não muda até alguém criar a variável.
3. **Dados**: o worktree usa `DATA_BACKEND=firestore` (Firestore local, **não** o Supabase de produção) e o **Modo de Teste** ligado na interface, que grava em coleções de teste. **Nunca** mude `DATA_BACKEND` para `supabase` no worktree: o `.env` contém as chaves do Supabase de produção.
4. **Teste no localhost:3000** com dados semeados (Task 14) antes de qualquer merge.
5. **Nada vai para a `main` nem para o Vercel** sem aprovação explícita; o roteiro de publicação está na Task 15 e é executado só quando o usuário mandar.

## Estrutura de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `src/shared/text.ts` (novo) | `normName`: chave de comparação de nomes |
| `src/shared/units.ts` (novo) | `extractWeightKg` (movido de `priceAnalysis.ts`) |
| `src/shared/priceEstimation.ts` (novo) | Motor puro `estimatePrice` + tipos + parâmetros iniciais |
| `src/shared/priceSettings.ts` (novo) | `normalizeParams`, `validateParams`, `diffParams` |
| `src/shared/supplierMerge.ts` (novo) | `mergeSuppliersAddOnly` |
| `src/shared/permissions.ts` | permissão `prices.config` e regras de rota |
| `src/backend/services/priceEstimationService.ts` (novo) | Notas/cadastro → entrada do motor; `estimateItems` |
| `src/backend/services/orderEstimates.ts` (novo) | Montar requisição, aprovar limite, montar lista |
| `src/backend/app.ts` | Flag, rotas novas e integração em `purchase_orders` / `suppliers/import` |
| `src/frontend/utils/priceEstimationApi.ts` (novo) | Chamadas à API de estimativa/configuração |
| `src/frontend/hooks/usePriceEstimation.ts` (novo) | Pré-visualização no carrinho |
| `src/frontend/components/prices/*` (novos) | Selo de confiança, linha de estimativa, limite, configurações |
| `CartModal`, `PurchaseOrdersView`, `SettingsModal`, `ImportModal` | Integração da interface |
| `scripts/supabase/add-price-settings.sql`, `schema.sql` | Tabela `price_settings` |
| `scripts/dev/seed-test-invoices.ts` (novo) | Dados de teste para validar no localhost:3000 |

---

### Task 0: Workspace isolado e ambiente local

**Files:**
- Create: pasta `C:\vscode\labarr-gestor-estimativa` (worktree) e seu `.env`
- Verify: `docs/superpowers/specs/2026-10-15-estimativa-de-precos-fase-1-design.md` existe na `main`

**Interfaces:**
- Produces: worktree com dependências instaladas, `.env` com `PRICE_ESTIMATION_ENABLED=1` e `DISABLE_PERMISSION_ENFORCEMENT=1`, servidor de desenvolvimento subindo na porta 3000.

- [ ] **Step 1: Garantir que a main esteja limpa e atualizada**

Run (PowerShell, em `C:\vscode\labarr-gestor`): `git status --short; git log --oneline -1`
Expected: só `git.txt` modificado (ou nada) e o último commit com as specs/plano. Se houver outras alterações, commitar ou guardar antes de continuar.

- [ ] **Step 2: Criar o worktree e a branch**

Run: `git worktree add ..\labarr-gestor-estimativa -b feature/estimativa-precos main`
Expected: `Preparing worktree (new branch 'feature/estimativa-precos')`.

- [ ] **Step 3: Instalar dependências**

Run: `cd ..\labarr-gestor-estimativa; npm install`
Expected: termina sem erro. Sem `ERESOLVE` fatal.

- [ ] **Step 4: Copiar arquivos de ambiente ignorados pelo git**

Run: `Copy-Item ..\labarr-gestor\.env .env -Force; if (Test-Path ..\labarr-gestor\firebase-applet-config.json) { Copy-Item ..\labarr-gestor\firebase-applet-config.json . -Force }`
Expected: `.env` e (se existir) `firebase-applet-config.json` presentes no worktree.

- [ ] **Step 5: Ajustar o `.env` do worktree**

Edit `C:\vscode\labarr-gestor-estimativa\.env`: confirmar que a primeira linha é `DATA_BACKEND=firestore` e acrescentar no final:

```
PRICE_ESTIMATION_ENABLED=1
DISABLE_PERMISSION_ENFORCEMENT=1
```

- [ ] **Step 6: Verificar tipos e testes de partida**

Run: `npx tsc --noEmit; npx tsx --test src/shared/permissions.test.ts`
Expected: `tsc` sem erros; `# pass 3`.

- [ ] **Step 7: Subir o servidor no localhost:3000**

Antes: encerrar o servidor da `main` se estiver rodando na porta 3000 (`Get-NetTCPConnection -LocalPort 3000`).
Run: `npm run dev`
Expected: `Server running on http://localhost:3000`. Abrir no navegador, ligar o **Modo de Teste** (faixa âmbar aparece) e conferir que o sistema carrega normalmente. Deixar o servidor para os testes manuais da Task 14.

- [ ] **Step 8: Sem commit** (nada versionado nesta task).

---

### Task 1: Utilitários compartilhados (`normName`, `extractWeightKg`)

**Files:**
- Create: `src/shared/text.ts`, `src/shared/units.ts`, `src/shared/units.test.ts`
- Modify: `src/frontend/utils/priceAnalysis.ts:8-19` (passa a importar `extractWeightKg`)

**Interfaces:**
- Produces: `normName(s: unknown): string`; `extractWeightKg(name: string): number | null`.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/shared/units.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractWeightKg } from './units';
import { normName } from './text';

test('extractWeightKg lê kg e g do nome', () => {
  assert.equal(extractWeightKg('ARROZ TIPO 1 5KG'), 5);
  assert.equal(extractWeightKg('Farinha 1,5 kg'), 1.5);
  assert.equal(extractWeightKg('SAL 500 G'), 0.5);
  assert.equal(extractWeightKg('LEITE INTEGRAL 1L'), null);
});

test('normName ignora acento, caixa e espaços', () => {
  assert.equal(normName('  Açúcar   Refinado '), 'acucar refinado');
  assert.equal(normName(null), '');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/shared/units.test.ts`
Expected: FAIL (`Cannot find module './units'`).

- [ ] **Step 3: Implementar**

Create `src/shared/text.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Minúsculas, sem acento, espaços colapsados e aparados. Chave de comparação de nomes. */
export const normName = (s: unknown): string =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
```

Create `src/shared/units.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Peso da embalagem em kg a partir do nome ("ARROZ 5KG" -> 5, "SAL 500 G" -> 0.5), ou null. */
export const extractWeightKg = (name: string): number | null => {
  const kgMatch = name.match(/([0-9]+(?:[.,][0-9]+)?)\s*KG\b/i);
  if (kgMatch) {
    return parseFloat(kgMatch[1].replace(',', '.'));
  }
  const gMatch = name.match(/([0-9]+(?:[.,][0-9]+)?)\s*G\b/i);
  if (gMatch) {
    return parseFloat(gMatch[1].replace(',', '.')) / 1000;
  }
  return null;
};
```

- [ ] **Step 4: Fazer o `priceAnalysis.ts` usar a função compartilhada**

Em `src/frontend/utils/priceAnalysis.ts`, apagar a definição local `const extractWeightKg = (name: string): number | null => { ... };` (linhas 8-19) e acrescentar no topo, junto ao `import { Supplier } from '../types';`:

```ts
import { extractWeightKg } from '../../shared/units';
```

- [ ] **Step 5: Rodar testes e tipos**

Run: `npx tsx --test src/shared/units.test.ts; npx tsc --noEmit`
Expected: testes passam (`# pass 2`), `tsc` sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/shared/text.ts src/shared/units.ts src/shared/units.test.ts src/frontend/utils/priceAnalysis.ts
git commit -m "refactor: move extractWeightKg para src/shared e adiciona normName"
```

---

### Task 2: Motor de estimativa

**Files:**
- Create: `src/shared/priceEstimation.ts`, `src/shared/priceEstimation.test.ts`

**Interfaces:**
- Consumes: nada (módulo puro).
- Produces: `estimatePrice(input: EstimateInput): PriceEstimate`; tipos `PriceParams`, `HistoryPoint`, `ManualReference`, `EstimateInput`, `PriceEstimate`, `Confidence`, `EstimateMethod`, `UnitKind`; constante `DEFAULT_PRICE_PARAMS`.

- [ ] **Step 1: Escrever os testes (cenários 1–9 e 15 da spec) que falham**

Create `src/shared/priceEstimation.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimatePrice, DEFAULT_PRICE_PARAMS, HistoryPoint } from './priceEstimation';

const P = DEFAULT_PRICE_PARAMS;
const MONTHLY = ['2026-01-15', '2026-02-15', '2026-03-15', '2026-04-15', '2026-05-15', '2026-06-15'];
const series = (prices: number[], unit: 'kg' | 'un' = 'un'): HistoryPoint[] =>
  prices.map((price, i) => ({ date: MONTHLY[i], price, unit }));
const base = { categories: [] as string[], packageKg: null as number | null, today: '2026-07-15', params: P };

test('1. aumento consistente: tendência limitada pelo teto mensal, confiança alta', () => {
  const r = estimatePrice({ ...base, history: series([10, 11, 12, 13, 14, 15]) });
  assert.equal(r.method, 'trend');
  assert.equal(r.lastPrice, 15);
  assert.equal(r.estimatedPrice, 15.74); // 15 + 0,75/mês (teto de 5%) * 0,986 mês
  assert.equal(r.marginPct, 5.21);
  assert.equal(r.protectedPrice, 16.56);
  assert.equal(r.confidence, 'alta');
  assert.equal(r.sampleSize, 6);
  assert.equal(r.intervalDays, 31);
});

test('2. redução de preços: estimativa abaixo do último preço', () => {
  const r = estimatePrice({ ...base, history: series([15, 14, 13, 12, 11, 10]) });
  assert.equal(r.method, 'trend');
  assert.equal(r.lastPrice, 10);
  assert.equal(r.estimatedPrice, 9.51);
  assert.ok(r.estimatedPrice < r.lastPrice);
  assert.equal(r.confidence, 'alta');
});

test('3. preços oscilantes: margem no teto e confiança média', () => {
  const r = estimatePrice({ ...base, history: series([10, 14, 9, 15, 10, 14]) });
  assert.equal(r.estimatedPrice, 14.49);
  assert.equal(r.marginPct, 25);
  assert.equal(r.protectedPrice, 18.11);
  assert.equal(r.confidence, 'media');
});

test('4. várias notas com preços iguais: sem tendência, margem base, confiança alta', () => {
  const r = estimatePrice({ ...base, history: series([10, 10, 10, 10, 10, 10]) });
  assert.equal(r.estimatedPrice, 10);
  assert.equal(r.marginPct, 5);
  assert.equal(r.protectedPrice, 10.5);
  assert.equal(r.confidence, 'alta');
});

test('5. uma compra recente: preço de referência + margem base, confiança baixa', () => {
  const r = estimatePrice({ ...base, history: [{ date: '2026-07-01', price: 100, unit: 'un' }] });
  assert.equal(r.method, 'single');
  assert.equal(r.estimatedPrice, 100);
  assert.equal(r.marginPct, 5);
  assert.equal(r.protectedPrice, 105);
  assert.equal(r.confidence, 'baixa');
});

test('6. uma compra antiga: a idade aumenta a margem, sem inventar aumento de preço', () => {
  const r = estimatePrice({ ...base, history: [{ date: '2026-04-15', price: 100, unit: 'un' }] });
  assert.equal(r.estimatedPrice, 100);
  assert.equal(r.marginPct, 5.99);
  assert.equal(r.protectedPrice, 105.99);
  assert.equal(r.confidence, 'baixa');
});

test('7. sem histórico, sem cadastro e sem cotação: sem referência, nada inventado', () => {
  const r = estimatePrice({ ...base, history: [] });
  assert.equal(r.method, 'none');
  assert.equal(r.estimatedPrice, 0);
  assert.equal(r.protectedPrice, 0);
  assert.equal(r.confidence, 'sem_referencia');
  assert.equal(r.noReference, true);
  assert.equal(r.marginPct, 5);
});

test('8. sem histórico com cotação e com preço manual', () => {
  const quote = estimatePrice({ ...base, history: [], reference: { kind: 'quote', value: 50, date: '2026-07-10', supplierName: 'X' } });
  assert.equal(quote.method, 'quote');
  assert.equal(quote.estimatedPrice, 50);
  assert.equal(quote.protectedPrice, 52.5);
  assert.equal(quote.confidence, 'baixa');
  assert.equal(quote.reference?.supplierName, 'X');

  const manual = estimatePrice({ ...base, history: [], reference: { kind: 'manual', value: 40, date: '2026-07-14' } });
  assert.equal(manual.method, 'manual');
  assert.equal(manual.protectedPrice, 42);
});

test('8b. cadastro vale como compra única; sem data assume preço desatualizado', () => {
  const dated = estimatePrice({ ...base, history: [], catalogPrice: 30, catalogDate: '2026-06-15' });
  assert.equal(dated.method, 'cadastro');
  assert.equal(dated.estimatedPrice, 30);
  assert.equal(dated.protectedPrice, 31.5);
  assert.equal(dated.confidence, 'baixa');

  const undated = estimatePrice({ ...base, history: [], catalogPrice: 30 });
  assert.equal(undated.marginPct, 7.46);
  assert.equal(undated.protectedPrice, 32.24);
  assert.equal(undated.lastPriceDate, null);
});

test('8c. precedência: cotação vence preço manual, que vence o cadastro', () => {
  const r = estimatePrice({ ...base, history: [], catalogPrice: 30, reference: { kind: 'manual', value: 44, date: '2026-07-10' } });
  assert.equal(r.method, 'manual');
  assert.equal(r.estimatedPrice, 44);
});

test('9. unidades diferentes: só compras do mesmo tipo entram; kg volta para a embalagem pedida', () => {
  const r = estimatePrice({
    ...base,
    packageKg: 5,
    history: [
      { date: '2026-05-15', price: 4, unit: 'kg' },
      { date: '2026-06-15', price: 4.4, unit: 'kg' },
      { date: '2026-06-20', price: 99, unit: 'un' },
    ],
  });
  assert.equal(r.sampleSize, 2);
  assert.equal(r.discardedUnit, 1);
  assert.equal(r.lastPrice, 22); // 4,40/kg * 5 kg
  assert.equal(r.estimatedPrice, 22.48);
  assert.equal(r.confidence, 'media');
});

test('15. dados inconsistentes são descartados e contados', () => {
  const r = estimatePrice({
    ...base,
    history: [
      { date: 'abc', price: 10, unit: 'un' },
      { date: '2026-06-01', price: -5, unit: 'un' },
      { date: '2027-01-01', price: 12, unit: 'un' },
      { date: '2026-06-10', price: 10, unit: 'un' },
    ],
  });
  assert.equal(r.discardedOther, 3);
  assert.equal(r.sampleSize, 1);
  assert.equal(r.method, 'single');
  assert.equal(r.estimatedPrice, 10);
});

test('duas compras: tendência reduzida a 25%', () => {
  const r = estimatePrice({
    ...base,
    history: [{ date: '2026-05-15', price: 10, unit: 'un' }, { date: '2026-06-15', price: 12, unit: 'un' }],
  });
  assert.equal(r.method, 'trend');
  assert.equal(r.estimatedPrice, 12.48);
  assert.equal(r.marginPct, 14.09);
  assert.equal(r.confidence, 'media');
});

test('compras no mesmo dia viram um ponto (média)', () => {
  const r = estimatePrice({
    ...base,
    history: [{ date: '2026-06-15', price: 10, unit: 'un' }, { date: '2026-06-15', price: 12, unit: 'un' }],
  });
  assert.equal(r.sampleSize, 1);
  assert.equal(r.estimatedPrice, 11);
});

test('histórico fora da janela: usa tudo, marca como antigo, projeção limitada a 6 meses', () => {
  const r = estimatePrice({
    ...base,
    history: [{ date: '2025-01-15', price: 10, unit: 'un' }, { date: '2025-03-15', price: 11, unit: 'un' }],
  });
  assert.equal(r.staleHistory, true);
  assert.equal(r.horizonMonths, 6);
  assert.equal(r.estimatedPrice, 11.77);
  assert.equal(r.confidence, 'baixa');
});

test('margem base por categoria: produto com várias categorias usa a maior', () => {
  const r = estimatePrice({
    ...base,
    categories: ['Ingredientes', 'Embalagens'],
    params: { ...P, baseByCategory: { Ingredientes: 8, Embalagens: 12 } },
    history: [{ date: '2026-07-10', price: 100, unit: 'un' }],
  });
  assert.equal(r.marginPct, 12);
  assert.equal(r.protectedPrice, 112);
});

test('reprodutível: mesmos dados e parâmetros dão o mesmo resultado e guardam os parâmetros usados', () => {
  const input = { ...base, history: series([10, 11, 12, 13, 14, 15]) };
  const a = estimatePrice(input);
  const b = estimatePrice(input);
  assert.deepEqual(a, b);
  assert.deepEqual(a.params, P);
  assert.equal(a.computedAt, '2026-07-15');
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/shared/priceEstimation.test.ts`
Expected: FAIL (`Cannot find module './priceEstimation'`).

- [ ] **Step 3: Implementar o motor**

Create `src/shared/priceEstimation.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Motor puro de estimativa de preço. Sem banco, relógio ou rede: a data de hoje e os
// parâmetros entram como argumentos, então os mesmos dados dão sempre o mesmo resultado.
// Percentuais são números em "pontos percentuais" (5 = 5%).

export interface PriceParams {
  windowMonths: number;
  maxMonthlyTrendPct: number;
  maxProjectionMonths: number;
  leadDays: number;
  defaultBase: number;
  baseByCategory: Record<string, number>;
  volK: number;
  ageStartMonths: number;
  agePctPerMonth: number;
  minMargin: number;
  maxMargin: number;
  staleDays: number;
  calibrationByCategory: Record<string, number>;
}

export const DEFAULT_PRICE_PARAMS: PriceParams = {
  windowMonths: 12,
  maxMonthlyTrendPct: 5,
  maxProjectionMonths: 6,
  leadDays: 0,
  defaultBase: 5,
  baseByCategory: {},
  volK: 1,
  ageStartMonths: 1,
  agePctPerMonth: 0.5,
  minMargin: 3,
  maxMargin: 25,
  staleDays: 180,
  calibrationByCategory: {},
};

export type UnitKind = 'kg' | 'un';
export type Confidence = 'alta' | 'media' | 'baixa' | 'sem_referencia';
export type EstimateMethod = 'trend' | 'single' | 'cadastro' | 'manual' | 'quote' | 'none';

export interface HistoryPoint {
  /** AAAA-MM-DD (ou ISO completo; só os 10 primeiros caracteres contam). */
  date: string;
  /** Preço unitário líquido: R$/kg quando unit = 'kg', R$/un caso contrário. */
  price: number;
  unit: UnitKind;
}

export interface ManualReference {
  kind: 'manual' | 'quote';
  /** Preço da embalagem pedida. */
  value: number;
  date: string;
  by?: string;
  supplierName?: string;
}

export interface EstimateInput {
  categories: string[];
  history: HistoryPoint[];
  /** Peso da embalagem pedida em kg (extractWeightKg do nome), ou null. */
  packageKg: number | null;
  catalogPrice?: number;
  catalogDate?: string | null;
  reference?: ManualReference | null;
  today: string;
  params: PriceParams;
}

export interface PriceEstimate {
  lastPrice: number;
  lastPriceDate: string | null;
  estimatedPrice: number;
  marginPct: number;
  protectedPrice: number;
  confidence: Confidence;
  method: EstimateMethod;
  sampleSize: number;
  discardedUnit: number;
  discardedOther: number;
  intervalDays: number | null;
  volatilityRel: number;
  horizonMonths: number;
  staleHistory: boolean;
  noReference: boolean;
  reference: ManualReference | null;
  computedAt: string;
  params: PriceParams;
}

const MONTH_DAYS = 30.4375;

const toDay = (iso: string): number => {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!y || !m || !d) return NaN;
  return Date.UTC(y, m - 1, d) / 86400000;
};

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;
const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n));

const median = (xs: number[]): number => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

interface Point { day: number; price: number }

export function estimatePrice(input: EstimateInput): PriceEstimate {
  const { params, today, categories } = input;
  const todayDay = toDay(today);
  const target = todayDay + params.leadDays;
  const itemUnit: UnitKind = input.packageKg ? 'kg' : 'un';

  // 1. Seleção e normalização para preço da embalagem pedida.
  let discardedUnit = 0;
  let discardedOther = 0;
  const byDay = new Map<number, number[]>();
  for (const h of input.history) {
    if (h.unit !== itemUnit) { discardedUnit++; continue; }
    const day = toDay(h.date);
    if (!Number.isFinite(day) || !(h.price > 0) || day > todayDay) { discardedOther++; continue; }
    const price = itemUnit === 'kg' ? h.price * (input.packageKg as number) : h.price;
    byDay.set(day, [...(byDay.get(day) || []), price]);
  }
  const all: Point[] = Array.from(byDay.entries())
    .map(([day, prices]) => ({ day, price: prices.reduce((a, b) => a + b, 0) / prices.length }))
    .sort((a, b) => a.day - b.day);

  // 2. Janela: últimos N meses; com menos de 2 compras nela usa todo o histórico.
  const cutoff = todayDay - params.windowMonths * MONTH_DAYS;
  const inWindow = all.filter(p => p.day >= cutoff);
  let used = inWindow;
  let staleHistory = false;
  if (inWindow.length < 2 && all.length > inWindow.length) {
    used = all;
    staleHistory = true;
  }
  const n = used.length;

  // 3. Referência (quando há compras, a última compra manda).
  let method: EstimateMethod;
  let lastPrice = 0;
  let lastDay: number | null = null;
  let reference: ManualReference | null = null;
  if (n >= 1) {
    method = n >= 2 ? 'trend' : 'single';
    lastPrice = used[n - 1].price;
    lastDay = used[n - 1].day;
  } else if (input.reference && input.reference.value > 0 && Number.isFinite(toDay(input.reference.date))) {
    method = input.reference.kind;
    reference = input.reference;
    lastPrice = input.reference.value;
    lastDay = toDay(input.reference.date);
  } else if (input.catalogPrice && input.catalogPrice > 0) {
    method = 'cadastro';
    lastPrice = input.catalogPrice;
    const d = input.catalogDate ? toDay(input.catalogDate) : NaN;
    lastDay = Number.isFinite(d) ? d : null;
  } else {
    method = 'none';
  }

  // 4. Tendência (Theil-Sen) e volatilidade.
  let slope = 0;
  let volatilityRel = 0;
  let intervalDays: number | null = null;
  if (method === 'trend') {
    const ms = used.map(p => (p.day - used[0].day) / MONTH_DAYS);
    const slopes: number[] = [];
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) slopes.push((used[j].price - used[i].price) / (ms[j] - ms[i]));
    }
    slope = median(slopes);
    if (n >= 3) {
      const intercept = median(used.map((p, i) => p.price - slope * ms[i]));
      const sse = used.reduce((acc, p, i) => acc + Math.pow(p.price - (intercept + slope * ms[i]), 2), 0);
      const meanP = used.reduce((a, p) => a + p.price, 0) / n;
      volatilityRel = Math.sqrt(sse / (n - 1)) / meanP;
      intervalDays = Math.round(median(used.slice(1).map((p, i) => p.day - used[i].day)));
    } else {
      volatilityRel = Math.abs(used[1].price - used[0].price) / (used[1].price + used[0].price);
    }
  }

  // 5. Projeção.
  const effectiveLastDay = lastDay ?? (target - params.staleDays);
  const horizonMonths = method === 'trend'
    ? Math.min(params.maxProjectionMonths, Math.max(0, (target - effectiveLastDay) / MONTH_DAYS))
    : 0;
  const shrink = Math.min(1, (n - 1) / 4);
  const cap = (params.maxMonthlyTrendPct / 100) * lastPrice;
  const slopeEff = clamp(slope * shrink, -cap, cap);
  const estimatedPrice = method === 'none' ? 0 : round2(Math.max(0, lastPrice + slopeEff * horizonMonths));

  // 6. Margem de segurança.
  const ageMonths = method === 'none' ? 0 : Math.max(0, (target - effectiveLastDay) / MONTH_DAYS);
  const base = categories.length
    ? Math.max(...categories.map(c => params.baseByCategory[c] ?? params.defaultBase))
    : params.defaultBase;
  const calibration = categories.length
    ? Math.max(...categories.map(c => params.calibrationByCategory[c] ?? 0))
    : 0;
  const rawMargin = base + calibration
    + params.volK * volatilityRel * 100
    + params.agePctPerMonth * Math.max(0, ageMonths - params.ageStartMonths);
  const marginPct = round2(clamp(rawMargin, params.minMargin, params.maxMargin));
  const protectedPrice = method === 'none' ? 0 : round2(estimatedPrice * (1 + marginPct / 100));

  // 7. Confiança.
  let confidence: Confidence;
  if (method === 'none') {
    confidence = 'sem_referencia';
  } else if (method !== 'trend') {
    confidence = 'baixa';
  } else {
    const recent6 = used.filter(p => p.day >= todayDay - 6 * MONTH_DAYS).length;
    const lastAgeDays = todayDay - (lastDay as number);
    if (!staleHistory && n >= 5 && recent6 >= 3 && volatilityRel < 0.10 && lastAgeDays <= 90) confidence = 'alta';
    else if (!staleHistory && volatilityRel < 0.25 && lastAgeDays <= params.staleDays) confidence = 'media';
    else confidence = 'baixa';
  }

  return {
    lastPrice: round2(lastPrice),
    lastPriceDate: lastDay === null ? null : new Date(lastDay * 86400000).toISOString().slice(0, 10),
    estimatedPrice,
    marginPct,
    protectedPrice,
    confidence,
    method,
    sampleSize: n,
    discardedUnit,
    discardedOther,
    intervalDays,
    volatilityRel: Math.round(volatilityRel * 10000) / 10000,
    horizonMonths: Math.round(horizonMonths * 1000) / 1000,
    staleHistory,
    noReference: method === 'none',
    reference,
    computedAt: today,
    params,
  };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/shared/priceEstimation.test.ts`
Expected: PASS (`# pass 17`, `# fail 0`). Se algum valor numérico divergir, **não ajuste o teste**: reler a fórmula na spec e corrigir a implementação.

- [ ] **Step 5: Commit**

```bash
git add src/shared/priceEstimation.ts src/shared/priceEstimation.test.ts
git commit -m "feat(precos): motor puro de estimativa de preço com margem e confiança"
```

---

### Task 3: Parâmetros administrativos (normalizar, validar, comparar)

**Files:**
- Create: `src/shared/priceSettings.ts`, `src/shared/priceSettings.test.ts`

**Interfaces:**
- Consumes: `PriceParams`, `DEFAULT_PRICE_PARAMS` (Task 2).
- Produces: `normalizeParams(input?: Partial<PriceParams> | null): PriceParams`; `validateParams(p: PriceParams): string[]`; `diffParams(before, after): Array<{ field: string; before: unknown; after: unknown }>`; tipo `PriceSettingsChange { at, by, field, before, after }`.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/shared/priceSettings.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRICE_PARAMS } from './priceEstimation';
import { normalizeParams, validateParams, diffParams } from './priceSettings';

test('normalizeParams completa com os valores iniciais e converte números', () => {
  const p = normalizeParams({ defaultBase: '7' as any, baseByCategory: { Ingredientes: '9' as any, vazio: 'x' as any } });
  assert.equal(p.defaultBase, 7);
  assert.deepEqual(p.baseByCategory, { Ingredientes: 9 });
  assert.equal(p.windowMonths, DEFAULT_PRICE_PARAMS.windowMonths);
  assert.deepEqual(normalizeParams(null), DEFAULT_PRICE_PARAMS);
});

test('validateParams aceita os iniciais e recusa valores fora da faixa', () => {
  assert.deepEqual(validateParams(DEFAULT_PRICE_PARAMS), []);
  const bad = validateParams({ ...DEFAULT_PRICE_PARAMS, minMargin: 30, maxMargin: 10, windowMonths: 0, leadDays: 1.5 });
  assert.ok(bad.length >= 3);
  assert.ok(bad.some(m => m.includes('mínima')));
});

test('diffParams lista só o que mudou, inclusive por categoria', () => {
  const before = DEFAULT_PRICE_PARAMS;
  const after = { ...before, defaultBase: 6, baseByCategory: { Limpeza: 10 } };
  assert.deepEqual(diffParams(before, after), [
    { field: 'defaultBase', before: 5, after: 6 },
    { field: 'baseByCategory.Limpeza', before: null, after: 10 },
  ]);
  assert.deepEqual(diffParams(before, before), []);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/shared/priceSettings.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

Create `src/shared/priceSettings.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { DEFAULT_PRICE_PARAMS, PriceParams } from './priceEstimation';

export interface PriceSettingsChange {
  at: string;
  by: string;
  field: string;
  before: unknown;
  after: unknown;
}

const SCALAR_FIELDS = [
  'windowMonths', 'maxMonthlyTrendPct', 'maxProjectionMonths', 'leadDays', 'defaultBase',
  'volK', 'ageStartMonths', 'agePctPerMonth', 'minMargin', 'maxMargin', 'staleDays',
] as const;

const num = (v: unknown, fallback: number): number => {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
};

const numberRecord = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object') {
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      const n = Number(val);
      if (k.trim() && Number.isFinite(n)) out[k] = n;
    }
  }
  return out;
};

/** Completa com os valores iniciais e converte para número o que veio de formulário/JSON. */
export function normalizeParams(input?: Partial<PriceParams> | null): PriceParams {
  const d = DEFAULT_PRICE_PARAMS;
  const i: any = input || {};
  return {
    windowMonths: num(i.windowMonths, d.windowMonths),
    maxMonthlyTrendPct: num(i.maxMonthlyTrendPct, d.maxMonthlyTrendPct),
    maxProjectionMonths: num(i.maxProjectionMonths, d.maxProjectionMonths),
    leadDays: num(i.leadDays, d.leadDays),
    defaultBase: num(i.defaultBase, d.defaultBase),
    baseByCategory: numberRecord(i.baseByCategory),
    volK: num(i.volK, d.volK),
    ageStartMonths: num(i.ageStartMonths, d.ageStartMonths),
    agePctPerMonth: num(i.agePctPerMonth, d.agePctPerMonth),
    minMargin: num(i.minMargin, d.minMargin),
    maxMargin: num(i.maxMargin, d.maxMargin),
    staleDays: num(i.staleDays, d.staleDays),
    calibrationByCategory: numberRecord(i.calibrationByCategory),
  };
}

/** Lista de erros em português; vazia quando os parâmetros são válidos. */
export function validateParams(p: PriceParams): string[] {
  const errors: string[] = [];
  const range = (label: string, v: number, lo: number, hi: number, integer = false) => {
    if (!Number.isFinite(v) || v < lo || v > hi || (integer && !Number.isInteger(v))) {
      errors.push(`${label} deve ser ${integer ? 'um número inteiro ' : 'um número '}entre ${lo} e ${hi}.`);
    }
  };
  range('Janela de histórico (meses)', p.windowMonths, 1, 60, true);
  range('Variação máxima da tendência (% ao mês)', p.maxMonthlyTrendPct, 0, 100);
  range('Projeção máxima (meses)', p.maxProjectionMonths, 0, 24, true);
  range('Prazo até a compra (dias)', p.leadDays, 0, 365, true);
  range('Margem base padrão (%)', p.defaultBase, 0, 100);
  range('Peso da volatilidade', p.volK, 0, 10);
  range('Meses sem acréscimo de idade', p.ageStartMonths, 0, 60);
  range('Acréscimo por mês de idade (%)', p.agePctPerMonth, 0, 100);
  range('Margem mínima (%)', p.minMargin, 0, 100);
  range('Margem máxima (%)', p.maxMargin, 0, 100);
  range('Dias para preço desatualizado', p.staleDays, 1, 3650, true);
  if (p.minMargin > p.maxMargin) errors.push('A margem mínima não pode ser maior que a máxima.');
  for (const [cat, v] of Object.entries(p.baseByCategory)) range(`Margem base de "${cat}" (%)`, v, 0, 100);
  for (const [cat, v] of Object.entries(p.calibrationByCategory)) range(`Calibração de "${cat}" (%)`, v, -100, 100);
  return errors;
}

/** Diferenças campo a campo, para o histórico de alterações. */
export function diffParams(before: PriceParams, after: PriceParams): Array<{ field: string; before: unknown; after: unknown }> {
  const changes: Array<{ field: string; before: unknown; after: unknown }> = [];
  for (const f of SCALAR_FIELDS) {
    if (before[f] !== after[f]) changes.push({ field: f, before: before[f], after: after[f] });
  }
  for (const group of ['baseByCategory', 'calibrationByCategory'] as const) {
    const keys = new Set([...Object.keys(before[group]), ...Object.keys(after[group])]);
    for (const k of Array.from(keys).sort()) {
      const b = before[group][k];
      const a = after[group][k];
      if (b !== a) changes.push({ field: `${group}.${k}`, before: b ?? null, after: a ?? null });
    }
  }
  return changes;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/shared/priceSettings.test.ts`
Expected: PASS (`# pass 3`).

- [ ] **Step 5: Commit**

```bash
git add src/shared/priceSettings.ts src/shared/priceSettings.test.ts
git commit -m "feat(precos): parâmetros administrativos com validação e histórico de diferenças"
```

---

### Task 4: Permissão `prices.config` e regras de rota

**Files:**
- Modify: `src/shared/permissions.ts` (catálogo e `ROUTE_RULES`)
- Modify: `src/shared/permissions.test.ts`

**Interfaces:**
- Produces: permissão `prices.config`; `requiredPermission('/xml/price-settings') === 'prices.config'`; `requiredPermission('/xml/price-estimates') === null`.

- [ ] **Step 1: Escrever o teste que falha**

Em `src/shared/permissions.test.ts`, dentro do teste `'escrita sem regra exige admin; algumas rotas liberam qualquer aprovado'`, acrescentar ao final do corpo:

```ts
  assert.equal(requiredPermission('/xml/price-settings'), 'prices.config');
  assert.equal(requiredPermission('/xml/price-estimates'), null);
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/shared/permissions.test.ts`
Expected: FAIL (`'admin' !== 'prices.config'`).

- [ ] **Step 3: Implementar**

Em `src/shared/permissions.ts`:

1. No array `PERMISSIONS`, após a linha de `config.manage`, acrescentar:

```ts
  { id: 'prices.config', label: 'Configurar margens e parâmetros de preço', group: 'Sistema' },
```

2. No array `ROUTE_RULES`, logo antes da linha `['/xml/setores', 'config.manage'],`, acrescentar:

```ts
  ['/xml/price-settings', 'prices.config'],
  ['/xml/price-estimates', null],
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/shared/permissions.test.ts`
Expected: PASS (`# pass 3`).

- [ ] **Step 5: Commit**

```bash
git add src/shared/permissions.ts src/shared/permissions.test.ts
git commit -m "feat(precos): permissão prices.config e regras das rotas de estimativa"
```

---

### Task 5: Serviço de estimativa (notas + cadastro → motor)

**Files:**
- Create: `src/backend/services/priceEstimationService.ts`, `src/backend/services/priceEstimationService.test.ts`

**Interfaces:**
- Consumes: `estimatePrice`, `PriceParams`, `HistoryPoint`, `ManualReference`, `PriceEstimate` (Task 2); `extractWeightKg`, `normName` (Task 1).
- Produces: `estimateItems(items: EstimateRequestItem[], ctx: EstimateContext): PriceEstimate[]`; `buildHistoryIndex(invoices)`; `validateManualPrice(input, today)`; `toIsoDate(raw)`; classe `EstimateInputError { code, message }`; tipos `EstimateRequestItem`, `EstimateContext`, `ManualPriceInput`.

- [ ] **Step 1: Escrever os testes que falham**

Create `src/backend/services/priceEstimationService.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PRICE_PARAMS } from '../../shared/priceEstimation';
import {
  buildHistoryIndex, estimateItems, toIsoDate, validateManualPrice, EstimateInputError,
} from './priceEstimationService';

const inv = (id: string, date: string, products: any[], extra: any = {}) => ({ id, date, supplierName: 'Atacadão', products, ...extra });
const ctx = (invoices: any[], suppliers: any[] = []) => ({
  invoices, suppliers, params: DEFAULT_PRICE_PARAMS, today: '2026-07-15', by: 'Maria',
});

test('toIsoDate aceita ISO, ISO com hora e dd/MM/aaaa', () => {
  assert.equal(toIsoDate('2026-06-15T10:00:00-03:00'), '2026-06-15');
  assert.equal(toIsoDate('15/06/2026'), '2026-06-15');
  assert.equal(toIsoDate('lixo'), null);
  assert.equal(toIsoDate(undefined), null);
});

test('histórico: notas reais e "Sem NF" entram; "NF" provisória, excluídos e manual-inv- ficam de fora', () => {
  const invoices = [
    inv('n1', '2026-05-10', [{ code: 'C1', name: 'Açúcar 1kg', vUnCom: 5 }]),
    inv('l1', '2026-06-10', [{ code: 'C1', name: 'Açúcar 1kg', vUnCom: 6 }], { source: 'shopping_list', hasNF: true }),
    inv('l2', '2026-06-12', [{ code: 'C1', name: 'Açúcar 1kg', vUnCom: 60 }], { source: 'shopping_list', hasNF: false }),
    inv('n2', '2026-06-14', [{ code: 'C1', name: 'Açúcar 1kg', vUnCom: 70, deleted: true }]),
    inv('manual-inv-1', '2026-06-15', [{ code: 'C1', name: 'Açúcar 1kg', vUnCom: 80 }]),
  ];
  const index = buildHistoryIndex(invoices);
  assert.deepEqual(index.byCode.get('C1')!.map(p => p.price), [5, 6]);
  assert.equal(index.byCode.get('C1')![0].unit, 'kg');
});

test('estimativa por item: usa o histórico por código, ou por nome quando não há código', () => {
  const invoices = [
    inv('a', '2026-05-15', [{ code: 'C9', name: 'Óleo 900ml', vUnCom: 10 }]),
    inv('b', '2026-06-15', [{ code: 'C9', name: 'Óleo 900ml', vUnCom: 12 }]),
    inv('c', '2026-06-20', [{ code: 'N/A', name: 'Leite Integral 1L', vUnCom: 5 }]),
  ];
  const [byCode, byName] = estimateItems([
    { name: 'Óleo 900ml', code: 'C9', supplierName: 'Atacadão' },
    { name: 'leite integral 1l', supplierName: 'Atacadão' },
  ], ctx(invoices));
  assert.equal(byCode.method, 'trend');
  assert.equal(byCode.lastPrice, 12);
  assert.equal(byName.method, 'single');
  assert.equal(byName.lastPrice, 5);
});

test('sem histórico: usa o preço do cadastro (compra única) e as categorias do cadastro', () => {
  const suppliers = [{ name: 'Atacadão', products: [
    { name: 'Detergente', code: 'D1', price: 3, lastPurchaseDate: '10/07/2026', categories: ['Limpeza'] },
  ] }];
  const params = { ...DEFAULT_PRICE_PARAMS, baseByCategory: { Limpeza: 9 } };
  const [r] = estimateItems([{ name: 'Detergente', code: 'D1', supplierName: 'ATACADÃO' }], { ...ctx([], suppliers), params });
  assert.equal(r.method, 'cadastro');
  assert.equal(r.lastPriceDate, '2026-07-10');
  assert.equal(r.marginPct, 9);
  assert.equal(r.confidence, 'baixa');
});

test('sem nada: sem referência; com cotação válida: usa a cotação e registra quem informou', () => {
  const [none] = estimateItems([{ name: 'Produto Novo', supplierName: 'X' }], ctx([]));
  assert.equal(none.method, 'none');
  assert.equal(none.noReference, true);

  const [quoted] = estimateItems([{
    name: 'Produto Novo', supplierName: 'X',
    manualPrice: { kind: 'quote', value: 25, date: '2026-07-14', supplierName: 'Fornecedor Z' },
  }], ctx([]));
  assert.equal(quoted.method, 'quote');
  assert.equal(quoted.estimatedPrice, 25);
  assert.equal(quoted.reference?.by, 'Maria');
});

test('entrada manual inválida é recusada com erro claro', () => {
  const bad = [
    { kind: 'manual' as const, value: 0, date: '2026-07-10' },
    { kind: 'manual' as const, value: 10, date: '2026-08-01' },
    { kind: 'manual' as const, value: 10, date: 'xx' },
    { kind: 'outro' as any, value: 10, date: '2026-07-10' },
  ];
  for (const b of bad) {
    assert.throws(() => validateManualPrice(b, '2026-07-15'), (e: any) => e instanceof EstimateInputError && e.code === 'manual_invalid');
  }
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/backend/services/priceEstimationService.test.ts`
Expected: FAIL (`Cannot find module './priceEstimationService'`).

- [ ] **Step 3: Implementar o serviço**

Create `src/backend/services/priceEstimationService.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { estimatePrice, HistoryPoint, ManualReference, PriceEstimate, PriceParams } from '../../shared/priceEstimation';
import { extractWeightKg } from '../../shared/units';
import { normName } from '../../shared/text';

// Camada que traduz os dados do sistema (notas, fornecedores) para a entrada do motor puro.
// Não acessa banco: quem chama (app.ts) carrega as coleções e passa aqui.

export class EstimateInputError extends Error {
  constructor(public code: string, message: string) {
    super(message);
  }
}

export interface ManualPriceInput {
  kind: 'manual' | 'quote';
  value: number;
  date: string;
  supplierName?: string;
}

export interface EstimateRequestItem {
  name: string;
  code?: string;
  supplierName: string;
  manualPrice?: ManualPriceInput | null;
}

export interface EstimateContext {
  invoices: any[];
  suppliers: any[];
  params: PriceParams;
  /** AAAA-MM-DD */
  today: string;
  /** Nome de quem está pedindo (gravado nas referências manuais/cotações). */
  by: string;
}

export interface HistoryIndex {
  byCode: Map<string, HistoryPoint[]>;
  byName: Map<string, HistoryPoint[]>;
}

/** "15/06/2026" -> "2026-06-15"; datas ISO ficam com os 10 primeiros caracteres. */
export function toIsoDate(raw: unknown): string | null {
  const s = String(raw ?? '').trim();
  const br = s.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

/**
 * Indexa as compras de cada produto por código e por nome normalizado.
 * Entram: notas reais e entradas da lista "Sem NF" (hasNF === true).
 * Ficam de fora: entradas da lista "NF" (provisórias), itens excluídos, preço <= 0 e notas manual-inv-.
 */
export function buildHistoryIndex(invoices: any[]): HistoryIndex {
  const byCode = new Map<string, HistoryPoint[]>();
  const byName = new Map<string, HistoryPoint[]>();
  const push = (map: Map<string, HistoryPoint[]>, key: string, point: HistoryPoint) => {
    const list = map.get(key);
    if (list) list.push(point); else map.set(key, [point]);
  };

  for (const inv of invoices || []) {
    if (!inv || String(inv.id || '').startsWith('manual-inv-')) continue;
    if (inv.source === 'shopping_list' && inv.hasNF !== true) continue;
    const date = toIsoDate(inv.dhEmi || inv.date || inv.createdAt);
    if (!date || !Array.isArray(inv.products)) continue;

    for (const p of inv.products) {
      if (!p || p.deleted || !p.name || p.name === 'N/A') continue;
      const price = Number(p.vUnCom || p.price || 0);
      if (!(price > 0)) continue;
      const weight = extractWeightKg(String(p.name));
      const point: HistoryPoint = weight
        ? { date, price: price / weight, unit: 'kg' }
        : { date, price, unit: 'un' };
      const code = String(p.code ?? '').trim();
      if (code && code !== 'N/A') push(byCode, code, point);
      push(byName, normName(p.name), point);
    }
  }
  return { byCode, byName };
}

function lookupHistory(index: HistoryIndex, item: EstimateRequestItem): HistoryPoint[] {
  const code = String(item.code ?? '').trim();
  if (code && code !== 'N/A') {
    const byCode = index.byCode.get(code);
    if (byCode && byCode.length) return byCode;
  }
  return index.byName.get(normName(item.name)) || [];
}

function lookupCatalog(suppliers: any[], item: EstimateRequestItem) {
  const supplier = (suppliers || []).find(s => normName(s?.name) === normName(item.supplierName));
  const products: any[] = Array.isArray(supplier?.products) ? supplier.products : [];
  const code = String(item.code ?? '').trim();
  const product =
    (code && code !== 'N/A' ? products.find(p => String(p?.code ?? '').trim() === code) : undefined) ||
    products.find(p => normName(p?.name) === normName(item.name));
  if (!product) return { price: undefined as number | undefined, date: null as string | null, categories: [] as string[] };
  const categories: string[] = Array.isArray(product.categories)
    ? product.categories.filter(Boolean)
    : product.category ? [product.category] : [];
  return {
    price: Number(product.price) > 0 ? Number(product.price) : undefined,
    date: toIsoDate(product.lastPurchaseDate),
    categories,
  };
}

/** Valida a entrada manual/cotação vinda do navegador; lança EstimateInputError se inválida. */
export function validateManualPrice(input: ManualPriceInput, today: string): ManualPriceInput {
  const value = Number(input?.value);
  if (!(value > 0) || !Number.isFinite(value)) {
    throw new EstimateInputError('manual_invalid', 'O preço informado deve ser maior que zero.');
  }
  if (input.kind !== 'manual' && input.kind !== 'quote') {
    throw new EstimateInputError('manual_invalid', 'Tipo de preço informado inválido.');
  }
  const date = toIsoDate(input.date);
  if (!date || date > today) {
    throw new EstimateInputError('manual_invalid', 'A data do preço informado é inválida ou está no futuro.');
  }
  return { kind: input.kind, value, date, supplierName: input.supplierName?.trim() || undefined };
}

/** Estima o preço de cada item, na mesma ordem em que vieram. */
export function estimateItems(items: EstimateRequestItem[], ctx: EstimateContext): PriceEstimate[] {
  const index = buildHistoryIndex(ctx.invoices);
  return items.map(item => {
    const catalog = lookupCatalog(ctx.suppliers, item);
    let reference: ManualReference | null = null;
    if (item.manualPrice) {
      const valid = validateManualPrice(item.manualPrice, ctx.today);
      reference = { ...valid, by: ctx.by };
    }
    return estimatePrice({
      categories: catalog.categories,
      history: lookupHistory(index, item),
      packageKg: extractWeightKg(String(item.name)),
      catalogPrice: catalog.price,
      catalogDate: catalog.date,
      reference,
      today: ctx.today,
      params: ctx.params,
    });
  });
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/backend/services/priceEstimationService.test.ts; npx tsc --noEmit`
Expected: PASS (`# pass 6`) e `tsc` sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/priceEstimationService.ts src/backend/services/priceEstimationService.test.ts
git commit -m "feat(precos): serviço que monta o histórico a partir das notas e estima cada item"
```

---

### Task 6: Regras da requisição (montar, aprovar limite, enviar para lista)

**Files:**
- Create: `src/backend/services/orderEstimates.ts`, `src/backend/services/orderEstimates.test.ts`

**Interfaces:**
- Consumes: `PriceEstimate` (Task 2).
- Produces: `buildOrderDoc(args: BuildOrderArgs)`; `applyRequisitionApproval(order, args: ApprovalArgs)`; `buildListFromOrder(order, now)`; classe `OrderError { code, message, status }`.

- [ ] **Step 1: Escrever os testes que falham**

Create `src/backend/services/orderEstimates.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildOrderDoc, applyRequisitionApproval, buildListFromOrder, OrderError } from './orderEstimates';

const estimateFor = (price: number, protectedPrice: number) => ({ estimatedPrice: price, protectedPrice } as any);

test('requisição: price vira a estimativa, totais e limite sugerido separados, valores do navegador ignorados', () => {
  const order = buildOrderDoc({
    id: 'po_1', name: 'Semana', createdBy: 'Maria', now: '2026-07-15T12:00:00.000Z', shippingFee: 10,
    items: [
      { name: 'Arroz', supplierName: 'A', quantity: 2, price: 999, manualPrice: { kind: 'manual', value: 1, date: '2026-07-01' } },
      { name: 'Feijão', supplierName: 'A', quantity: 1, price: 999 },
    ],
    estimates: [estimateFor(20, 21), estimateFor(8, 8.4)],
  });
  assert.equal(order.items[0].price, 20);
  assert.equal(order.items[0].estimate.protectedPrice, 21);
  assert.equal('manualPrice' in order.items[0], false);
  assert.equal(order.estimatedTotal, 58); // 2*20 + 8 + 10 de frete
  assert.equal(order.total, 58);
  assert.equal(order.suggestedLimit, 60.4); // 2*21 + 8,4 + 10
  assert.equal(order.status, 'pending');
});

test('requisição: quantidade inválida e itens vazios são recusados', () => {
  const args = { id: 'po', items: [{ name: 'X', quantity: 0 }], estimates: [estimateFor(1, 1)], shippingFee: 0, createdBy: '', now: 'n' };
  assert.throws(() => buildOrderDoc(args), (e: any) => e instanceof OrderError && e.code === 'quantity_invalid');
  assert.throws(() => buildOrderDoc({ ...args, items: [], estimates: [] }), (e: any) => e instanceof OrderError);
});

const sampleOrder = () => buildOrderDoc({
  id: 'po_1', createdBy: 'Maria', now: '2026-07-15T12:00:00.000Z', shippingFee: 0,
  items: [{ name: 'Arroz', supplierName: 'A', quantity: 10 }], estimates: [estimateFor(20, 22)],
});

test('1ª aprovação: sem informar limite confirma o sugerido e registra o histórico', () => {
  const patch: any = applyRequisitionApproval(sampleOrder(), { approvedBy: 'João', now: '2026-07-16T09:00:00.000Z' });
  assert.equal(patch.status, 'requisition_approved');
  assert.equal(patch.approvedLimit, 220);
  assert.equal(patch.limitHistory.length, 1);
  assert.equal(patch.limitHistory[0].reason, 'Limite sugerido confirmado');
});

test('1ª aprovação: mudar o limite exige motivo e fica registrado', () => {
  const order = sampleOrder();
  assert.throws(
    () => applyRequisitionApproval(order, { approvedBy: 'João', approvedLimit: 250, now: 'n' }),
    (e: any) => e instanceof OrderError && e.code === 'limit_reason_required',
  );
  const patch: any = applyRequisitionApproval(order, { approvedBy: 'João', approvedLimit: 250, limitReason: 'Promoção do fornecedor', now: 'n' });
  assert.equal(patch.approvedLimit, 250);
  assert.deepEqual(patch.limitHistory[0], { at: 'n', by: 'João', from: 220, to: 250, reason: 'Promoção do fornecedor' });
});

test('1ª aprovação: limite negativo ou inválido é recusado', () => {
  assert.throws(() => applyRequisitionApproval(sampleOrder(), { approvedBy: 'J', approvedLimit: -1, now: 'n' }), (e: any) => e.code === 'limit_invalid');
  assert.throws(() => applyRequisitionApproval(sampleOrder(), { approvedBy: 'J', approvedLimit: 'abc', now: 'n' }), (e: any) => e.code === 'limit_invalid');
});

test('requisição antiga (sem limite sugerido) aprova como antes, sem campos novos', () => {
  const patch: any = applyRequisitionApproval({ id: 'old', total: 50 }, { approvedBy: 'João', observacao: 'ok', now: 'n' });
  assert.equal(patch.status, 'requisition_approved');
  assert.equal('approvedLimit' in patch, false);
});

test('envio para a lista leva a referência da ordem; requisição antiga não ganha referência', () => {
  const order: any = { ...sampleOrder(), approvedLimit: 230, approvedBy: 'Chefe' };
  const list = buildListFromOrder(order, '2026-07-17T10:00:00.000Z');
  assert.deepEqual(list.orderRef, { orderId: 'po_1', estimatedTotal: 200, suggestedLimit: 220, approvedLimit: 230 });
  assert.equal(list.items[0].estimate.protectedPrice, 22);
  assert.equal(buildListFromOrder({ id: 'old', items: [], total: 1, shippingFee: 0 }, 'n').orderRef, undefined);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/backend/services/orderEstimates.test.ts`
Expected: FAIL (`Cannot find module './orderEstimates'`).

- [ ] **Step 3: Implementar**

Create `src/backend/services/orderEstimates.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { PriceEstimate } from '../../shared/priceEstimation';

// Regras puras da requisição com estimativa: montagem do documento, aprovação do limite
// e envio para a lista. app.ts só carrega/grava; as decisões ficam aqui para serem testáveis.

export class OrderError extends Error {
  constructor(public code: string, message: string, public status = 400) {
    super(message);
  }
}

const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

export interface BuildOrderArgs {
  id: string;
  name?: string;
  items: any[];
  estimates: PriceEstimate[];
  shippingFee: number;
  createdBy: string;
  now: string;
}

/** Monta a requisição com o snapshot de estimativa congelado em cada item. */
export function buildOrderDoc(args: BuildOrderArgs) {
  const { items, estimates } = args;
  if (!Array.isArray(items) || items.length === 0 || items.length !== estimates.length) {
    throw new OrderError('items_required', 'Itens são obrigatórios');
  }
  const shippingFee = Number(args.shippingFee) > 0 ? Number(args.shippingFee) : 0;
  let estimated = 0;
  let protectedSum = 0;

  const orderItems = items.map((item, i) => {
    const quantity = Number(item.quantity);
    if (!(quantity > 0)) {
      throw new OrderError('quantity_invalid', `Quantidade inválida para "${item.name}".`);
    }
    const estimate = estimates[i];
    estimated += estimate.estimatedPrice * quantity;
    protectedSum += estimate.protectedPrice * quantity;
    const { manualPrice, ...rest } = item;
    return { ...rest, bought: false, price: estimate.estimatedPrice, estimate };
  });

  const estimatedTotal = round2(estimated + shippingFee);
  return {
    id: args.id,
    name: args.name || 'Lista de Compras',
    date: args.now,
    items: orderItems,
    total: estimatedTotal,
    estimatedTotal,
    suggestedLimit: round2(protectedSum + shippingFee),
    shippingFee,
    createdBy: args.createdBy || '',
    status: 'pending',
  };
}

export interface ApprovalArgs {
  approvedBy: string;
  observacao?: string;
  approvedLimit?: unknown;
  limitReason?: string;
  now: string;
}

/**
 * Patch da 1ª aprovação. Com limite sugerido (requisição com estimativa) define o limite
 * aprovado; se o aprovador mudar o valor, o motivo é obrigatório. Requisições antigas
 * (sem limite sugerido) seguem o fluxo de antes.
 */
export function applyRequisitionApproval(order: any, args: ApprovalArgs) {
  const base = {
    status: 'requisition_approved',
    requisitionApprovedBy: args.approvedBy || '',
    requisitionApprovedAt: args.now,
    observacao: args.observacao || '',
  };
  const suggested = order?.suggestedLimit;
  if (typeof suggested !== 'number') return base;

  const hasLimit = args.approvedLimit !== undefined && args.approvedLimit !== null && args.approvedLimit !== '';
  const limit = hasLimit ? Number(args.approvedLimit) : suggested;
  if (!Number.isFinite(limit) || limit < 0) {
    throw new OrderError('limit_invalid', 'O limite aprovado deve ser um valor maior ou igual a zero.');
  }
  const changed = Math.abs(limit - suggested) > 0.005;
  const reason = String(args.limitReason ?? '').trim();
  if (changed && reason.length < 3) {
    throw new OrderError('limit_reason_required', 'Informe o motivo para alterar o limite sugerido.');
  }
  const entry = {
    at: args.now,
    by: args.approvedBy || '',
    from: suggested,
    to: round2(limit),
    reason: changed ? reason : 'Limite sugerido confirmado',
  };
  return {
    ...base,
    approvedLimit: round2(limit),
    approvedLimitBy: args.approvedBy || '',
    approvedLimitAt: args.now,
    limitHistory: [...(Array.isArray(order.limitHistory) ? order.limitHistory : []), entry],
  };
}

/** Documento da lista de compras criada a partir da requisição. */
export function buildListFromOrder(order: any, now: string) {
  const list: any = {
    name: order.name,
    date: now,
    items: order.items,
    total: order.total,
    shippingFee: order.shippingFee,
    createdBy: order.createdBy,
    approvedBy: order.approvedBy || '',
  };
  if (typeof order.suggestedLimit === 'number') {
    list.orderRef = {
      orderId: order.id,
      estimatedTotal: order.estimatedTotal,
      suggestedLimit: order.suggestedLimit,
      approvedLimit: typeof order.approvedLimit === 'number' ? order.approvedLimit : null,
    };
  }
  return list;
}
```

- [ ] **Step 4: Rodar todos os testes dos módulos puros**

Run: `npx tsx --test src/shared/*.test.ts src/backend/services/*.test.ts; npx tsc --noEmit`
Expected: PASS (`# pass 38`, `# fail 0`) e `tsc` sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/backend/services/orderEstimates.ts src/backend/services/orderEstimates.test.ts
git commit -m "feat(precos): regras da requisição com estimativa, limite aprovado e envio para a lista"
```

---

### Task 7: Planilha de fornecedores somente adição (regra pura)

**Files:**
- Create: `src/shared/supplierMerge.ts`, `src/shared/supplierMerge.test.ts`

**Interfaces:**
- Consumes: `normName` (Task 1).
- Produces: `mergeSuppliersAddOnly(existing: MergeSupplier[], incoming: MergeSupplier[], newId: () => string): MergeResult` com `{ toSave, addedSuppliers, addedProducts, skippedProducts }`.

- [ ] **Step 1: Escrever o teste que falha**

Create `src/shared/supplierMerge.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeSuppliersAddOnly } from './supplierMerge';

test('planilha só-adição: existente intacto, produto novo entra, fornecedor novo entra', () => {
  const existing = [
    { id: 'f1', name: 'Atacadão', phone: '111', products: [{ name: 'Arroz 5kg', price: 20, code: 'A1' }] },
  ];
  const incoming = [
    { name: 'ATACADÃO', phone: '999', products: [
      { name: 'arroz 5KG', price: 99 },
      { name: 'Feijão 1kg', price: 8 },
    ] },
    { name: 'Distribuidora Nova', phone: '222', products: [{ name: 'Sal', price: 3 }, { name: 'sal', price: 4 }] },
  ];
  const r = mergeSuppliersAddOnly(existing, incoming, () => 'novo-id');

  assert.equal(r.addedSuppliers, 1);
  assert.equal(r.addedProducts, 2); // Feijão + Sal
  assert.equal(r.skippedProducts, 2); // Arroz (já existia) + sal duplicado na planilha

  const atacadao = r.toSave.find(s => s.id === 'f1')!;
  assert.equal(atacadao.phone, '111');
  assert.equal(atacadao.products[0].price, 20); // preço existente intacto
  assert.deepEqual(atacadao.products.map(p => p.name), ['Arroz 5kg', 'Feijão 1kg']);

  const nova = r.toSave.find(s => s.id === 'novo-id')!;
  assert.deepEqual(nova.products.map(p => p.name), ['Sal']);
  assert.equal(existing[0].products.length, 1); // entrada original não foi mutada
});

test('planilha só-adição: nada novo não grava nada', () => {
  const existing = [{ id: 'f1', name: 'A', products: [{ name: 'X' }] }];
  const r = mergeSuppliersAddOnly(existing, [{ name: 'A', products: [{ name: 'x' }] }], () => 'id');
  assert.deepEqual(r.toSave, []);
  assert.equal(r.skippedProducts, 1);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/shared/supplierMerge.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar**

Create `src/shared/supplierMerge.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { normName } from './text';

// A planilha só introduz o que ainda não existe: fornecedor novo entra completo e
// fornecedor existente só recebe produtos novos. Nada do que já existe é alterado.

export interface MergeProduct { name: string; [key: string]: any }
export interface MergeSupplier { id?: string; name: string; phone?: string; products: MergeProduct[]; [key: string]: any }

export interface MergeResult {
  toSave: MergeSupplier[];
  addedSuppliers: number;
  addedProducts: number;
  skippedProducts: number;
}

export function mergeSuppliersAddOnly(existing: MergeSupplier[], incoming: MergeSupplier[], newId: () => string): MergeResult {
  const byName = new Map<string, MergeSupplier>();
  existing.forEach(s => byName.set(normName(s.name), s));

  const toSave: MergeSupplier[] = [];
  let addedSuppliers = 0;
  let addedProducts = 0;
  let skippedProducts = 0;

  for (const supplier of incoming) {
    const key = normName(supplier.name);
    if (!key) continue;
    const current = byName.get(key);
    const known = new Set((current?.products || []).map(p => normName(p.name)));

    const fresh: MergeProduct[] = [];
    for (const product of supplier.products || []) {
      const pKey = normName(product.name);
      if (!pKey || known.has(pKey)) { skippedProducts++; continue; }
      known.add(pKey);
      fresh.push(product);
    }

    if (current) {
      if (fresh.length > 0) {
        const merged = { ...current, products: [...current.products, ...fresh] };
        byName.set(key, merged);
        toSave.push(merged);
        addedProducts += fresh.length;
      }
    } else {
      const created = { ...supplier, id: supplier.id || newId(), products: fresh };
      byName.set(key, created);
      toSave.push(created);
      addedSuppliers++;
      addedProducts += fresh.length;
    }
  }
  return { toSave, addedSuppliers, addedProducts, skippedProducts };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npx tsx --test src/shared/supplierMerge.test.ts`
Expected: PASS (`# pass 2`).

- [ ] **Step 5: Commit**

```bash
git add src/shared/supplierMerge.ts src/shared/supplierMerge.test.ts
git commit -m "feat(fornecedores): regra de importação de planilha somente adição"
```

---

### Task 8: Backend — flag, configuração, rotas e integração com `purchase_orders`

**Files:**
- Modify: `src/backend/app.ts` (imports; guarda de permissões; rotas de configuração/estimativa; `purchase_orders` create/approve-requisition/send; `suppliers/import`; `TEST_MODE_COLLECTIONS`)
- Modify: `src/backend/data/supabaseRepo.ts` (`LIVE_EDIT_COLLECTIONS`)
- Create: `scripts/supabase/add-price-settings.sql`
- Modify: `scripts/supabase/schema.sql`

**Interfaces:**
- Consumes: tudo das Tasks 1–7.
- Produces (HTTP):
  - `GET /api/xml/price-settings` → `{ enabled: boolean, params: PriceParams, history: PriceSettingsChange[] }`
  - `POST /api/xml/price-settings` body `{ params }` → `{ status: 'success' }` (404 `disabled` com a flag desligada; 400 `invalid_params`)
  - `POST /api/xml/price-estimates` body `{ items: [{ name, code?, supplierName, manualPrice? }] }` → `{ estimates: PriceEstimate[] }` (404 `disabled` com a flag desligada)
  - `POST /api/xml/purchase_orders` com a flag ligada devolve `order` com `estimate` por item, `estimatedTotal` e `suggestedLimit`
  - `POST /api/xml/purchase_orders/approve-requisition` body acrescido de `approvedLimit?`, `limitReason?`
  - `POST /api/xml/suppliers/import` → `{ status, addedSuppliers, addedProducts, skippedProducts }`

- [ ] **Step 1: Imports e flag**

No topo de `src/backend/app.ts`, após o import de `../shared/permissions.js`, acrescentar:

```ts
import { DEFAULT_PRICE_PARAMS } from "../shared/priceEstimation.js";
import { normalizeParams, validateParams, diffParams } from "../shared/priceSettings.js";
import { mergeSuppliersAddOnly } from "../shared/supplierMerge.js";
import { estimateItems, EstimateInputError, EstimateRequestItem } from "./services/priceEstimationService.js";
import { buildOrderDoc, applyRequisitionApproval, buildListFromOrder, OrderError } from "./services/orderEstimates.js";
```

- [ ] **Step 2: Guarda de permissões guarda a pessoa autenticada**

No middleware `app.use('/api', asyncHandler(async (req, res, next) => { ... }))` (seção `// --- PERMISSÕES ---`), logo depois de `const user = await getAuthUser(uid);`, acrescentar:

```ts
  res.locals.authUser = user;
```

- [ ] **Step 3: Funções de apoio (flag, configuração, contexto, erros)**

Logo antes da linha `app.post("/api/xml/process"` (bloco de rotas de notas), inserir:

```ts
// --- ESTIMATIVA DE PREÇOS (Fase 1) ---
// Tudo isto só vale com PRICE_ESTIMATION_ENABLED=1. Desligado, as rotas existentes se comportam como antes.
const priceEstimationEnabled = () => process.env.PRICE_ESTIMATION_ENABLED === '1';

const actorName = (req: Request, res: Response): string =>
  String(res.locals.authUser?.name || req.body?.by || 'sistema');

async function loadPriceSettings() {
  try {
    const ref = repo.doc('price_settings', 'default');
    const snap = await repo.getDoc(ref, 'price_settings/default', true);
    const exists = typeof snap.exists === 'function' ? snap.exists() : !!snap.exists;
    const data: any = exists ? (typeof snap.data === 'function' ? snap.data() : snap.data) : {};
    return { params: normalizeParams(data.params), history: Array.isArray(data.history) ? data.history : [] };
  } catch (e) {
    console.warn('[PriceSettings] usando valores iniciais:', (e as Error).message);
    return { params: DEFAULT_PRICE_PARAMS, history: [] as any[] };
  }
}

async function loadEstimateContext(by: string) {
  const rows = (snap: any) => snap.docs.map((d: any) => ({ id: d.id, ...(typeof d.data === 'function' ? d.data() : d.data) }));
  const [invoicesSnap, suppliersSnap, settings] = await Promise.all([
    repo.getDocs('invoices', 'invoices'),
    repo.getDocs('suppliers', 'suppliers'),
    loadPriceSettings(),
  ]);
  return {
    invoices: rows(invoicesSnap),
    suppliers: rows(suppliersSnap),
    params: settings.params,
    today: new Date().toISOString().slice(0, 10),
    by,
  };
}

// Erros de regra de negócio viram 4xx com mensagem em português; devolve true se tratou.
function sendKnownError(res: Response, e: unknown): boolean {
  if (e instanceof OrderError) {
    res.status(e.status).json({ error: e.code, message: e.message });
    return true;
  }
  if (e instanceof EstimateInputError) {
    res.status(400).json({ error: e.code, message: e.message });
    return true;
  }
  return false;
}

app.get("/api/xml/price-settings", asyncHandler(async (req: Request, res: Response) => {
  const settings = await loadPriceSettings();
  res.json({ enabled: priceEstimationEnabled(), params: settings.params, history: settings.history });
}));

app.post("/api/xml/price-settings", asyncHandler(async (req: Request, res: Response) => {
  if (!priceEstimationEnabled()) return res.status(404).json({ error: 'disabled', message: 'Recurso desativado.' });
  const params = normalizeParams(req.body?.params);
  const errors = validateParams(params);
  if (errors.length > 0) return res.status(400).json({ error: 'invalid_params', message: errors.join(' ') });

  const current = await loadPriceSettings();
  const at = new Date().toISOString();
  const by = actorName(req, res);
  const entries = diffParams(current.params, params).map(c => ({ at, by, ...c }));
  if (entries.length === 0) return res.json({ status: 'success', changed: 0 });

  const history = [...current.history, ...entries].slice(-200);
  await repo.set(repo.doc('price_settings', 'default'), { params, history, updatedAt: at }, 'price_settings/default');
  repo.invalidateCache('price_settings');
  res.json({ status: 'success', changed: entries.length });
}));

app.post("/api/xml/price-estimates", asyncHandler(async (req: Request, res: Response) => {
  if (!priceEstimationEnabled()) return res.status(404).json({ error: 'disabled', message: 'Recurso desativado.' });
  const items = Array.isArray(req.body?.items) ? req.body.items : [];
  if (items.length === 0 || items.length > 200) {
    return res.status(400).json({ error: 'items_required', message: 'Informe de 1 a 200 itens.' });
  }
  try {
    const ctx = await loadEstimateContext(actorName(req, res));
    res.json({ estimates: estimateItems(items as EstimateRequestItem[], ctx) });
  } catch (e) {
    if (sendKnownError(res, e)) return;
    throw e;
  }
}));
```

- [ ] **Step 4: Criar a requisição com snapshot (flag ligada)**

Substituir o corpo de `app.post("/api/xml/purchase_orders", ...)` por:

```ts
app.post("/api/xml/purchase_orders", asyncHandler(async (req: Request, res: Response) => {
  const { name, items, total, shippingFee, createdBy } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "Itens são obrigatórios" });
  }
  const id = `po_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

  if (priceEstimationEnabled()) {
    try {
      const ctx = await loadEstimateContext(String(createdBy || actorName(req, res)));
      const estimates = estimateItems(items as EstimateRequestItem[], ctx);
      const order = buildOrderDoc({
        id, name, items, estimates, shippingFee, createdBy: createdBy || '', now: new Date().toISOString(),
      });
      await repo.set(repo.doc('purchase_orders', id), order, 'purchase_orders/' + id);
      repo.invalidateCache('purchase_orders');
      return res.json({ status: "success", order });
    } catch (e) {
      if (sendKnownError(res, e)) return;
      throw e;
    }
  }

  const order = {
    id,
    name: name || 'Lista de Compras',
    date: new Date().toISOString(),
    items,
    total: Number(total) || 0,
    shippingFee: Number(shippingFee) || 0,
    createdBy: createdBy || '',
    status: 'pending'
  };
  await repo.set(repo.doc('purchase_orders', id), order, 'purchase_orders/' + id);
  repo.invalidateCache('purchase_orders');
  res.json({ status: "success", order });
}));
```

- [ ] **Step 5: Primeira aprovação define o limite (flag ligada)**

Substituir o corpo de `app.post("/api/xml/purchase_orders/approve-requisition", ...)` por:

```ts
app.post("/api/xml/purchase_orders/approve-requisition", asyncHandler(async (req: Request, res: Response) => {
  const { id, approvedBy, observacao, approvedLimit, limitReason } = req.body;
  if (!id) return res.status(400).json({ error: "ID é obrigatório" });

  if (priceEstimationEnabled()) {
    const ref = repo.doc('purchase_orders', id);
    const snap = await repo.getDoc(ref, 'purchase_orders/' + id, true);
    const exists = typeof snap.exists === 'function' ? snap.exists() : !!snap.exists;
    if (!exists) return res.status(404).json({ error: "Ordem de compra não encontrada" });
    const order: any = typeof snap.data === 'function' ? snap.data() : snap.data;
    try {
      const patch = applyRequisitionApproval(order, {
        approvedBy: approvedBy || actorName(req, res),
        observacao,
        approvedLimit,
        limitReason,
        now: new Date().toISOString(),
      });
      await repo.update(ref, patch, 'purchase_orders/' + id);
    } catch (e) {
      if (sendKnownError(res, e)) return;
      throw e;
    }
    repo.invalidateCache('purchase_orders');
    return res.json({ status: "success" });
  }

  await repo.update(repo.doc('purchase_orders', id), {
    status: 'requisition_approved',
    requisitionApprovedBy: approvedBy || '',
    requisitionApprovedAt: new Date().toISOString(),
    observacao: observacao || ''
  }, 'purchase_orders/' + id);
  repo.invalidateCache('purchase_orders');
  res.json({ status: "success" });
}));
```

- [ ] **Step 6: Envio para a lista leva a referência da ordem**

Em `app.post("/api/xml/purchase_orders/send", ...)`, substituir o objeto `const listData = { ... };` por:

```ts
  const listData = buildListFromOrder(order, new Date().toISOString());
```

(Para requisições antigas o resultado é idêntico ao de antes, sem `orderRef`.)

- [ ] **Step 7: Importação de planilha somente adição**

Substituir o corpo de `app.post("/api/xml/suppliers/import", ...)` por:

```ts
app.post("/api/xml/suppliers/import", asyncHandler(async (req: Request, res: Response) => {
  const { suppliers } = req.body || {};
  if (!Array.isArray(suppliers) || suppliers.length === 0) {
    return res.status(400).json({ error: "Nenhum fornecedor enviado." });
  }
  const snapshot = await repo.getDocs('suppliers', 'suppliers', true);
  const existing = snapshot.docs.map((d: any) => ({ id: d.id, ...(typeof d.data === 'function' ? d.data() : d.data) }));
  const result = mergeSuppliersAddOnly(
    existing as any,
    suppliers,
    () => `imp_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`
  );
  for (const supplier of result.toSave) {
    const { id, ...rest } = supplier;
    await repo.set(repo.doc('suppliers', id as string), rest, 'suppliers/' + id);
  }
  repo.invalidateCache('suppliers');
  res.json({
    status: "success",
    addedSuppliers: result.addedSuppliers,
    addedProducts: result.addedProducts,
    skippedProducts: result.skippedProducts,
  });
}));
```

- [ ] **Step 8: Coleção nova nas listas de teste e de leitura direta**

Em `src/backend/app.ts`, no array `TEST_MODE_COLLECTIONS`, acrescentar `'price_settings',` antes de `'push_subscriptions'`.
Em `src/backend/data/supabaseRepo.ts`, no `LIVE_EDIT_COLLECTIONS`, acrescentar `'price_settings',` após `'pending_xml_imports',`.

- [ ] **Step 9: SQL da tabela**

Create `scripts/supabase/add-price-settings.sql`:

```sql
-- Tabela da configuração de estimativa de preços. Rode UMA vez no SQL Editor do Supabase. É idempotente.

create table if not exists public.price_settings (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.price_settings   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());

alter table public.price_settings enable row level security;
alter table test.price_settings   enable row level security;

grant all privileges on test.price_settings to service_role;
```

Em `scripts/supabase/schema.sql`: no comentário da lista de coleções acrescentar `, price_settings`; adicionar após as linhas de `pending_xml_imports` (uma em `public`, outra em `test`):

```sql
create table if not exists public.price_settings (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.price_settings (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
```

e acrescentar `'price_settings'` ao array `tbls` (após `'pending_xml_imports'`).

- [ ] **Step 10: Verificar tipos, bundle e testes**

Run: `npx tsc --noEmit; npx esbuild src/backend/server.ts --bundle --platform=node --format=cjs --packages=external --outfile=$env:TEMP\server-check.cjs; npx tsx --test src/shared/*.test.ts src/backend/services/*.test.ts`
Expected: sem erro de tipos; bundle gerado; todos os testes passam.

- [ ] **Step 11: Verificação manual das rotas no servidor local (Modo de Teste)**

Com `npm run dev` rodando no worktree e `PRICE_ESTIMATION_ENABLED=1`:

Run (PowerShell): `curl.exe -s http://localhost:3000/api/xml/price-settings -H "x-test-mode: true"`
Expected: JSON com `"enabled":true` e `params` iguais aos valores iniciais.

Run: `curl.exe -s -X POST http://localhost:3000/api/xml/price-estimates -H "Content-Type: application/json" -H "x-test-mode: true" -d "{\"items\":[{\"name\":\"PRODUTO SEM NADA\",\"supplierName\":\"X\"}]}"`
Expected: `"method":"none"`, `"confidence":"sem_referencia"`, `"estimatedPrice":0`.

Parar o servidor, definir `PRICE_ESTIMATION_ENABLED=0` no `.env`, subir de novo e repetir a segunda chamada.
Expected: HTTP 404 com `"error":"disabled"`. Voltar o `.env` para `1`.

- [ ] **Step 12: Commit**

```bash
git add src/backend/app.ts src/backend/data/supabaseRepo.ts scripts/supabase/add-price-settings.sql scripts/supabase/schema.sql
git commit -m "feat(precos): rotas de estimativa e configuração; requisição com snapshot e limite aprovado atrás de flag"
```

---

### Task 9: Frontend — tipos, API e hook de pré-visualização

**Files:**
- Create: `src/frontend/utils/priceEstimationApi.ts`, `src/frontend/hooks/usePriceEstimation.ts`
- Modify: `src/frontend/types.ts` (`CartItem`, `SavedList['items']`, `PurchaseOrder`)
- Modify: `src/frontend/hooks/useCart.ts` (`setCartManualPrice`)

**Interfaces:**
- Consumes: `PriceEstimate`, `PriceParams` (Task 2); `PriceSettingsChange` (Task 3); rotas da Task 8.
- Produces: `fetchPriceSettings(force?)`, `savePriceSettings(params)`, `fetchPriceEstimates(items)`, `estimateKey(item)`, tipo `ManualPriceInput`; hook `usePriceEstimation(cart, active): { enabled, estimates, loading }`; `useCart().setCartManualPrice(name, supplierName, manual | null)`.

- [ ] **Step 1: Tipos**

Em `src/frontend/types.ts`:

1. No topo do arquivo acrescentar:

```ts
import type { PriceEstimate } from '../shared/priceEstimation';
import type { ManualPriceInput } from './utils/priceEstimationApi';
```

2. Em `CartItem`, acrescentar o campo:

```ts
  manualPrice?: ManualPriceInput | null;
```

3. Em `SavedList['items']`, dentro do tipo do item (junto de `previousLastPurchaseDate?: string`), acrescentar `estimate?: PriceEstimate`:
   trocar `previousLastPurchaseDate?: string })[]` por `previousLastPurchaseDate?: string, estimate?: PriceEstimate })[]`.

4. Em `SavedList`, acrescentar:

```ts
  orderRef?: { orderId: string; estimatedTotal?: number; suggestedLimit?: number; approvedLimit?: number | null };
```

5. Em `PurchaseOrder`, acrescentar os campos:

```ts
  estimatedTotal?: number;
  suggestedLimit?: number;
  approvedLimit?: number;
  approvedLimitBy?: string;
  approvedLimitAt?: string;
  limitHistory?: Array<{ at: string; by: string; from: number; to: number; reason: string }>;
```

- [ ] **Step 2: API**

Create `src/frontend/utils/priceEstimationApi.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { PriceEstimate, PriceParams } from '../../shared/priceEstimation';
import type { PriceSettingsChange } from '../../shared/priceSettings';

export interface PriceSettingsResponse {
  enabled: boolean;
  params: PriceParams;
  history: PriceSettingsChange[];
}

export interface ManualPriceInput {
  kind: 'manual' | 'quote';
  value: number;
  date: string;
  supplierName?: string;
}

export const estimateKey = (i: { name: string; supplierName: string }) => `${i.supplierName}||${i.name}`;

let settingsRequest: Promise<PriceSettingsResponse | null> | null = null;

export function fetchPriceSettings(force = false): Promise<PriceSettingsResponse | null> {
  if (!settingsRequest || force) {
    settingsRequest = fetch('/api/xml/price-settings', { headers: { 'Cache-Control': 'no-cache' } })
      .then(res => (res.ok ? (res.json() as Promise<PriceSettingsResponse>) : null))
      .catch(() => null);
  }
  return settingsRequest;
}

export async function savePriceSettings(params: PriceParams): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch('/api/xml/price-settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ params }),
    });
    if (res.ok) {
      await fetchPriceSettings(true);
      return { ok: true };
    }
    const body = await res.json().catch(() => null);
    return { ok: false, message: body?.message || `Erro ${res.status}` };
  } catch {
    return { ok: false, message: 'Falha de conexão com o servidor.' };
  }
}

export async function fetchPriceEstimates(
  items: Array<{ name: string; code?: string; supplierName: string; manualPrice?: ManualPriceInput | null }>
): Promise<Record<string, PriceEstimate> | null> {
  try {
    const res = await fetch('/api/xml/price-estimates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: items.map(i => ({ name: i.name, code: i.code, supplierName: i.supplierName, manualPrice: i.manualPrice ?? null })),
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const map: Record<string, PriceEstimate> = {};
    (data.estimates as PriceEstimate[]).forEach((estimate, idx) => {
      map[estimateKey(items[idx])] = estimate;
    });
    return map;
  } catch {
    return null;
  }
}
```

- [ ] **Step 3: Hook de pré-visualização**

Create `src/frontend/hooks/usePriceEstimation.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import type { PriceEstimate } from '../../shared/priceEstimation';
import type { CartItem } from '../types';
import { fetchPriceEstimates, fetchPriceSettings } from '../utils/priceEstimationApi';

// Pré-visualização das estimativas dos itens do carrinho. Só funciona com o recurso ligado
// no servidor; desligado, `enabled` é false e nada muda na interface.
export function usePriceEstimation(cart: CartItem[], active: boolean) {
  const [enabled, setEnabled] = useState(false);
  const [estimates, setEstimates] = useState<Record<string, PriceEstimate>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPriceSettings().then(s => { if (alive) setEnabled(!!s?.enabled); });
    return () => { alive = false; };
  }, []);

  const signature = JSON.stringify(cart.map(i => [i.name, i.supplierName, i.code, i.manualPrice ?? null]));

  useEffect(() => {
    if (!enabled || !active || cart.length === 0) {
      setEstimates({});
      return;
    }
    let alive = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      const result = await fetchPriceEstimates(cart);
      if (!alive) return;
      if (result) setEstimates(result);
      setLoading(false);
    }, 400);
    return () => { alive = false; clearTimeout(timer); };
  }, [enabled, active, signature]);

  return { enabled, estimates, loading };
}
```

- [ ] **Step 4: `setCartManualPrice` no carrinho**

Em `src/frontend/hooks/useCart.ts`, logo após a função `clearCart` (`const clearCart = () => setCart([]);`), acrescentar:

```ts
  const setCartManualPrice = (name: string, supplierName: string, manual: CartItem['manualPrice']) => {
    setCart(prev => prev.map(item =>
      item.name === name && item.supplierName === supplierName ? { ...item, manualPrice: manual ?? undefined } : item
    ));
  };
```

e incluir `setCartManualPrice,` na lista do `return { ... }` do hook (junto de `clearCart`).

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/types.ts src/frontend/utils/priceEstimationApi.ts src/frontend/hooks/usePriceEstimation.ts src/frontend/hooks/useCart.ts
git commit -m "feat(precos): API, tipos e hook de pré-visualização das estimativas"
```

---

### Task 10: Interface — carrinho com estimativa, confiança e preço manual/cotação

**Files:**
- Create: `src/frontend/components/prices/PriceConfidenceBadge.tsx`, `src/frontend/components/prices/CartItemEstimate.tsx`
- Modify: `src/frontend/components/modals/CartModal.tsx`, `src/frontend/components/Modals.tsx`, `src/frontend/App.tsx`

**Interfaces:**
- Consumes: `usePriceEstimation`, `estimateKey`, `ManualPriceInput` (Task 9); `setCartManualPrice` (Task 9).
- Produces: `<PriceConfidenceBadge confidence />`; `<CartItemEstimate item estimate onManualPrice />`; `CartModal` com props `estimationEnabled`, `previewEstimates`, `setCartManualPrice`.

- [ ] **Step 1: Selo de confiança**

Create `src/frontend/components/prices/PriceConfidenceBadge.tsx`:

```tsx
import React from 'react';
import type { Confidence } from '../../../shared/priceEstimation';

const STYLES: Record<Confidence, { label: string; className: string }> = {
  alta: { label: 'Confiança alta', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  media: { label: 'Confiança média', className: 'bg-amber-50 text-amber-700 border-amber-200' },
  baixa: { label: 'Confiança baixa', className: 'bg-orange-50 text-orange-700 border-orange-200' },
  sem_referencia: { label: 'Sem referência', className: 'bg-rose-50 text-rose-700 border-rose-200' },
};

export const PriceConfidenceBadge: React.FC<{ confidence: Confidence }> = ({ confidence }) => {
  const style = STYLES[confidence];
  return (
    <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black uppercase tracking-wider ${style.className}`}>
      {style.label}
    </span>
  );
};
```

- [ ] **Step 2: Linha de estimativa do item do carrinho**

Create `src/frontend/components/prices/CartItemEstimate.tsx`:

```tsx
import React from 'react';
import type { PriceEstimate } from '../../../shared/priceEstimation';
import type { CartItem } from '../../types';
import type { ManualPriceInput } from '../../utils/priceEstimationApi';
import { formatCurrency } from '../../utils';
import { PriceConfidenceBadge } from './PriceConfidenceBadge';

interface CartItemEstimateProps {
  item: CartItem;
  estimate?: PriceEstimate;
  onManualPrice: (manual: ManualPriceInput | null) => void;
}

const todayIso = () => new Date().toISOString().slice(0, 10);

const METHOD_LABEL: Record<PriceEstimate['method'], string> = {
  trend: 'tendência do histórico',
  single: 'última compra',
  cadastro: 'preço do cadastro',
  manual: 'preço informado',
  quote: 'cotação informada',
  none: 'sem referência',
};

export const CartItemEstimate: React.FC<CartItemEstimateProps> = ({ item, estimate, onManualPrice }) => {
  const [kind, setKind] = React.useState<'manual' | 'quote'>('manual');
  const [value, setValue] = React.useState('');
  const [date, setDate] = React.useState(todayIso());
  const [supplier, setSupplier] = React.useState('');

  if (!estimate) return null;

  const canInform = ['none', 'cadastro', 'manual', 'quote'].includes(estimate.method);
  const parsed = Number(value.replace(',', '.'));
  const valid = parsed > 0 && date <= todayIso();

  return (
    <div className="basis-full space-y-2 pt-2 border-t border-slate-100">
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
        <PriceConfidenceBadge confidence={estimate.confidence} />
        {estimate.method !== 'none' && (
          <>
            <span>Último: {formatCurrency(estimate.lastPrice)}{estimate.lastPriceDate ? ` (${estimate.lastPriceDate.split('-').reverse().join('/')})` : ''}</span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-800">Estimado: {formatCurrency(estimate.estimatedPrice)}</span>
            <span className="text-slate-300">|</span>
            <span>Margem {estimate.marginPct.toLocaleString('pt-BR')}% → protegido {formatCurrency(estimate.protectedPrice)}</span>
            <span className="text-slate-300">|</span>
            <span className="font-medium">{METHOD_LABEL[estimate.method]}</span>
          </>
        )}
        {estimate.method === 'none' && (
          <span className="text-rose-600">Sem histórico, sem cadastro e sem cotação: informe um preço abaixo (não bloqueia a requisição).</span>
        )}
      </div>

      {canInform && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={e => setKind(e.target.value as 'manual' | 'quote')}
            className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] font-bold outline-none"
          >
            <option value="manual">Preço estimado</option>
            <option value="quote">Cotação do fornecedor</option>
          </select>
          <input
            type="text"
            inputMode="decimal"
            placeholder="Valor"
            value={value}
            onChange={e => setValue(e.target.value)}
            className="w-24 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold outline-none focus:border-indigo-500"
          />
          <input
            type="date"
            value={date}
            max={todayIso()}
            onChange={e => setDate(e.target.value)}
            className="px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold outline-none focus:border-indigo-500"
          />
          {kind === 'quote' && (
            <input
              type="text"
              placeholder="Fornecedor da cotação"
              value={supplier}
              onChange={e => setSupplier(e.target.value)}
              className="w-40 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] font-bold outline-none focus:border-indigo-500"
            />
          )}
          <button
            type="button"
            disabled={!valid}
            onClick={() => onManualPrice({ kind, value: parsed, date, supplierName: kind === 'quote' ? supplier.trim() || undefined : undefined })}
            className="px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-[10px] font-black uppercase disabled:opacity-40"
          >
            Aplicar
          </button>
          {item.manualPrice && (
            <button
              type="button"
              onClick={() => { onManualPrice(null); setValue(''); }}
              className="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-[10px] font-black uppercase"
            >
              Remover
            </button>
          )}
        </div>
      )}
    </div>
  );
};
```

- [ ] **Step 3: Integrar no `CartModal`**

Em `src/frontend/components/modals/CartModal.tsx`:

1. Imports (junto dos existentes):

```tsx
import type { PriceEstimate } from '../../../shared/priceEstimation';
import { estimateKey, ManualPriceInput } from '../../utils/priceEstimationApi';
import { CartItemEstimate } from '../prices/CartItemEstimate';
```

2. Em `CartModalProps`, acrescentar:

```tsx
  estimationEnabled?: boolean;
  previewEstimates?: Record<string, PriceEstimate>;
  setCartManualPrice?: (name: string, supplier: string, manual: ManualPriceInput | null) => void;
```

e na desestruturação do componente acrescentar `estimationEnabled = false, previewEstimates = {}, setCartManualPrice` (junto de `isEditingList = false`).

3. Logo antes do `return (` do componente, acrescentar:

```tsx
  const estimateOf = (item: { name: string; supplierName: string }) =>
    estimationEnabled ? previewEstimates[estimateKey(item)] : undefined;
  const priceOf = (item: { name: string; supplierName: string; price: number }) =>
    estimateOf(item)?.estimatedPrice ?? item.price;
  const protectedTotal = cart.reduce((acc, item) => acc + (estimateOf(item)?.protectedPrice ?? item.price) * item.quantity, 0);
  const weakItems = cart.filter(item => {
    const c = estimateOf(item)?.confidence;
    return c === 'baixa' || c === 'sem_referencia';
  }).length;
```

4. No card do item (`<div key={i} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 ...">`), acrescentar `sm:flex-wrap` à `className` e, como **último filho** do card (depois do `<div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 flex-wrap">...</div>`), acrescentar:

```tsx
                      <CartItemEstimate
                        item={item}
                        estimate={estimateOf(item)}
                        onManualPrice={(manual) => setCartManualPrice?.(item.name, item.supplierName, manual)}
                      />
```

5. No campo de preço do item (`<input type="number" ... value={item.price} onChange={(e) => updateProductPrice(...)} />`), envolver com condição: quando `estimateOf(item)` existir, mostrar texto somente leitura em vez do input:

```tsx
                          {estimateOf(item) ? (
                            <span className="text-sm font-black text-slate-800 tabular-nums">{formatCurrency(priceOf(item))}</span>
                          ) : (
                            <input
                              type="number"
                              className="w-20 text-right font-black text-slate-800 text-sm tabular-nums bg-transparent border-b border-transparent hover:border-slate-300 focus:border-indigo-500 outline-none"
                              value={item.price}
                              onChange={(e) => updateProductPrice(item.name, item.supplierName, Number(e.target.value))}
                            />
                          )}
```

6. Nos dois `reduce` dos totais (Subtotal e Total), trocar `acc + (item.price * item.quantity)` por `acc + (priceOf(item) * item.quantity)`.

7. Logo após o bloco do **Total** (o `<div className="flex justify-between gap-4 pt-1 border-t border-slate-200">`), acrescentar:

```tsx
                  {estimationEnabled && (
                    <div className="space-y-1 pt-1 border-t border-dashed border-slate-200">
                      <div className="flex justify-between gap-4">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-none">Limite sugerido (com margem)</p>
                        <p className="text-sm font-black text-slate-600 tracking-tighter tabular-nums leading-none">{formatCurrency(protectedTotal + shippingFee)}</p>
                      </div>
                      {weakItems > 0 && (
                        <p className="text-[10px] font-bold text-amber-600">{weakItems} item(ns) com confiança baixa ou sem referência</p>
                      )}
                    </div>
                  )}
```

(`formatCurrency` já é importado no arquivo.)

- [ ] **Step 4: Passar as props por `Modals.tsx` e `App.tsx`**

Em `src/frontend/components/Modals.tsx`: na interface de props, acrescentar `estimationEnabled?: boolean; previewEstimates?: Record<string, import('../../shared/priceEstimation').PriceEstimate>; setCartManualPrice?: (name: string, supplier: string, manual: import('../utils/priceEstimationApi').ManualPriceInput | null) => void;` e repassar as três ao `<CartModal ... />` (junto de `finalizeList={props.finalizeList}`).

Em `src/frontend/App.tsx`:

1. Importar: `import { usePriceEstimation } from './hooks/usePriceEstimation';`
2. Desestruturar `setCartManualPrice` do `useCart(...)`.
3. Logo depois da linha `const [isCartOpen, setIsCartOpen] = useState(...)`, acrescentar: `const priceEstimation = usePriceEstimation(cart, isCartOpen);`
4. No `<Modals ... />`, acrescentar: `estimationEnabled={priceEstimation.enabled} previewEstimates={priceEstimation.estimates} setCartManualPrice={setCartManualPrice}`.

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/components/prices src/frontend/components/modals/CartModal.tsx src/frontend/components/Modals.tsx src/frontend/App.tsx
git commit -m "feat(precos): carrinho mostra estimativa, margem, confiança e aceita preço manual/cotação"
```

---

### Task 11: Interface — requisição e aprovação do limite

**Files:**
- Create: `src/frontend/components/prices/OrderItemEstimate.tsx`, `src/frontend/components/prices/ApprovalLimitFields.tsx`
- Modify: `src/frontend/components/PurchaseOrdersView.tsx`, `src/frontend/hooks/usePurchaseOrders.ts`

**Interfaces:**
- Consumes: `PriceEstimate`, `PurchaseOrder` com `suggestedLimit` etc. (Task 9); rota `approve-requisition` (Task 8).
- Produces: `approveRequisition(id, observacao?, approval?: { approvedLimit?: number; limitReason?: string })`.

- [ ] **Step 1: Linha de estimativa por item**

Create `src/frontend/components/prices/OrderItemEstimate.tsx`:

```tsx
import React from 'react';
import type { PriceEstimate } from '../../../shared/priceEstimation';
import { formatCurrency } from '../../utils';
import { PriceConfidenceBadge } from './PriceConfidenceBadge';

export const OrderItemEstimate: React.FC<{ estimate?: PriceEstimate }> = ({ estimate }) => {
  if (!estimate) return null;
  return (
    <div className="px-3 pb-2 flex flex-wrap items-center gap-2 text-[10px] font-bold text-slate-500">
      <PriceConfidenceBadge confidence={estimate.confidence} />
      {estimate.method === 'none' ? (
        <span className="text-rose-600">Sem referência de preço</span>
      ) : (
        <>
          <span>Último {formatCurrency(estimate.lastPrice)}</span>
          <span className="text-slate-300">→</span>
          <span className="text-slate-800">Est. {formatCurrency(estimate.estimatedPrice)}</span>
          <span>(+{estimate.marginPct.toLocaleString('pt-BR')}% = {formatCurrency(estimate.protectedPrice)})</span>
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 2: Campo do limite aprovado**

Create `src/frontend/components/prices/ApprovalLimitFields.tsx`:

```tsx
import React from 'react';
import type { PurchaseOrder } from '../../types';
import { formatCurrency } from '../../utils';

export interface LimitDraft {
  limit: string;
  reason: string;
}

export const parseLimit = (raw: string): number => Number(raw.replace(',', '.'));

export const limitChanged = (order: PurchaseOrder, draft?: LimitDraft): boolean => {
  if (!draft || draft.limit.trim() === '' || typeof order.suggestedLimit !== 'number') return false;
  return Math.abs(parseLimit(draft.limit) - order.suggestedLimit) > 0.005;
};

interface ApprovalLimitFieldsProps {
  order: PurchaseOrder;
  draft?: LimitDraft;
  onChange: (draft: LimitDraft) => void;
}

export const ApprovalLimitFields: React.FC<ApprovalLimitFieldsProps> = ({ order, draft, onChange }) => {
  if (typeof order.suggestedLimit !== 'number') return null;
  const current: LimitDraft = draft ?? { limit: String(order.suggestedLimit).replace('.', ','), reason: '' };
  const weak = order.items.filter(i => i.estimate && (i.estimate.confidence === 'baixa' || i.estimate.confidence === 'sem_referencia')).length;
  const changed = limitChanged(order, current);

  return (
    <div className="space-y-2 p-3 bg-slate-50 rounded-xl border border-slate-100">
      <div className="flex justify-between text-[11px] font-bold text-slate-500">
        <span>Total estimado</span>
        <span className="text-slate-800">{formatCurrency(order.estimatedTotal ?? order.total)}</span>
      </div>
      <div className="flex justify-between text-[11px] font-bold text-slate-500">
        <span>Limite sugerido (com margem)</span>
        <span className="text-slate-800">{formatCurrency(order.suggestedLimit)}</span>
      </div>
      {weak > 0 && (
        <p className="text-[10px] font-bold text-amber-600">{weak} item(ns) com confiança baixa ou sem referência</p>
      )}
      <label className="block text-[10px] font-black uppercase text-slate-400">Limite aprovado (R$)</label>
      <input
        type="text"
        inputMode="decimal"
        value={current.limit}
        onChange={e => onChange({ ...current, limit: e.target.value })}
        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-black outline-none focus:border-indigo-500"
      />
      {changed && (
        <textarea
          value={current.reason}
          onChange={e => onChange({ ...current, reason: e.target.value })}
          placeholder="Motivo da alteração do limite (obrigatório)..."
          rows={2}
          className="w-full px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-medium outline-none focus:border-indigo-500 resize-none"
        />
      )}
    </div>
  );
};
```

- [ ] **Step 3: Hook — aprovar com limite e mostrar o erro do servidor**

Em `src/frontend/hooks/usePurchaseOrders.ts`, substituir a função `approveRequisition` inteira por:

```ts
  const approveRequisition = useCallback(async (
    id: string,
    observacao?: string,
    approval?: { approvedLimit?: number; limitReason?: string }
  ) => {
    const order = purchaseOrders.find(o => o.id === id);
    try {
      const res = await fetch('/api/xml/purchase_orders/approve-requisition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, approvedBy: loggedName, observacao, ...approval })
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        addAppNotification('Não foi possível aprovar', body?.message || `Erro ${res.status}`);
        await fetchPurchaseOrders(true);
        return;
      }
      await fetchPurchaseOrders(true);
      addAppNotification('Requisição Aprovada', `"${order?.name || 'Requisição'}" foi aprovada por ${loggedName} e aguarda aprovação de compra.`);
    } catch (err) {
      console.error('Erro ao aprovar requisição:', err);
    }
  }, [loggedName, fetchPurchaseOrders, addAppNotification, purchaseOrders]);
```

- [ ] **Step 4: Tela da requisição**

Em `src/frontend/components/PurchaseOrdersView.tsx`:

1. Imports:

```tsx
import { OrderItemEstimate } from './prices/OrderItemEstimate';
import { ApprovalLimitFields, LimitDraft, limitChanged, parseLimit } from './prices/ApprovalLimitFields';
```

2. Tipo da prop: trocar `approveRequisition: (id: string, observacao?: string) => Promise<void>;` por
`approveRequisition: (id: string, observacao?: string, approval?: { approvedLimit?: number; limitReason?: string }) => Promise<void>;`

3. Junto dos `useState` existentes, acrescentar:

```tsx
  const [limitDrafts, setLimitDrafts] = React.useState<Record<string, LimitDraft>>({});

  const approvalFor = (order: PurchaseOrder) => {
    const draft = limitDrafts[order.id];
    if (!draft || typeof order.suggestedLimit !== 'number') return undefined;
    return { approvedLimit: parseLimit(draft.limit), limitReason: draft.reason.trim() };
  };
  const approvalBlocked = (order: PurchaseOrder) => {
    const draft = limitDrafts[order.id];
    return limitChanged(order, draft) && (draft?.reason.trim().length ?? 0) < 3;
  };
```

4. No componente `ItemsList`, trocar o retorno por:

```tsx
    <div>
      <div className="bg-slate-50 rounded-xl border border-slate-100 divide-y divide-slate-100 max-h-40 overflow-y-auto">
        {order.items.map((item, idx) => (
          <div key={idx}>
            <div className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
              <span className="font-bold text-slate-700 truncate">{item.name}</span>
              <span className="flex items-center gap-3 shrink-0 text-slate-500">
                <span>{item.quantity}x</span>
                <span className="font-black text-slate-800">{formatCurrency(item.price * item.quantity)}</span>
              </span>
            </div>
            <OrderItemEstimate estimate={item.estimate} />
          </div>
        ))}
      </div>
      {typeof order.suggestedLimit === 'number' && (
        <div className="mt-2 flex flex-wrap justify-between gap-2 text-[10px] font-bold text-slate-500">
          <span>Estimado {formatCurrency(order.estimatedTotal ?? order.total)}</span>
          <span>Limite sugerido {formatCurrency(order.suggestedLimit)}</span>
          {typeof order.approvedLimit === 'number' && (
            <span className="text-emerald-700">Limite aprovado {formatCurrency(order.approvedLimit)}</span>
          )}
        </div>
      )}
    </div>
```

5. Na coluna "Requisição Criada", imediatamente **antes** do `<textarea ... placeholder="Observação (opcional)..."`, acrescentar (apenas para requisições não rejeitadas):

```tsx
                  {order.status !== 'rejected' && (
                    <ApprovalLimitFields
                      order={order}
                      draft={limitDrafts[order.id]}
                      onChange={(draft) => setLimitDrafts(prev => ({ ...prev, [order.id]: draft }))}
                    />
                  )}
```

6. No botão "Aprovar Requisição", trocar o `onClick` e acrescentar `disabled`:

```tsx
                        onClick={() => approveRequisition(order.id, getObservacao(order), approvalFor(order))}
                        disabled={approvalBlocked(order)}
                        title={approvalBlocked(order) ? 'Informe o motivo para alterar o limite' : undefined}
```

e acrescentar `disabled:opacity-40 disabled:cursor-not-allowed` à `className` do botão.

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 6: Commit**

```bash
git add src/frontend/components/prices src/frontend/components/PurchaseOrdersView.tsx src/frontend/hooks/usePurchaseOrders.ts
git commit -m "feat(precos): requisição mostra estimativa por item e a 1ª aprovação define o limite"
```

---

### Task 12: Interface — configurações de preço

**Files:**
- Create: `src/frontend/components/prices/PriceSettingsSection.tsx`
- Modify: `src/frontend/components/modals/SettingsModal.tsx`

**Interfaces:**
- Consumes: `fetchPriceSettings`, `savePriceSettings` (Task 9); `normalizeParams`, `validateParams` (Task 3); permissão `prices.config` (Task 4).
- Produces: `<PriceSettingsSection categories />` (não renderiza nada se o recurso estiver desligado).

- [ ] **Step 1: Seção de configurações**

Create `src/frontend/components/prices/PriceSettingsSection.tsx`:

```tsx
import React from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { PriceParams } from '../../../shared/priceEstimation';
import { normalizeParams, validateParams, PriceSettingsChange } from '../../../shared/priceSettings';
import { fetchPriceSettings, savePriceSettings } from '../../utils/priceEstimationApi';

const SCALAR_FIELDS: Array<{ key: keyof PriceParams; label: string; hint: string }> = [
  { key: 'windowMonths', label: 'Janela de histórico (meses)', hint: 'Compras mais antigas só entram se houver menos de 2 na janela.' },
  { key: 'maxMonthlyTrendPct', label: 'Variação máxima da tendência (% ao mês)', hint: 'Teto do aumento ou queda projetados por mês.' },
  { key: 'maxProjectionMonths', label: 'Projeção máxima (meses)', hint: 'Limite de meses projetados desde a última compra.' },
  { key: 'leadDays', label: 'Prazo até a compra (dias)', hint: '0 = compra imediata, sem projetar aumento.' },
  { key: 'defaultBase', label: 'Margem base padrão (%)', hint: 'Usada quando a categoria não tem margem própria.' },
  { key: 'volK', label: 'Peso da volatilidade', hint: 'Quanto a oscilação dos preços aumenta a margem.' },
  { key: 'ageStartMonths', label: 'Meses sem acréscimo de idade', hint: 'Depois disso a margem cresce com a idade do preço.' },
  { key: 'agePctPerMonth', label: 'Acréscimo por mês de idade (%)', hint: 'Somado à margem a cada mês de preço antigo.' },
  { key: 'minMargin', label: 'Margem mínima (%)', hint: 'Piso da margem de segurança.' },
  { key: 'maxMargin', label: 'Margem máxima (%)', hint: 'Teto da margem de segurança.' },
  { key: 'staleDays', label: 'Dias para preço desatualizado', hint: 'Acima disso a confiança cai para baixa.' },
];

export const PriceSettingsSection: React.FC<{ categories: string[] }> = ({ categories }) => {
  const [enabled, setEnabled] = React.useState(false);
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [categoryDraft, setCategoryDraft] = React.useState<Record<string, string>>({});
  const [history, setHistory] = React.useState<PriceSettingsChange[]>([]);
  const [message, setMessage] = React.useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    const s = await fetchPriceSettings(true);
    if (!s) return;
    setEnabled(s.enabled);
    setHistory(s.history || []);
    const next: Record<string, string> = {};
    SCALAR_FIELDS.forEach(f => { next[f.key] = String(s.params[f.key]); });
    setDraft(next);
    const cats: Record<string, string> = {};
    Object.entries(s.params.baseByCategory).forEach(([k, v]) => { cats[k] = String(v); });
    setCategoryDraft(cats);
  }, []);

  React.useEffect(() => { load(); }, [load]);

  if (!enabled) return null;

  const handleSave = async () => {
    const baseByCategory: Record<string, number> = {};
    Object.entries(categoryDraft).forEach(([k, v]) => {
      if (v.trim() !== '') baseByCategory[k] = Number(v.replace(',', '.'));
    });
    const scalars: Record<string, number> = {};
    SCALAR_FIELDS.forEach(f => { scalars[f.key] = Number((draft[f.key] ?? '').replace(',', '.')); });
    const params = normalizeParams({ ...scalars, baseByCategory } as Partial<PriceParams>);
    const errors = validateParams(params);
    if (errors.length > 0) {
      setMessage({ ok: false, text: errors.join(' ') });
      return;
    }
    setSaving(true);
    const result = await savePriceSettings(params);
    setSaving(false);
    setMessage(result.ok ? { ok: true, text: 'Configurações salvas.' } : { ok: false, text: result.message || 'Não foi possível salvar.' });
    if (result.ok) await load();
  };

  return (
    <section className="space-y-4">
      <h3 className="text-sm font-black text-slate-800 flex items-center gap-3 uppercase tracking-wider">
        <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
        Estimativa de preços
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {SCALAR_FIELDS.map(f => (
          <label key={f.key} className="block p-3 bg-slate-50 border border-slate-100 rounded-xl">
            <span className="block text-[11px] font-black text-slate-700">{f.label}</span>
            <span className="block text-[10px] text-slate-400 font-medium mb-1">{f.hint}</span>
            <input
              type="text"
              inputMode="decimal"
              value={draft[f.key] ?? ''}
              onChange={e => setDraft(prev => ({ ...prev, [f.key]: e.target.value }))}
              className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-indigo-500"
            />
          </label>
        ))}
      </div>

      <div className="space-y-2">
        <p className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Margem base por categoria (%)</p>
        <p className="text-[10px] text-slate-400 font-medium">Vazio = usa a margem base padrão. Produto com várias categorias usa a maior.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {categories.map(cat => (
            <label key={cat} className="flex items-center justify-between gap-3 p-2 bg-white border border-slate-100 rounded-lg">
              <span className="text-xs font-bold text-slate-700 truncate">{cat}</span>
              <input
                type="text"
                inputMode="decimal"
                value={categoryDraft[cat] ?? ''}
                placeholder="padrão"
                onChange={e => setCategoryDraft(prev => ({ ...prev, [cat]: e.target.value }))}
                className="w-20 px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-right outline-none focus:border-indigo-500"
              />
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 bg-indigo-600 text-white rounded-xl text-xs font-black uppercase disabled:opacity-50"
        >
          {saving ? 'Salvando...' : 'Salvar configurações'}
        </button>
        {message && (
          <span className={`text-xs font-bold ${message.ok ? 'text-emerald-600' : 'text-rose-600'}`}>{message.text}</span>
        )}
      </div>

      {history.length > 0 && (
        <div className="space-y-1">
          <p className="text-[11px] font-black text-slate-700 uppercase tracking-wider">Últimas alterações</p>
          <div className="max-h-40 overflow-y-auto bg-slate-50 border border-slate-100 rounded-xl divide-y divide-slate-100">
            {[...history].reverse().slice(0, 20).map((h, i) => (
              <p key={i} className="px-3 py-1.5 text-[11px] text-slate-600 font-medium">
                {new Date(h.at).toLocaleString('pt-BR')} · <span className="font-bold">{h.by}</span> · {h.field}: {String(h.before ?? '—')} → {String(h.after ?? '—')}
              </p>
            ))}
          </div>
        </div>
      )}
    </section>
  );
};
```

- [ ] **Step 2: Encaixar no `SettingsModal`**

Em `src/frontend/components/modals/SettingsModal.tsx`:

1. Import: `import { PriceSettingsSection } from '../prices/PriceSettingsSection';`
2. Junto das constantes `canConfig`, `canApprove`, `canManageUsers`, acrescentar: `const canPriceConfig = allowed('prices.config');`
3. Trocar a condição de abertura do bloco principal `{(canConfig || canApprove || canManageUsers) && (` por `{(canConfig || canApprove || canManageUsers || canPriceConfig) && (`.
4. Imediatamente antes do fechamento `</>` desse bloco (depois da seção "Acessos Autorizados"), acrescentar:

```tsx
                  {canPriceConfig && <PriceSettingsSection categories={categories} />}
```

- [ ] **Step 3: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
git add src/frontend/components/prices/PriceSettingsSection.tsx src/frontend/components/modals/SettingsModal.tsx
git commit -m "feat(precos): seção de configurações de estimativa com histórico de alterações"
```

---

### Task 13: Interface — importação de planilha somente adição

**Files:**
- Modify: `src/frontend/hooks/useSuppliers.ts` (trocar `saveSuppliersBatch` por `importSuppliersAddOnly`)
- Modify: `src/frontend/hooks/useExcel.ts` (`performImport` sem substituir)
- Modify: `src/frontend/components/modals/ImportModal.tsx`
- Modify: `src/frontend/App.tsx`

**Interfaces:**
- Consumes: `POST /api/xml/suppliers/import` (Task 8).
- Produces: `importSuppliersAddOnly(batch: Supplier[]): Promise<{ ok: boolean; addedSuppliers: number; addedProducts: number; skippedProducts: number }>`; `performImport(data: Record<string, Supplier>)`; `ImportModal` com `onPerformImport: () => void`.

- [ ] **Step 1: Hook de fornecedores**

Em `src/frontend/hooks/useSuppliers.ts`, substituir a função `saveSuppliersBatch` inteira por:

```ts
  // Importação de planilha: o servidor só ACRESCENTA fornecedores/produtos novos e devolve as contagens.
  const importSuppliersAddOnly = async (batch: Supplier[]) => {
    const failed = { ok: false, addedSuppliers: 0, addedProducts: 0, skippedProducts: 0 };
    if (batch.length === 0) return { ...failed, ok: true };
    try {
      const res = await fetch('/api/xml/suppliers/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ suppliers: batch.map(s => cleanObject(s)) })
      });
      if (!res.ok) {
        console.warn(`Importação não foi salva (HTTP ${res.status}).`);
        return failed;
      }
      const data = await res.json();
      await invalidateBackendCache('suppliers');
      await loadData(true);
      return {
        ok: true,
        addedSuppliers: Number(data.addedSuppliers) || 0,
        addedProducts: Number(data.addedProducts) || 0,
        skippedProducts: Number(data.skippedProducts) || 0,
      };
    } catch (err: any) {
      console.warn("Importação de fornecedores falhou:", err.message);
      return failed;
    }
  };
```

e, no `return { ... }` do hook, trocar `saveSuppliersBatch,` por `importSuppliersAddOnly,`.

- [ ] **Step 2: `useExcel`**

Em `src/frontend/hooks/useExcel.ts`:

1. Trocar a assinatura do hook para
`export const useExcel = (suppliers: Supplier[], importSuppliersAddOnly: (batch: Supplier[]) => Promise<{ ok: boolean; addedSuppliers: number; addedProducts: number; skippedProducts: number }>, addNotification: any) => {`
2. Substituir a função `performImport` inteira (de `const performImport = async` até o `};` que a fecha, logo antes de `const handleSyncSheets`) por:

```ts
  const performImport = async (data: Record<string, Supplier>) => {
    try {
      const result = await importSuppliersAddOnly(Object.values(data));
      if (!result.ok) {
        addNotification('A importação não foi salva. Verifique se você tem permissão para importar planilhas.', 0);
        return;
      }
      if (result.addedSuppliers === 0 && result.addedProducts === 0) {
        addNotification(`Nada novo para importar: ${result.skippedProducts} produto(s) já existiam e foram mantidos.`, 0);
      } else {
        addNotification(
          `Importação: ${result.addedSuppliers} fornecedor(es) e ${result.addedProducts} produto(s) novos; ${result.skippedProducts} já existiam e foram mantidos.`,
          result.addedProducts
        );
      }
    } catch (err) {
      console.error('Erro na execução da importação:', extractErrorMessage(err));
      addNotification('Erro ao salvar dados importados', 0);
    }
  };
```

- [ ] **Step 3: Modal**

Em `src/frontend/components/modals/ImportModal.tsx`:

1. Trocar `onPerformImport: (replace: boolean) => void;` por `onPerformImport: () => void;`.
2. Remover o botão "Substituir Tudo" (o segundo `<button>` dentro de `<div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-slate-900">`) e trocar o grid por `grid-cols-1`.
3. No botão que restou: `onClick={() => onPerformImport()}`, título `Importar apenas novos` e texto `Adiciona fornecedores e produtos que ainda não existem. O que já está cadastrado não é alterado.`
4. No parágrafo "Como deseja prosseguir?", trocar por `O que já existe no sistema não será alterado.`
5. Remover do import de `lucide-react` o ícone `Trash2` se ficar sem uso.

- [ ] **Step 4: `App.tsx`**

Em `src/frontend/App.tsx`:

1. Na desestruturação de `useSuppliers`, trocar `saveSuppliersBatch,` por `importSuppliersAddOnly,`.
2. Trocar `useExcel(suppliers, saveSuppliersBatch, addNotification)` por `useExcel(suppliers, importSuppliersAddOnly, addNotification)`.
3. Substituir o `onPerformImport` por:

```tsx
  const onPerformImport = React.useCallback(async () => {
    if (!pendingImportData || isImporting) return;
    setIsImporting(true);
    try {
      await performImport(pendingImportData);
      setPendingImportData(null);
    } finally {
      setIsImporting(false);
    }
  }, [pendingImportData, isImporting, performImport]);
```

- [ ] **Step 5: Verificar tipos**

Run: `npx tsc --noEmit`
Expected: sem erros (se sobrar uso de `deleteAllSuppliers` apenas em outros lugares, tudo bem).

- [ ] **Step 6: Commit**

```bash
git add src/frontend/hooks/useSuppliers.ts src/frontend/hooks/useExcel.ts src/frontend/components/modals/ImportModal.tsx src/frontend/App.tsx
git commit -m "feat(fornecedores): importação de planilha somente adição, sem substituir a lista"
```

---

### Task 14: Dados de teste e validação manual no localhost:3000

**Files:**
- Create: `scripts/dev/seed-test-invoices.ts`

**Interfaces:**
- Consumes: servidor local com `DISABLE_PERMISSION_ENFORCEMENT=1` e Modo de Teste (cabeçalho `x-test-mode: true`).
- Produces: fornecedor `FORNECEDOR TESTE SEED` com 8 produtos que cobrem os cenários, e notas de teste com datas relativas a hoje.

- [ ] **Step 1: Script de semente**

Create `scripts/dev/seed-test-invoices.ts`:

```ts
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
```

- [ ] **Step 2: Rodar a semente**

Com o servidor no ar (Task 0, Step 7): `npx tsx scripts/dev/seed-test-invoices.ts`
Expected: linhas `notas: ...` para os 6 produtos e `fornecedor: FORNECEDOR TESTE SEED (8 produtos)`. Se der `HTTP 401/403`, confirmar `DISABLE_PERMISSION_ENFORCEMENT=1` no `.env` e reiniciar o servidor.

- [ ] **Step 3: Conferir as estimativas pela API**

Run:

```powershell
curl.exe -s -X POST http://localhost:3000/api/xml/price-estimates -H "Content-Type: application/json" -H "x-test-mode: true" -d "{\"items\":[{\"name\":\"ARROZ TIPO 1 5KG\",\"code\":\"SEED-ARROZ\",\"supplierName\":\"FORNECEDOR TESTE SEED\"},{\"name\":\"LEITE INTEGRAL 1L\",\"code\":\"SEED-LEITE\",\"supplierName\":\"FORNECEDOR TESTE SEED\"},{\"name\":\"AZEITE EXTRA VIRGEM 500ML\",\"code\":\"SEED-AZEITE\",\"supplierName\":\"FORNECEDOR TESTE SEED\"},{\"name\":\"CAFE TORRADO 500G\",\"code\":\"SEED-CAFE\",\"supplierName\":\"FORNECEDOR TESTE SEED\"},{\"name\":\"PRODUTO NOVO SEM NADA\",\"code\":\"SEED-NOVO\",\"supplierName\":\"FORNECEDOR TESTE SEED\"}]}"
```

Expected (por produto): ARROZ → `method:"trend"`, `confidence:"alta"`, `estimatedPrice` acima de 25; LEITE → `trend`, `alta`, `estimatedPrice` abaixo de 5; AZEITE → `single`, `baixa`, `estimatedPrice` 32; CAFE → `cadastro`, `baixa`, `estimatedPrice` 18; NOVO → `none`, `sem_referencia`, `estimatedPrice` 0.

- [ ] **Step 4: Roteiro manual no navegador (Modo de Teste ligado, flag `1`)**

Marcar cada item ao validar:

- [ ] **Carrinho:** em Fornecedores, adicionar ao carrinho ARROZ, LEITE, OVOS, SAL, AZEITE, FARINHA, CAFE e PRODUTO NOVO. Abrir o carrinho: cada item mostra selo de confiança, último preço, estimativa e margem; o campo de preço deixa de ser editável; "Limite sugerido (com margem)" aparece nos totais com aviso de itens de confiança baixa/sem referência.
- [ ] **PRODUTO NOVO:** mostra aviso "Sem histórico..." e os campos de preço manual/cotação. Aplicar uma cotação (ex.: R$ 25, hoje): a linha passa a método "cotação informada", confiança baixa, estimativa 25.
- [ ] **Validação:** tentar aplicar valor 0 ou data futura: o botão "Aplicar" fica desabilitado.
- [ ] **Criar requisição:** informar um nome e enviar para aprovação. Em Ordem de Compra, a requisição mostra, por item, último → estimado (+margem) e o selo; mostra "Estimado" e "Limite sugerido".
- [ ] **1ª aprovação:** o campo "Limite aprovado" vem preenchido com o sugerido. Alterar o valor: aparece o campo de motivo e "Aprovar Requisição" fica desabilitado até digitar 3+ caracteres. Aprovar. A requisição vai para "Requisição aprovada" mostrando "Limite aprovado".
- [ ] **Sem alterar o limite:** em outra requisição, aprovar sem mexer: aprova direto e o histórico registra "Limite sugerido confirmado".
- [ ] **2ª aprovação e envio:** aprovar a compra e "Enviar para lista": a lista abre em Minhas Listas; os itens mantêm o preço estimado.
- [ ] **Configurações:** em Configurações → "Estimativa de preços", mudar a "Margem base padrão" para 8, salvar, reabrir o carrinho: as margens sobem; a seção "Últimas alterações" mostra a mudança (quem, quando, antes → depois). Valor inválido (ex.: margem mínima 30 e máxima 10) mostra erro e não salva.
- [ ] **Planilha só-adição:** importar uma planilha com (a) um fornecedor existente com preço diferente em um produto existente e um produto novo; (b) um fornecedor novo. Resultado: produto existente mantém o preço, o produto novo entra, o fornecedor novo entra; o aviso informa quantos entraram e quantos já existiam. O modal não oferece mais "Substituir".
- [ ] **Flag desligada:** parar o servidor, trocar `.env` para `PRICE_ESTIMATION_ENABLED=0`, subir de novo. Carrinho, requisição e configurações voltam a ser **idênticos ao sistema atual** (preço editável, sem selos, sem limite, sem seção de estimativa). Uma requisição criada nesse modo não tem `estimate`. Voltar o `.env` para `1`.
- [ ] **Requisição antiga:** uma requisição criada com a flag desligada, aberta com a flag ligada, abre normalmente sem selos nem limite.
- [ ] **Dashboard:** o "Gasto no Período" e "Faltando NF" permanecem iguais ao que eram antes de testar (nenhuma requisição ou estimativa altera esses valores).

- [ ] **Step 5: Commit**

```bash
git add scripts/dev/seed-test-invoices.ts
git commit -m "chore(dev): script de dados de teste para validar a estimativa de preços"
```

---

### Task 15: Verificação final e roteiro de publicação (não executar o merge sem ordem)

**Files:**
- Verify: todo o worktree

- [ ] **Step 1: Verificação completa**

Run (no worktree):

```powershell
npx tsc --noEmit
npx tsx --test src/shared/*.test.ts src/backend/services/*.test.ts
npx esbuild src/backend/server.ts --bundle --platform=node --format=cjs --packages=external --outfile=$env:TEMP\server-check.cjs
npx vite build
```

Expected: `tsc` sem erros; todos os testes passam (`# fail 0`); bundle do servidor gerado; `vite build` conclui.

- [ ] **Step 2: Conferir o escopo do diff**

Run: `git diff main --stat`
Expected: apenas os arquivos listados na "Estrutura de arquivos" (mais testes e script de semente). Nenhuma mudança em `DashboardView.tsx`, `SectorDashboardView.tsx` ou nos cálculos de gasto do mês.

- [ ] **Step 3: Revisão final com o usuário**

Mostrar ao usuário o resultado do roteiro da Task 14 e pedir aprovação **explícita** antes de qualquer publicação. Nada abaixo é executado sem essa ordem.

- [ ] **Step 4: Roteiro de publicação (só quando o usuário mandar)**

1. Merge para a main: `cd C:\vscode\labarr-gestor; git merge --no-ff feature/estimativa-precos`. Rodar `npx tsc --noEmit` após o merge.
2. **Antes do deploy**, o usuário roda `scripts/supabase/add-price-settings.sql` no SQL Editor do Supabase de produção.
3. `git push`. O deploy do Vercel **não** liga o recurso: a variável `PRICE_ESTIMATION_ENABLED` não existe lá, então o sistema segue como hoje.
4. Quando decidir ativar: criar `PRICE_ESTIMATION_ENABLED=1` nas variáveis de ambiente do Vercel (Production) e fazer um novo deploy. Marcar a permissão `prices.config` para quem vai configurar as margens e ajustar as margens por categoria em Configurações.
5. **Desfazer rápido**: remover a variável (ou colocar `0`) e fazer novo deploy devolve o comportamento anterior sem perder dados; requisições já criadas continuam abrindo.
6. Remover o worktree: `git worktree remove ..\labarr-gestor-estimativa`.

---

## Self-Review

- **Cobertura da spec:** motor (Tasks 1–2) com cenários 1–9 e 15; parâmetros e histórico de alterações (Task 3); permissão (Task 4); serviço, snapshot, limite aprovado e envio para a lista (Tasks 5, 6, 8); planilha só-adição imposta no servidor e "Substituir" removido (Tasks 7, 8, 13); configuração administrativa e interface (Tasks 10–12); migração (`price_settings`, Task 8); restrição do dashboard (Global Constraints + Task 14, último item + Task 15, passo 2); isolamento e flag (Estratégia + Tasks 0, 8, 15).
- **Placeholders:** nenhum; cada passo traz o código, o comando e o resultado esperado.
- **Consistência de tipos/nomes:** `estimatePrice`, `PriceEstimate`, `PriceParams`, `HistoryPoint`, `ManualReference` (Task 2) são os mesmos usados em 3, 5, 6, 9–12; `ManualPriceInput` (serviço, Task 5) e `ManualPriceInput` (API do front, Task 9) têm o mesmo formato `{ kind, value, date, supplierName? }`; `approveRequisition(id, observacao?, approval?)` é igual no hook (Task 11), na view (Task 11) e na rota (`approvedLimit`, `limitReason`, Task 8); `importSuppliersAddOnly` (Task 13) é o nome usado no hook, em `useExcel` e em `App.tsx`; `estimateKey` (`fornecedor||nome`) é usado igualmente na API (Task 9) e no `CartModal` (Task 10).
