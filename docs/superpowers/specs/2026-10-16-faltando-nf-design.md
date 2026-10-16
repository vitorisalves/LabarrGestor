# Faltando NF — regra de cálculo

## Objetivo
Mostrar, junto ao "Gasto no Período" (Dashboard) e ao "Gasto por Setor", quanto foi confirmado
pela lista de compras como "NF" e ainda espera a nota fiscal real.

## Regras
1. **Confirmado com NF** (`source = shopping_list`, `hasNF !== true`): cada produto entra no
   "Faltando NF" do mês em que foi confirmado, pelo valor da confirmação (preço × quantidade).
   Não entra no gasto.
2. **Confirmado sem NF** (`hasNF === true`): entra direto no gasto do período, somando ao total.
3. **Nota real importada** (XML): soma no gasto e desconta do "Faltando NF" do seu mês, pelo valor
   bruto dos produtos (antes do desconto da nota).
4. **Ordem:** o desconto é cronológico dentro do mês. Uma nota só desconta o saldo existente até
   a sua data; uma nota que entrou antes de uma confirmação **não** cancela essa confirmação.
   Na mesma hora, a confirmação conta antes da nota.
5. **Sem crédito:** o saldo nunca fica negativo; a sobra de uma nota é perdida e não passa para
   outro mês. Cada mês é independente.
6. **Data da nota:** usa a data de emissão (`dhEmi`), não a da importação.
7. **Filtros:** no Dashboard, com categoria selecionada, só entram os produtos dela; em Setores,
   o saldo é por setor e só do mês selecionado.

## Implementação
- `src/shared/missingNF.ts`: `missingNFRunning(entries)` (cronológico, regras 4–5), com testes em
  `missingNF.test.ts`. `missingNFBalances` (sem ordem) permanece, mas deixou de ser usada pelas telas.
- `DashboardView.tsx` (`totalExpenseMissingNF`) e `SectorDashboardView.tsx` (`missingNFBySetor`).

## Fora de escopo
Não há vínculo por produto entre confirmação e nota (o desconto é por valor, não por item).
