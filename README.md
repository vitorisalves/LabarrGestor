<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/bed5d8c6-de22-4942-9608-255e065ea8fb

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Acesso

- O login é com **conta Google**. Quem entra pela primeira vez fica como *pendente*; quem tem a permissão de aprovar acessos libera, e as permissões são definidas por pessoa nas Configurações.
- O **admin supremo** é a conta cujo e-mail Google (verificado) é igual à variável `SUPER_ADMIN_EMAIL`. Sem a variável, ninguém é admin. Essa conta não pode ser rebaixada, recusada nem removida.
- Toda a API (`/api`) exige uma pessoa aprovada, inclusive as leituras. Só `/api/health` e a chave pública de notificações são abertas.
- Para o login funcionar: ative o provedor **Google** em Firebase Authentication e inclua o domínio do site em *Authorized domains*.
- `DISABLE_PERMISSION_ENFORCEMENT=1` desliga o controle de acesso apenas em desenvolvimento local; é ignorado em produção e na Vercel.

## Segurança e operação

> **ATENÇÃO: `DATA_BACKEND=supabase` é obrigatório na Vercel.** O padrão do código é `firestore`, e as regras do Firestore agora negam todo acesso direto. Se essa variável faltar na Vercel, a API para de ler e gravar dados.

### Variáveis de ambiente

Obrigatórias em produção (Vercel):

| Variável | Para que serve |
| --- | --- |
| `SUPER_ADMIN_EMAIL` | E-mail Google (verificado) do admin supremo. Sem ela, ninguém é admin. |
| `DATA_BACKEND` | Deve ser `supabase`. Padrão do código: `firestore`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Acesso ao banco Supabase. |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | Notificações push. Sem elas o push fica desativado. |
| `G_API_KEY` (ou `GEMINI_API_KEY`) | Chave do Gemini. `G_API_KEY` tem prioridade. |

Opcionais:

| Variável | Padrão | Para que serve |
| --- | --- | --- |
| `VAPID_CONTACT_EMAIL` | `mailto:vitorisalves1@gmail.com` (padrão do código; o valor do `.env.example` é só um exemplo para você trocar) | Contato exibido aos serviços de push. |
| `OMIE_BASE_URL` | `https://production-manager-api.onrender.com/v1` | URL base da API externa. |
| `BODY_LIMIT` | `4mb` na Vercel, `10mb` local | Tamanho máximo do corpo das requisições. |
| `RATE_LIMIT_IP_PER_MIN` | `600` | Limite por IP, por minuto. |
| `RATE_LIMIT_USER_PER_MIN` | `300` | Limite por pessoa, por minuto. |
| `RATE_LIMIT_HEAVY_PER_MIN` | `20` | Limite por minuto nas rotas pesadas (IA, importação, planilha). |

Somente desenvolvimento local (**ignoradas ou proibidas em produção e na Vercel**; não devem existir lá):

- `DISABLE_PERMISSION_ENFORCEMENT=1`: desliga o controle de acesso.
- `RATE_LIMIT_DISABLED=1`: desliga o limite de requisições.
- `DISABLE_BACKGROUND_WORKER=1`: desliga o processo em segundo plano.
- `DATA_BACKEND=memory`: banco em memória, usado nos testes de integração.
- `DATA_BACKEND=firestore` só funciona com credencial de administrador (local).

### Limite de requisições (429)

A API limita requisições por minuto (por IP, por pessoa e, mais baixo, nas rotas de IA/importação/planilha). O limite é por instância. Ao passar, a resposta é **429** com um aviso e o cabeçalho `Retry-After`: é só esperar o tempo indicado e tentar de novo. Se o uso normal estiver esbarrando no limite, aumente `RATE_LIMIT_IP_PER_MIN`, `RATE_LIMIT_USER_PER_MIN` ou `RATE_LIMIT_HEAVY_PER_MIN` nas variáveis da Vercel.

### Cabeçalhos de segurança

- Do site: ficam em `vercel.json`.
- Da API: vêm do `helmet`.
- A **Content-Security-Policy está em modo somente relatório** (não bloqueia nada). Para ver o que ela reportaria, abra o site, tecle F12 e olhe o Console: os avisos de "Content Security Policy" aparecem ali. Aplicar a política de fato (deixar de ser só relatório) é um passo pequeno para uma próxima rodada, depois de revisar esses avisos.

### Testes

- Tipos: `npx tsc --noEmit`.
- Suíte direcionada: `npx tsx --test "src/shared/*.test.ts" "src/backend/auth/*.test.ts" "src/backend/*.test.ts" "src/backend/services/*.test.ts" "src/backend/integration/*.test.ts" src/backend/data/supabaseRepo.test.ts src/backend/data/version.test.ts src/backend/data/memoryRepo.test.ts src/backend/data/firestoreRepo.test.ts`.
- Os testes de integração usam `DATA_BACKEND=memory` (nada toca o banco real).

### Passos manuais do dono

Siga esta ordem (é a ordem segura de deploy):

1. Na Vercel, em **Production e Preview**, confirmar `DATA_BACKEND=supabase`, `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `SUPER_ADMIN_EMAIL`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` e `G_API_KEY`; e que `DISABLE_PERMISSION_ENFORCEMENT`, `RATE_LIMIT_DISABLED` e `DATA_BACKEND=memory` **não** existem.
   - VAPID: até agora o app pode ter usado a chave que estava no código. Sem as variáveis na Vercel o push fica desativado. A chave privada antiga continua no histórico do git, então é recomendável gerar um par NOVO (`npx web-push generate-vapid-keys`) e usar o mesmo par em Production e Preview. As pessoas se reinscrevem automaticamente na próxima vez que abrirem o site.
2. Fazer o deploy e rodar o "Smoke test depois do deploy" (abaixo).
3. **Só então** publicar o `firestore.rules` no Console do Firebase (as regras negam todo acesso direto). Antes disso não publique: um ambiente da Vercel que ainda use o backend Firestore deixaria de ler e gravar.
4. Restringir a chave de API Web do Firebase apenas por **Restrições de API**: Google Cloud Console → APIs e serviços → Credenciais → chave "Browser key" → Restrições de API → "Restringir chave" → marcar só Identity Toolkit API e Token Service API (e as APIs do Firebase realmente usadas, como Firebase Installations API ou Cloud Firestore API, se aparecerem).
   - O servidor confere o token do login com as chaves públicas do Google, sem usar a chave do navegador. Por isso, **depois que este deploy estiver no ar e o login testado**, você pode restringir a chave também por "Sites (referenciadores HTTP)": adicione o endereço de produção, `https://*.vercel.app/*` (Preview) e `http://localhost:*/*`. **Não aplique antes do deploy**: o servidor antigo chamava o Google com essa chave, sem Referer, e a API inteira daria 401.
   - Se depois de restringir o login por popup falhar, confira se o domínio usado está na lista de referenciadores.
5. Conferir que o domínio da Vercel está em *Authorized domains* do Firebase Authentication.

### Smoke test depois do deploy

- Login com Google (popup).
- Ativar/desativar notificações e receber um teste.
- Importar cerca de 30 XMLs.
- Importar e exportar a planilha de fornecedores (.xlsx).
- Importar e exportar as duas planilhas do DRE de Vendas.
- Abrir F12 → Console e copiar os avisos de "Content Security Policy".

## Integridade e auditoria

- Rode `scripts/supabase/add-audit-log.sql` no **SQL Editor do Supabase**, uma única vez, para criar a tabela de auditoria.
- O relatório `GET /api/xml/invoices/duplicates` (somente admin) lista possíveis notas repetidas. Ele só mostra os grupos; **nada é apagado**.
- Reimportar uma nota que já existe é ignorado, com aviso, e não altera a nota nem gera novo alerta de preço.
- A coleção `audit_log` guarda quem fez cada ação destrutiva (quem, o quê e quando).
