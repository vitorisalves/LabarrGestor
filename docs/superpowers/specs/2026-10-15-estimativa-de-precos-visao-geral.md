# Estimativa inteligente de preços — visão geral e fases

Data: 2026-10-15
Status: aprovado para planejamento (Fase 1); Fases 2 e 3 a brainstormar depois

## Contexto

O pedido original (prompt do usuário, 16 seções) pede um sistema de estimativa de
preço para as requisições de compra, separando claramente **estimado**, **aprovado**
e **realizado**, com margem de segurança, classificação de confiança, integração com
lista de compras e dashboard, e aprendizado com os resultados reais.

É grande demais para uma única entrega. Foi dividido em três fases, cada uma com
sua spec, plano e entrega. Este documento registra a divisão, as restrições que
valem para todas as fases e onde cada ponto do prompt original é atendido.

## Restrição que vale para todas as fases

**O valor gasto do mês do dashboard permanece exatamente como funciona hoje**
(notas fiscais reais + entradas "Sem NF" da lista; entradas marcadas "NF" ficam
no saldo "Faltando NF"). Valores novos (estimado, aprovado, realizado, variações)
entram como **cards ou dashboards adicionais**, nunca alterando essa conta.

Demais restrições herdadas do prompt:

- Não inventar preço; estimativa nunca substitui nem sobrescreve histórico.
- Cada nota fiscal continua armazenada (`invoices`) para análises futuras.
- Importação duplicada de nota não duplica gasto (já tratado pela chave da NF-e).
- Reutilizar estruturas existentes; só criar tabela quando necessário.
- Cálculo reproduzível: mesmos dados + mesmos parâmetros = mesmo resultado.

## Fases

| Fase | Escopo | Spec |
|---|---|---|
| 1 | Motor de estimativa, margens configuráveis, snapshot na requisição, valor aprovado na 1ª aprovação, cotação/preço manual, confiança, planilha só-adição | `2026-10-15-estimativa-de-precos-fase-1-design.md` |
| 2 | Realizado x estimado x aprovado na lista de compras; cards/dashboards adicionais (variações, compras acima do limite, produtos com maior variação, estimativas pouco confiáveis); limite excedido e aprovação complementar | a escrever |
| 3 | Aprendizado: compara previsto x pago por compra concluída, mede erro por categoria/fornecedor, recomenda margens (sem alterar sozinho), trilha de auditoria das mudanças | a escrever |

## Mapa do prompt original → fase

| Seção do prompt | Tema | Fase |
|---|---|---|
| 1, 2 | Objetivo; separar valores financeiros | 1 (estimado/aprovado), 2 (realizado) |
| 3 | Produtos com várias compras | 1 |
| 4 | Produto com uma compra | 1 |
| 5 | Produto sem compra (manual/cotação) | 1 |
| 6 | Classificação de confiança | 1 |
| 7 | Data prevista da próxima compra | 1 (intervalo informativo; compra = hoje + prazo) |
| 8 | Aprovação e controle de limite | 1 (limite na 1ª aprovação), 2 (excedente e aprovação complementar) |
| 9 | Integração com a lista de compras | 1 (levar o snapshot), 2 (registrar realizado) |
| 10 | Integração com o dashboard | 2 |
| 11 | Aprendizado com resultados reais | 3 |
| 12 | Requisitos técnicos e segurança | todas |
| 13 | Testes obrigatórios | 1 (cenários 1–9 e 15), 2 (10–14 e 16) |
| 14 | Orientações finais | todas |

## Decisões tomadas no brainstorming

1. Divisão em 3 fases (acima).
2. Arquitetura **A**: módulo puro compartilhado + servidor calcula e congela o
   snapshot na criação da requisição, lendo `invoices`. Descartadas: cálculo no
   navegador (B) e tabela de histórico de preços por produto (C).
3. O **valor aprovado** (limite) é definido na **1ª aprovação** (requisição
   aprovada); a 2ª aprovação (compra) apenas reconfirma.
4. Produto **sem histórico e sem cotação não bloqueia** a aprovação: só avisa.
5. Preço do **cadastro** do produto vale como referência de **compra única**.
6. Planilha de fornecedores passa a ser **somente adição**.
