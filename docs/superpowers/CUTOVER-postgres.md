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

Rode `npx tsx scripts/supabase/migrate.ts` (e `npx tsx scripts/supabase/migrate.ts --test`)
depois que o script de migração chegar na Task 8; espere `✓ contagens conferem`.

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
