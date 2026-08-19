# Refatoração do DashboardView.tsx — Design

## Contexto e motivação

`src/frontend/components/DashboardView.tsx` tem 3047 linhas e reúne cerca de
8 funcionalidades praticamente independentes num único componente: modal de
preview de importação em lote, cards de resumo, gestão de produtos pendentes
de listas de compras, painel de upload/logs de XML, gráfico de gasto mensal,
gráfico de pizza por categoria + editor de categorias, painel de logs do
sistema, tabela de aumentos de preço e painel de análise/histórico de preço
por produto.

Isso é o primeiro de vários sub-projetos de uma refatoração maior do sistema
(organização de código + modelo de dados), motivada por três problemas
observados: duplicação/redundância de dados entre coleções, o sistema batendo
no limite de cota do Firestore rapidamente, e dificuldade de manutenção por
causa de arquivos grandes. Este documento cobre **apenas** o `DashboardView.tsx`.

O sistema está em produção ativa com dados reais — por isso a refatoração
precisa ser incremental, sem downtime, sem alterar comportamento visível ao
usuário, e com verificação manual no navegador a cada etapa.

## Achado relevante: acesso direto ao Firestore

Durante a exploração, foi identificado que `DashboardView.tsx` acessa o
Firestore diretamente do navegador em 3 pontos (`getDocs` para `suppliers` e
`xml_spendings`, `deleteDoc` para `xml_spendings`), usando o SDK cliente do
Firebase em vez da API do backend. Isso tem duas consequências:

- Essas leituras/escritas não passam pelo cache do backend (`fsOps`), o que
  contribui para o consumo de cota do Firestore.
- Essas leituras/escritas não respeitam o Modo de Teste (não usam o prefixo
  `test_`), então essa parte do Dashboard sempre acessa dados reais mesmo com
  o Modo de Teste ligado.

Um levantamento mais amplo mostrou que esse padrão de acesso direto ao
Firestore também existe em 6 outros hooks do frontend (`useCart.ts`,
`useSuppliers.ts`, `useDeliveredProducts.ts`, `useReminders.ts`,
`useAuth.ts`, e a leitura em `App.tsx`/`firestoreUtils.ts` foi descartada por
não ter acesso direto). Migrar todos esses hooks é maior que este
sub-projeto e fica **fora de escopo aqui** — é candidato a um sub-projeto
futuro, com seu próprio design.

**Restrição importante**: os dados de `xml_spendings`/`invoices` alimentam
várias partes do sistema (ver regra 8 de `agents/agents.md` — atualização de
preço/data propagada para fornecedores, mercado e materiais). Este
sub-projeto não muda nenhuma coleção, endpoint existente ou o formato dos
dados — apenas troca a *origem* das 3 chamadas do Dashboard (de Firestore
direto para os mesmos endpoints de API que o resto do sistema já usa), e
adiciona um endpoint novo para permitir excluir um `xml_spendings`
corretamente.

## Escopo

**Dentro do escopo:**
- Dividir `DashboardView.tsx` em componentes e hooks menores, um por área
  funcional.
- Corrigir os 3 acessos diretos ao Firestore dentro do `DashboardView.tsx`,
  fazendo-os passar pela API do backend (`GET /api/xml/suppliers`, `GET
  /api/xml/spendings`, e um novo `DELETE /api/xml/spendings/:id`).
- Preservar exatamente o comportamento visível hoje (nenhuma mudança de UX).

**Fora do escopo:**
- Migrar `useCart.ts`, `useSuppliers.ts`, `useDeliveredProducts.ts`,
  `useReminders.ts`, `useAuth.ts` para a API do backend.
- Qualquer mudança no modelo de dados (nomes/estrutura de coleções).
- Qualquer mudança de comportamento ou UX visível ao usuário.

## Achado adicional: exclusão de `xml_spendings` já inconsistente

A função `handleDeleteXmlSpending` hoje pula a chamada `deleteDoc` do
Firestore quando o Modo de Teste está ativo (`if (!isTestMode)`), mas chama
`DELETE /api/xml/invoices/:id` de qualquer forma. Esse endpoint apaga o
documento da coleção `invoices`, não de `xml_spendings` — ou seja, hoje, em
Modo de Teste, o registro de gasto nunca é de fato removido de
`xml_spendings`, só some da tela. O novo endpoint `DELETE
/api/xml/spendings/:id` corrige isso para os dois modos (teste e produção),
usando o mesmo mecanismo de prefixo (`test_`) que todo o resto do backend já
usa.

## Arquitetura

`DashboardView.tsx` passa a ser um componente "casca": mantém apenas o
estado que é genuinamente compartilhado entre seções (intervalo de datas do
filtro, lista de categorias) e orquestra a composição dos componentes
filhos. Cada área funcional ganha seu próprio arquivo de hook (dados) e/ou
componente (apresentação), seguindo o mesmo padrão já usado em hooks como
`useReminders.ts`.

## Componentes e hooks a extrair

| Arquivo novo | Responsabilidade | Tipo de mudança |
|---|---|---|
| `hooks/useXmlSpendings.ts` | Busca (`GET /api/xml/spendings`) e exclusão (`DELETE /api/xml/spendings/:id`, novo) de gastos XML | Comportamento (corrige acesso direto ao Firestore) |
| `components/dashboard/BatchImportPreviewModal.tsx` | Modal de preview de importação em lote | Só organização |
| `components/dashboard/DashboardStatsCards.tsx` | Cards de resumo (gasto total, nº faturas, ticket médio) | Só organização |
| `components/dashboard/PendingListProductsPanel.tsx` + `hooks/usePendingListProductsPanel.ts` | Produtos pendentes de listas de compras (ações em lote, exclusão) | Só organização |
| `components/dashboard/MonthlySpendChart.tsx` | Gráfico de área do gasto mensal | Só organização |
| `components/dashboard/CategoryPieChart.tsx` | Gráfico de pizza por categoria | Só organização |
| `components/dashboard/CategoryEditorPanel.tsx` | Painel de busca/edição de categorias de produto | Só organização |
| `components/dashboard/SystemLogsPanel.tsx` | Painel de logs do sistema | Só organização |
| `components/dashboard/PriceIncreasesTable.tsx` | Tabela de produtos com aumento de preço | Só organização |
| `components/dashboard/PriceAnalysisPanel.tsx` | Análise/histórico de preço por produto (top 10, busca) | Só organização |

## Backend

Novo endpoint em `src/backend/app.ts`:

```
DELETE /api/xml/spendings/:id
```

Apaga o documento correspondente na coleção `xml_spendings` (respeitando o
prefixo de Modo de Teste via `fsOps`), invalida o cache de `xml_spendings`,
e retorna `{ status: 'deleted' }` ou `{ status: 'not_found' }`, seguindo o
mesmo padrão de `deleteInvoiceHelper` já existente no arquivo.

## Fluxo de dados

Cada hook novo é responsável só pela sua fatia: busca via API do backend,
mantém seu próprio estado de loading/erro, expõe funções de mutação. O
`DashboardView.tsx` não contém lógica de negócio própria — só decide o que é
compartilhado entre seções e repassa como prop.

## Tratamento de erros

Mantido exatamente como está hoje: `try/catch` com log no console e
mensagem no log de sistema da tela, `window.confirm` antes de exclusões.
Nenhuma mudança de comportamento visível ao usuário nesta etapa.

## Plano de execução (ordem por risco crescente)

Cada etapa é verificada manualmente no navegador (fluxo da seção
correspondente) e commitada isoladamente antes de seguir para a próxima:

1. `DashboardStatsCards.tsx` e `SystemLogsPanel.tsx` — puramente visuais, sem
   mutação de dados.
2. `MonthlySpendChart.tsx` e `CategoryPieChart.tsx` — leitura de dados já
   existentes, sem mutação.
3. `BatchImportPreviewModal.tsx` — modal de preview, sem mudar a lógica de
   importação em si.
4. `PriceIncreasesTable.tsx` e `PriceAnalysisPanel.tsx` — leitura, sem
   mutação.
5. `PendingListProductsPanel.tsx` — ações em lote e exclusão, mais sensível.
6. `useXmlSpendings.ts` + correção do acesso direto ao Firestore + novo
   endpoint `DELETE /api/xml/spendings/:id` — por último, é a única etapa
   que muda comportamento real (não só organização).

## Testes

Não há suíte de testes automatizados para este componente. A verificação é
manual: após cada etapa, rodar o servidor de desenvolvimento e testar no
navegador o fluxo golden-path da seção extraída, além de conferir que as
demais seções do Dashboard continuam funcionando (regressão visual/funcional
rápida). `npx tsc --noEmit` é rodado após cada etapa para garantir que não há
erros de tipo.

## Trabalho futuro (fora deste documento)

- Migrar `useCart.ts`, `useSuppliers.ts`, `useDeliveredProducts.ts`,
  `useReminders.ts` e `useAuth.ts` para passar pela API do backend em vez de
  acessar o Firestore diretamente do navegador.
- Revisão do modelo de dados (duplicação entre `invoices`, `xml_spendings`,
  `price_increases`, `product_categories`/`categories`).
- Divisão de outros arquivos grandes (`DREVendasView.tsx`, `app.ts`,
  `AIView.tsx`, `App.tsx`, `firebase.ts`).
