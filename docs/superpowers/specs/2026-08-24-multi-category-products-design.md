# Categorias múltiplas por produto + aba Produtos unificada

Data: 2026-08-24
Status: aprovado para planejamento

## Contexto

Hoje cada produto (`Product.category`) só pode ter **uma** categoria, escolhida a
partir da lista de categorias criadas pelo usuário (coleção `categories`, gerida
em Configurações via `addCategory`/`deleteCategory`). Os produtos vivem
aninhados dentro do documento do fornecedor (`Supplier.products[]`) — não são
uma coleção própria no banco.

Na sidebar de Compras (`SuppliersView.tsx`), a navegação tem hoje 4 abas:
`Fornecedores`, `Mercado`, `Materiais`, `Importar XML`. `Mercado` e `Materiais`
são, na prática, fornecedores especiais (`name === 'MERCADO'` /
`name === 'MATERIAIS'`) usados como "catálogos gerais" fora de um fornecedor
real.

Motivação da mudança: um produto como "Manteiga sem sal" precisa poder
pertencer a mais de uma categoria ao mesmo tempo (ex: "Insumo Loja" e "Insumo
Produção"). O sistema de categoria única não permite isso.

Fora de escopo, confirmado com o usuário: o mapeamento `product_categories`
usado no Dashboard/DRE para produtos de notas fiscais (XML) é um sistema
paralelo, indexado por código do produto, e **não muda**.

## Mudança 1 — `Product.categories: string[]`

O campo `category: string` é substituído por `categories: string[]` em toda
parte do sistema onde ele descreve a classificação do próprio produto
(cadastro em Fornecedores/Mercado/Materiais/Produtos, importação de XML,
importação de Excel).

**Compatibilidade com dados existentes**: não há migração de banco. A
normalização acontece na leitura, num único ponto (hook `useSuppliers`, ao
processar os fornecedores vindos da API): qualquer produto que só tenha o
campo antigo `category` (string) é convertido em memória para
`categories: [category]` antes de chegar ao resto do frontend. Nenhum dado
real em produção é reescrito por um script; a próxima vez que o produto for
salvo pela UI, ele já grava no formato novo (`categories`).

O campo antigo `category` deixa de ser gravado por qualquer fluxo de escrita
do frontend, mas continua sendo lido (fallback) por essa camada de
normalização, então documentos antigos nunca ficam "quebrados".

### Arquivos que leem/escrevem `Product.category` hoje e precisam mudar

- `src/frontend/types.ts` — `Product.category` → `Product.categories: string[]`
- `src/frontend/hooks/useSuppliers.ts` — ponto de normalização na leitura
- `src/frontend/hooks/useSupplierForm.ts` — form state de categoria vira lista
- `src/frontend/components/modals/SupplierModal.tsx` — select de categoria vira
  multi-select (checklist) no formulário de produto
- `src/frontend/components/SuppliersView.tsx` — badge de categoria nos cards
  (Fornecedores/Mercado/Materiais) vira lista de chips; filtros de busca
  passam a testar `categories.some(...)`
- `src/frontend/hooks/useXmlImport.ts` e
  `src/frontend/components/suppliers/XmlImportTab.tsx` — a categoria sugerida
  na importação de XML vira seleção múltipla (`targetCategories: string[]`)
- `src/frontend/hooks/useExcel.ts` — export/import de planilha: coluna
  "Categoria" passa a serializar como lista separada por vírgula
- `src/frontend/components/AIView.tsx` — badges e sugestão de categoria via IA
  (linhas 226, 306, 314, 327, 335, 1065, 1081) — mesma adaptação de single→lista
- `src/frontend/components/HistoryView.tsx` (linha 67) — exibe
  `item.category`, mas este é item de lista/carrinho (ver Mudança 2, não
  muda)
- `src/backend/app.ts` — nenhuma rota nova; os endpoints de fornecedor já
  salvam o documento inteiro, então só precisam continuar aceitando o campo
  `categories` dentro de cada produto (sem validação de schema hoje)

### Fora do escopo desta mudança (confirmado)

- `product_categories` (mapeamento de categoria por código de produto usado no
  Dashboard/DRE) — sem alteração
- `CategoryEditorPanel.tsx` (Dashboard) — sem alteração

## Mudança 2 — categoria única por item de compra (carrinho/lista)

Separado da classificação do produto, cada item dentro do carrinho ou de uma
lista de compras salva (`CartItem`, itens de `SavedList`) continua tendo **uma
única categoria** — mas agora essa categoria é escolhida no momento de
adicionar o item à lista, não herdada automaticamente do cadastro do produto.

- `CartItem` e os itens de `SavedList.items` passam a ter um campo próprio
  `category: string`, independente de `Product.categories`
- Ao clicar "Adicionar" em qualquer card de produto (Fornecedores, Produtos,
  Mercado, Materiais, tela de Compras/`ShoppingView`), aparece um select ao
  lado do seletor de quantidade, listando **todas** as categorias do sistema
  (não só as do produto)
- Pré-seleção: a primeira categoria do produto (`product.categories[0]`), se
  houver; senão a primeira categoria da lista geral. O usuário pode trocar
  livremente antes de adicionar
- `addToCart(product, supplierName, quantity, category)` e
  `addItemToList(listId, product, supplierName, quantity, category)` em
  `src/frontend/hooks/useCart.ts` passam a receber esse quarto parâmetro e
  gravá-lo como `category` no item, em vez de copiar `product.categories`
- `ShoppingView.tsx` (agrupamento por categoria ao navegar produtos, linha
  ~54-74): continua agrupando pela classificação do produto
  (`product.categories`), mas agora um produto com 2 categorias aparece nos
  dois grupos — é só navegação/busca, não afeta o item salvo no carrinho
- `CartModal.tsx`, `HistoryView.tsx`: exibem `item.category` (singular) sem
  mudança de tipo, pois já é o campo do item de lista, não do produto

## Mudança 3 — Sidebar de Compras: 3 abas

`SuppliersView.tsx` passa a ter 3 abas: **Fornecedores**, **Produtos**,
**Importar XML**. As abas `Mercado` e `Materiais` são removidas como abas
independentes; os fornecedores especiais `MERCADO` e `MATERIAIS` continuam
existindo como estão hoje (mesmo mecanismo de "Gerenciar Produtos" via
`handleAddChannelProduct`), só deixam de ter uma view própria — seus produtos
passam a aparecer dentro da aba Produtos junto com os de todos os outros
fornecedores.

`Fornecedores` e `Importar XML` continuam exatamente como estão.

### Aba Produtos (nova)

Lista única com os produtos de **todos** os fornecedores (incluindo
MERCADO/MATERIAIS), reaproveitando o layout de card já usado em
Fornecedores/Mercado/Materiais. Funcionalidades:

- Busca por nome/código/fornecedor/categoria (mesmo padrão `normalizeText` já
  usado nas outras abas)
- Select de filtro por categoria: "Todas", "Sem categoria", e cada categoria
  cadastrada — filtra produtos cujo `categories` contenha a categoria
  selecionada
- Editor de categorias inline no card: um multi-select (checklist) que
  permite marcar/desmarcar categorias do produto sem abrir o modal completo
- Botão de editar (lápis) abre o modal completo do fornecedor
  (`SupplierModal`) para editar nome/preço/código/etc., incluindo o mesmo
  multi-select de categorias
- Botão "Adicionar" com seletor de quantidade + seletor de categoria da
  compra (Mudança 2)

**Persistência**: como produtos vivem dentro do documento do fornecedor,
atualizar as categorias de um produto (seja pelo editor inline ou pelo modal)
significa localizar o fornecedor dono daquele produto e salvar o documento do
fornecedor de novo — reaproveitando `saveSupplier`, que já existe e já é
usado por todos os fluxos de edição atuais. Não é necessário nenhum endpoint
novo no backend.

**Novo hook**: `useProductCatalog` (`src/frontend/hooks/useProductCatalog.ts`)
— deriva, a partir de `suppliers: Supplier[]`, uma lista achatada de
`{ product, supplierId, supplierName, productIndex }` para renderizar a aba, e
expõe `updateProductCategories(supplierId, productIndex, categories: string[])`
que monta o fornecedor atualizado e chama `saveSupplier`.

## Testes / rollout

- `npx tsc --noEmit` e `npm run build` limpos antes de mesclar
- Testar manualmente em Modo de Teste (que já não usa o Firestore real, dados
  isolados em disco) antes de qualquer teste em produção:
  - Criar produto com 2+ categorias, confirmar que aparece nos dois grupos de
    `ShoppingView` e no filtro da aba Produtos
  - Adicionar um produto de 2 categorias ao carrinho, confirmar que o select
    de categoria da compra mostra todas as categorias do sistema, não só as
    do produto
  - Editar categorias de um produto pelo editor inline da aba Produtos e
    confirmar que persiste (reabrir a página)
  - Confirmar que um produto salvo antes desta mudança (só com `category`
    antigo) continua aparecendo corretamente com 1 categoria após a
    normalização de leitura
  - Confirmar que o Dashboard/DRE (mapeamento `product_categories`) continua
    funcionando sem alteração
- Sem necessidade de rodar nenhum script contra o Firestore real — a
  normalização é só em memória, na leitura
