# Migração do banco de dados: Firestore → Postgres (Supabase)

- **Data:** 2026-08-27
- **Status:** Aprovado para planejamento
- **Autor:** Claude + vitorisalves

## Objetivo

Substituir o Firestore pelo PostgreSQL hospedado no Supabase (plano gratuito)
como armazenamento de dados da aplicação, eliminando os erros recorrentes de
"Quota Exceeded" do Firestore, sem risco de indisponibilidade e com rollback
imediato a qualquer momento.

O **Firebase Auth** (login Google + anônimo) **permanece inalterado**. Apenas os
dados são migrados, incluindo os dados de perfil/permissão da coleção
`authorized_users`.

## Contexto: situação atual

### Acesso a dados no servidor

Quase todo acesso a dados passa por um único objeto, `fsOps`, em
`src/backend/firebase.ts`. Há **168 chamadas** a `fsOps.*` em
`src/backend/app.ts` (`getDocs`, `doc`, `getDoc`, `set`, `update`, `delete`,
`invalidateCache`, `getCollectionVersion`). Esse é o ponto único de troca.

O `fsOps` encapsula, hoje:

- **Cache em memória + disco** com TTL por coleção e versionamento de coleção
  (`invalidateCache` incrementa uma versão que invalida o cache).
- **Circuit breaker de quota** (`checkQuotaExceeded` / `setQuotaExceededActive` /
  `resetQuotaExceeded`) — quando o Firestore retorna erro de quota, passa a
  servir cache local por 1h. **Deixa de existir** com Postgres.
- **Modo de Teste** via prefixo `test_` nas coleções. O prefixo vem de
  `getCollectionPrefix()` em `src/backend/context.ts`, dirigido por
  `AsyncLocalStorage` (`requestContext`), setado por middleware conforme o
  cabeçalho/estado de Modo de Teste da requisição.
- **Fallback offline** lendo os arquivos `firestore_cache_*.json` da raiz do
  repositório (empacotados no deploy da Vercel via `vercel.json`).

`src/backend/reminderWorker.ts` usa `getDb()` diretamente para uma query
`where('notified','==',false)` / `where(date <= now)` na coleção `reminders`.

### Acesso a dados no frontend (fora do `fsOps`)

- `src/frontend/hooks/useAuth.ts` — lê e escreve `authorized_users`
  (`getDocs`, `setDoc`, `updateDoc`, `deleteDoc`) e mantém um **`onSnapshot` em
  tempo real** no documento do próprio usuário (`authorized_users/{uid}`), para
  reagir na hora a mudança de permissão/status. **É o único uso de tempo real da
  aplicação.**
- `src/frontend/hooks/useReminders.ts` — `getDocs`, `addDoc`, `updateDoc`,
  `deleteDoc` em `reminders`.
- `src/frontend/hooks/useSuppliers.ts` — `getDocs` em `suppliers`, `categories`,
  `setores` (já existe rota `/api/xml/*` equivalente).
- `src/frontend/hooks/useCart.ts` — `getDocs` com `query/orderBy/limit`.
- `src/frontend/hooks/useDeliveredProducts.ts` — `getDocs` com `query`.
- `src/frontend/App.tsx` — `setDoc`, `deleteDoc`, `getDocs` (`query/where`).

`src/frontend/firebase.ts` inicializa Firestore com `persistentLocalCache` +
`experimentalForceLongPolling` e também o Firebase Auth.

### Infra

- App na Vercel: backend Express empacotado como função serverless
  (`api/index.ts` → `src/backend/app.ts`, builder `@vercel/node`), frontend
  estático (Vite) em `dist/`.
- Também roda em modo long-running local (`tsx src/backend/server.ts`), que
  inclui o `reminderWorker`.
- `IS_VERCEL` (em `src/backend/config.ts`) já ramifica comportamento
  (sem escrita em disco, sem Admin SDK).

## Decisões (tomadas na fase de brainstorming)

| Tema | Decisão |
|---|---|
| Autenticação | Manter Firebase Auth. Migrar apenas dados, inclusive `authorized_users`. |
| Acesso ao Postgres | Cliente `@supabase/supabase-js` (HTTP/PostgREST). Sem pool de conexões — adequado a serverless. |
| Modelagem inicial | Tabela genérica por coleção: `id text pk`, `data jsonb`, `updated_at timestamptz`. Espelha o modelo de documentos. Normalização de tabelas quentes fica para depois. |
| Cutover | Env var `DATA_BACKEND` seleciona o backend. Backfill único. Código Firestore intacto para rollback imediato. Sem dual-write. |

## Arquitetura alvo

### Camada de repositório

```
src/backend/data/
  index.ts          → exporta `repo`: DataRepo, escolhido por process.env.DATA_BACKEND
  types.ts          → interface DataRepo + tipos de retorno (DocSnapshot, QuerySnapshot)
  firestoreRepo.ts  → implementação atual (fsOps) movida para trás da interface
  supabaseRepo.ts   → nova implementação (Supabase / Postgres)
  cache.ts          → camada de cache em memória com TTL/versão, compartilhada
```

- `DATA_BACKEND=firestore` (padrão) reproduz o comportamento atual byte a byte.
  `DATA_BACKEND=supabase` usa Postgres.
- A interface `DataRepo` espelha as assinaturas de `fsOps` para minimizar o diff
  em `app.ts`. Os objetos de retorno continuam expondo a mesma forma:
  - lista: `{ docs: Array<{ id: string; data(): any; exists(): boolean }>, empty: boolean }`
  - documento: `{ id: string; data(): any; exists(): boolean }`
- `app.ts` e `reminderWorker.ts` passam a importar `repo` de `src/backend/data`
  em vez de `fsOps` de `src/backend/firebase.ts`. Substituição textual
  `fsOps.` → `repo.` onde as assinaturas forem idênticas.
- Métodos da interface (nomes preservando `fsOps`):
  `collection`, `getDocsWithLimit`, `getDocs`, `getDoc`, `doc`, `set`, `update`,
  `delete`, `invalidateCache`, `getCollectionVersion`.
- Método novo dedicado para o worker: `getPendingReminders(nowIso: string)`,
  substituindo a query `where` crua. Implementado nos dois repos.

### `firestoreRepo`

O conteúdo atual de `src/backend/firebase.ts` (`fsOps` + cache + circuit breaker
+ armazenamento local de Modo de Teste) movido para `firestoreRepo.ts`, exposto
pela interface `DataRepo`. Sem mudança de comportamento. `src/backend/firebase.ts`
mantém apenas a inicialização do SDK (`initFirebase`, `getDb`) usada pelo
`firestoreRepo`.

### `supabaseRepo`

- Usa `@supabase/supabase-js` com a **service role key** (variável de ambiente
  `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`), apenas no backend.
- Uma tabela por coleção; leitura/escrita mapeadas assim:
  - `getDocs(coll)` → `select id, data from <schema>.<coll>` → mapeado para o
    formato `{ docs: [...], empty }`.
  - `getDoc(coll, id)` → `select ... where id = $1`.
  - `set(coll, id, obj)` → `upsert({ id, data: obj, updated_at: now() })`.
  - `update(coll, id, patch)` → merge no JSONB (`data = data || $patch`) ou
    read-modify-write dentro do repo, preservando a semântica de merge raso do
    `fsOps.update`.
  - `delete(coll, id)` → `delete where id = $1`.
  - `getDocsWithLimit(coll, n)` → `select ... limit n`.
- **Cache:** reaproveita `cache.ts` (mesma lógica de TTL/versão do `fsOps`), pois
  PostgREST tem latência de rede e o `invalidateCache` precisa continuar
  funcionando. **Removidos** nesta implementação: cache em disco
  (`saveCacheToDisk`/`loadCacheFromDisk`) e circuit breaker de quota.
- **Modo de Teste:** schema Postgres separado `test` com as mesmas tabelas.
  `getCollectionPrefix()` deixa de prefixar o nome e passa a selecionar o schema
  (`public` vs `test`) no `supabaseRepo`. Isolamento físico total.
- **Timestamps:** valores `Timestamp` do Firestore são normalizados para string
  ISO 8601 no backfill e em qualquer escrita subsequente. O JSONB guarda ISO
  string; a aplicação já lida com datas como string na maioria dos caminhos
  (confirmar por tabela no plano de implementação).

### Schema

`scripts/supabase/schema.sql`, versionado no repositório:

```sql
create schema if not exists test;

-- repetido para cada coleção, nos schemas public e test:
create table if not exists <schema>.<colecao> (
  id          text primary key,
  data        jsonb not null,
  updated_at  timestamptz not null default now()
);
```

Coleções: `invoices`, `xml_spendings`, `price_increases`, `suppliers`,
`categories`, `setores`, `product_categories`, `product_setores`,
`authorized_users`, `delivered_products`, `reminders`, `shopping_lists`,
`purchase_orders`, `pending_list_products`, `setor_limits`,
`reminders_pending`.

(A lista definitiva é derivada, no plano, de um grep de todos os literais de
coleção passados a `fsOps.*` em `src/backend/app.ts` e `reminderWorker.ts`.)

RLS permanece **desligada** nessas tabelas: a autorização é feita na camada de
aplicação e o acesso é só via service key no backend.

## Migração de dados (backfill único)

Script `scripts/supabase/migrate.ts`:

1. Aplica `schema.sql` (idempotente).
2. Para cada coleção: lê **direto do Firestore** (fonte da verdade — não os
   arquivos `firestore_cache_*.json`) e faz `upsert` em lote no Supabase,
   normalizando timestamps para ISO string.
3. Migra também as coleções `test_*` correspondentes para o schema `test`.
4. Emite relatório de contagem por coleção (Firestore vs Postgres) para
   conferência manual.
5. Idempotente: `upsert` por `id`, pode rodar novamente sem duplicar.

Volume total é pequeno (poucos MB somando todas as coleções); execução em
segundos, sem necessidade de downtime.

## Frontend

- `useReminders`, `useSuppliers`, `useCart`, `useDeliveredProducts`, `App.tsx`:
  substituir acessos diretos ao Firestore por chamadas às rotas `/api/xml/*`
  existentes. Criar as rotas que faltarem — no mínimo:
  - `POST /api/xml/reminders` (add), `POST /api/xml/reminders/update`,
    `POST /api/xml/reminders/delete` (o `GET /api/xml/reminders` já existe).
  - Verificar no plano se `useCart` / `useDeliveredProducts` / `App.tsx`
    precisam de rota nova ou se já há equivalente.
- `useAuth`:
  - Leitura/escrita de `authorized_users` → novas rotas
    `GET/POST /api/auth/users`, `POST /api/auth/users/status`,
    `POST /api/auth/users/delete`.
  - O `onSnapshot` em tempo real é substituído por **re-fetch** da rota: ao
    montar, ao focar a aba (`visibilitychange`), em intervalo leve (ex.: 60s) e
    após ações administrativas. Reação a mudança de permissão passa a ter
    latência de até ~1 min, aceitável para o caso de uso.
  - Caminho de upgrade documentado (não implementado agora): Supabase Realtime
    na tabela `authorized_users` para reação instantânea.
- `src/frontend/firebase.ts`: manter apenas a inicialização do **Auth**. Remover
  `initializeFirestore`, `persistentLocalCache`, `persistentMultipleTabManager`
  e os exports de Firestore, uma vez concluída a etapa 8.

## Ordem de execução (com rollback em cada ponto)

1. **Refactor sem mudança de comportamento.** Criar `src/backend/data/` com a
   interface e `firestoreRepo` (mover `fsOps`). `app.ts` e `reminderWorker.ts`
   chamam `repo.*`. `DATA_BACKEND` default `firestore`. Sistema idêntico ao
   atual; `npm run lint` limpo; teste manual dos fluxos principais.
2. **Fechar brechas do frontend.** Mover acessos diretos ao Firestore para rotas
   `/api/*` (criando as que faltam). Ainda 100% Firestore.
3. **Provisionar Supabase.** Projeto no plano free; aplicar `schema.sql` nos
   schemas `public` e `test`; configurar variáveis de ambiente na Vercel
   (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) sem ainda ativar.
4. **Implementar `supabaseRepo`** + `cache.ts` compartilhado + testes de
   paridade: mesmo input produz o mesmo formato de saída que `firestoreRepo`
   (usando fixtures dos `firestore_cache_*.json`).
5. **Backfill.** Rodar `migrate.ts`; conferir o relatório de contagens.
6. **Virar em preview.** Deploy de preview da Vercel com `DATA_BACKEND=supabase`.
   Teste manual do fluxo completo, incluindo Modo de Teste e o worker de
   lembretes.
7. **Virar em produção.** Setar `DATA_BACKEND=supabase` na env de produção.
   Rollback = voltar a env var para `firestore` (nada foi apagado).
8. **Limpeza** (após alguns dias estável). Remover `firestoreRepo` e seu uso, o
   SDK do Firestore (dependências `firebase`/`firebase-admin` no backend, se não
   usadas pelo Auth no servidor), arquivos `firestore_cache_*.json`,
   `firestore.rules`, `includeFiles` correspondentes em `vercel.json`, e a
   inicialização de Firestore em `src/frontend/firebase.ts`. Firebase Auth
   permanece.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Diferença de formato de retorno quebra os 168 call sites em `app.ts` | Interface espelha `fsOps`; testes de paridade na etapa 4; etapa 1 não muda comportamento |
| `Timestamp` do Firestore vs string ISO | Normalização no backfill e em toda escrita do `supabaseRepo`; auditoria campo a campo no plano |
| Conexões em ambiente serverless | `@supabase/supabase-js` é HTTP/PostgREST, sem pool — risco não se aplica |
| Modo de Teste vazar para dados de produção | Schema `test` fisicamente separado; teste explícito na etapa 6 |
| Perda do tempo real em permissões (`useAuth`) | Polling/re-fetch; caminho de upgrade para Supabase Realtime documentado |
| `invalidateCache` deixar de funcionar e servir dado velho | `cache.ts` compartilhado preserva a lógica de TTL/versão do `fsOps` |
| Política do plano free do Supabase mudar / projeto pausar por inatividade | Uso ativo diário evita pausa; backfill é idempotente e re-executável; rollback para Firestore continua disponível até a etapa 8 |
| Limite de 500 MB do plano free | Volume atual é de poucos MB; monitorar; normalização futura reduz footprint |

## Fora de escopo

- Substituir o Firebase Auth.
- Normalizar o schema (colunas tipadas por campo) — evolução posterior.
- Implementar Supabase Realtime.
- Alterar o comportamento funcional de qualquer tela.
