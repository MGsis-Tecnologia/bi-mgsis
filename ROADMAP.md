# Roadmap — novas funcionalidades sugeridas

Sugestões levantadas em 06/10/2026, a partir de uma análise do projeto, do que criar para impactar a gestão do cliente. **Nada desta lista foi implementado ainda.**

Pendências e correções do que já existe ficam no [TAREFAS.md](TAREFAS.md); aqui ficam só as funcionalidades novas.

## Ordem recomendada para começar

### 1. Metas reais + projeção de fechamento do mês

Hoje não existe cadastro de metas:

- o "% da meta" do vendedor é `revenue / MAX(revenue)`, ou seja, relativo ao melhor vendedor (`src/lib/server/analytics/dashboard.ts`, por volta da linha 240);
- o "Meta vs Realizado" é o período anterior × 1,08.

A ideia é ter cadastro de metas de verdade (por vendedor, por mês) e projetar o fechamento do mês pelo ritmo atual.

### 2. Resumo diário/semanal por e-mail ao gestor

Envio automático dos principais números. O SMTP do sistema já existe em `mailer.ts`.

### 3. Fluxo de caixa projetado

Receber − pagar por semana de vencimento.

Atenção: receber/pagar ainda são enviados por data de emissão (item 7 do TAREFAS). Para este item funcionar, o dado precisa vir por vencimento.

## Demais sugestões

- **Clientes deixando de comprar** — lista de ação por vendedor, a partir do RFM.
- **Orçamentos em aberto para recuperar** — Prospecção vira lista de follow-up.
- **Vazamento de margem** — venda abaixo do custo, desconto fora do padrão.
- **Sugestão de compra/reposição** — depende do item 10 do TAREFAS ("Excesso" de estoque).
- **Impacto do câmbio na margem** — forte para o Paraguai.
- **Tela "Hoje" para celular.**
- **Relatório mensal em PDF automático.**
- **Status de atualização dos dados visível ao cliente.**
- **"Pergunte ao BI" com IA** — mais adiante.

## Pré-requisito antes de vender no Paraguai

Ainda há textos fixos em português fora do i18n:

- insights em `src/lib/analytics/insights-agg.ts`;
- tagline do dashboard;
- cartões de desconto/devolução e mapa em `vendas/page.tsx`;
- rótulos de mês com locale `pt-BR` fixo nos hooks;
- "Fornecedores", "Caixa & DRE", "Lucro".

## Como retomar

Escolher um item (a ordem recomendada é 1 → 2 → 3) e fazer um plano antes de codar.
