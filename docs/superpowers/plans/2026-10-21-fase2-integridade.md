# Fase 2 — Integridade dos dados: plano de execução

> **Para quem executar:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos usam checkbox (`- [ ]`).

**Objetivo:** impedir gasto duplicado na confirmação, valores absurdos, perda de dados por gravação simultânea, nota reimportada sobrescrevendo a original e ações destrutivas sem rastro; e parar de vazar detalhe técnico de erro em produção.

**Arquitetura:** a lógica nova vai para módulos puros e testáveis sem banco (`validation.ts`, `errors.ts`, `audit.ts`, `services/confirmedSpending.ts`, `services/invoiceDuplicates.ts`, `data/version.ts`); `app.ts` só chama esses módulos. O controle de versão fica em `data.version` (dentro do JSON do documento) e a gravação condicional usa `updated_at` como trava no banco (compare-and-swap), sem mudar o formato do que as rotas GET devolvem.

**Stack:** Express, TypeScript ESM, Supabase (Postgres, tabelas `id/data/updated_at`), React/Vite, `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-20-seguranca-integridade-design.md` (Fase 2, itens 2.1 a 2.7). Regras de negócio de Faltando NF / Gasto no Período: `docs/superpowers/specs/2026-10-16-faltando-nf-design.md` (não podem mudar).

## Rulings (decisões já tomadas, com custo se erradas)
- **Nota duplicada (2.4):** o ID da nota já é a chave de acesso sem o prefixo `NFe` (`xmlService.ts:97-101`), então o mesmo XML cai no mesmo registro; o problema real é que reimportar **sobrescreve** a nota (perdendo ajustes) e **refaz os alertas de preço e o push**. A mudança é: se o ID já existe, não grava nada e responde `status: 'duplicate'`. Custo se errado: quem reimportava de propósito para "atualizar" uma nota agora precisa apagar e importar de novo.
- **Versão (2.3):** só as listas de compras (`shopping_lists/update-items`) ganham controle de versão nesta fase. Ajustes de pedido (`approve`, `reject`, `observacao`) gravam um campo só por merge e não perdem o resto; histórico de preços muda raramente. Custo se errado: continuam possíveis perdas raras nesses pontos.
- **Cliente antigo:** `baseVersion` ausente = grava sem checar (mas sempre incrementa a versão). Evita quebrar telas abertas durante o deploy.
- **Valores (2.2):** só se valida o que veio preenchido; campo ausente mantém o padrão atual (preço 0, quantidade 1). Preço `0 ≤ p ≤ 1.000.000`; quantidade `0 < q ≤ 100.000`.
- **Ações em massa (2.5):** `suppliers/delete-all` exige `confirmCount` igual ao número que seria apagado; `list-spendings/reset` exige `confirm: true`. Custo se errado: o reset não confere contagem (só mexe em lançamentos provisórios de listas).
- **Auditoria:** se gravar o registro de auditoria falhar, a ação segue e o erro vai para o log (auditoria nunca bloqueia o trabalho). A tabela `audit_log` precisa ser criada no Supabase por você (SQL pronto na Tarefa 6).
- **Testes de rota:** as rotas usam o banco real (o teste de lembretes grava e apaga de verdade). Por isso testes de rota aqui só cobrem respostas 400 que acontecem **antes** de qualquer gravação; o resto é testado em funções puras.

## Restrições globais
- Imports relativos em `src/backend` e `src/shared` terminam em `.js` (nos arquivos de teste, `.ts`, como os existentes).
- Arquivos do repo têm CRLF; edite com Edit/scripts que preservem as quebras de linha.
- Rodar só testes direcionados: `npx tsx --test src/shared/*.test.ts src/backend/auth/*.test.ts src/backend/*.test.ts src/backend/services/*.test.ts src/backend/data/supabaseRepo.test.ts` e `npx tsc --noEmit`. Nunca `npm test` completo. `routes.reminders.test.ts` só com `--test-name-pattern` e `timeout`.
- O `tsconfig` não é `strict`: use interfaces com campos opcionais, não uniões discriminadas.
- Mensagens para o usuário em português.
- Commits só quando o dono pedir; cada tarefa termina compilando e com testes passando.

## Estrutura de arquivos
- Criar `src/backend/validation.ts` (+ `validation.test.ts`) — `ValidationError`, `parsePrice`, `parseQuantity`, `validateItems`.
- Criar `src/backend/services/confirmedSpending.ts` (+ teste) — ID estável e payload do gasto confirmado.
- Criar `src/backend/errors.ts` (+ teste) — `describeError`, `internalErrorMessage`.
- Criar `src/backend/services/invoiceDuplicates.ts` (+ teste) — `findDuplicateInvoices`.
- Criar `src/backend/data/version.ts` (+ teste) — `versionOf`.
- Criar `src/backend/audit.ts` (+ teste) — `buildAuditRecord`, `recordAudit`.
- Criar `scripts/supabase/add-audit-log.sql`.
- Modificar `src/backend/data/types.ts`, `supabaseRepo.ts`, `firestoreRepo.ts` (+ `supabaseRepo.test.ts`) — `updateIfVersion`.
- Modificar `src/backend/app.ts`, `src/shared/permissions.ts`.
- Modificar no front: `usePendingListProductsPanel.ts`, `useCart.ts`, `useSuppliers.ts`, `ResetListSpendingsButton.tsx`, `DashboardView.tsx`, `types.ts`.

---

### Tarefa 1: Validação de valores

**Arquivos:** criar `src/backend/validation.ts`, `src/backend/validation.test.ts`; modificar `src/backend/app.ts` (confirmação, update-items, criar lista, pedidos, limite de setor, importar fornecedores), `src/backend/data/routes.reminders.test.ts`.

**Interfaces:**
- Produz: `class ValidationError extends Error { status = 400 }`, `parsePrice(value: unknown, label?: string): number` (ausente → 0), `parseQuantity(value: unknown, label?: string, fallback?: number): number` (ausente → `fallback`, padrão 1), `validateItems(items: unknown, label?: string): void`, constantes `MAX_PRICE`, `MAX_QUANTITY`.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `src/backend/validation.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrice, parseQuantity, validateItems, ValidationError, MAX_PRICE, MAX_QUANTITY } from './validation.ts';

test('preço: ausente vira 0; número e texto numérico passam', () => {
  assert.equal(parsePrice(undefined), 0);
  assert.equal(parsePrice(''), 0);
  assert.equal(parsePrice(null), 0);
  assert.equal(parsePrice(12.5), 12.5);
  assert.equal(parsePrice('7.3'), 7.3);
  assert.equal(parsePrice(0), 0);
});

test('preço: negativo, NaN, Infinity, texto e acima do limite dão ValidationError 400', () => {
  for (const bad of [-1, NaN, Infinity, 'abc', true, {}, MAX_PRICE + 1]) {
    assert.throws(() => parsePrice(bad), (e: any) => e instanceof ValidationError && e.status === 400, String(bad));
  }
});

test('quantidade: ausente usa o padrão; zero, negativo e acima do limite falham', () => {
  assert.equal(parseQuantity(undefined), 1);
  assert.equal(parseQuantity(undefined, 'Quantidade', 5), 5);
  assert.equal(parseQuantity(0.5), 0.5);
  for (const bad of [0, -2, NaN, Infinity, 'x', MAX_QUANTITY + 1]) {
    assert.throws(() => parseQuantity(bad), ValidationError, String(bad));
  }
});

test('mensagem cita o campo e está em português', () => {
  assert.throws(() => parsePrice(-3, 'Preço de Arroz'), /Preço de Arroz/);
});

test('validateItems confere price e quantity só quando preenchidos e cita o item', () => {
  assert.doesNotThrow(() => validateItems([{ name: 'a', price: 2, quantity: 3 }, { name: 'b' }]));
  assert.throws(() => validateItems([{ name: 'Arroz', price: -1, quantity: 1 }]), /Arroz/);
  assert.throws(() => validateItems([{ name: 'Feijão', price: 1, quantity: 0 }]), /Feijão/);
  assert.throws(() => validateItems('não é lista' as any), ValidationError);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx tsx --test src/backend/validation.test.ts`
Expected: FAIL (módulo `./validation.ts` não existe).

- [ ] **Passo 3: Implementar**

Criar `src/backend/validation.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export const MAX_PRICE = 1_000_000;
export const MAX_QUANTITY = 100_000;

/** Erro de dado inválido: o tratador de erros devolve 400 com esta mensagem. */
export class ValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const isAbsent = (v: unknown) => v === undefined || v === null || (typeof v === 'string' && v.trim() === '');

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return NaN;
}

/** Preço/valor em reais: ausente vale 0; preenchido precisa ser número finito, 0 ≤ p ≤ MAX_PRICE. */
export function parsePrice(value: unknown, label = 'Preço'): number {
  if (isAbsent(value)) return 0;
  const n = toNumber(value);
  if (!Number.isFinite(n) || n < 0) {
    throw new ValidationError(`${label} inválido: informe um número maior ou igual a zero.`);
  }
  if (n > MAX_PRICE) {
    throw new ValidationError(`${label} acima do limite permitido (R$ ${MAX_PRICE.toLocaleString('pt-BR')}).`);
  }
  return n;
}

/** Quantidade: ausente vale `fallback`; preenchida precisa ser número finito, 0 < q ≤ MAX_QUANTITY. */
export function parseQuantity(value: unknown, label = 'Quantidade', fallback = 1): number {
  if (isAbsent(value)) return fallback;
  const n = toNumber(value);
  if (!Number.isFinite(n) || n <= 0) {
    throw new ValidationError(`${label} inválida: informe um número maior que zero.`);
  }
  if (n > MAX_QUANTITY) {
    throw new ValidationError(`${label} acima do limite permitido (${MAX_QUANTITY.toLocaleString('pt-BR')}).`);
  }
  return n;
}

/** Confere price/quantity de cada item (só o que veio preenchido). Falha na primeira inconsistência. */
export function validateItems(items: unknown, label = 'Item'): void {
  if (!Array.isArray(items)) throw new ValidationError(`${label}s inválidos: esperada uma lista.`);
  items.forEach((it: any, i: number) => {
    if (!it || typeof it !== 'object') throw new ValidationError(`${label} ${i + 1} inválido.`);
    const nome = String(it.name || it.productName || `${label} ${i + 1}`);
    parsePrice(it.price, `Preço de ${nome}`);
    parseQuantity(it.quantity, `Quantidade de ${nome}`);
  });
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx tsx --test src/backend/validation.test.ts`
Expected: PASS.

- [ ] **Passo 5: Aplicar nas rotas (`src/backend/app.ts`)**

Adicionar o import junto dos outros imports de `./` : `import { ValidationError, parsePrice, parseQuantity, validateItems } from './validation.js';` (`ValidationError` só se usado; se não for, remover do import para o `tsc` não reclamar).

Aplicar estas edições:

1. `shopping_lists/update-items`: logo depois do `if (!listId || !Array.isArray(items)) {...}` acrescentar `validateItems(items);` e trocar `if (typeof total === 'number') updates.total = total;` por `if (typeof total === 'number') updates.total = parsePrice(total, 'Total');`.
2. `POST /api/xml/shopping_lists` (criar lista): depois de `const { id, ...listData } = req.body;` acrescentar `if (Array.isArray(listData.items)) validateItems(listData.items);`.
3. `POST /api/xml/purchase_orders`: depois do `if (!Array.isArray(items) || items.length === 0) {...}` acrescentar `validateItems(items);` e `parsePrice(shippingFee, 'Frete');`; no ramo legado trocar `total: Number(total) || 0,` por `total: parsePrice(total, 'Total'),` e `shippingFee: Number(shippingFee) || 0,` por `shippingFee: parsePrice(shippingFee, 'Frete'),`.
4. `POST /api/xml/setor-limits`: trocar `monthlyLimit: Number(monthlyLimit) || 0,` por `monthlyLimit: parsePrice(monthlyLimit, 'Limite mensal'),`.
5. `POST /api/xml/suppliers/import`: depois do `if (!Array.isArray(suppliers) ...)` acrescentar `for (const s of suppliers) { if (s && Array.isArray(s.products)) validateItems(s.products, 'Produto'); }`.
6. `POST /api/xml/pending-list-products/confirm`: **antes** do `for (const it of items)` acrescentar `for (const it of items) { if (it) { parsePrice(it.price, 'Preço'); parseQuantity(it.quantity, 'Quantidade'); } }` (valida tudo antes de gravar qualquer coisa), e dentro do laço trocar `const itemPrice = Number(it.price || 0);` por `const itemPrice = parsePrice(it.price, 'Preço');` e `const itemQty = Number(it.quantity || 1);` por `const itemQty = parseQuantity(it.quantity, 'Quantidade');`. (A Tarefa 2 reescreve este laço; aqui basta a validação.)

- [ ] **Passo 6: Teste de rota (só respostas 400, antes de gravar)**

Acrescentar em `src/backend/data/routes.reminders.test.ts`, no fim:

```ts
test('valores inválidos são recusados com 400 antes de gravar', async () => {
  const post = (path: string, body: unknown) => fetch(`${base}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const confirmRes = await post('/api/xml/pending-list-products/confirm', { items: [{ id: 'x', productName: 'Arroz', price: -5, quantity: 1 }] });
  assert.equal(confirmRes.status, 400);
  assert.match((await confirmRes.json()).message, /Preço/);
  assert.equal((await post('/api/xml/shopping_lists/update-items', { listId: 'nao-existe', items: [{ name: 'a', price: 1, quantity: 0 }] })).status, 400);
  assert.equal((await post('/api/xml/setor-limits', { setor: 'Cozinha', monthlyLimit: -10 })).status, 400);
  assert.equal((await post('/api/xml/purchase_orders', { items: [{ name: 'a', price: 1, quantity: 1e9 }] })).status, 400);
});
```

- [ ] **Passo 7: Rodar**

Run: `npx tsc --noEmit` (limpo) e `timeout 120 npx tsx --test --test-name-pattern "valores inválidos" src/backend/data/routes.reminders.test.ts`
Expected: PASS. Se o processo não encerrar sozinho, é o comportamento já conhecido deste arquivo; o `timeout` encerra e o resultado do teste já foi impresso.

- [ ] **Passo 8: Commit (somente se o dono pedir)**

```bash
git add src/backend/validation.ts src/backend/validation.test.ts src/backend/app.ts src/backend/data/routes.reminders.test.ts
git commit -m "feat(api): valida preço e quantidade (Fase 2.2)"
```

---

### Tarefa 2: Confirmação idempotente

**Arquivos:** criar `src/backend/services/confirmedSpending.ts`, `src/backend/services/confirmedSpending.test.ts`; modificar `src/backend/app.ts` (`pending-list-products/confirm`), `src/frontend/hooks/usePendingListProductsPanel.ts`.

**Interfaces:**
- Consome: `ValidationError`, `parsePrice`, `parseQuantity` (Tarefa 1).
- Produz: `confirmedSpendingId(it: { id?: unknown; confirmId?: unknown }): string` (estável; lança `ValidationError` se não houver identificador) e `buildConfirmedSpending(it: Record<string, any>, now: Date): Record<string, any>` (payload completo, com `id`).

- [ ] **Passo 1: Escrever o teste que falha**

Criar `src/backend/services/confirmedSpending.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmedSpendingId, buildConfirmedSpending } from './confirmedSpending.ts';
import { ValidationError } from '../validation.ts';

test('o ID é estável: o mesmo item sempre gera o mesmo ID', () => {
  assert.equal(confirmedSpendingId({ id: 'p1' }), confirmedSpendingId({ id: 'p1' }));
  assert.equal(confirmedSpendingId({ id: 'p1' }), 'conf_list_p1');
});

test('sem id usa confirmId; sem nenhum dos dois lança ValidationError', () => {
  assert.equal(confirmedSpendingId({ confirmId: 'abc-123' }), 'conf_list_abc-123');
  assert.throws(() => confirmedSpendingId({}), ValidationError);
  assert.throws(() => confirmedSpendingId({ id: '  ' }), ValidationError);
});

test('caracteres estranhos no ID são trocados por _', () => {
  assert.equal(confirmedSpendingId({ id: 'a/b c' }), 'conf_list_a_b_c');
});

test('payload usa o ID estável e calcula o total', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  const a = buildConfirmedSpending({ id: 'p1', productName: 'Arroz', price: 4, quantity: 3, supplierName: 'X' }, now);
  const b = buildConfirmedSpending({ id: 'p1', productName: 'Arroz', price: 4, quantity: 3, supplierName: 'X' }, new Date('2026-10-22T00:00:00.000Z'));
  assert.equal(a.id, 'conf_list_p1');
  assert.equal(a.id, b.id);
  assert.equal(a.total, 12);
  assert.equal(a.vNF, 12);
  assert.equal(a.source, 'shopping_list');
  assert.equal(a.products[0].quantity, 3);
  assert.equal(a.date, now.toISOString());
});

test('valor inválido lança ValidationError', () => {
  assert.throws(() => buildConfirmedSpending({ id: 'p1', price: -1 }, new Date()), ValidationError);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx tsx --test src/backend/services/confirmedSpending.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Passo 3: Implementar**

Criar `src/backend/services/confirmedSpending.ts` com o mesmo formato de campos que a rota usa hoje:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ValidationError, parsePrice, parseQuantity } from '../validation.js';

/** ID do gasto confirmado, derivado do item pendente: confirmar de novo regrava o mesmo registro. */
export function confirmedSpendingId(it: { id?: unknown; confirmId?: unknown }): string {
  const key = String(it?.id ?? it?.confirmId ?? '').trim();
  if (!key) throw new ValidationError('Item sem identificador: recarregue a tela e tente de novo.');
  return `conf_list_${key.replace(/[^A-Za-z0-9_-]/g, '_')}`;
}

/** Monta o gasto (mesmo registro vai para xml_spendings e invoices). */
export function buildConfirmedSpending(it: Record<string, any>, now: Date): Record<string, any> {
  const price = parsePrice(it.price, 'Preço');
  const quantity = parseQuantity(it.quantity, 'Quantidade');
  const total = price * quantity;
  const id = confirmedSpendingId(it);
  const dateStr = it.date || now.toISOString();
  const name = it.productName || 'Produto sem nome';
  const code = `LIST_${String(it.productName || 'PROD').toUpperCase()}`;

  return {
    id,
    dhEmi: dateStr,
    date: dateStr,
    createdAt: dateStr,
    supplierName: it.supplierName || 'Lista de Compras',
    vTotTrib: total,
    vNF: total,
    total,
    source: 'shopping_list',
    hasNF: it.hasNF === true,
    listName: it.listName || 'Minhas Listas',
    products: [{
      code,
      cProd: code,
      name,
      xProd: name,
      vUnCom: price,
      price,
      quantity,
      vProd: total,
      category: it.category || 'Outros',
      categoryId: it.category || 'Outros',
      setor: it.setor || ''
    }]
  };
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx tsx --test src/backend/services/confirmedSpending.test.ts`
Expected: PASS.

- [ ] **Passo 5: Usar na rota**

Em `src/backend/app.ts`, importar `import { buildConfirmedSpending } from './services/confirmedSpending.js';` e substituir o corpo da rota `pending-list-products/confirm` (a partir de `const now = new Date();` até o fim do laço) por:

```ts
  const now = new Date();
  const valid = items.filter((it: any) => it);
  // Monta tudo antes de gravar: um item inválido recusa o pedido inteiro, sem gravação parcial.
  const payloads = valid.map((it: any) => ({ it, spending: buildConfirmedSpending(it, now) }));

  for (const { it, spending } of payloads) {
    // O ID é derivado do item: repetir a confirmação regrava os mesmos registros (nada duplica).
    await repo.set(repo.doc('xml_spendings', spending.id), spending, 'xml_spendings/' + spending.id);
    // Também em invoices, para as buscas por período enxergarem o gasto.
    await repo.set(repo.doc('invoices', spending.id), spending, 'invoices/' + spending.id);
    if (it.id) {
      await repo.delete(repo.doc('pending_list_products', it.id), 'pending_list_products/' + it.id);
    }
  }
  const confirmedCount = payloads.length;
```

Remover as linhas antigas do laço (`let confirmedCount = 0;`, o `for` antigo inteiro, `confirmedCount++`) e **também** o bloco de validação adicionado na Tarefa 1, passo 5, item 6 (agora redundante: `buildConfirmedSpending` valida e roda antes de qualquer gravação). Manter as três linhas `repo.invalidateCache(...)` e o `res.json({ status: "success", confirmedCount })`.

- [ ] **Passo 6: Front — identificador e botão**

Em `src/frontend/hooks/usePendingListProductsPanel.ts`:
1. Conferir o import de `react` no topo (`grep -n "from 'react'" src/frontend/hooks/usePendingListProductsPanel.ts`) e acrescentar `useRef` se faltar.
2. Dentro do hook, junto dos outros `useState`, acrescentar `const confirmingRef = useRef(false);`.
3. Em `handleConfirmPendingProducts`, logo no início:

```ts
    if (confirmingRef.current) return; // clique duplo: o segundo clique é ignorado
```
   e depois do `if (itemsToConfirm.length === 0) return;` acrescentar `confirmingRef.current = true;`. No `finally` já existente (onde há `setIsUploading(false)`), acrescentar `confirmingRef.current = false;`.
4. No corpo enviado, trocar `JSON.stringify({ items: itemsToConfirm })` por:

```ts
JSON.stringify({ items: itemsToConfirm.map(p => ({ ...p, confirmId: p.id || crypto.randomUUID() })) })
```
5. Se existir o botão de confirmar nesta tela sem `disabled={isUploading}`, acrescentar o `disabled` (`grep -rn "handleConfirmPendingProducts" src/frontend/components`).

- [ ] **Passo 7: Rodar**

Run: `npx tsc --noEmit` e `npx tsx --test src/backend/services/*.test.ts`
Expected: limpo / PASS.

- [ ] **Passo 8: Commit (somente se o dono pedir)**

```bash
git add src/backend/services/confirmedSpending.ts src/backend/services/confirmedSpending.test.ts src/backend/app.ts src/frontend/hooks/usePendingListProductsPanel.ts
git commit -m "fix: confirmação de itens da lista é idempotente (Fase 2.1)"
```

---

### Tarefa 3: Erros sem detalhe técnico em produção

**Arquivos:** criar `src/backend/errors.ts`, `src/backend/errors.test.ts`; modificar `src/backend/app.ts` (tratador de erros e os `res.status(500)` espalhados).

**Interfaces:**
- Produz: `isProductionEnv(env?: NodeJS.ProcessEnv): boolean`, `describeError(err: any, opts: { production: boolean; ref?: string }): { status: number; body: { error: string; message: string; ref?: string } }`, `internalErrorMessage(err: any, label?: string): string`.

- [ ] **Passo 1: Escrever o teste que falha**

Criar `src/backend/errors.test.ts`:

```ts
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
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx tsx --test src/backend/errors.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Passo 3: Implementar**

Criar `src/backend/errors.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { randomUUID } from 'node:crypto';

export interface PublicError {
  status: number;
  body: { error: string; message: string; ref?: string };
}

export const isProductionEnv = (env: NodeJS.ProcessEnv = process.env): boolean =>
  env.NODE_ENV === 'production' || !!env.VERCEL;

const newRef = () => randomUUID().replace(/-/g, '').slice(0, 8);

/** O que o cliente vê. Em produção, erro 5xx não mostra o texto técnico: só um código de referência. */
export function describeError(err: any, opts: { production: boolean; ref?: string }): PublicError {
  const raw = Number(err?.status);
  const status = Number.isInteger(raw) && raw >= 400 && raw <= 599 ? raw : 500;
  const original = String(err?.message || 'Ocorreu um erro inesperado.');

  if (status < 500) {
    return { status, body: { error: err?.name || 'Erro', message: original } };
  }
  if (!opts.production) {
    return { status, body: { error: err?.name || 'Erro no servidor', message: original } };
  }
  const ref = opts.ref || newRef();
  return {
    status,
    body: {
      error: 'Erro no servidor',
      message: `Algo deu errado do nosso lado. Se continuar, informe o código ${ref}.`,
      ref,
    },
  };
}

/** Para rotas que respondem o 500 na mão: registra o detalhe no log e devolve o texto seguro. */
export function internalErrorMessage(err: any, label = 'Erro'): string {
  const production = isProductionEnv();
  const ref = newRef();
  console.error(`[${label}] ref=${ref}`, err?.stack || err?.message || err);
  return production ? `Algo deu errado do nosso lado. Se continuar, informe o código ${ref}.` : String(err?.message || err);
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx tsx --test src/backend/errors.test.ts`
Expected: PASS.

- [ ] **Passo 5: Tratador global**

Em `src/backend/app.ts`, importar `import { describeError, isProductionEnv, internalErrorMessage } from './errors.js';` e substituir o final do tratador de erros (depois do bloco de timeout) — as linhas `res.status(err.status || 500).json({ error: err.name || 'Erro no servidor', message: err.message || ... });` — por:

```ts
  const described = describeError(err, { production: isProductionEnv() });
  if (described.body.ref) console.error(`[ErrorHandler] ref=${described.body.ref}`, err?.stack || err);
  res.status(described.status).json(described.body);
```

- [ ] **Passo 6: Rotas que respondem 500 na mão**

Rodar este script (preserva CRLF) para trocar `message: error.message` / `message: err.message` nas linhas que contêm `res.status(500)`:

```bash
cat > "$TMP/errfix.js" <<'EOF'
const fs = require('fs');
const F = 'C:/vscode/labarr-gestor/src/backend/app.ts';
let s = fs.readFileSync(F, 'utf8');
const nl = s.includes('\r\n') ? '\r\n' : '\n';
let n = 0;
s = s.split(/\r?\n/).map(line => {
  if (!line.includes('res.status(500)')) return line;
  const out = line.replace(/message:\s*(error|err)\.message/, (_m, v) => { n++; return `message: internalErrorMessage(${v})`; });
  return out;
}).join(nl);
fs.writeFileSync(F, s);
console.log('trocadas', n);
EOF
TMP="${TMP:-/tmp}" node "$TMP/errfix.js"
```

Depois conferir o que sobrou: `grep -n "res.status(500)" src/backend/app.ts`. As linhas `res.status(500).json({ error: error?.message || String(error) })` e `res.status(500).json({ error: error.message })` (rotas `/debug-db` e `/excel-sync`) e o bloco multilinha de `/api/xml/invoices` (≈ linha 702) devem ser editadas **à mão**: trocar o texto técnico por `internalErrorMessage(error)` mantendo o nome do campo (`error:` ou `message:`) que a tela já lê.

- [ ] **Passo 7: Rodar**

Run: `npx tsc --noEmit` e `npx tsx --test src/backend/errors.test.ts src/backend/auth/*.test.ts`
Expected: limpo / PASS.

- [ ] **Passo 8: Commit (somente se o dono pedir)**

```bash
git add src/backend/errors.ts src/backend/errors.test.ts src/backend/app.ts
git commit -m "fix(api): erros 5xx em produção sem detalhe técnico, com código de referência (Fase 2.6)"
```

---

### Tarefa 4: Nota duplicada

**Arquivos:** criar `src/backend/services/invoiceDuplicates.ts`, `src/backend/services/invoiceDuplicates.test.ts`; modificar `src/backend/app.ts` (`/xml/process`, `/xml/process-batch`, nova rota de duplicatas), `src/shared/permissions.ts`, `src/backend/auth/accessGuard.test.ts`, `src/frontend/components/DashboardView.tsx` e demais chamadores.

**Interfaces:**
- Produz: `findDuplicateInvoices(invoices: Array<Record<string, any>>): DuplicateGroup[]` com `DuplicateGroup { reason: 'mesma_chave' | 'mesmo_conteudo'; key: string; ids: string[] }`; resposta nova `status: 'duplicate'` nas rotas de importação; rota `GET /api/xml/invoices/duplicates` (somente admin, somente leitura).

- [ ] **Passo 1: Escrever o teste que falha**

Criar `src/backend/services/invoiceDuplicates.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findDuplicateInvoices } from './invoiceDuplicates.ts';

const nota = (id: string, extra: Record<string, any> = {}) => ({
  id, supplierName: 'ACME', date: '2026-10-01T10:00:00Z', vTotTrib: 100, products: [{}, {}], ...extra,
});

test('mesma chave com e sem o prefixo NFe é duplicata', () => {
  const r = findDuplicateInvoices([nota('NFe123'), nota('123')]);
  assert.equal(r.length, 1);
  assert.equal(r[0].reason, 'mesma_chave');
  assert.deepEqual([...r[0].ids].sort(), ['123', 'NFe123']);
});

test('IDs diferentes com mesmo fornecedor, dia, total e nº de itens são "mesmo conteúdo"', () => {
  const r = findDuplicateInvoices([nota('A'), nota('B')]);
  assert.equal(r.length, 1);
  assert.equal(r[0].reason, 'mesmo_conteudo');
});

test('notas diferentes não são agrupadas', () => {
  assert.equal(findDuplicateInvoices([nota('A'), nota('B', { vTotTrib: 101 })]).length, 0);
});

test('lançamentos provisórios de lista (source shopping_list) são ignorados', () => {
  assert.equal(findDuplicateInvoices([nota('conf_list_1', { source: 'shopping_list' }), nota('conf_list_2', { source: 'shopping_list' })]).length, 0);
});
```

- [ ] **Passo 2: Rodar e ver falhar**

Run: `npx tsx --test src/backend/services/invoiceDuplicates.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Passo 3: Implementar**

Criar `src/backend/services/invoiceDuplicates.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface DuplicateGroup {
  reason: 'mesma_chave' | 'mesmo_conteudo';
  key: string;
  ids: string[];
}

const normalizeId = (id: string) => String(id).replace(/^NFe/, '');

/**
 * Procura notas repetidas, só leitura. "mesma_chave": o mesmo ID com e sem o prefixo NFe.
 * "mesmo_conteudo": IDs diferentes com mesmo fornecedor, dia, total e quantidade de itens.
 * Lançamentos provisórios de lista de compras ficam de fora.
 */
export function findDuplicateInvoices(invoices: Array<Record<string, any>>): DuplicateGroup[] {
  const real = invoices.filter(inv => inv && inv.id && inv.source !== 'shopping_list');
  const groups: DuplicateGroup[] = [];

  const byKey = new Map<string, string[]>();
  for (const inv of real) {
    const k = normalizeId(inv.id);
    byKey.set(k, [...(byKey.get(k) || []), String(inv.id)]);
  }
  const inKeyGroup = new Set<string>();
  for (const [key, ids] of byKey) {
    if (ids.length > 1) {
      groups.push({ reason: 'mesma_chave', key, ids });
      ids.forEach(i => inKeyGroup.add(i));
    }
  }

  const byContent = new Map<string, string[]>();
  for (const inv of real) {
    if (inKeyGroup.has(String(inv.id))) continue;
    const day = String(inv.date || inv.dhEmi || '').slice(0, 10);
    const total = Number(inv.vTotTrib ?? inv.total ?? 0).toFixed(2);
    const count = Array.isArray(inv.products) ? inv.products.length : 0;
    if (!day) continue;
    const k = `${String(inv.supplierName || '').trim().toLowerCase()}|${day}|${total}|${count}`;
    byContent.set(k, [...(byContent.get(k) || []), String(inv.id)]);
  }
  for (const [key, ids] of byContent) {
    if (ids.length > 1) groups.push({ reason: 'mesmo_conteudo', key, ids });
  }
  return groups;
}
```

- [ ] **Passo 4: Rodar e ver passar**

Run: `npx tsx --test src/backend/services/invoiceDuplicates.test.ts`
Expected: PASS.

- [ ] **Passo 5: Rota de duplicatas (admin, só leitura)**

1. `src/shared/permissions.ts`: trocar `export const ADMIN_ONLY_GET = ['/debug-db'];` por `export const ADMIN_ONLY_GET = ['/debug-db', '/xml/invoices/duplicates'];`.
2. `src/backend/auth/accessGuard.test.ts`: logo depois do teste `'debug-db só para admin'` acrescentar:

```ts
test('relatório de notas duplicadas só para admin', () => {
  assert.equal(run('GET', '/xml/invoices/duplicates', google('a@x.com'), approved()).ok, false);
  assert.equal(run('GET', '/xml/invoices/duplicates', google('a@x.com'), approved([], 'admin')).ok, true);
});
```
3. `src/backend/app.ts`: importar `findDuplicateInvoices` de `./services/invoiceDuplicates.js` e, **antes** da rota `app.get("/api/xml/invoices", ...)`, acrescentar:

```ts
// Relatório de notas repetidas: só leitura. Nada é apagado por aqui; quem decide é o dono.
app.get("/api/xml/invoices/duplicates", asyncHandler(async (req: Request, res: Response) => {
  const snapshot = await repo.getDocs('invoices', 'invoices', true);
  const invoices = snapshot.docs.map((doc: any) => {
    const d = typeof doc.data === 'function' ? doc.data() : doc.data;
    return { id: doc.id, ...d };
  });
  const groups = findDuplicateInvoices(invoices);
  res.json({ total: invoices.length, groups });
}));
```

- [ ] **Passo 6: Importação para de sobrescrever**

Em `src/backend/app.ts`:

**`/api/xml/process`:** depois do `const exists = ...` (≈ linha 334) inserir:

```ts
  if (exists) {
    // A nota já foi importada: não regrava (preserva ajustes) nem refaz alertas de preço.
    return res.json({ status: 'duplicate', id: parsedData.id });
  }
```
e mudar o `res.json` final para `res.json({ status: 'imported', id: parsedData.id });`. Como `exists` agora é sempre falso adiante, trocar `alreadyImported: exists,` (≈ linha 411) por `alreadyImported: false,`.

**`/api/xml/process-batch`:** depois do `const exists = ...` (≈ linha 486) inserir:

```ts
      if (exists) {
        results.push({
          id: parsedData.id,
          supplierName: parsedData.supplierName,
          dhEmi: parsedData.date,
          vTotTrib: parsedData.vTotTrib || 0,
          status: 'duplicate'
        });
        continue;
      }
```
(o `continue` fica dentro do `try` do laço `for`, o que é válido) e trocar o `status: exists ? 'updated' : 'imported'` final por `status: 'imported'` e `alreadyImported: exists,` por `alreadyImported: false,`.

- [ ] **Passo 7: Front trata `duplicate`**

1. `grep -rn "process-batch\|xml/process'" src/frontend` para achar todos os chamadores. Em cada um que lê `status`, tratar `'duplicate'` como "já existia" (aviso, não erro e não sucesso de importação).
2. `src/frontend/components/DashboardView.tsx` (≈ linha 638): trocar o par de expressões por:

```tsx
            type: r.status === 'imported' ? 'success' : 'warning',
            text: r.status === 'duplicate'
              ? `Nota de "${r.supplierName}" (R$ ${r.vTotTrib.toFixed(2)}) já existia e não foi importada de novo.`
              : `Sucesso: Nota de "${r.supplierName}" (R$ ${r.vTotTrib.toFixed(2)}) importada.`
```
(ajustar à estrutura exata do objeto naquela linha; manter os demais campos).

- [ ] **Passo 8: Rodar**

Run: `npx tsc --noEmit` e `npx tsx --test src/backend/services/invoiceDuplicates.test.ts src/backend/auth/accessGuard.test.ts`
Expected: limpo / PASS.

- [ ] **Passo 9: Commit (somente se o dono pedir)**

```bash
git add src/backend/services/invoiceDuplicates.ts src/backend/services/invoiceDuplicates.test.ts src/shared/permissions.ts src/backend/auth/accessGuard.test.ts src/backend/app.ts src/frontend
git commit -m "fix: reimportar a mesma nota não sobrescreve; relatório de duplicatas (Fase 2.4)"
```

---

### Tarefa 5: Gravações simultâneas nas listas de compras

**Arquivos:** criar `src/backend/data/version.ts`, `src/backend/data/version.test.ts`; modificar `src/backend/data/types.ts`, `supabaseRepo.ts`, `supabaseRepo.test.ts`, `firestoreRepo.ts`, `src/backend/app.ts`, `src/frontend/types.ts`, `src/frontend/hooks/useCart.ts`.

**Interfaces:**
- Produz: `versionOf(data: any): number` (campo `version` inteiro ≥ 0; ausente = 0); no `DataRepo`: `updateIfVersion(ref: DocRef | Promise<DocRef>, patch: DocData, expectedVersion: number, path?: string): Promise<'ok' | 'conflict' | 'not_found'>` — grava `patch` com `version = expectedVersion + 1` só se a versão atual for a esperada e (no Supabase) `updated_at` não mudou entre a leitura e a gravação.

- [ ] **Passo 1: Teste de `versionOf`**

Criar `src/backend/data/version.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { versionOf } from './version.ts';

test('versionOf: ausente, inválido e negativo valem 0; inteiro válido é mantido', () => {
  assert.equal(versionOf(undefined), 0);
  assert.equal(versionOf({}), 0);
  assert.equal(versionOf({ version: 'x' }), 0);
  assert.equal(versionOf({ version: -3 }), 0);
  assert.equal(versionOf({ version: 1.5 }), 0);
  assert.equal(versionOf({ version: 4 }), 4);
});
```
Run: `npx tsx --test src/backend/data/version.test.ts` → FAIL. Criar `src/backend/data/version.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/** Versão do documento (campo `version` no JSON). Documentos antigos, sem o campo, valem 0. */
export const versionOf = (data: any): number => {
  const n = Number(data?.version);
  return Number.isInteger(n) && n >= 0 ? n : 0;
};
```
Run de novo → PASS.

- [ ] **Passo 2: Interface do repositório**

Em `src/backend/data/types.ts`, depois da linha de `update(...)`, acrescentar:

```ts
  /**
   * Grava `patch` (mesclado ao documento) só se a versão atual for `expectedVersion`; a nova versão
   * é `expectedVersion + 1`. 'conflict' = outra pessoa gravou antes; 'not_found' = documento não existe.
   */
  updateIfVersion(ref: DocRef | Promise<DocRef>, patch: DocData, expectedVersion: number, path?: string): Promise<'ok' | 'conflict' | 'not_found'>;
```

- [ ] **Passo 3: Teste do Supabase (compare-and-swap)**

Em `src/backend/data/supabaseRepo.test.ts`, no `fakeClient`, trocar o tipo do `store` para `{ id: string; data: any; updated_at?: string }[]`, fazer `maybeSingle` devolver também `updated_at`, e acrescentar o método `update` ao objeto `q`:

```ts
      update(row: any) {
        const filters: Array<[string, string]> = [];
        const chain: any = {
          eq(c: string, v: string) { filters.push([c, v]); return chain; },
          select() {
            const rs = rows();
            const hit = rs.find(r => filters.every(([c, v]) => (c === 'id' ? r.id === v : (r as any)[c] === v)));
            if (!hit) return Promise.resolve({ data: [], error: null });
            hit.data = row.data; hit.updated_at = row.updated_at;
            return Promise.resolve({ data: [{ id: hit.id }], error: null });
          }
        };
        return chain;
      },
```
(no `maybeSingle` e no mapeamento de `then`, incluir `updated_at: r.updated_at` em `{ id: r.id, data: r.data }`). Acrescentar os testes:

```ts
test('updateIfVersion: versão certa grava e incrementa', async () => {
  const store: any = { shopping_lists: [{ id: 'l1', data: { items: [], version: 2 }, updated_at: 't1' }] };
  const repo = makeSupabaseRepo(fakeClient(store));
  const r = await repo.updateIfVersion(repo.doc('shopping_lists', 'l1'), { items: [1] }, 2, 'shopping_lists/l1');
  assert.equal(r, 'ok');
  assert.equal(store.shopping_lists[0].data.version, 3);
  assert.deepEqual(store.shopping_lists[0].data.items, [1]);
});

test('updateIfVersion: versão velha dá conflict e não grava', async () => {
  const store: any = { shopping_lists: [{ id: 'l1', data: { items: [], version: 5 }, updated_at: 't1' }] };
  const repo = makeSupabaseRepo(fakeClient(store));
  assert.equal(await repo.updateIfVersion(repo.doc('shopping_lists', 'l1'), { items: [9] }, 4, 'shopping_lists/l1'), 'conflict');
  assert.deepEqual(store.shopping_lists[0].data.items, []);
});

test('updateIfVersion: documento sem version vale 0; inexistente dá not_found', async () => {
  const store: any = { shopping_lists: [{ id: 'l1', data: { items: [] }, updated_at: 't1' }] };
  const repo = makeSupabaseRepo(fakeClient(store));
  assert.equal(await repo.updateIfVersion(repo.doc('shopping_lists', 'l1'), { items: [1] }, 0, 'shopping_lists/l1'), 'ok');
  assert.equal(await repo.updateIfVersion(repo.doc('shopping_lists', 'nao'), { items: [1] }, 0, 'shopping_lists/nao'), 'not_found');
});
```
Run: `npx tsx --test src/backend/data/supabaseRepo.test.ts` → FAIL (método não existe).

- [ ] **Passo 4: Implementar no Supabase**

Em `src/backend/data/supabaseRepo.ts`, importar `import { versionOf } from './version.js';` e acrescentar, depois do `update`:

```ts
    async updateIfVersion(refPromise: DocRef | Promise<DocRef>, patch: any, expectedVersion: number, path: string = 'unknown') {
      const ref = await refPromise;
      const realPath = realPathOf(path);
      const { data: current, error: readErr } = await table(ref.__coll).select('data,updated_at').eq('id', ref.__id).maybeSingle();
      if (readErr) throw new Error(`[SupabaseRepo] updateIfVersion(read) falhou em ${realPath}: ${readErr.message ?? readErr}`);
      if (!current) return 'not_found' as const;
      if (versionOf(current.data) !== expectedVersion) return 'conflict' as const;
      const merged = { ...(current.data ?? {}), ...normalizeTimestamps(patch), version: expectedVersion + 1 };
      // Trava no banco: só grava se ninguém mexeu no registro desde a leitura (updated_at igual).
      const { data: written, error } = await table(ref.__coll)
        .update({ data: merged, updated_at: new Date().toISOString() })
        .eq('id', ref.__id)
        .eq('updated_at', current.updated_at)
        .select('id');
      if (error) throw new Error(`[SupabaseRepo] updateIfVersion falhou em ${realPath}: ${error.message ?? error}`);
      if (!written || written.length === 0) return 'conflict' as const;
      updateCacheWithDoc(realPath, merged);
      return 'ok' as const;
    },
```
Run: `npx tsx --test src/backend/data/supabaseRepo.test.ts` → PASS.

- [ ] **Passo 5: Implementar no Firestore (uso local, sem trava no banco)**

Em `src/backend/data/firestoreRepo.ts`, no objeto exportado, junto de `update`:

```ts
  async updateIfVersion(ref, patch, expectedVersion, path = 'unknown') {
    const snap = await this.getDoc(ref, path, true);
    const exists = typeof snap.exists === 'function' ? snap.exists() : !!snap.exists;
    if (!exists) return 'not_found' as const;
    if (versionOf(snap.data()) !== expectedVersion) return 'conflict' as const;
    await this.update(ref, { ...patch, version: expectedVersion + 1 }, path);
    return 'ok' as const;
  },
```
com `import { versionOf } from './version.js';`. Se o `tsc` apontar a forma do objeto (parâmetros sem tipo), tipar como nos métodos vizinhos. Este caminho só roda em desenvolvimento local; produção usa o Supabase.

- [ ] **Passo 6: Rota `update-items`**

Em `src/backend/app.ts`, importar `versionOf` de `./data/version.js` e substituir o corpo de `shopping_lists/update-items` por:

```ts
app.post("/api/xml/shopping_lists/update-items", asyncHandler(async (req: Request, res: Response) => {
  const { listId, items, total, date, baseVersion } = req.body;
  if (!listId || !Array.isArray(items)) {
    return res.status(400).json({ error: "listId e items são obrigatórios" });
  }
  validateItems(items);
  const updates: any = { items };
  if (typeof total === 'number') updates.total = parsePrice(total, 'Total');
  if (typeof date === 'string') updates.date = date;
  const ref = repo.doc('shopping_lists', listId);
  const path = 'shopping_lists/' + listId;

  if (baseVersion === undefined || baseVersion === null) {
    // Tela antiga (sem versão): grava como antes, mas sempre avança a versão.
    const current = await repo.getDoc(ref, path, true);
    const exists = typeof current.exists === 'function' ? current.exists() : !!current.exists;
    const version = (exists ? versionOf(current.data()) : 0) + 1;
    await repo.update(ref, { ...updates, version }, path);
    repo.invalidateCache('shopping_lists');
    return res.json({ status: "success", version });
  }

  const expected = Number(baseVersion);
  if (!Number.isInteger(expected) || expected < 0) {
    return res.status(400).json({ error: "baseVersion inválido" });
  }
  const outcome = await repo.updateIfVersion(ref, updates, expected, path);
  if (outcome === 'not_found') return res.status(404).json({ error: "not_found", message: "Lista não encontrada." });
  if (outcome === 'conflict') {
    return res.status(409).json({ error: "version_conflict", message: "Esta lista foi alterada por outra pessoa. Recarregue a tela e tente de novo." });
  }
  repo.invalidateCache('shopping_lists');
  res.json({ status: "success", version: expected + 1 });
}));
```

- [ ] **Passo 7: Front envia a versão e trata o 409**

1. `src/frontend/types.ts`: no tipo `SavedList` acrescentar `version?: number;`.
2. `src/frontend/hooks/useCart.ts`: confirmar o import de `react` (acrescentar `useRef` se faltar) e, dentro do hook, antes de `toggleSavedListItemBought`, acrescentar:

```ts
  // Salva os itens de uma lista com controle de versão. As gravações da mesma lista saem em fila
  // (uma depende da versão devolvida pela anterior), então cliques seguidos não geram conflito falso.
  const listQueues = useRef(new Map<string, Promise<unknown>>());
  const knownVersions = useRef(new Map<string, number>());

  const saveListItems = (list: SavedList, body: Record<string, unknown>): Promise<boolean> => {
    const previous = listQueues.current.get(list.id) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(async () => {
      const baseVersion = Math.max(knownVersions.current.get(list.id) ?? 0, list.version ?? 0);
      const res = await fetch('/api/xml/shopping_lists/update-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ listId: list.id, baseVersion, ...body })
      });
      if (res.status === 409) {
        knownVersions.current.delete(list.id);
        addAppNotification('Lista alterada', 'Esta lista foi alterada por outra pessoa. Atualizei a tela; refaça a alteração.');
        await refreshLists();
        return false;
      }
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (typeof data.version === 'number') {
          knownVersions.current.set(list.id, data.version);
          setSavedLists(prev => prev.map(l => l.id === list.id ? { ...l, version: data.version } : l));
        }
      }
      return res.ok;
    });
    listQueues.current.set(list.id, run);
    return run;
  };
```
3. Trocar as três chamadas diretas a `/api/xml/shopping_lists/update-items`:
   - `toggleSavedListItemBought`: o `await fetch(...)` vira `await saveListItems(list, { items: updatedItems.map(item => cleanObject(item)) });`
   - `addItemToList`: vira `await saveListItems(list, { items: updatedItems, total: newTotal, date: newDate });`
   - `updateProductPriceInLists` (dentro do `for ... of listsToSync`): vira `await saveListItems(list, { items: list.items, total: list.total });`
   Manter os `try/catch`, `invalidateBackendCache` e notificações como estão.

- [ ] **Passo 8: Rodar**

Run: `npx tsc --noEmit` e `npx tsx --test src/backend/data/version.test.ts src/backend/data/supabaseRepo.test.ts src/backend/data/firestoreRepo.test.ts`
Expected: limpo / PASS. Se `repo.parity.test.ts` listar métodos obrigatórios do repositório, incluir `updateIfVersion` ali e rodá-lo também.

- [ ] **Passo 9: Commit (somente se o dono pedir)**

```bash
git add src/backend/data src/backend/app.ts src/frontend/types.ts src/frontend/hooks/useCart.ts
git commit -m "fix: listas de compras com controle de versão contra gravação simultânea (Fase 2.3)"
```

---

### Tarefa 6: Auditoria e ações em massa

**Arquivos:** criar `scripts/supabase/add-audit-log.sql`, `src/backend/audit.ts`, `src/backend/audit.test.ts`; modificar `src/backend/app.ts`, `src/frontend/hooks/useSuppliers.ts`, `src/frontend/components/dashboard/ResetListSpendingsButton.tsx`.

**Interfaces:**
- Produz: `interface AuditEntry { action: string; actor: { uid?: string; email?: string; name?: string }; target: string; before?: unknown; after?: unknown; meta?: Record<string, unknown> }`, `buildAuditRecord(entry: AuditEntry, now: Date, rand?: () => string): { id: string; data: Record<string, unknown> }`, `recordAudit(repo: DataRepo, entry: AuditEntry): Promise<void>` (nunca lança).

- [ ] **Passo 1: SQL da tabela (você roda no Supabase)**

Criar `scripts/supabase/add-audit-log.sql`:

```sql
-- Registro de auditoria: quem fez o quê e quando (ações destrutivas e mudanças de acesso).
create table if not exists public.audit_log (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.audit_log   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());

alter table public.audit_log enable row level security;
alter table test.audit_log   enable row level security;
grant all privileges on test.audit_log to service_role;

create index if not exists audit_log_updated_at_idx on public.audit_log (updated_at desc);
```

- [ ] **Passo 2: Teste que falha**

Criar `src/backend/audit.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAuditRecord, recordAudit } from './audit.ts';

const entry = {
  action: 'supplier.delete', actor: { uid: 'u1', email: 'a@x.com', name: 'Ana' },
  target: 'suppliers/s1', before: { name: 'ACME' }, meta: { count: 1 },
};

test('buildAuditRecord monta ID ordenável e guarda quem, quando, ação e alvo', () => {
  const now = new Date('2026-10-21T12:00:00.000Z');
  const r = buildAuditRecord(entry, now, () => 'r4nd');
  assert.equal(r.id, '2026-10-21T12:00:00.000Z_r4nd');
  assert.equal(r.data.action, 'supplier.delete');
  assert.equal(r.data.target, 'suppliers/s1');
  assert.equal(r.data.at, now.toISOString());
  assert.deepEqual(r.data.actor, entry.actor);
  assert.deepEqual(r.data.before, { name: 'ACME' });
});

test('recordAudit grava via repo.set na coleção audit_log', async () => {
  const calls: any[] = [];
  const repo: any = { doc: async (c: string, id: string) => ({ __coll: c, __id: id }), set: async (ref: any, data: any) => { calls.push({ ref, data }); } };
  await recordAudit(repo, entry);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].ref.__coll, 'audit_log');
  assert.equal(calls[0].data.action, 'supplier.delete');
});

test('recordAudit nunca lança, mesmo se a gravação falhar', async () => {
  const repo: any = { doc: async () => ({}), set: async () => { throw new Error('tabela não existe'); } };
  await assert.doesNotReject(() => recordAudit(repo, entry));
});
```
Run: `npx tsx --test src/backend/audit.test.ts` → FAIL.

- [ ] **Passo 3: Implementar**

Criar `src/backend/audit.ts`:

```ts
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { DataRepo } from './data/types.js';

export interface AuditEntry {
  action: string;
  actor: { uid?: string; email?: string; name?: string };
  target: string;
  before?: unknown;
  after?: unknown;
  meta?: Record<string, unknown>;
}

export function buildAuditRecord(entry: AuditEntry, now: Date, rand: () => string = () => Math.random().toString(36).slice(2, 8)) {
  const at = now.toISOString();
  return {
    id: `${at}_${rand()}`,
    data: {
      at,
      action: entry.action,
      actor: entry.actor,
      target: entry.target,
      before: entry.before ?? null,
      after: entry.after ?? null,
      meta: entry.meta ?? {},
    } as Record<string, unknown>,
  };
}

/** Registra a ação. Falha de auditoria vai para o log e nunca impede a ação em si. */
export async function recordAudit(repo: DataRepo, entry: AuditEntry): Promise<void> {
  try {
    const { id, data } = buildAuditRecord(entry, new Date());
    await repo.set(await repo.doc('audit_log', id), data, 'audit_log/' + id);
  } catch (err: any) {
    console.error('[Audit] não foi possível registrar:', entry.action, entry.target, err?.message || err);
  }
}
```
Run: `npx tsx --test src/backend/audit.test.ts` → PASS.

- [ ] **Passo 4: Ligar nas rotas (`src/backend/app.ts`)**

Importar `import { recordAudit } from './audit.js';` e criar, perto de `actorName`:

```ts
const auditActor = (res: Response) => ({
  uid: res.locals.identity?.uid,
  email: res.locals.identity?.email,
  name: res.locals.authUser?.name,
});
```
Registrar (sempre **depois** de a ação ter dado certo e **antes** do `res.json`), com estes pares ação/alvo:

| Rota | Ação | Alvo / dados |
|---|---|---|
| `deleteInvoiceHelper` (depois do `repo.delete`) | `invoice.delete` | `invoices/${finalId}`; `before`: `{ supplierName, vTotTrib, date, produtos: n }` lido de `docSnapshot.data()` |
| `suppliers/delete` | `supplier.delete` | `suppliers/${id}`; `before`: ler o nome com `repo.getDoc` antes de apagar |
| `suppliers/delete-all` | `supplier.delete_all` | `suppliers`; `meta: { count }` |
| `spendings/:id` (ramo `exists`) | `spending.delete` | `xml_spendings/${id}` |
| `list-spendings/reset` | `list_spendings.reset` | `invoices`; `meta: { start, end, removed }` |
| `products/delete` | `product.delete` | `products`; `meta: { code: targetCode, name }` |
| `products/delete-item` | `product.delete_item` | `invoices/${invKey}`; `meta: { productIndex, code, name }` |
| `auth/users/status` | `user.approve` ou `user.deny` | `authorized_users/${uid}`; `before: { status: target.status }`, `after: { status }` |
| `auth/users/delete` | `user.delete` | `authorized_users/${uid}`; `before: { email: target?.email, status: target?.status }` |
| `auth/users/permissions` | `user.permissions` | `authorized_users/${uid}`; `before: { permissions: target.permissions }`, `after: { permissions: granted }` |

Forma de cada chamada:

```ts
await recordAudit(repo, { action: 'supplier.delete_all', actor: auditActor(res), target: 'suppliers', meta: { count } });
```

- [ ] **Passo 5: Confirmação explícita nas ações em massa**

1. `suppliers/delete-all` (`app.ts`): antes de apagar, calcular quantos seriam apagados e exigir `confirmCount`:

```ts
  const snapshot = await repo.getDocs('suppliers', 'suppliers', true);
  const deletable = snapshot.docs.filter((docSnap: any) => {
    const d = typeof docSnap.data === 'function' ? docSnap.data() : docSnap.data;
    const name = String(d?.name || '').trim().toUpperCase();
    return name !== 'MERCADO' && name !== 'MATERIAIS';
  });
  if (Number(req.body?.confirmCount) !== deletable.length) {
    return res.status(409).json({
      error: "confirm_count_mismatch",
      expected: deletable.length,
      message: `Confirmação necessária: isto apagaria ${deletable.length} fornecedores. Recarregue a tela e confirme de novo.`
    });
  }
  let count = 0;
  for (const docSnap of deletable) {
    await repo.delete(repo.doc('suppliers', docSnap.id), 'suppliers/' + docSnap.id);
    count++;
  }
```
(substitui o laço atual; mantém `invalidateCache`, a auditoria e o `res.json({ status: "success", count })`).

2. `list-spendings/reset`: logo depois da validação do período acrescentar:

```ts
  if (req.body?.confirm !== true) {
    return res.status(400).json({ error: "confirm_required", message: "Confirmação necessária para resetar os gastos das listas." });
  }
```

3. Front `src/frontend/hooks/useSuppliers.ts` `deleteAllSuppliers`: antes do `setSuppliers`, guardar `const previous = suppliers;` e `const confirmCount = suppliers.filter(s => { const n = (s.name || '').trim().toUpperCase(); return n !== 'MERCADO' && n !== 'MATERIAIS'; }).length;`; trocar o `fetch` por:

```ts
      const res = await fetch('/api/xml/suppliers/delete-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmCount })
      });
      if (!res.ok) {
        setSuppliers(previous); // o servidor recusou: volta a lista como estava
        console.warn('Exclusão em lote recusada:', res.status);
        return;
      }
```
   (se `suppliers` não for o nome do estado na linha 237, usar o nome real do estado.)
4. Front `ResetListSpendingsButton.tsx`: trocar o corpo por `JSON.stringify({ start: start.toISOString(), end: end.toISOString(), confirm: true })`.

- [ ] **Passo 6: Rodar**

Run: `npx tsc --noEmit` e `npx tsx --test src/backend/audit.test.ts src/backend/auth/*.test.ts`
Expected: limpo / PASS.

- [ ] **Passo 7: Commit (somente se o dono pedir)**

```bash
git add scripts/supabase/add-audit-log.sql src/backend/audit.ts src/backend/audit.test.ts src/backend/app.ts src/frontend
git commit -m "feat: auditoria de ações destrutivas e confirmação em ações em massa (Fase 2.5)"
```

---

### Tarefa 7: Fechamento da fase

**Arquivos:** modificar `README.md`.

- [ ] **Passo 1: Documentar**

No `README.md`, acrescentar uma seção curta "Integridade e auditoria" dizendo: (a) rode `scripts/supabase/add-audit-log.sql` no SQL Editor do Supabase uma vez; (b) o relatório `GET /api/xml/invoices/duplicates` (admin) lista possíveis notas repetidas, sem apagar nada; (c) reimportar uma nota existente é ignorado com aviso; (d) a coleção `audit_log` guarda quem fez cada ação destrutiva.

- [ ] **Passo 2: Verificação completa**

Run, nesta ordem:
- `npx tsc --noEmit`
- `npx tsx --test src/shared/*.test.ts src/backend/auth/*.test.ts src/backend/*.test.ts src/backend/services/*.test.ts src/backend/data/supabaseRepo.test.ts src/backend/data/version.test.ts`
- `timeout 120 npx tsx --test --test-name-pattern "valores inválidos|guarda de acesso" src/backend/data/routes.reminders.test.ts`
- `npx vite build`

Expected: tudo limpo e passando. Anotar a contagem de testes.

- [ ] **Passo 3: Roteiro manual (depois do deploy, com você)**

1. No Supabase, rodar `add-audit-log.sql`.
2. Lista de compras: confirmar itens clicando duas vezes rápido no botão → deve aparecer um único gasto por item.
3. Importar o mesmo XML duas vezes → a segunda avisa "já existia" e não muda a nota nem gera novo alerta de preço.
4. Abrir `/api/xml/invoices/duplicates` logado como admin → conferir se há grupos; **nada é apagado automaticamente**, a decisão é sua.
5. Abrir a mesma lista de compras em duas abas, alterar em ambas → a segunda mostra "Lista alterada por outra pessoa".
6. Apagar um fornecedor de teste e conferir a linha em `audit_log` (Supabase → Table Editor).
7. Tentar um preço negativo numa lista → mensagem de erro clara.
8. Conferir que **Faltando NF** e **Gasto no Período** continuam com os mesmos números (regras em `2026-10-16-faltando-nf-design.md`).
9. Backup do Supabase: confirmar no painel (Database → Backups) se está ativo e de quanto em quanto tempo; anotar aqui o resultado.

- [ ] **Passo 4: Commit (somente se o dono pedir)**

```bash
git add README.md
git commit -m "docs: integridade e auditoria (Fase 2)"
```

---

## Auto-revisão

**Cobertura da spec:** 2.1 → Tarefa 2; 2.2 → Tarefa 1; 2.3 → Tarefa 5 (escopo reduzido, registrado nos Rulings); 2.4 → Tarefa 4 (incl. verificação somente leitura de duplicatas existentes); 2.5 → Tarefa 6 (backup do Supabase é item manual, Tarefa 7 passo 3.9); 2.6 → Tarefa 3; 2.7 → testes nas Tarefas 1–6 e roteiro manual na 7.

**Consistência de tipos:** `ValidationError`/`parsePrice`/`parseQuantity`/`validateItems` (T1) são os mesmos usados em T2 e T5; `versionOf` (T5) é o mesmo no Supabase, Firestore e na rota; `recordAudit(repo, entry)` e `auditActor(res)` (T6) têm uma única assinatura; `describeError`/`internalErrorMessage` (T3) idem.

**Pontos que dependem de conferir no código ao executar:** nome do estado de fornecedores em `useSuppliers.ts`; chamadores do front de `/xml/process*` (T4 passo 7); lista de métodos obrigatórios em `repo.parity.test.ts` (T5 passo 8).
