# Fase 1 — Acesso com Google e fechamento da API: plano de execução

> **Para quem executar:** use superpowers:subagent-driven-development (recomendado) ou superpowers:executing-plans. Passos usam checkbox (`- [ ]`).

**Objetivo:** trocar o login por CPF/sessão anônima por login Google verificado, tornar `compras.labarr@gmail.com` o admin supremo (via variável de ambiente) e exigir pessoa aprovada em toda a API (inclusive leituras).

**Arquitetura:** o servidor continua validando o token do Firebase pela REST `accounts:lookup` (sem Admin SDK), agora extraindo e-mail, `emailVerified` e provedor. Uma função pura `decideAccess` concentra toda a decisão de acesso (testável sem rede). O cadastro em `authorized_users` continua com o `uid` do Firebase como ID do documento (o uid de uma conta Google é estável e 1:1 com o e-mail verificado), ganhando o campo `email`. Cadastros antigos (uid anônimo) ficam inertes.

**Stack:** Express, TypeScript ESM (imports relativos com `.js` em `src/backend` e `src/shared`), Firebase Auth (Google), Supabase em produção, React/Vite, `node:test` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-10-20-seguranca-integridade-design.md` (Fase 1).

**Rulings:**
- Spec diz "cadastro identificado pelo e-mail"; aqui o ID do documento segue sendo o `uid` Google, com `email` gravado e conferido. Efeito igual, sem migrar IDs.
- Fases 2 e 3 terão cada uma o seu plano, escrito depois que a Fase 1 estiver no ar (o aprendido aqui muda o detalhe delas).

## Restrições globais
- Imports relativos em `src/backend` e `src/shared` terminam em `.js`.
- Arquivos do repo têm CRLF; edite sem trocar quebras de linha.
- Rodar só testes direcionados: `npx tsx --test src/shared/*.test.ts src/backend/*.test.ts src/backend/services/*.test.ts src/backend/data/supabaseRepo.test.ts` e `npx tsc --noEmit`. Nunca `npm test` completo.
- Nenhum CPF ou e-mail de admin escrito no código ao final.
- Commits só quando o dono pedir; cada tarefa termina num ponto que compila e passa nos testes.

## Estrutura de arquivos
- Criar `src/backend/auth/identity.ts` — `lookupIdentity(token)`; sem regra de negócio.
- Criar `src/backend/auth/accessGuard.ts` — `isSuperAdmin`, `decideAccess` (puro).
- Criar `src/backend/auth/accessGuard.test.ts`, `src/backend/auth/identity.test.ts`.
- Modificar `src/backend/app.ts` — middleware de acesso, rotas `/api/auth/*`, rotas sensíveis.
- Modificar `src/shared/permissions.ts` — regras de rota para GETs restritos.
- Modificar `src/frontend/firebase.ts`, `src/frontend/hooks/useAuth.ts`, `src/frontend/components/Login.tsx`, `src/frontend/utils/apiAuthFetch.ts`, `src/frontend/types.ts`, e o ponto onde `<Login>` é usado (`App.tsx`/`AppLayout.tsx`).
- Modificar `firestore.rules` (remover admin fixo), `.env.example`, `README.md`.

---

### Tarefa 1: Identidade do token (e-mail verificado + provedor)

**Arquivos:** criar `src/backend/auth/identity.ts`, `src/backend/auth/identity.test.ts`.

**Interfaces:**
- Produz: `interface Identity { uid: string; email: string; emailVerified: boolean; provider: string | null; name?: string; picture?: string }` e `lookupIdentity(token: string, deps?: { apiKey: string; fetchImpl?: typeof fetch }): Promise<Identity | null>`.

- [ ] **Passo 1: teste falhando** — `identity.test.ts` com `fetchImpl` falso:
  - resposta `{users:[{localId:'u1',email:'A@x.com',emailVerified:true,displayName:'Ana',photoUrl:'p',providerUserInfo:[{providerId:'google.com'}]}]}` → `{uid:'u1',email:'a@x.com',emailVerified:true,provider:'google.com',name:'Ana',picture:'p'}` (e-mail em minúsculas).
  - usuário anônimo (`providerUserInfo: []`, sem e-mail) → `provider: null`, `email: ''`, `emailVerified: false`.
  - `r.ok === false` → `null`; exceção no fetch → `null`; `users` vazio → `null`.
- [ ] **Passo 2:** rodar `npx tsx --test src/backend/auth/identity.test.ts` e ver falhar (módulo inexistente).
- [ ] **Passo 3: implementar** — POST em `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}` com `{idToken}`; ler `users[0]`; `provider = providerUserInfo.find(p => p.providerId === 'google.com') ? 'google.com' : (providerUserInfo[0]?.providerId ?? null)`; `email` em minúsculas e aparado; todo erro vira `null`.
- [ ] **Passo 4:** rodar o teste e ver passar; `npx tsc --noEmit`.

### Tarefa 2: Decisão de acesso pura (`decideAccess`)

**Arquivos:** criar `src/backend/auth/accessGuard.ts`, `src/backend/auth/accessGuard.test.ts`; modificar `src/shared/permissions.ts`.

**Interfaces:**
- Consome: `Identity` (tarefa 1); `requiredPermission`, `userCan`, `isAdminUser` de `../../shared/permissions.js`.
- Produz:
  - `isSuperAdmin(identity: Identity | null, superAdminEmail: string | undefined): boolean` — verdadeiro só se a variável existe, `identity.emailVerified`, `identity.provider === 'google.com'` e o e-mail (minúsculo) é igual.
  - `type StoredUser = { role?: string; status?: string; permissions?: string[]; email?: string } | null`
  - `type Decision = { ok: true; admin: boolean } | { ok: false; status: 401 | 403; error: 'unauthorized' | 'forbidden'; message: string; permission?: string | null }`
  - `decideAccess(input: { method: string; path: string; identity: Identity | null; stored: StoredUser; superAdminEmail?: string }): Decision` (`path` sem o prefixo `/api`).

**Regras (nesta ordem):**
1. Públicas sem login: `GET /health` e `GET /notifications/vapid-key` → `ok`.
2. Sem identidade, ou `!emailVerified`, ou provedor diferente de `google.com` → `401 unauthorized` ("Sessão expirada. Entre com sua conta Google.").
3. Super admin → `ok, admin: true` em qualquer rota.
4. Rotas `/auth/*` → `ok` para qualquer identidade válida (os handlers decidem).
5. `stored` nulo ou `status !== 'approved'` → `403 forbidden` ("Seu acesso ainda não foi aprovado.").
6. Leituras (`GET/HEAD/OPTIONS`): se o caminho começa por um prefixo de `ADMIN_ONLY_GET` (`/debug-db`) exige admin; senão `ok`.
7. Escritas: `rule = requiredPermission(path)`; `rule === null` → `ok`; `'admin'` → só admin; string → `userCan(stored, rule)`; senão `403` com `permission: rule`.

- [ ] **Passo 1: testes falhando** — tabela cobrindo: `/health` e vapid sem token; sem identidade → 401; anônimo (provider null) → 401; e-mail não verificado → 401; provedor `password` → 401; pendente → 403; negado → 403; aprovado sem permissão lendo → ok; aprovado sem permissão escrevendo em `/xml/suppliers` → 403 com `permission: 'suppliers.edit'`; aprovado com permissão → ok; `/debug-db` aprovado comum → 403, admin → ok; super admin pendente/sem cadastro → ok; e-mail do super admin **sem** verificação → 401; e-mail igual com caixa diferente → ok; `superAdminEmail` indefinido nunca dá admin; rota de escrita sem regra → só admin.
- [ ] **Passo 2:** ver falhar.
- [ ] **Passo 3: implementar** conforme as regras; em `permissions.ts` exportar `ADMIN_ONLY_GET = ['/debug-db']` (e usar também no front para esconder, se necessário).
- [ ] **Passo 4:** testes passam; `npx tsc --noEmit`; `npx tsx --test src/shared/permissions.test.ts` continua verde.

### Tarefa 3: Ligar o guard na API e fechar as leituras

**Arquivos:** modificar `src/backend/app.ts`.

**Interfaces:**
- Consome: `lookupIdentity`, `decideAccess`, `isSuperAdmin`.
- Produz: em `res.locals`: `identity` (Identity) e `authUser` (cadastro ou `null`); helpers `getIdentity(req)` com cache de 5 min por token (substitui `verifyUid`/`verifiedTokens`, mantendo o limite de 500 entradas).

- [ ] **Passo 1:** localizar o middleware `app.use('/api', ...)` (hoje só barra escritas) e `verifyUid`/`verifyUidRemote`/`getAuthUser`.
- [ ] **Passo 2:** substituir por um middleware único que, para toda requisição a `/api`: extrai o `Authorization: Bearer`, obtém a identidade (cache), carrega o cadastro por `uid` (`getAuthUser`, cache de 15 s), chama `decideAccess` e responde 401/403 com `{ error, message, permission }` (mesmo formato que o front já entende) ou segue com `res.locals` preenchido.
- [ ] **Passo 3:** `DISABLE_PERMISSION_ENFORCEMENT === '1'` passa a valer **somente** quando `NODE_ENV === 'test'`; em qualquer outro ambiente é ignorado e o servidor registra aviso no log se a variável estiver definida.
- [ ] **Passo 4:** `X-Test-Mode` só é lido depois do guard (hoje o `requestContext.run` vem antes; manter o contexto, mas a rota só executa para quem passou no guard — nada a mudar além de a ordem dos middlewares garantir o guard antes das rotas).
- [ ] **Passo 5:** remover `GET /api/quota-status/reset` do acesso aberto não é necessário (já é POST → admin); conferir que `GET /api/quota-status` fica atrás do login.
- [ ] **Passo 6:** teste HTTP no padrão de `src/backend/data/routes.reminders.test.ts`: subir o app, chamar `GET /api/xml/invoices` e `GET /api/auth/users` sem token → 401; `GET /api/health` → 200. (A parte com token válido é coberta pelos testes puros da tarefa 2; o teste HTTP injeta `lookupIdentity` falso se o padrão do arquivo permitir; caso contrário limita-se aos casos sem token.)
- [ ] **Passo 7:** `npx tsc --noEmit` e os testes direcionados.

### Tarefa 4: Rotas `/api/auth/*` sem CPF como chave

**Arquivos:** modificar `src/backend/app.ts`; criar `src/backend/auth/users.test.ts` se a lógica de decisão for extraída para funções puras.

**Comportamento novo:**
- `POST /api/auth/session` (substitui `users/upsert`): sem corpo relevante; usa a identidade do token. Se já existe cadastro para o `uid`, atualiza `lastLogin`, `name`, `picture`, `email` **sem tocar** `status`, `role`, `permissions`. Se não existe, cria `{ uid, email, name, picture, status: 'pending', role: 'user', permissions: [], requestDate, lastLogin }`. Se `isSuperAdmin(identity)`: grava/garante `role: 'admin'`, `status: 'approved'`. CPF opcional vindo do corpo é guardado só como texto informativo (somente dígitos, 11 posições), nunca usado para decidir nada, e nunca herda cadastro de outro uid. Responde o cadastro resultante (sem campos internos).
- `GET /api/auth/users/me`: usa a identidade do token (ignora `?uid=`); devolve o cadastro ou `null`; para o super admin devolve um cadastro admin mesmo se o documento ainda não existir.
- `GET /api/auth/users`: permitido só para admin ou quem tem `users.approve`/`users.manage`; os demais recebem 403.
- `POST /api/auth/users/status`, `/delete`, `/permissions`: mantêm as regras atuais **mais**: nada pode alterar, recusar, remover ou mudar permissões de quem é super admin (comparação por e-mail do cadastro alvo com `SUPER_ADMIN_EMAIL`, ou por `uid` do super admin); remover o próprio cadastro continua permitido a quem não é super admin.
- Remover `ADMIN_CPF`, a lógica "herda acesso pelo CPF" e a remoção automática de cadastros do mesmo CPF.

- [ ] **Passo 1:** extrair para funções puras (em `accessGuard.ts` ou novo `auth/users.ts`) a decisão "este alvo é protegido" e "quem pode mexer em quem", com testes: super admin não rebaixável/removível/recusável por admin comum nem por si mesmo via `delete` de outro; usuário comum não mexe em admin; `users.approve` só mexe em pendentes; sem `SUPER_ADMIN_EMAIL` nada é protegido por e-mail.
- [ ] **Passo 2:** reescrever as rotas conforme acima; remover constantes e ramos de CPF.
- [ ] **Passo 3:** testes puros passam; `tsc` limpo; `grep` por `05839352144` e `vitorisalves` no `src/` deve retornar vazio nas pastas de backend (o front é limpo na tarefa 6).

### Tarefa 5: Rotas sensíveis e demais exceções

**Arquivos:** modificar `src/backend/app.ts`.

- [ ] **Passo 1:** `GET /api/debug-db`: já coberto por `ADMIN_ONLY_GET`; remover `projectId` e `firestoreDatabaseId` da resposta (devolver só contagem e erro).
- [ ] **Passo 2:** `GET /api/excel-sync`, `GET /api/omie-direct/products`, `ALL /api/v1/*`: ficam atrás do login (já garantido pela tarefa 3). Em `/api/v1/*`, rejeitar `subPath` que contenha `..` ou `//` com 400.
- [ ] **Passo 3:** `POST /api/xml/cache/invalidate` e `/notifications/subscribe` já exigem aprovado (regra `null`); conferir.
- [ ] **Passo 4:** `tsc` e testes direcionados.

### Tarefa 6: Front — login Google e token em todas as chamadas

**Arquivos:** modificar `src/frontend/firebase.ts`, `src/frontend/hooks/useAuth.ts`, `src/frontend/components/Login.tsx`, `src/frontend/utils/apiAuthFetch.ts`, `src/frontend/types.ts`, e o componente que renderiza `<Login>` (buscar `<Login` em `App.tsx`/`AppLayout.tsx`).

**Comportamento:**
- `firebase.ts`: já exporta `GoogleAuthProvider` e `signInWithPopup`; manter. Usar `googleProvider.setCustomParameters({ prompt: 'select_account' })`.
- `apiAuthFetch.ts`: anexar `Authorization: Bearer` em **todas** as chamadas a `/api` (não só gravações); excetuar `/api/health` e `/api/notifications/vapid-key`. Em 401 disparar o evento já existente e, se for 401 de sessão, chamar `signOut`.
- `useAuth.ts`: remover `signInAnonymously`, `handleLogin` por CPF, `resetAnonymousSession`, CPF/e-mail/nome fixos (`isAdmin` por CPF, por e-mail `vitorisalves1@gmail.com` e por "VITOR"). Novo fluxo: `onAuthStateChanged` → se há usuário Google, `POST /api/auth/session` e depois `GET /api/auth/users/me`; `isAdmin`, `isApproved` e `can()` vêm somente do que o servidor devolve (`myAccess`). Expor `loginWithGoogle()` (popup) e `handleLogout()` (`signOut`). Estados: sem sessão → tela de login; sessão pendente → tela "aguardando aprovação" com o e-mail e botão sair; aprovado → app. Polling de 60 s do `/users/me` permanece (detecta aprovação).
- `Login.tsx`: trocar o formulário por botão "Entrar com Google" (mantendo o visual atual), mensagem de erro e aviso "acesso restrito a contas aprovadas". Remover props de CPF/nome.
- `types.ts`: `AuthorizedUser` ganha `email?: string`, `picture?: string`; `cpf` vira opcional.
- Telas de gerenciamento de acessos (Configurações): listar por nome/e-mail (CPF, se existir, como informação).

- [ ] **Passo 1:** ajustar tipos e `apiAuthFetch.ts`.
- [ ] **Passo 2:** reescrever `useAuth.ts` e `Login.tsx`; atualizar quem consome o hook (props `loginCpf`, `loginName`, `authorizedCpfs`).
- [ ] **Passo 3:** `npx tsc --noEmit` limpo (aponta todos os usos antigos).
- [ ] **Passo 4:** `grep` por `05839352144`, `vitorisalves`, `VITOR`, `signInAnonymously` em `src/` deve retornar vazio.
- [ ] **Passo 5:** `npm run build` (só `vite build`/`tsc` se o build completo for lento) para confirmar que compila.

### Tarefa 7: Regras do Firestore, variáveis e documentação

**Arquivos:** modificar `firestore.rules`, `.env.example`, `README.md`.

- [ ] **Passo 1:** em `firestore.rules`, remover as condições de admin por e-mail/CPF fixos. As regras abertas das demais coleções são tratadas na Fase 3 (aqui só se tira o admin escrito no código).
- [ ] **Passo 2:** `.env.example`: adicionar `SUPER_ADMIN_EMAIL=compras.labarr@gmail.com` com comentário explicando que sem ela ninguém é admin.
- [ ] **Passo 3:** `README.md`: seção curta "Acesso": login Google, admin supremo por variável, fluxo de aprovação, como autorizar o domínio no Firebase.

### Tarefa 8: Verificação final e lista de corte

- [ ] **Passo 1:** rodar `npx tsc --noEmit` e os testes direcionados; relatar resultados.
- [ ] **Passo 2:** revisão do diff completo (login, guard, rotas) contra a spec, Fase 1.
- [ ] **Passo 3 (manual do dono, antes do deploy):**
  1. Console do Firebase → Authentication → Sign-in method → ativar **Google**.
  2. Authentication → Settings → Authorized domains → incluir `gestor-fornecedor.vercel.app`.
  3. Vercel → Settings → Environment Variables → `SUPER_ADMIN_EMAIL=compras.labarr@gmail.com` (Production e Preview); conferir que `DISABLE_PERMISSION_ENFORCEMENT` **não** existe.
  4. Escolher o horário do corte e avisar a equipe que será preciso entrar com o Google e aguardar aprovação.
- [ ] **Passo 4 (pós-deploy, dono):** entrar com `compras.labarr@gmail.com` → deve aparecer como admin; abrir `https://gestor-fornecedor.vercel.app/api/xml/invoices` numa aba anônima → deve dar 401; entrar com uma segunda conta Google → deve ficar pendente; aprovar e dar permissões.
- [ ] **Passo 5:** commit e push só quando o dono pedir.

---

## Verificação contra a spec (Fase 1)
- 1.1 Login Google: tarefas 1, 4, 6. · 1.2 Admin supremo: tarefas 2, 4, 6, 7. · 1.3 Fechamento das rotas: tarefas 2, 3, 5. · 1.4 Corte: tarefa 8. · 1.5 Testes: tarefas 1, 2, 3, 4.

## Risco e reversão
- A Fase 1 derruba o acesso de todos até a reaprovação (esperado). Para reverter: redeploy do commit anterior na Vercel; os dados não são alterados por esta fase (só se criam novos cadastros).

## Próximos planos
- `2026-10-XX-fase2-integridade.md` e `2026-10-XX-fase3-endurecimento.md`, escritos com o código real depois da Fase 1 no ar.
