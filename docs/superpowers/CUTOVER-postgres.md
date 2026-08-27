# Cutover: Firestore → Supabase (Postgres)

Runbook para o operador manual. Segue a migração incremental: código suporta os dois
backends via `DATA_BACKEND`, e a produção só troca depois de validar em Preview.

## Setup

1. No painel do Supabase, crie um novo projeto:
   - Plano **Free**.
   - Região: **South America** (São Paulo) se disponível; senão a mais próxima.
   - Guarde a senha do banco em local seguro.
2. Em **Settings → API**, copie:
   - **Project URL** → vai para `SUPABASE_URL`.
   - **service_role** secret key (seção "Project API keys") → vai para `SUPABASE_SERVICE_KEY`.
     Nunca commite essa key; ela ignora RLS.
3. Abra o **SQL Editor**, cole todo o conteúdo de `scripts/supabase/schema.sql` e execute.
   Confirme no **Table Editor** que as 16 tabelas aparecem tanto em `public` quanto em `test`.
4. Em **Settings → API → Exposed schemas**, adicione `test` à lista (deixe `public` também).
   Salve. Sem isso o PostgREST não enxerga o schema de Modo de Teste.

## Env vars

Local (`.env`, copiado de `.env.example`):

```
DATA_BACKEND=firestore
SUPABASE_URL=https://<ref>.supabase.co
SUPABASE_SERVICE_KEY=<service_role key>
```

Vercel — **Preview** e **Production** (Settings → Environment Variables):

- `DATA_BACKEND` — em Preview pode ser `supabase` para testar; em **Production mantenha
  `firestore`** (ou não defina) até o cutover de produção.
- `SUPABASE_URL` — o Project URL, em ambos os ambientes.
- `SUPABASE_SERVICE_KEY` — a service_role key, marcada como secret, em ambos os ambientes.

## Backfill

Pré-requisitos:

- `.env` com `SUPABASE_URL` e `SUPABASE_SERVICE_KEY` (o script tem um carregador de `.env`
  embutido; não depende de `dotenv`).
- Rodar **localmente** com credenciais do Firebase Admin SDK — o Admin SDK só inicializa
  fora da Vercel, via `gcloud auth application-default login` ou
  `GOOGLE_APPLICATION_CREDENTIALS=/caminho/para/service-account.json`. Sem isso o script
  aborta com "Admin SDK unavailable".

Passos:

1. `npx tsx scripts/supabase/migrate.ts` — coleções sem prefixo → schema `public`.
2. `npx tsx scripts/supabase/migrate.ts --test` — coleções `test_*` → schema `test`
   (várias podem ter 0 docs; tudo bem).

Em ambos, espere a lista por coleção terminando em `✓ contagens conferem` (exit 0). Se
aparecer `⚠ divergências: <nomes>` (exit 1), investigue as coleções listadas antes de
prosseguir. Use `--only=coll1,coll2` para reprocessar um subconjunto.

### Quota do Firestore esgotada

Se `migrate.ts` abortar com `RESOURCE_EXHAUSTED: Quota exceeded`, a cota diária de
leituras do Firestore acabou (reseta à meia-noite no horário do Pacífico). Opções:

- **Esperar o reset** e rodar `migrate.ts` de novo (é idempotente — upsert por id).
- **Seed a partir do cache** para não ficar bloqueado: `npx tsx scripts/supabase/seed-from-cache.ts`
  (e `--test`) popula o Postgres a partir dos snapshots `firestore_cache_*.json` da raiz
  do repo. Serve para exercitar o app num deploy de **preview**; **não é autoritativo**.
  Antes da virada de produção, rode `migrate.ts` ao vivo para reconciliar.

### Grants do schema `test`

Um schema criado pelo SQL Editor não herda os grants padrão do Supabase. Se ler/escrever
em `test` der `permission denied for schema test`, rode no SQL Editor (já incluído no
`schema.sql`, mas pode ser aplicado à parte):

```sql
grant usage on schema test to service_role;
grant all privileges on all tables in schema test to service_role;
alter default privileges in schema test grant all privileges on tables to service_role;
```

Rode o backfill de novo imediatamente antes do cutover de produção para reconciliar os
dados criados desde a última execução.

## Preview cutover checklist

Validar em um deploy de Preview com `DATA_BACKEND=supabase` (detalhado na Task 9):

- [ ] Login / autenticação
- [ ] Fornecedores: criar, editar, excluir
- [ ] Categorias e setores
- [ ] Dashboard carrega com os números corretos
- [ ] Lembretes
- [ ] Importação de XML
- [ ] Pedidos de compra (purchase orders)
- [ ] Isolamento do Modo de Teste (schema `test` separado do `public`)
- [ ] Push notifications
- [ ] Ícone de "Quota Exceeded" some (não há mais Firestore no caminho de escrita)

## Production cutover

1. Rode o backfill de novo para reconciliar dados criados desde o último backfill.
2. Em **Vercel Production**, defina `DATA_BACKEND=supabase` e faça redeploy.
3. Monitore de 3 a 7 dias (erros, contagens, relatos de usuários).
4. Rollback: remover `DATA_BACKEND` ou voltar para `firestore` na Production e redeploy.
   O Firestore permanece intacto durante a janela de monitoramento.

## SECURITY NOTE

As rotas de escrita de `authorized_users` (`/api/auth/users/upsert`, `/api/auth/users/status`,
`/api/auth/users/delete`) são protegidas por verificação de Firebase ID token via o endpoint
REST do identitytoolkit (sem Admin SDK). Durante o checklist de Preview, confirme que:

- Admin consegue aprovar/negar usuários.
- Auto-registro de novo usuário funciona.

Um `401` nessas rotas significa que a verificação de token está se comportando mal no runtime
da Vercel — investigar antes de prosseguir para produção.

`schema.sql` habilita **RLS sem políticas** em todas as 32 tabelas. O backend usa a
`service_role` key, que ignora RLS, então a aplicação não é afetada; acesso via anon key
fica bloqueado. O SQL Editor / Table Editor do Supabase roda como `postgres` (dono das
tabelas) e continua enxergando tudo normalmente.
