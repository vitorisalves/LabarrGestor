# Segurança e integridade — design em 3 fases

## Contexto
Revisão de 2026-10-20 encontrou: (1) qualquer pessoa vira admin enviando o CPF do admin (CPF fixo no código, login por sessão anônima do Firebase + CPF digitado); (2) todas as rotas GET da API são públicas, inclusive a lista de usuários com CPF; (3) regras do Firestore com `allow read, write: if true`; (4) dependências vulneráveis (23, 2 críticas); (5) confirmação da lista não é idempotente, sem validação de valores, sem controle de concorrência, sem auditoria.

## Decisões já tomadas
- Login: **conta Google** (Firebase Auth, provedor Google). O CPF deixa de ser chave de acesso.
- Admin supremo: **compras.labarr@gmail.com**, definido por variável de ambiente.
- Migração: **reaprovação geral** (ninguém herda o acesso antigo).
- Entrega: **3 fases em sequência**, cada uma com deploy e teste antes da seguinte. A Fase 1 vai sozinha, em horário combinado.

---

## Fase 1 — Acesso

### 1.1 Login com Google
- O botão "Entrar com Google" substitui a sessão anônima e o campo de CPF.
- O servidor valida o ID token do Firebase e exige `email_verified = true` e provedor Google.
- O cadastro (`authorized_users`) passa a ser identificado pelo e-mail (minúsculo). Campos: e-mail, nome, foto, status, papel, permissões, `requestDate`, `lastLogin`. CPF vira campo opcional informativo; nunca concede acesso nem herda cadastro.
- Primeiro login de e-mail desconhecido: cria cadastro `pending`. Aprovação continua com `users.approve`/`users.manage`, como hoje.
- Cadastros antigos (por CPF/uid anônimo) não concedem nada. Ficam inertes; o admin pode limpá-los.

### 1.2 Admin supremo
- `SUPER_ADMIN_EMAIL` (variável de ambiente no servidor). É admin quem tem token com esse e-mail e `email_verified`. Sem a variável, ninguém é admin.
- A conta não pode ser rebaixada, recusada, removida nem ter permissões alteradas por ninguém.
- Removidos do código: `ADMIN_CPF`, e-mail `vitorisalves1@gmail.com`, a checagem por nome ("VITOR") e as regras de admin no `firestore.rules`.

### 1.3 Fechamento das rotas
- Todo `/api` exige pessoa aprovada (inclusive GET). Exceções: `GET /api/health` e `GET /api/notifications/vapid-key`.
- `GET /api/auth/users`: só para quem tem `users.approve` ou `users.manage` (ou admin). Os demais obtêm apenas o próprio cadastro (`/users/me`, que passa a usar o e-mail do token, não um `uid` da query).
- `debug-db`: somente admin (ou removido). `excel-sync`, `omie-direct/products` e `/api/v1/*`: exigem login (leitura) e as demais regras de escrita atuais.
- `X-Test-Mode` só vale para quem está logado e aprovado.
- Respostas: 401 sem token/token inválido/e-mail não verificado; 403 para pendente, negado ou sem permissão.

### 1.4 Corte
- Antes: configurar `SUPER_ADMIN_EMAIL` na Vercel; ativar o provedor Google e autorizar o domínio da Vercel no console do Firebase.
- Deploy único. Em seguida o admin entra, confirma o papel e aprova as demais pessoas com as permissões necessárias.

### 1.5 Testes
- Automáticos (guard): sem token, token anônimo, e-mail não verificado, pendente, negado, aprovado sem permissão, aprovado com permissão, admin supremo, e-mail de admin sem verificação (deve falhar).
- Automáticos: admin supremo não pode ser alterado/removido por outro admin; `GET /api/auth/users` bloqueado para quem não gerencia acessos.
- Manual (produção): login, aprovação de uma segunda conta, chamada de URL da API sem login (deve dar 401).

---

## Fase 2 — Integridade dos dados

### 2.1 Confirmação idempotente
- O ID do gasto confirmado passa a ser derivado do item pendente (estável), sem sufixo aleatório. Repetir a confirmação regrava o mesmo registro. Item sem ID pendente recebe um identificador gerado no cliente e enviado na requisição.
- Front desabilita o botão durante a confirmação.

### 2.2 Validação de valores
- Preço: número finito, ≥ 0. Quantidade: número finito, > 0. Limites máximos razoáveis. Erro 400 com mensagem em português.
- Aplicada a confirmação, listas, pedidos, limites de setor e importação manual.

### 2.3 Gravações simultâneas
- Rotas lê-altera-grava (`shopping_lists/update-items`, histórico de preços, ajustes de pedidos) usam controle por versão (`updated_at`). Conflito responde 409 "o registro mudou, recarregue".

### 2.4 Nota duplicada
- A chave de acesso da NF-e é o identificador da nota. Reimportar o mesmo XML não grava de novo e avisa que a nota já existe.
- Antes de ativar, verificação somente leitura de duplicatas já existentes; nada é apagado sem decisão do dono.

### 2.5 Auditoria e exclusão segura
- Tabela de auditoria (quem, quando, ação, alvo, antes/depois) para: apagar nota, fornecedor, produto, `delete-all`, reset de gastos da lista, mudança de permissões e de acessos.
- Ações em massa exigem confirmação explícita no pedido (contagem de itens afetados).
- Backup do Supabase: verificar com o dono se está ativo (item operacional, não de código).

### 2.6 Erros
- Produção devolve mensagem genérica com código de referência; detalhe técnico fica no log do servidor.

### 2.7 Testes
- Automáticos: confirmação repetida (um registro), valores inválidos, conflito de versão, nota duplicada.
- Manual: confirmar lista com duplo clique; importar o mesmo XML duas vezes; conferir Faltando NF e Gasto no Período (regras em `2026-10-16-faltando-nf-design.md`).

---

## Fase 3 — Endurecimento

### 3.1 Dependências
- `npm audit fix` para o que tem correção sem quebra de versão maior; maiores só com aviso ao dono. Rodar build, `tsc` e testes.
- Trocar `xlsx` por `exceljs` (servidor e front); validar com uma planilha real antes/depois.
- Verificação de vulnerabilidades críticas no repositório.

### 3.2 Limite de requisições
- Limite por pessoa logada e geral por IP; mais baixo nas rotas de IA e importação. 429 com mensagem em português. Contador por instância (suficiente para começar).

### 3.3 Firestore
- Confirmar que nada lê o Firestore direto do navegador; então regras `negar tudo` (o backend usa conta de serviço). Remover coleções `test_*` abertas e admin fixo das regras.

### 3.4 Cabeçalhos, CORS e tamanho
- `helmet` (CSP, nosniff, frame-ancestors), CORS limitado ao domínio da Vercel, limite de corpo ajustado ao da Vercel (4,5 MB) com mensagem clara.

### 3.5 Organização
- `.gitattributes` para quebras de linha.
- Dividir `app.ts` por domínio, sem mudar comportamento, em commit separado e só com os testes de guard/rotas das fases anteriores cobrindo.
- Testes de integração dos fluxos de dinheiro (confirmar, importar, descontar, resetar).

### 3.6 Configuração
- Garantir `DISABLE_PERMISSION_ENFORCEMENT` ausente em produção; restringir a chave de API do Firebase por domínio; atualizar `.env.example` e documentação (`SUPER_ADMIN_EMAIL` etc.).

---

## Fora de escopo
- 2FA próprio (a conta Google já oferece), monitoramento externo de erros, reescrita do modelo de dados e transações de banco. Podem virar Fase 4.

## Riscos aceitos
- Na Fase 1 todos perdem o acesso até a reaprovação (esperado, em horário combinado).
- Sessões abertas antes do corte deixam de funcionar.
- Login Google exige domínio autorizado no Firebase Auth.
