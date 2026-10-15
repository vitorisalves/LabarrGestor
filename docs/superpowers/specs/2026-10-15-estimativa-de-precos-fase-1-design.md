# Estimativa de preços — Fase 1: motor, margens e requisição/aprovação

Data: 2026-10-15
Status: aprovado para planejamento
Visão geral e fases: `2026-10-15-estimativa-de-precos-visao-geral.md`

## Objetivo

Estimar o preço provável de cada item de uma requisição de compra a partir do
histórico de notas fiscais, aplicar uma margem de segurança configurável,
classificar a confiança da estimativa e definir o **valor aprovado** (limite de
gasto) na 1ª aprovação — mantendo **estimado**, **aprovado** e (na Fase 2)
**realizado** como valores distintos.

Fora de escopo desta fase: registrar o valor realizado, comparar com o limite,
novos cards no dashboard (Fase 2); calibração das margens pelo erro das
previsões (Fase 3). O valor gasto do mês do dashboard **não muda**.

## Situação atual (levantada no código)

- O item da requisição guarda um único `price`, copiado do cadastro do produto
  quando entra no carrinho. Não há data, origem, margem nem confiança.
- `PurchaseOrder` tem `items`, `total`, `shippingFee` e `status`
  (`pending → requisition_approved → approved`, ou `rejected`). Não existe
  "valor aprovado" separado do `total`.
- Rotas em `src/backend/app.ts`: `POST /api/xml/purchase_orders` (criar),
  `/approve-requisition`, `/approve`, `/reject`, `/observacao`, `/send`, `/delete`.
- O histórico de preços está em `invoices`: cada produto da nota tem `vUnCom`
  (unitário líquido, desconto rateado), `vUnComGross`, `quantity`, `discount`,
  `totalNet` e a data da nota. A unidade (`uCom`/`uTrib`) **não** é guardada; a
  normalização por peso é feita pelo nome (`extractWeightKg`, hoje em
  `src/frontend/utils/priceAnalysis.ts`).
- Entradas confirmadas pela lista de compras também ficam em `invoices` com
  `source: 'shopping_list'` e `hasNF`.
- Produtos vivem dentro do fornecedor (`Supplier.products[]`) com `price`,
  `lastPurchaseDate` (formato `dd/MM/yyyy`), `categories[]` e `setor`.

## Arquitetura

Arquitetura **A**: um módulo puro compartilhado calcula a estimativa; o
**servidor** lê as notas, calcula e **congela o snapshot** em cada item no
momento da criação da requisição. O navegador usa o mesmo módulo apenas para
pré-visualizar no carrinho e nunca é fonte do valor gravado.

```
src/shared/units.ts                    extractWeightKg (movido de priceAnalysis.ts)
src/shared/priceEstimation.ts          motor puro: histórico + parâmetros + data -> estimativa
src/backend/services/priceEstimationService.ts
                                       carrega notas, cadastro e configuração; chama o motor por item
src/backend/app.ts                     rotas novas e integração em purchase_orders
src/frontend/...                       carrinho, requisição, configurações, tipos
```

## Motor de estimativa (`src/shared/priceEstimation.ts`)

Função pura: `estimatePrice(input) -> PriceEstimate`. Sem acesso a banco, relógio
ou rede; a data de hoje e os parâmetros entram como argumentos. Mesmos dados e
parâmetros produzem sempre o mesmo resultado.

### Entrada

- `history`: lista de compras do produto (data, preço unitário líquido, tipo de
  unidade, origem).
- `item`: nome, código, fornecedor, categorias, `price` do cadastro,
  `lastPurchaseDate` do cadastro, entrada manual/cotação (opcional).
- `params`: parâmetros da configuração (tabela abaixo) e margens por categoria.
- `today`: data de referência.

### Quais compras entram no histórico

- Identificação do produto: pelo `code` (quando diferente de `N/A`) ou, na falta,
  pelo nome normalizado (minúsculas, sem acento, espaços aparados) — a mesma
  regra do detector de aumentos de preço.
- Entram: notas reais; entradas da lista **Sem NF** (`hasNF === true`), que são
  compras reais sem nota.
- Ficam de fora (ignorados, nunca apagados): entradas da lista **NF**
  (`hasNF !== true`, provisórias — duplicariam com a nota real); itens marcados
  `deleted`; preço `<= 0`; notas `manual-inv-`.
- Preço usado: `vUnCom` (líquido). Compras no mesmo dia viram um único ponto
  (média dos preços do dia).
- Unidade: se o nome indica peso (`extractWeightKg`, incluindo 1 kg), a compra é
  normalizada para **R$/kg**; caso contrário é **R$/un**. Só entram compras do
  **mesmo tipo de unidade** do item pedido. O preço estimado volta para a
  embalagem pedida multiplicando por seu peso. O snapshot registra quantas
  compras foram descartadas por unidade diferente.
- Janela: últimos `windowMonths` meses. Se restarem menos de 2 compras, usa todo
  o histórico e marca `staleHistory = true`.

### Referência quando não há compras

Precedência: **cotação > preço manual > preço do cadastro > nenhuma**.

- `cadastro`: `Product.price` com `lastPurchaseDate` como data, tratado como
  compra única. Sem data, assume-se idade `staleDays`.
- `manual` / `quote`: valor, data, responsável e (cotação) fornecedor, informados
  pelo requisitante. Validação: valor `> 0` e data não futura.
- `nenhuma`: `estimatedPrice = 0`, confiança `sem_referencia`, `noReference = true`.
  **Não bloqueia** a aprovação; apenas avisa.

### Cálculo com 2 ou mais compras (método `trend`)

Com pontos `(m_i, p_i)`, `m` em meses (`dias / 30,4375`), `n` pontos, `P_last` o
preço da compra mais recente em `t_last`:

1. `s` = mediana das inclinações `(p_j - p_i) / (m_j - m_i)` de todos os pares
   (Theil-Sen).
2. `shrink = min(1, (n - 1) / 4)`; `s_eff = clamp(s * shrink, ±maxMonthlyTrendPct * P_last)`.
3. `T = today + leadDays`; `h = min(maxProjectionMonths, max(0, meses(T - t_last)))`.
4. `P_est = max(0, P_last + s_eff * h)`, arredondado a 2 casas (meio para cima).

Com 1 compra (`single`, `cadastro`, `manual`, `quote`): `P_est = P_last`, sem
tendência.

### Margem de segurança

```
ageMonths   = meses(T - t_last)
margem%     = clamp( base(categoria) + calibração(categoria)
                     + volK * volatilidadeRelativa
                     + agePctPerMonth * max(0, ageMonths - ageStartMonths),
                     minMargin, maxMargin )
preçoProtegido = P_est * (1 + margem%)
```

- `base(categoria)`: margem base da categoria; produto com várias categorias usa
  a **maior**; sem categoria configurada usa `defaultBase`.
- `volatilidadeRelativa`: `n >= 3` → desvio-padrão dos resíduos da reta
  Theil-Sen dividido pela média dos preços; `n = 2` → `|p2 - p1| / (p1 + p2)`;
  compra única/referência → 0.
- `calibração(categoria)`: 0 nesta fase (reservado para a Fase 3).
- A margem é proteção orçamentária; **não** é afirmada como aumento real.

### Intervalo e próxima compra

`intervalDays` = mediana dos intervalos entre compras (`n >= 3`), guardado como
informação ("próxima compra prevista" = `t_last + intervalDays`). A projeção usa
sempre `T = hoje + leadDays`, para não projetar aumento por meses em que a
compra não ocorrerá.

### Confiança

| Nível | Condição |
|---|---|
| `alta` | `n >= 5`, ao menos 3 compras nos últimos 6 meses, volatilidade relativa `< 10%`, última compra `<= 90` dias |
| `media` | `n >= 2`, volatilidade relativa `< 25%`, última compra `<= staleDays` |
| `baixa` | compra única, `cadastro`, `manual`, `quote`, preço mais velho que `staleDays`, `staleHistory`, ou volatilidade `>= 25%` |
| `sem_referencia` | nenhuma compra, nenhum cadastro, nenhuma cotação/manual |

Ter muitas notas não basta para `alta`: a regra exige comparabilidade (mesma
unidade) e consistência (volatilidade).

### Saída (`PriceEstimate`)

`lastPrice`, `lastPriceDate`, `estimatedPrice`, `marginPct`, `protectedPrice`,
`confidence`, `method` (`trend | single | cadastro | manual | quote | none`),
`sampleSize`, `discardedUnit`, `discardedOther`, `intervalDays`,
`volatilityRel`, `horizonMonths`, `staleHistory`, `noReference`,
`reference` (`{ source, value, date, by, supplierName }` quando manual/cotação),
`computedAt`, `params` (cópia dos parâmetros usados).

## Parâmetros administrativos

Tabela nova `price_settings`, um documento (`id = 'default'`). Se a tabela ou o
documento não existirem, o servidor usa os valores iniciais e registra o aviso.

| Parâmetro | Valor inicial |
|---|---|
| `windowMonths` | 12 |
| `maxMonthlyTrendPct` | 5 |
| `maxProjectionMonths` | 6 |
| `leadDays` | 0 |
| `defaultBase` (margem base padrão) | 5% |
| `baseByCategory` | vazio (usa `defaultBase`) |
| `volK` | 1,0 |
| `ageStartMonths` / `agePctPerMonth` | 1 / 0,5% |
| `minMargin` / `maxMargin` | 3% / 25% |
| `staleDays` | 180 |
| `calibrationByCategory` | vazio (Fase 3) |

Toda alteração acrescenta uma entrada em `history[]` do documento:
`{ at, by, field, before, after }`. Validação: percentuais entre 0 e 100,
`minMargin <= maxMargin`, meses/dias inteiros `>= 0`.

## Modelo de dados

Sem alterar tabelas existentes (documentos JSON ganham campos novos).

**Item da requisição** (`PurchaseOrder.items[i]`):
- `price` = `estimatedPrice` (sem margem) — mantém `total`, listas e telas atuais
  funcionando.
- `estimate` = `PriceEstimate` congelado na criação.

**`PurchaseOrder`** ganha:
- `estimatedTotal` (Σ `estimatedPrice × quantity` + frete; igual a `total`),
- `suggestedLimit` (Σ `protectedPrice × quantity` + frete),
- `approvedLimit`, `approvedLimitBy`, `approvedLimitAt` (definidos na 1ª aprovação),
- `limitHistory[]` = `{ at, by, from, to, reason }`.

Requisições antigas, sem `estimate`, abrem normalmente e mostram "sem estimativa".

**Entrada manual no carrinho** (`CartItem.manualPrice`): `{ kind: 'manual' | 'quote', value, date, supplierName? }`.

## Servidor

- `POST /api/xml/price-estimates` (leitura): recebe itens, devolve os
  `PriceEstimate`. Regra de permissão: qualquer pessoa aprovada (`null`).
- `POST /api/xml/purchase_orders` (existente): **recalcula** cada item e grava
  `estimate`, `estimatedTotal` e `suggestedLimit`. Ignora preço/estimativa
  enviados pelo navegador; aceita apenas `manualPrice` validado.
- `POST /api/xml/purchase_orders/approve-requisition` (existente): aceita
  `approvedLimit` e `limitReason`. Padrão = `suggestedLimit`. Se diferir do
  sugerido, o motivo é obrigatório. Grava `limitHistory`.
- `POST /api/xml/purchase_orders/approve` (existente): reconfirma sem recalcular.
- `POST /api/xml/purchase_orders/send` (existente): a lista criada leva o `price`
  estimado, o `estimate` de cada item e a referência da ordem (`orderId`,
  `estimatedTotal`, `approvedLimit`) para uso na Fase 2.
- `GET /api/xml/price-settings` e `POST /api/xml/price-settings` (grava e
  registra o histórico). Permissão do POST: `prices.config`.
- Erro ao ler notas: a criação da requisição não usa preço "de reserva";
  responde erro claro e não cria a requisição.

`price_settings` entra em `TEST_MODE_COLLECTIONS` e em `LIVE_EDIT_COLLECTIONS`.

## Permissões

Nova: `prices.config` — "Configurar margens e parâmetros de preço" (grupo Sistema).
Regras de rota: `/xml/price-settings` → `prices.config`; `/xml/price-estimates` →
`null`. Criar requisição continua `lists.edit`; aprovar e ajustar limite
continuam `orders.approve`.

## Interface

- **Carrinho (`CartModal`)**: por item, estimativa, confiança (selo) e margem;
  itens `sem_referencia` mostram aviso e campos de preço manual/cotação (valor,
  fornecedor, data). Pré-visualização via `price-estimates`.
- **Requisição (`PurchaseOrdersView`)**: por item, último preço → estimativa
  (+ margem) e selo de confiança; resumo com total estimado, limite sugerido e
  contagem de itens com baixa confiança/sem referência (aviso, sem bloqueio).
  Na 1ª aprovação: campo do limite aprovado (pré-preenchido) e motivo quando
  alterado.
- **Configurações (`SettingsModal`)**: seção "Estimativa de preços" com os
  parâmetros e a tabela de margem base por categoria (categorias existentes) e
  o histórico de alterações.
- **Tipos** (`types.ts`): `PriceEstimate`, campos novos de `PurchaseOrder`,
  `CartItem.manualPrice`.

## Planilha de fornecedores: somente adição

A importação deixa de poder alterar o que já existe:

- Fornecedor existente (nome normalizado): só recebe produtos **novos** (nome
  normalizado inexistente); telefone, preços, categorias, setor e datas dos
  existentes ficam intactos.
- Fornecedor novo: entra completo.
- **Imposto no servidor**: `POST /api/xml/suppliers/import` carrega os
  fornecedores atuais e aplica a fusão só-adição, independentemente do que o
  navegador enviar.
- "Substituir lista" é removido da importação.
- O aviso final informa quantos fornecedores/produtos entraram e quantos foram
  ignorados por já existirem.

Motivo: o preço do cadastro passa a ser referência de estimativa e só deve
mudar por fluxos controlados.

## Migração

- `scripts/supabase/add-price-settings.sql` (idempotente): cria
  `public.price_settings` e `test.price_settings`, habilita RLS e concede
  acesso ao `service_role` no schema `test`. Atualizar também `schema.sql`.
- Nenhuma alteração nas tabelas existentes.

## Testes

Unitários do motor (dados fixos, `today` fixo), cobrindo os cenários 1–9 e 15 do
prompt original:

1. aumento consistente; 2. redução; 3. oscilação; 4. preços iguais;
5. compra única recente; 6. compra única antiga; 7. sem histórico e sem cotação;
8. sem histórico com cotação/manual; 9. unidades/embalagens diferentes;
15. dados insuficientes ou inconsistentes.

Além deles: reprodutibilidade (mesma entrada, mesma saída); `cadastro` como
referência única; entradas da lista NF ignoradas e Sem NF incluídas; precedência
cotação > manual > cadastro; limites de validação.

Servidor/integração: o snapshot ignora valores vindos do navegador; limite
aprovado exige motivo quando diferente do sugerido e grava `limitHistory`;
fusão só-adição da planilha (existente intacto, novo adicionado); regras de
permissão das rotas novas.

Fora desta fase (Fase 2): cenários 10–14 e 16 (realizado, limite excedido,
quantidade diferente, importação duplicada, dashboard).

## Riscos e limitações conhecidas

- A unidade é normalizada pelo nome do produto (a nota não guarda `uCom`);
  produtos sem peso no nome são comparados como unidade.
- A requisição não tem data planejada de compra; usa hoje + `leadDays`.
- Leitura de todas as notas a cada estimativa: aceitável no volume atual
  (cache de 30 s da coleção); revisar se `invoices` crescer muito.
- A margem por categoria depende de as categorias dos produtos estarem
  preenchidas; sem categoria usa `defaultBase`.
- O ajuste por erro de previsões anteriores só existe na Fase 3.

## Arquivos afetados (previstos)

Novos: `src/shared/units.ts`, `src/shared/priceEstimation.ts` (+ testes),
`src/backend/services/priceEstimationService.ts`,
`scripts/supabase/add-price-settings.sql`.

Alterados: `src/backend/app.ts`, `src/backend/data/supabaseRepo.ts`,
`src/shared/permissions.ts` (+ teste), `src/frontend/utils/priceAnalysis.ts`
(passa a importar `extractWeightKg`), `src/frontend/types.ts`,
`src/frontend/components/modals/CartModal.tsx`,
`src/frontend/components/PurchaseOrdersView.tsx`,
`src/frontend/components/modals/SettingsModal.tsx`,
`src/frontend/hooks/usePurchaseOrders.ts`, `src/frontend/hooks/useCart.ts`,
`src/frontend/hooks/useExcel.ts`, `src/frontend/components/modals/ImportModal.tsx`,
`scripts/supabase/schema.sql`.
