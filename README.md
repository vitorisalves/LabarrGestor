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
