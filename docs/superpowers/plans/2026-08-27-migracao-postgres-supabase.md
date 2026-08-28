# Migração Firestore → Postgres (Supabase) — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar o Firestore pelo PostgreSQL do Supabase como armazenamento de dados, selecionável por variável de ambiente, sem mudança funcional e com rollback imediato.

**Architecture:** Introduzir a camada `src/backend/data/` com a interface `DataRepo` e duas implementações: `firestoreRepo` (o `fsOps` atual movido para trás da interface, comportamento idêntico) e `supabaseRepo` (novo, via `@supabase/supabase-js`). Um seletor lê `process.env.DATA_BACKEND`. O schema no Postgres é genérico: uma tabela por coleção com `id text`, `data jsonb`, `updated_at timestamptz`. Modo de Teste usa o schema Postgres `test`. Um script de backfill copia os dados uma vez, lendo direto do Firestore. O Firebase Auth permanece.

**Tech Stack:** TypeScript, Node 18+, Express, Vite/React, `@supabase/supabase-js`, `firebase`/`firebase-admin` (mantidos até a limpeza), `tsx` (runner de testes via `node:test`), Vercel (serverless + estático).

**Spec:** `docs/superpowers/specs/2026-08-27-migracao-postgres-supabase-design.md`

## Global Constraints

- **Sem mudança funcional:** nenhuma tela muda de comportamento. Formatos de resposta das rotas `/api/*` permanecem idênticos.
- **Rollback por env var:** `DATA_BACKEND=firestore` (padrão, ausente = firestore) reproduz o comportamento atual. `DATA_BACKEND=supabase` usa Postgres. Nenhum dado do Firestore é apagado antes da Task 10.
- **Firebase Auth intocado:** login Google + anônimo continua no Firebase. Só dados migram.
- **Formato de retorno do repo:** lista = `{ docs: Array<{ id: string; data(): object; exists(): boolean }>, empty: boolean }`; documento = `{ id: string; data(): object; exists(): boolean }`. `doc()` retorna `Promise<DocRef>` (assíncrono, como o `fsOps.doc` atual).
- **Coleções (16):** `invoices`, `xml_spendings`, `price_increases`, `suppliers`, `categories`, `setores`, `product_categories`, `product_setores`, `authorized_users`, `delivered_products`, `reminders`, `shopping_lists`, `purchase_orders`, `pending_list_products`, `setor_limits`, `push_subscriptions`. (Mais `reminders_pending` como *nome lógico de cache*, não tabela.)
- **Timestamps:** toda escrita pelo `supabaseRepo` e o backfill normalizam valores de data para string ISO 8601. O JSONB nunca guarda objeto `Timestamp` do Firestore.
- **Segredos:** `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` só no backend (env da Vercel + `.env` local, nunca no bundle do frontend, nunca commitados).
- **Commits frequentes:** um commit por tarefa concluída, mensagem `feat:` / `refactor:` / `chore:` conforme o caso, terminando com as linhas de co-autoria já usadas no repositório.

---

## Estrutura de arquivos

**Criar:**
- `src/backend/data/types.ts` — interface `DataRepo` e tipos (`DocSnapshot`, `QuerySnapshot`, `DocRef`).
- `src/backend/data/cache.ts` — cache em memória com TTL/versão, extraído do `fsOps` (sem disco, sem circuit breaker).
- `src/backend/data/firestoreRepo.ts` — implementação Firestore (o corpo do `fsOps` atual).
- `src/backend/data/supabaseRepo.ts` — implementação Supabase.
- `src/backend/data/index.ts` — seletor: exporta `repo: DataRepo` conforme `DATA_BACKEND`.
- `src/backend/data/repo.parity.test.ts` — testes de paridade de formato entre as duas implementações.
- `src/backend/data/supabaseRepo.test.ts` — testes unitários do mapeamento com cliente Supabase falso.
- `scripts/supabase/schema.sql` — DDL das tabelas nos schemas `public` e `test`.
- `scripts/supabase/migrate.ts` — backfill único Firestore → Supabase.
- `docs/superpowers/CUTOVER-postgres.md` — checklist manual de virada (preview e produção).

**Modificar:**
- `src/backend/firebase.ts` — passa a expor só `initFirebase`/`getDb`; o `fsOps` sai daqui.
- `src/backend/app.ts` — importa `repo` de `./data`; `fsOps.` → `repo.`; novas rotas de `reminders` e `/api/auth/users`.
- `src/backend/reminderWorker.ts` — usa `repo.getPendingReminders(nowIso)`.
- `src/backend/services/pushService.ts` — importa `repo` de `../data`.
- `src/frontend/firebase.ts` — (Task 9) remove init do Firestore, mantém Auth.
- `src/frontend/hooks/useReminders.ts`, `useAuth.ts`, `useSuppliers.ts`, `useCart.ts`, `useDeliveredProducts.ts`, `src/frontend/App.tsx` — removem acesso direto ao Firestore.
- `package.json` — dependência `@supabase/supabase-js`; script `test`.
- `vercel.json` — (Task 10) remove `includeFiles` dos `firestore_cache_*.json`.

---

## Task 1: Camada `data/` com `firestoreRepo` (sem mudança de comportamento)

**Files:**
- Create: `src/backend/data/types.ts`
- Create: `src/backend/data/cache.ts`
- Create: `src/backend/data/firestoreRepo.ts`
- Create: `src/backend/data/index.ts`
- Modify: `src/backend/firebase.ts` (remover `fsOps`, manter init)
- Modify: `package.json` (script `test`)
- Test: `src/backend/data/firestoreRepo.test.ts`

**Interfaces:**
- Consumes: `getDb`, `initFirebase` de `src/backend/firebase.ts`; `getCollectionPrefix`, `isTestModeActive` de `src/backend/context.ts`; `IS_VERCEL` de `src/backend/config.ts`.
- Produces:
  - `DataRepo` (em `types.ts`):
    ```ts
    export interface DocData { [k: string]: any }
    export interface DocSnapshot { id: string; data(): DocData; exists(): boolean }
    export interface QuerySnapshot { docs: DocSnapshot[]; empty: boolean }
    export interface DocRef { __coll: string; __id: string; __local?: boolean }
    export interface DataRepo {
      collection(coll: string): Promise<any>;
      getDocs(coll: string, path?: string, forceNoCache?: boolean): Promise<QuerySnapshot>;
      getDocsWithLimit(coll: string, limitCount: number, forceNoCache?: boolean): Promise<QuerySnapshot>;
      getDoc(ref: DocRef | Promise<DocRef>, path?: string, forceNoCache?: boolean): Promise<DocSnapshot>;
      doc(coll: string, id: string): Promise<DocRef>;
      set(ref: DocRef | Promise<DocRef>, data: DocData, path?: string): Promise<void>;
      update(ref: DocRef | Promise<DocRef>, data: DocData, path?: string): Promise<void>;
      delete(ref: DocRef | Promise<DocRef>, path?: string): Promise<void>;
      invalidateCache(path: string): void;
      getCollectionVersion(path: string): number;
      getPendingReminders(nowIso: string): Promise<QuerySnapshot>;
    }
    ```
  - `repo: DataRepo` exportado de `src/backend/data/index.ts`.
  - `firestoreRepo: DataRepo` exportado de `src/backend/data/firestoreRepo.ts`.

- [ ] **Step 1: Adicionar runner de testes ao `package.json`**

Em `scripts`, adicionar:
```json
"test": "tsx --test \"src/backend/**/*.test.ts\""
```
(Node 18 tem `node:test`; `tsx --test` compila TS on-the-fly. Nenhuma dependência nova.)

- [ ] **Step 2: Escrever `src/backend/data/types.ts`**

Colar exatamente o bloco `DataRepo` do campo *Produces* acima, num arquivo só de tipos (sem lógica).

- [ ] **Step 3: Escrever o teste que falha — `src/backend/data/firestoreRepo.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firestoreRepo } from './firestoreRepo.ts';

test('firestoreRepo expõe a superfície da interface DataRepo', () => {
  for (const m of ['collection','getDocs','getDocsWithLimit','getDoc','doc','set','update','delete','invalidateCache','getCollectionVersion','getPendingReminders']) {
    assert.equal(typeof (firestoreRepo as any)[m], 'function', `faltando método ${m}`);
  }
});

test('firestoreRepo.doc retorna uma Promise de DocRef', async () => {
  const ref = await firestoreRepo.doc('suppliers', 'abc');
  assert.ok(ref);
});
```

- [ ] **Step 4: Rodar o teste e ver falhar**

Run: `npx tsx --test src/backend/data/firestoreRepo.test.ts`
Expected: FAIL — `Cannot find module './firestoreRepo.ts'`.

- [ ] **Step 5: Extrair o cache para `src/backend/data/cache.ts`**

Mover de `src/backend/firebase.ts` para `cache.ts`, **sem alterar a lógica**: `CachedDocs`, `CachedDoc`, `g_docsCache`, `g_docCache`, `g_collectionVersions`, `getCollectionTTL`, `getCollectionVersion`, `invalidateCache`, `updateCacheWithDoc`, `deleteCacheDoc`. Exportar todas essas funções/estruturas. **Não** mover `saveCacheToDisk`/`loadCacheFromDisk` nem nada de `firestore_quota_exceeded_flag` — isso continua só no `firestoreRepo`.

- [ ] **Step 6: Escrever `src/backend/data/firestoreRepo.ts`**

Mover o objeto `fsOps` inteiro (e o que só ele usa: `checkQuotaExceeded`, `setQuotaExceededActive`, `resetQuotaExceeded`, `handleFirestoreError`, `saveCacheToDisk`, `loadCacheFromDisk`, funções de Modo de Teste local `loadLocalTestCollection`/`saveLocalTestCollection`/`clearLocalTestCollection`, `OperationType`) de `src/backend/firebase.ts` para cá. Importar do novo `cache.ts` o que foi extraído no Step 5. Renomear o export: `export const firestoreRepo: DataRepo = { ...fsOps, getPendingReminders };`.

Adicionar o método novo:
```ts
async function getPendingReminders(nowIso: string): Promise<QuerySnapshot> {
  const db: any = await getDb();
  let snap: any;
  if (db.collection) {
    snap = await db.collection('reminders').where('notified', '==', false).where('date', '<=', nowIso).get();
  } else {
    const { collection, query, where, getDocs } = await import('firebase/firestore/lite');
    snap = await getDocs(query(collection(db, 'reminders'), where('notified','==',false), where('date','<=',nowIso)));
  }
  const docs = snap.docs.map((d: any) => {
    const data = typeof d.data === 'function' ? d.data() : d.data;
    return { id: d.id, data: () => data, exists: () => true };
  });
  return { docs, empty: docs.length === 0 };
}
```
(Isto replica a query que hoje está em `reminderWorker.ts`; confira o nome real do campo de data e do filtro no worker antes de fechar — ajuste `date` se lá for outro nome.)

Manter também `export { clearLocalTestCollection };` e `export { OperationType };` (usados fora).

- [ ] **Step 7: Escrever `src/backend/data/index.ts`**

```ts
import type { DataRepo } from './types.ts';
import { firestoreRepo } from './firestoreRepo.ts';

const backend = (process.env.DATA_BACKEND || 'firestore').toLowerCase();

let selected: DataRepo = firestoreRepo;
if (backend === 'supabase') {
  // carregado dinamicamente só quando necessário (Task 6 cria o módulo)
  const { supabaseRepo } = await import('./supabaseRepo.ts');
  selected = supabaseRepo;
}
export const repo: DataRepo = selected;
```
Se `supabaseRepo.ts` ainda não existir nesta task, envolver o `import` dinâmico em `try/catch` que faz `console.error` e cai no `firestoreRepo` — assim a Task 1 compila sozinha.

- [ ] **Step 8: Reduzir `src/backend/firebase.ts`**

Deve restar apenas: imports do SDK, `initFirebase`, `getDb`, `initPromise`, `adminDb`/`clientDb`/`adminDisabled`. Nada de `fsOps`, cache ou quota-flag. Reexportar para compatibilidade temporária, se algo ainda importar: `export { firestoreRepo as fsOps } from './data/firestoreRepo.ts';` — remover essa linha na Task 2 quando os call sites migrarem.

- [ ] **Step 9: Rodar `npm run lint`**

Run: `npm run lint`
Expected: PASS (0 erros de TypeScript).

- [ ] **Step 10: Rodar o teste e ver passar**

Run: `npx tsx --test src/backend/data/firestoreRepo.test.ts`
Expected: PASS (2 testes).

- [ ] **Step 11: Smoke test manual do servidor**

Run: `npm run dev`, abrir `http://localhost:3000`, logar, abrir Fornecedores, Dashboard, Lembretes.
Expected: tudo carrega igual a antes (ainda 100% Firestore).

- [ ] **Step 12: Commit**

```bash
git add src/backend/data package.json src/backend/firebase.ts
git commit -m "refactor: introduce DataRepo layer with firestoreRepo behind it"
```

---

## Task 2: Ligar `app.ts`, `reminderWorker.ts` e `pushService.ts` ao `repo`

**Files:**
- Modify: `src/backend/app.ts` (todas as `fsOps.*` → `repo.*`)
- Modify: `src/backend/reminderWorker.ts`
- Modify: `src/backend/services/pushService.ts`
- Modify: `src/backend/firebase.ts` (remover o reexport `fsOps` temporário)
- Test: `src/backend/data/firestoreRepo.test.ts` (reuso) + smoke manual

**Interfaces:**
- Consumes: `repo` de `src/backend/data/index.ts`; `repo.getPendingReminders(nowIso)` da Task 1.
- Produces: nenhuma API nova; comportamento inalterado.

- [ ] **Step 1: Trocar import e chamadas em `src/backend/app.ts`**

Substituir o import de `fsOps` por:
```ts
import { repo } from './data/index.js';
```
Depois, substituição textual `fsOps.` → `repo.` em todo o arquivo (são 168 ocorrências). Nenhuma assinatura muda.

- [ ] **Step 2: Conferir chamadas que dependiam de detalhes internos**

Grep por `getDb(` e `firebase-admin` dentro de `app.ts`. Se houver acesso cru ao `db` (fora do `repo`), anotar e tratar: mover para um método do `repo` ou manter via `getDb` só se for chamada de infra (health check). Não deve haver para dados de negócio.

- [ ] **Step 3: `src/backend/reminderWorker.ts`**

Trocar o bloco que usa `getDb()` + `where` por:
```ts
import { repo } from './data/index.js';
// ...
const nowIso = new Date().toISOString();
const snapshot = await repo.getPendingReminders(nowIso);
// resto igual: itera snapshot.docs, repo.update(await repo.doc('reminders', d.id), { notified: true }, `reminders/${d.id}`)
```
Remover imports de `firebase/firestore/lite` que ficarem sem uso.

- [ ] **Step 4: `src/backend/services/pushService.ts`**

Trocar `import { fsOps } from "../firebase.js";` por `import { repo } from "../data/index.js";` e `fsOps.` → `repo.` (3 ocorrências).

- [ ] **Step 5: Remover o reexport temporário**

Em `src/backend/firebase.ts`, apagar a linha `export { firestoreRepo as fsOps } ...` adicionada na Task 1. Grep final: `grep -rn "fsOps" src/backend` deve retornar **nada**.

- [ ] **Step 6: `npm run lint`**

Expected: PASS.

- [ ] **Step 7: Smoke test manual completo**

`npm run dev`. Exercitar: login, Fornecedores (criar/editar/excluir), Categorias, Setores, Dashboard, Lembretes (criar/excluir), Modo de Teste (ligar, criar um fornecedor de teste, desligar, confirmar que sumiu do real), importação de XML de uma nota pequena.
Expected: idêntico ao comportamento anterior.

- [ ] **Step 8: Commit**

```bash
git add src/backend
git commit -m "refactor: route all backend data access through repo"
```

---

## Task 3: Rotas de escrita de `reminders` e `authorized_users` no backend

**Files:**
- Modify: `src/backend/app.ts` (novas rotas)
- Test: `src/backend/data/routes.reminders.test.ts` (supertest-less: chamada direta ao handler via `app` + `node:http`) — ou smoke manual com `curl` se preferir manter simples

**Interfaces:**
- Consumes: `repo`, `asyncHandler`, padrão das rotas `/api/xml/*` existentes.
- Produces (contratos HTTP):
  - `POST /api/xml/reminders` body `{ productName, date }` → `{ status: "success", id }` (cria; gera id `rem_<ts>_<rand>`).
  - `POST /api/xml/reminders/update` body `{ id, ...patch }` → `{ status: "success" }`.
  - `POST /api/xml/reminders/delete` body `{ id }` → `{ status: "success" }`.
  - `GET /api/auth/users` → `AuthorizedUser[]` (mesma forma que `GET /api/xml/authorized_users`).
  - `GET /api/auth/users/me?uid=<uid>` → `AuthorizedUser | null`.
  - `POST /api/auth/users/upsert` body `{ uid, user }` → `{ status: "success" }` (grava `authorized_users/<uid>`).
  - `POST /api/auth/users/status` body `{ uid, status }` → `{ status: "success" }` (`approved` = update; `denied` = delete).
  - `POST /api/auth/users/delete` body `{ uid }` → `{ status: "success" }`.

- [ ] **Step 1: Escrever teste que falha**

`src/backend/data/routes.reminders.test.ts`:
```ts
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import app from '../app.ts';

let server: http.Server; let base: string;
before(async () => { server = app.listen(0); base = `http://localhost:${(server.address() as any).port}`; });
after(() => server.close());

test('POST /api/xml/reminders cria e retorna id', async () => {
  const res = await fetch(`${base}/api/xml/reminders`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productName: 'Teste', date: new Date().toISOString() }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.status, 'success');
  assert.ok(body.id);
  // limpeza
  await fetch(`${base}/api/xml/reminders/delete`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: body.id }) });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/backend/data/routes.reminders.test.ts`
Expected: FAIL com 404.

- [ ] **Step 3: Implementar as rotas de `reminders`**

Perto do `GET /api/xml/reminders` em `app.ts`, seguindo o padrão de `shopping_lists`:
```ts
app.post("/api/xml/reminders", asyncHandler(async (req, res) => {
  const { id, productName, date, ...rest } = req.body;
  if (!productName || !date) return res.status(400).json({ error: "productName e date são obrigatórios" });
  const remId = id || `rem_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await repo.set(repo.doc('reminders', remId), { productName, date, notified: false, ...rest }, 'reminders/' + remId);
  repo.invalidateCache('reminders');
  res.json({ status: "success", id: remId });
}));

app.post("/api/xml/reminders/update", asyncHandler(async (req, res) => {
  const { id, ...patch } = req.body;
  if (!id) return res.status(400).json({ error: "id ausente." });
  await repo.update(repo.doc('reminders', id), patch, 'reminders/' + id);
  repo.invalidateCache('reminders');
  res.json({ status: "success" });
}));

app.post("/api/xml/reminders/delete", asyncHandler(async (req, res) => {
  const { id } = req.body;
  if (!id) return res.status(400).json({ error: "id ausente." });
  await repo.delete(repo.doc('reminders', id), 'reminders/' + id);
  repo.invalidateCache('reminders');
  res.json({ status: "success" });
}));
```

- [ ] **Step 4: Implementar as rotas de `authorized_users`**

```ts
app.get("/api/auth/users", asyncHandler(async (req, res) => {
  const snap = await repo.getDocs('authorized_users', 'authorized_users', req.query.fresh === 'true');
  res.json(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
}));

app.get("/api/auth/users/me", asyncHandler(async (req, res) => {
  const uid = String(req.query.uid || '');
  if (!uid) return res.status(400).json({ error: "uid ausente." });
  const d = await repo.getDoc(repo.doc('authorized_users', uid), 'authorized_users/' + uid, true);
  res.json(d.exists() ? { id: d.id, ...d.data() } : null);
}));

app.post("/api/auth/users/upsert", asyncHandler(async (req, res) => {
  const { uid, user } = req.body;
  if (!uid || !user) return res.status(400).json({ error: "uid e user são obrigatórios" });
  await repo.set(repo.doc('authorized_users', uid), user, 'authorized_users/' + uid);
  repo.invalidateCache('authorized_users');
  res.json({ status: "success" });
}));

app.post("/api/auth/users/status", asyncHandler(async (req, res) => {
  const { uid, status } = req.body;
  if (!uid || !status) return res.status(400).json({ error: "uid e status são obrigatórios" });
  if (status === 'denied') await repo.delete(repo.doc('authorized_users', uid), 'authorized_users/' + uid);
  else await repo.update(repo.doc('authorized_users', uid), { status }, 'authorized_users/' + uid);
  repo.invalidateCache('authorized_users');
  res.json({ status: "success" });
}));

app.post("/api/auth/users/delete", asyncHandler(async (req, res) => {
  const { uid } = req.body;
  if (!uid) return res.status(400).json({ error: "uid ausente." });
  await repo.delete(repo.doc('authorized_users', uid), 'authorized_users/' + uid);
  repo.invalidateCache('authorized_users');
  res.json({ status: "success" });
}));
```

- [ ] **Step 5: Nota de segurança (registrar, decidir na execução)**

Hoje as escritas em `authorized_users` vão direto do cliente ao Firestore, protegidas pelas *regras* do Firestore (usuário só escreve o próprio doc; admin escreve os demais). Movê-las para estas rotas sem verificação **afrouxa** esse controle, já que as rotas `/api/*` não autenticam. Mitigação recomendada (implementar se o dono aprovar): nas rotas `/api/auth/users/*`, exigir header `Authorization: Bearer <firebaseIdToken>` e validar via REST, sem Admin SDK:
```ts
async function verifyUid(idToken: string): Promise<string | null> {
  const key = (await getFirebaseConfig()).apiKey;
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ idToken }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  return j.users?.[0]?.localId || null;
}
```
`upsert` exige `verifyUid(token) === uid`; `status`/`delete` exigem que o uid do token seja de um doc com `role === 'admin'`. Marcar como sub-decisão; não bloqueia o resto do plano.

- [ ] **Step 6: `npm run lint` + rodar o teste**

Run: `npm run lint` → PASS.
Run: `npx tsx --test src/backend/data/routes.reminders.test.ts` → PASS.

- [ ] **Step 7: Commit**

```bash
git add src/backend/app.ts src/backend/data/routes.reminders.test.ts
git commit -m "feat: backend write routes for reminders and authorized_users"
```

---

## Task 4: Frontend — remover acesso direto ao Firestore (dados de negócio)

**Files:**
- Modify: `src/frontend/hooks/useReminders.ts`
- Modify: `src/frontend/hooks/useSuppliers.ts`
- Modify: `src/frontend/hooks/useCart.ts`
- Modify: `src/frontend/hooks/useDeliveredProducts.ts`
- Modify: `src/frontend/App.tsx`
- Test: `npm run lint` + smoke manual

**Interfaces:**
- Consumes: rotas de `reminders` da Task 3; rotas `/api/xml/*` já existentes para suppliers/categories/setores/delivered_products.
- Produces: hooks sem imports de `firebase/firestore`.

- [ ] **Step 1: `useReminders.ts`**

- Remover `import { db } from '../firebase'` e `import { ... } from 'firebase/firestore'`.
- Em `loadReminders`: apagar o bloco `catch (backendErr)` que cai para `getDocs(query(collection(db,'reminders'), ...))`. Se a rota falhar, manter o `catch` externo que usa `localStorage`.
- `checkForDueReminders`: trocar `updateDoc(doc(db,'reminders',id), { notified: true })` por
  `fetch('/api/xml/reminders/update', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id, notified: true }) })`.
- `addReminder`: trocar `addDoc(collection(db,'reminders'), cleaned)` por
  `const r = await fetch('/api/xml/reminders', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ productName, date }) }); const { id } = await r.json();` e usar `id` no lugar de `docRef.id`.
- `deleteReminder`: trocar `deleteDoc(doc(db,'reminders',id))` por `fetch('/api/xml/reminders/delete', { method:'POST', ... body: JSON.stringify({ id }) })`.
- `invalidateBackendCache` já existe e continua sendo chamado.

- [ ] **Step 2: `useSuppliers.ts`**

- As escritas já usam `/api/xml/*`. Remover `import { collection, getDocs } from 'firebase/firestore'` e `import { db } ...` se ficar sem uso.
- Nas linhas ~88–91, onde monta `suppliersCollection`/`categoriesCollection`/`setoresCollection` e faz `getDocs(...)`: confirmar se é caminho de fallback. Se for, removê-lo (as leituras via `fetch(suppUrl/catUrl/setUrl)` já cobrem). Se `getDocs` for o caminho principal de leitura, substituir pelas três chamadas `fetch` que já existem no arquivo.

- [ ] **Step 3: `useCart.ts`**

- Ler o arquivo: identificar qual coleção o `getDocs(q)` (com `query/orderBy/limit`) consulta.
- Se houver rota `/api/xml/<coll>` equivalente, trocar por `fetch` + ordenação/limite no cliente.
- Se **não** houver, adicionar em `app.ts` uma rota `GET /api/xml/<coll>` no padrão das demais (com `handleCacheAndEtag`) e usá-la. Registrar a rota nova no commit.
- Remover imports de `firebase/firestore`.

- [ ] **Step 4: `useDeliveredProducts.ts`**

- O `getDocs(q)` consulta `delivered_products`. Já existe `GET /api/xml/delivered_products`. Trocar o bloco por `fetch('/api/xml/delivered_products')` e aplicar o `orderBy`/filtro no cliente.
- Remover imports de `firebase/firestore`.

- [ ] **Step 5: `App.tsx`**

- Ler os usos de `setDoc`/`deleteDoc`/`getDocs` (`import` na linha 10). Para cada um, identificar a coleção e trocar pela rota `/api/xml/*` correspondente (criar rota se faltar, padrão das demais).
- Remover o import de `firebase/firestore` e de `db` se ficar sem uso.

- [ ] **Step 6: `npm run lint`**

Expected: PASS. Grep de verificação: `grep -rn "firebase/firestore" src/frontend` deve sobrar **apenas** `useAuth.ts` (tratado na Task 5) e `src/frontend/firebase.ts`.

- [ ] **Step 7: Smoke manual**

`npm run dev`. Testar Lembretes (criar, disparar notificação/`notified`, excluir), Fornecedores, Carrinho, Produtos Entregues, e o que mudou em `App.tsx`.
Expected: sem regressão; sem erros de Firestore no console.

- [ ] **Step 8: Commit**

```bash
git add src/frontend
git commit -m "refactor(frontend): use API routes instead of direct Firestore for business data"
```

---

## Task 5: Frontend — `useAuth.ts` via API + polling no lugar do `onSnapshot`

**Files:**
- Modify: `src/frontend/hooks/useAuth.ts`
- Test: `npm run lint` + smoke manual de login/aprovação

**Interfaces:**
- Consumes: `GET /api/auth/users`, `GET /api/auth/users/me?uid=`, `POST /api/auth/users/upsert|status|delete` (Task 3). `auth` (Firebase Auth) permanece de `../firebase`.
- Produces: `useAuth` sem `firebase/firestore`; mesma API pública do hook (`isLoggedIn`, `isApproved`, `authorizedUsers`, `handleLogin`, `updateUserStatus`, `removeUserRequest`, etc.).

- [ ] **Step 1: Substituir o `onSnapshot` do doc do usuário por polling**

Trocar o `useEffect` que faz `onSnapshot(doc(db,'authorized_users',currentUid), cb)` por uma função `refreshMe()` que faz `fetch('/api/auth/users/me?uid=' + currentUid)` e roda a mesma lógica que o callback tinha (`snapshot.exists()` → `res !== null`; `snapshot.data()` → `res`). Disparar `refreshMe()`:
  - ao montar (quando `isAuthReady` e há `currentUid`);
  - em `setInterval` de 60s;
  - no listener `document.addEventListener('visibilitychange', ...)` quando a aba volta a ficar visível;
  - após `handleLogin` e após ações de admin.
Limpar interval e listener no cleanup.

- [ ] **Step 2: `loadAuthorizedUsers`**

Remover o bloco `catch (backendErr)` que usa `getDocs(collection(db,'authorized_users'))`. Trocar a URL `'/api/xml/authorized_users'` por `'/api/auth/users'` (ou manter a antiga — ambas retornam a mesma forma; padronizar em `/api/auth/users`). Manter o resto (dedupe por CPF, cache em `localStorage`).

- [ ] **Step 3: Escritas em `handleLogin`**

- `deleteDoc(doc(db,'authorized_users', existingUserByCpf.uid))` → `fetch('/api/auth/users/delete', { method:'POST', ..., body: JSON.stringify({ uid: existingUserByCpf.uid }) })`.
- `setDoc(doc(db,'authorized_users', currentUid), cleaned)` (duas ocorrências) → `fetch('/api/auth/users/upsert', { method:'POST', ..., body: JSON.stringify({ uid: currentUid, user: cleaned }) })`.
- Manter `invalidateBackendCache('authorized_users')` e o `refreshMe()` logo depois.

- [ ] **Step 4: `updateUserStatus` e `confirmDeleteUser`**

- `updateUserStatus`: `denied` → `POST /api/auth/users/status { uid, status:'denied' }`; `approved` → `POST /api/auth/users/status { uid, status:'approved' }`. Manter a atualização otimista do `setAuthorizedUsers`.
- `confirmDeleteUser`: → `POST /api/auth/users/delete { uid }`.

- [ ] **Step 5: Limpar imports**

Remover `db` do import de `../firebase` e a linha `import { collection, onSnapshot, doc, setDoc, updateDoc, deleteDoc, getDoc, getDocs } from 'firebase/firestore'`.

- [ ] **Step 6: `npm run lint`**

Expected: PASS. `grep -rn "firebase/firestore" src/frontend/hooks` → vazio.

- [ ] **Step 7: Smoke manual de autenticação**

`npm run dev`. Cenários:
  - Login com CPF de admin (`05839352144`) → entra, vê lista de usuários.
  - Login com CPF novo → status "aguardando aprovação".
  - Como admin, aprovar esse usuário; na aba do usuário (ou após ~60s / troca de foco) o acesso libera.
  - Negar/excluir um usuário.
Expected: mesmos resultados de antes, com no máximo ~60s de latência para refletir aprovação.

- [ ] **Step 8: Commit**

```bash
git add src/frontend/hooks/useAuth.ts
git commit -m "refactor(frontend): useAuth via API routes, polling instead of onSnapshot"
```

---

## Task 6: Provisionar Supabase + schema

**Files:**
- Create: `scripts/supabase/schema.sql`
- Create: `docs/superpowers/CUTOVER-postgres.md` (seção "Setup")
- Modify: `package.json` (dependência `@supabase/supabase-js`)
- Modify: `.env.example` (criar se não existir) — documentar `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DATA_BACKEND`

**Interfaces:**
- Consumes: nada de código do app.
- Produces: projeto Supabase com tabelas; vars de ambiente definidas; `schema.sql` versionado.

- [ ] **Step 1: Criar o projeto (manual, pelo dono da conta)**

No painel do Supabase: novo projeto no plano Free, região mais próxima (South America se disponível). Anotar `Project URL` e a `service_role` key (Settings → API). Registrar no `docs/superpowers/CUTOVER-postgres.md` **sem** colar a key (só instrução de onde pegar).

- [ ] **Step 2: Escrever `scripts/supabase/schema.sql`**

```sql
create schema if not exists test;

-- macro aplicada às 16 coleções, nos schemas public e test:
--   invoices, xml_spendings, price_increases, suppliers, categories, setores,
--   product_categories, product_setores, authorized_users, delivered_products,
--   reminders, shopping_lists, purchase_orders, pending_list_products,
--   setor_limits, push_subscriptions

create table if not exists public.invoices        (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.xml_spendings   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.price_increases (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.suppliers       (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.categories      (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.setores         (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.product_categories (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.product_setores    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.authorized_users   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.delivered_products (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.reminders       (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.shopping_lists  (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.purchase_orders (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.pending_list_products (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.setor_limits    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists public.push_subscriptions    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());

create table if not exists test.invoices        (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.xml_spendings   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.price_increases (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.suppliers       (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.categories      (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.setores         (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.product_categories (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.product_setores    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.authorized_users   (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.delivered_products (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.reminders       (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.shopping_lists  (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.purchase_orders (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.pending_list_products (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.setor_limits    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
create table if not exists test.push_subscriptions    (id text primary key, data jsonb not null, updated_at timestamptz not null default now());
```
(Confirmar a lista de 16 nomes rodando: `grep -rhoE "repo\.(doc|getDocs)\('[a-z_]+'" src/backend | grep -oE "'[a-z_]+'" | sort -u` — ajustar o SQL se aparecer algum nome a mais/menos.)

- [ ] **Step 3: Aplicar o schema**

No SQL Editor do Supabase, colar e rodar `schema.sql`. Conferir em Table Editor que as tabelas aparecem em `public` e `test`.

- [ ] **Step 4: Expor os schemas ao PostgREST**

Settings → API → "Exposed schemas": adicionar `test` além de `public`. Salvar.

- [ ] **Step 5: Instalar o cliente**

Run: `npm install @supabase/supabase-js`

- [ ] **Step 6: Documentar variáveis**

Criar/editar `.env.example`:
```
DATA_BACKEND=firestore
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
```
Garantir que `.env` está no `.gitignore` (verificar; adicionar se faltar).

- [ ] **Step 7: Commit**

```bash
git add scripts/supabase/schema.sql package.json package-lock.json .env.example docs/superpowers/CUTOVER-postgres.md .gitignore
git commit -m "chore: provision Supabase schema and @supabase/supabase-js"
```

---

## Task 7: Implementar `supabaseRepo`

**Files:**
- Create: `src/backend/data/supabaseRepo.ts`
- Create: `src/backend/data/supabaseRepo.test.ts`
- Modify: `src/backend/data/index.ts` (import dinâmico real do `supabaseRepo`)
- Test: `src/backend/data/supabaseRepo.test.ts` + `src/backend/data/repo.parity.test.ts`

**Interfaces:**
- Consumes: `@supabase/supabase-js` (`createClient`); `getCollectionPrefix`/`isTestModeActive` de `context.ts` (para decidir schema `public` vs `test`); `cache.ts` da Task 1 (`getCollectionTTL`, `getCollectionVersion`, `invalidateCache`, `updateCacheWithDoc`, `deleteCacheDoc`, `g_docsCache`, `g_docCache`).
- Produces: `export const supabaseRepo: DataRepo`. Cliente injetável para teste: `export function makeSupabaseRepo(client): DataRepo` e `supabaseRepo = makeSupabaseRepo(createClient(URL, KEY, { db: { schema: 'public' } }))`.

- [ ] **Step 1: Teste que falha — mapeamento com cliente falso**

`src/backend/data/supabaseRepo.test.ts`:
```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeSupabaseRepo } from './supabaseRepo.ts';

function fakeClient(store: Record<string, {id:string;data:any}[]>) {
  return {
    schema: () => api,
    from: (t: string) => tableApi(t),
  } as any;
  function tableApi(t: string) {
    const rows = () => (store[t] ||= []);
    const q: any = {
      select: () => q,
      _filterId: undefined as string | undefined,
      eq(_c: string, v: string) { q._filterId = v; return q; },
      limit: () => q,
      then(res: any) {
        let data = rows().map(r => ({ id: r.id, data: r.data }));
        if (q._filterId !== undefined) data = data.filter(r => r.id === q._filterId);
        return Promise.resolve(res({ data, error: null }));
      },
      upsert(row: any) { const rs = rows(); const i = rs.findIndex(r => r.id === row.id); if (i>=0) rs[i]=row; else rs.push(row); return Promise.resolve({ error: null }); },
      delete() { return { eq: (_c: string, v: string) => { store[t] = rows().filter(r => r.id !== v); return Promise.resolve({ error: null }); } }; },
    };
    return q;
  }
  var api: any;
}

test('getDocs devolve formato {docs:[{id,data(),exists()}],empty}', async () => {
  const store = { suppliers: [{ id: 's1', data: { name: 'ACME' } }] };
  const repo = makeSupabaseRepo(fakeClient(store));
  const snap = await repo.getDocs('suppliers', 'suppliers', true);
  assert.equal(snap.empty, false);
  assert.equal(snap.docs[0].id, 's1');
  assert.equal(snap.docs[0].data().name, 'ACME');
  assert.equal(snap.docs[0].exists(), true);
});

test('set faz upsert e getDoc lê de volta', async () => {
  const store: any = { suppliers: [] };
  const repo = makeSupabaseRepo(fakeClient(store));
  await repo.set(await repo.doc('suppliers', 's2'), { name: 'Beta' }, 'suppliers/s2');
  const d = await repo.getDoc(await repo.doc('suppliers', 's2'), 'suppliers/s2', true);
  assert.equal(d.exists(), true);
  assert.equal(d.data().name, 'Beta');
});

test('delete remove o registro', async () => {
  const store: any = { suppliers: [{ id: 's3', data: { name: 'X' } }] };
  const repo = makeSupabaseRepo(fakeClient(store));
  await repo.delete(await repo.doc('suppliers', 's3'), 'suppliers/s3');
  const d = await repo.getDoc(await repo.doc('suppliers', 's3'), 'suppliers/s3', true);
  assert.equal(d.exists(), false);
});
```
(O fake acima é um esqueleto; ajuste os encadeamentos ao que o `supabaseRepo` realmente chamar. O contrato testado é o **formato de saída**, não o fake.)

- [ ] **Step 2: Rodar e ver falhar**

Run: `npx tsx --test src/backend/data/supabaseRepo.test.ts`
Expected: FAIL — módulo não existe.

- [ ] **Step 3: Implementar `src/backend/data/supabaseRepo.ts`**

Pontos-chave:
- `schemaFor()` → `isTestModeActive() ? 'test' : 'public'`. Cada operação usa `client.schema(schemaFor()).from(coll)` (ou dois clients pré-criados, um por schema, e escolhe).
- `doc(coll, id)` → `async () => ({ __coll: coll, __id: id })`.
- `getDocs(coll, path?, forceNoCache?)`:
  - resolve `cacheKey = (schema==='test'?'test_':'') + coll`;
  - se `!forceNoCache` e cache válido por TTL/versão (mesma checagem do `firestoreRepo`), retorna do `g_docsCache`;
  - senão `const { data, error } = await client.schema(s).from(coll).select('id,data')`; em erro → log + retorna cache se houver, senão `{docs:[],empty:true}`;
  - mapeia `data` para `{ id, data: () => row.data, exists: () => true }`; grava no `g_docsCache` com `version`; retorna.
- `getDocsWithLimit(coll, n, forceNoCache?)` → igual, com `.limit(n)` e `cacheKey` sufixado `_limit_n`.
- `getDoc(ref, path?, forceNoCache?)` → resolve `ref`; `select('id,data').eq('id', id)`; `.maybeSingle()` se disponível; retorna `{ id, data: () => row?.data ?? {}, exists: () => !!row }`; atualiza `g_docCache`.
- `set(ref, data, path?)`:
  - resolve `ref`; `payload = { id, data: normalizeTimestamps(data), updated_at: new Date().toISOString() }`;
  - `await client.schema(s).from(coll).upsert(payload)`;
  - `updateCacheWithDoc(realPath, data)` (do `cache.ts`) para manter o cache coerente.
- `update(ref, patch, path?)`:
  - ler doc atual (via `getDoc` sem cache), `merged = { ...current, ...normalizeTimestamps(patch) }`, `upsert`. (Merge raso, igual ao `fsOps.update`.)
  - `updateCacheWithDoc(realPath, merged)`.
- `delete(ref, path?)` → `client.schema(s).from(coll).delete().eq('id', id)`; `deleteCacheDoc(realPath)`.
- `invalidateCache(path)` e `getCollectionVersion(path)` → delegar direto para as funções do `cache.ts` (idênticas ao `firestoreRepo`).
- `collection(coll)` → retornar `client.schema(schemaFor()).from(coll)` (poucos/nenhum uso; manter por compatibilidade de interface).
- `getPendingReminders(nowIso)`:
  ```ts
  const s = schemaFor();
  const { data } = await client.schema(s).from('reminders').select('id,data');
  const docs = (data ?? [])
    .filter((r: any) => r.data?.notified === false && String(r.data?.date ?? '') <= nowIso)
    .map((r: any) => ({ id: r.id, data: () => r.data, exists: () => true }));
  return { docs, empty: docs.length === 0 };
  ```
- `normalizeTimestamps(obj)`: percorre recursivamente; se um valor tem `.toDate` (Firestore Timestamp) ou é `Date`, converte para `.toISOString()`. Strings ISO passam intactas.
- Sem circuit breaker de quota, sem cache em disco, sem armazenamento local de Modo de Teste (o schema `test` no Postgres cobre isso).

- [ ] **Step 4: Ligar no `index.ts`**

Trocar o `try/catch` provisório da Task 1 por:
```ts
if (backend === 'supabase') {
  const { supabaseRepo } = await import('./supabaseRepo.js');
  selected = supabaseRepo;
}
```

- [ ] **Step 5: Escrever `src/backend/data/repo.parity.test.ts`**

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { firestoreRepo } from './firestoreRepo.ts';
import { makeSupabaseRepo } from './supabaseRepo.ts';

// só compara a FORMA do retorno para uma coleção vazia — sem tocar rede
test('getDocs de coleção inexistente: mesma forma nos dois repos', async () => {
  const sup = makeSupabaseRepo({
    schema: () => ({ from: () => ({ select: () => Promise.resolve({ data: [], error: null }) }) }),
  } as any);
  const a = await sup.getDocs('nao_existe', 'nao_existe', true);
  assert.deepEqual(Object.keys(a).sort(), ['docs', 'empty']);
  assert.equal(a.empty, true);
  assert.equal(Array.isArray(a.docs), true);
});
```

- [ ] **Step 6: `npm run lint` + testes**

Run: `npm run lint` → PASS.
Run: `npx tsx --test src/backend/data/supabaseRepo.test.ts src/backend/data/repo.parity.test.ts` → PASS.

- [ ] **Step 7: Teste de integração real (opcional, local, com credenciais)**

Com `.env` preenchido: `DATA_BACKEND=supabase npx tsx -e "import('./src/backend/data/index.js').then(async m => { const s = await m.repo.getDocs('suppliers','suppliers',true); console.log('ok', s.docs.length); })"`.
Expected: imprime `ok 0` (tabela vazia, ainda sem backfill) sem erro de conexão/schema.

- [ ] **Step 8: Commit**

```bash
git add src/backend/data
git commit -m "feat: supabaseRepo implementation of DataRepo"
```

---

## Task 8: Script de backfill Firestore → Supabase

**Files:**
- Create: `scripts/supabase/migrate.ts`
- Modify: `docs/superpowers/CUTOVER-postgres.md` (seção "Backfill")
- Test: execução real com relatório de contagens

**Interfaces:**
- Consumes: `initFirebase`/`getDb` de `src/backend/firebase.ts`; `createClient` de `@supabase/supabase-js`; `normalizeTimestamps` de `src/backend/data/supabaseRepo.ts` (exportar do módulo).
- Produces: script executável `npx tsx scripts/supabase/migrate.ts [--test] [--only=coll1,coll2]`.

- [ ] **Step 1: Escrever `scripts/supabase/migrate.ts`**

```ts
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { getDb, initFirebase } from '../../src/backend/data/../firebase.js';
import { normalizeTimestamps } from '../../src/backend/data/supabaseRepo.js';

const COLLECTIONS = ['invoices','xml_spendings','price_increases','suppliers','categories','setores','product_categories','product_setores','authorized_users','delivered_products','reminders','shopping_lists','purchase_orders','pending_list_products','setor_limits','push_subscriptions'];

const args = process.argv.slice(2);
const useTest = args.includes('--test');
const only = args.find(a => a.startsWith('--only='))?.split('=')[1]?.split(',');
const schema = useTest ? 'test' : 'public';
const prefix = useTest ? 'test_' : '';

const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!, { db: { schema } });

async function run() {
  await initFirebase();
  const db: any = await getDb();
  const list = (only ?? COLLECTIONS);
  const report: Record<string, { firestore: number; supabase: number }> = {};

  for (const coll of list) {
    const srcName = prefix + coll;
    const snap = db.collection ? await db.collection(srcName).get() : null;
    if (!snap) throw new Error('Admin SDK indisponível — rode localmente com credenciais.');
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
    const { count } = await sb.from(coll).select('*', { count: 'exact', head: true });
    report[coll] = { firestore: rows.length, supabase: count ?? -1 };
    console.log(`  ${coll}: firestore=${rows.length} supabase=${count}`);
  }

  const mismatches = Object.entries(report).filter(([, v]) => v.firestore !== v.supabase);
  console.log(mismatches.length ? `\n⚠ divergências: ${mismatches.map(([k]) => k).join(', ')}` : '\n✓ contagens conferem');
  process.exit(mismatches.length ? 1 : 0);
}
run().catch(e => { console.error(e); process.exit(1); });
```
(Se `dotenv` não estiver instalado: `npm i -D dotenv`, ou carregar `.env` manualmente. Ajustar o caminho do import de `getDb` ao real: `../../src/backend/firebase.js`.)

- [ ] **Step 2: Rodar contra `public` (dados reais)**

Pré-condição: `.env` com `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`; rodar **localmente** (Admin SDK do Firebase precisa de credenciais — `GOOGLE_APPLICATION_CREDENTIALS` ou `gcloud auth application-default login`).
Run: `npx tsx scripts/supabase/migrate.ts`
Expected: lista por coleção e `✓ contagens conferem`.

- [ ] **Step 3: Rodar contra `test`**

Run: `npx tsx scripts/supabase/migrate.ts --test`
Expected: `✓ contagens conferem` (pode haver 0 docs em várias — ok).

- [ ] **Step 4: Conferência pontual**

No Supabase Table Editor, abrir `public.suppliers` e `public.authorized_users`: conferir alguns registros contra o app em produção (nomes, status). Conferir que campos de data são strings ISO no JSONB.

- [ ] **Step 5: Commit**

```bash
git add scripts/supabase/migrate.ts docs/superpowers/CUTOVER-postgres.md package.json package-lock.json
git commit -m "feat: one-shot Firestore -> Supabase backfill script"
```

---

## Task 9: Virada em preview + `src/frontend/firebase.ts`

**Files:**
- Modify: `src/frontend/firebase.ts` (remover init do Firestore)
- Modify: `docs/superpowers/CUTOVER-postgres.md` (checklist de preview)
- Test: deploy de preview da Vercel com `DATA_BACKEND=supabase`, checklist manual

**Interfaces:**
- Consumes: `supabaseRepo` via `DATA_BACKEND`; rotas das Tasks 3–5.
- Produces: `src/frontend/firebase.ts` exportando só `auth` e helpers de Auth.

- [ ] **Step 1: Enxugar `src/frontend/firebase.ts`**

Remover `initializeFirestore`, `persistentLocalCache`, `persistentMultipleTabManager`, `getFirestore`, `disableNetwork`/`enableNetwork`/`terminate`/`clearIndexedDbPersistence` e o `export const db`. Manter `initializeApp`, `getAuth`, `GoogleAuthProvider`, `signInWithPopup`, `signOut`, `onAuthStateChanged`, `signInAnonymously`, `export const auth`, `googleProvider`.
Grep: `grep -rn "from '../firebase'" src/frontend` — confirmar que ninguém importa mais `db`, `disableNetwork` etc. Corrigir os que sobrarem (devem ter sido tratados nas Tasks 4–5). Ex.: `QuotaBanner.tsx`, `utils/index.ts` — inspecionar e ajustar.

- [ ] **Step 2: `npm run lint` + `npm run build`**

Run: `npm run lint` → PASS.
Run: `npm run build` → PASS (tsc + vite + esbuild).

- [ ] **Step 3: Configurar env no preview da Vercel**

No projeto Vercel, ambiente **Preview**: `DATA_BACKEND=supabase`, `SUPABASE_URL=...`, `SUPABASE_SERVICE_KEY=...`. Produção continua sem `DATA_BACKEND` (= firestore).

- [ ] **Step 4: Deploy de preview**

Push da branch → abrir a URL de preview da Vercel.

- [ ] **Step 5: Checklist manual no preview** (registrar resultados em `CUTOVER-postgres.md`)

  - Login admin e login de usuário novo; aprovar usuário; negar usuário.
  - Fornecedores: listar, criar, editar, excluir, excluir todos.
  - Categorias e Setores: criar e excluir.
  - Dashboard: gráficos carregam; análise de preços aparece.
  - Lembretes: criar, ver notificação ao vencer, excluir.
  - Importar XML de 1 nota pequena; conferir fatura, gasto e aumento de preço.
  - Pedidos de compra: criar, aprovar, rejeitar.
  - **Modo de Teste**: ligar → criar fornecedor de teste → confirmar que aparece só no modo teste → resetar modo teste → dados de produção intactos.
  - Push: assinar notificações; disparar broadcast de teste.
  - Header: ícone de "Quota Exceeded" **não** deve mais aparecer (não há mais quota).

- [ ] **Step 6: Corrigir o que falhar**

Bugs encontrados viram sub-commits `fix:` nesta task. Só seguir com todos os itens do checklist ok.

- [ ] **Step 7: Commit**

```bash
git add src/frontend/firebase.ts docs/superpowers/CUTOVER-postgres.md
git commit -m "chore: drop client Firestore init; preview cutover checklist passing"
```

---

## Task 10: Virada em produção + limpeza

**Files:**
- Modify: `vercel.json` (remover `includeFiles` de `firestore_cache_*.json`)
- Delete: `src/backend/data/firestoreRepo.ts` e seu teste; `firestore_cache_*.json`; `firestore.rules`; `firebase-blueprint.json`/`firebase-applet-config.json` **só se** não usados pelo Auth (o `apiKey`/`authDomain` ainda são necessários — provavelmente manter `firebase-applet-config.json`).
- Modify: `src/backend/data/index.ts` (Supabase vira padrão), `package.json` (remover `firebase-admin` do backend se nada mais usar; `firebase` do frontend continua para Auth), `src/backend/firebase.ts` (some se nada além do backfill usar `getDb`).

**Interfaces:**
- Consumes: tudo estável do preview por ≥ alguns dias.
- Produces: sistema só em Postgres; Firestore desconectado.

- [ ] **Step 1: Virar produção**

Vercel, ambiente **Production**: setar `DATA_BACKEND=supabase` + `SUPABASE_URL` + `SUPABASE_SERVICE_KEY`. Redeploy.

- [ ] **Step 2: Backfill final de reconciliação**

Antes do redeploy de produção, rodar `npx tsx scripts/supabase/migrate.ts` mais uma vez (captura o que mudou no Firestore desde a Task 8). `✓ contagens conferem`.

- [ ] **Step 3: Monitorar 3–7 dias**

Rollback disponível a qualquer momento: remover `DATA_BACKEND` (ou setar `firestore`) e redeploy. Nada foi apagado.

- [ ] **Step 4: Após o período estável — remover o backend Firestore**

- Em `src/backend/data/index.ts`: default vira `supabase`; manter o ramo `firestore` só se quiser rollback por env, senão remover junto.
- Deletar `src/backend/data/firestoreRepo.ts` e `firestoreRepo.test.ts`.
- `src/backend/data/cache.ts` **permanece** (usado pelo `supabaseRepo`).
- `src/backend/firebase.ts`: se só o `migrate.ts` usa `getDb`, mover o init para dentro do próprio script e deletar o módulo; senão manter.
- `package.json`: remover `firebase-admin`. **Manter `firebase`** (Auth no frontend).
- `vercel.json`: remover `"firestore_cache_*.json"` de `includeFiles`.
- Deletar da raiz: `firestore_cache_*.json`, `firestore_quota_exceeded_flag.json` (se existir), `firestore.rules`.
- Remover a lógica de "Quota Exceeded" que sobrou no frontend: `QuotaBanner.tsx`, ícone no `Header.tsx`, `/api/quota-status*` em `app.ts`, checagens em `useAuth`/`useReminders`. (Verificar cada uma; são caminhos mortos sem Firestore.)

- [ ] **Step 5: `npm run lint` + `npm run build` + smoke**

Todos PASS; `npm run dev` e passar o checklist da Task 9 Step 5 uma última vez.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: remove Firestore backend after stable Postgres cutover"
```

- [ ] **Step 7: Merge**

Seguir a skill `superpowers:finishing-a-development-branch` para integrar `feat/postgres-supabase-migration` na `main`.

---

## Self-Review

**Cobertura do spec:**
- Camada de repositório + seletor `DATA_BACKEND` → Tasks 1, 2, 7.
- `firestoreRepo` = comportamento atual → Task 1.
- `supabaseRepo` via `@supabase/supabase-js` → Task 7.
- Schema genérico JSONB + schema `test` → Task 6.
- Cache compartilhado (`cache.ts`), sem disco/circuit-breaker no Supabase → Tasks 1, 7.
- `getPendingReminders` para o worker → Tasks 1, 2.
- Backfill único idempotente lendo do Firestore, com relatório → Task 8.
- Frontend sem Firestore direto; rotas novas; `onSnapshot` → polling → Tasks 3, 4, 5.
- Firebase Auth mantido → Tasks 5, 9, 10 (não se remove `firebase`).
- Cutover por env var + rollback + limpeza faseada → Tasks 9, 10.
- Riscos (formato de retorno, timestamps, serverless, Modo de Teste, tempo real, `invalidateCache`, plano free) → cobertos nas tasks e nas notas de teste.

**Placeholders:** nenhum "TBD"/"TODO". Os pontos "inspecionar o arquivo e ajustar" (useCart/App.tsx) são inerentes — o plano dá o padrão exato a seguir e o critério de pronto (grep sem `firebase/firestore`).

**Consistência de tipos:** `DataRepo` definido na Task 1 e reusado nas Tasks 2, 7; `doc()` é `Promise<DocRef>` em todo o plano; `DocRef` = `{ __coll, __id, __local? }`; formato de `QuerySnapshot`/`DocSnapshot` idêntico entre `firestoreRepo` e `supabaseRepo` (testado na Task 7 Step 5). `normalizeTimestamps` exportado pelo `supabaseRepo` e consumido pelo `migrate.ts` (Task 8).
