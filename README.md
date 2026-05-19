# Dash BI

> Plataforma de inteligência comercial executiva. Análise de vendas, clientes,
> produtos e performance — com estética editorial corporativa estilo Linear /
> Stripe / Bloomberg.

[![Next.js 15](https://img.shields.io/badge/Next.js-15-000000?logo=next.js)]()
[![TypeScript 5](https://img.shields.io/badge/TypeScript-5-3178c6?logo=typescript)]()
[![TailwindCSS](https://img.shields.io/badge/TailwindCSS-3.4-38bdf8?logo=tailwind-css)]()

---

## Sumário

- [Visão geral](#visão-geral)
- [Arquitetura](#arquitetura)
- [Stack](#stack)
- [Estrutura](#estrutura)
- [Como executar](#como-executar)
- [Funcionalidades](#funcionalidades)
- [Sistema de design](#sistema-de-design)
- [Dados mockados](#dados-mockados)
- [Multimoeda](#multimoeda)
- [Roadmap](#roadmap)

---

## Visão geral

**Dash BI** é um dashboard gerencial corporativo voltado para análise de vendas
e performance comercial. Esta entrega cobre o **frontend completo** com:

- 6 áreas operacionais (Executivo, Vendas, Produtos, Clientes, Vendedores, Financeiro)
- 1 área operacional (Importação Excel/CSV — stub funcional com pipeline)
- Filtros globais com persistência (período, região, canal, vendedor, categoria, moeda)
- Multimoeda (BRL, USD, EUR, GBP) com conversão em tempo real
- Dataset mockado **determinístico** (~5.000 pedidos / 12 meses / 500 clientes / 200 produtos / 20 vendedores)
- Dark/Light mode com transição limpa
- Análises: KPIs com comparativo, curva ABC (produtos e clientes), RFM, top performers,
  sazonalidade (heatmap), DRE simplificado, insights automáticos

O backend (NestJS + Prisma + PostgreSQL) e a importação Excel real são fases
posteriores deste roadmap; o **frontend já está arquitetado para consumi-los**
via uma camada de hooks (`src/lib/hooks/use-dataset.ts`) que pode ser plugada
em React Query sem refatoração de componentes.

---

## Arquitetura

```
┌────────────────────────────────────────────────────────────┐
│                       NEXT.JS 15 (RSC)                     │
│  ┌────────────┐   ┌──────────────┐   ┌──────────────────┐  │
│  │  app/      │   │ components/  │   │ lib/             │  │
│  │  rotas RSC │ ◀ │ ui / charts  │ ◀ │ analytics / mock │  │
│  │            │   │ dashboard    │   │ store / hooks    │  │
│  └────────────┘   └──────────────┘   └──────────────────┘  │
│                       │                       │             │
│                       ▼                       ▼             │
│              Zustand (filtros globais persistentes)         │
│                                                             │
│   Camada de ingestão (preparada):                           │
│   - useDataset() ← getDataset()  ← mock determinístico      │
│              ↑                                              │
│   - swap por: REST / GraphQL / WebSocket / Prisma           │
└────────────────────────────────────────────────────────────┘
```

**Princípios:**

- **Clean Architecture**: dados (`lib/mock`), análises (`lib/analytics`), apresentação (`components/`), composição (`app/`) — cada camada com responsabilidade única.
- **Tipagem forte**: domínio modelado em `lib/types`, todos os módulos são tipados (sem `any`).
- **Acoplamento mínimo**: charts, KPIs e tabelas consomem apenas tipos de `lib/types` — fácil substituir o mock por qualquer fonte real.
- **Performance**: cálculos memoizados, dataset gerado uma vez por sessão, `optimizePackageImports` para charts/icons.

---

## Stack

| Camada           | Tecnologia                                                |
| ---------------- | --------------------------------------------------------- |
| Framework        | Next.js 15 (App Router, RSC, Turbopack)                   |
| Linguagem        | TypeScript 5.7                                            |
| Estilo           | TailwindCSS 3.4 + CSS Variables + tailwind-merge          |
| UI               | shadcn/ui style (Radix + cva) — componentes próprios      |
| Charts           | Recharts                                                  |
| Tabelas          | TanStack Table (planejado para vistas complexas)          |
| Estado           | Zustand (com persist)                                     |
| Formulários      | React Hook Form + Zod                                     |
| Tema             | next-themes (dark/light)                                  |
| Animações        | Framer Motion + Tailwind keyframes                        |
| Tipografia       | Geist Sans · Geist Mono · Instrument Serif (numbers hero) |
| Datas            | date-fns                                                  |
| Ícones           | lucide-react                                              |
| Container        | Docker (multi-stage build)                                |

---

## Estrutura

```
src/
├── app/
│   ├── (dashboard)/
│   │   ├── layout.tsx          # Sidebar + Topbar + main grid
│   │   ├── loading.tsx         # Skeleton para rotas internas
│   │   ├── dashboard/page.tsx  # 🌟 showpiece executivo
│   │   ├── vendas/page.tsx
│   │   ├── produtos/page.tsx
│   │   ├── clientes/page.tsx
│   │   ├── vendedores/page.tsx
│   │   ├── financeiro/page.tsx
│   │   └── importacao/page.tsx
│   ├── globals.css             # tokens de cor, fontes, utilitários (hairline, grain, glass)
│   ├── layout.tsx              # ThemeProvider + fonts
│   ├── not-found.tsx
│   └── page.tsx                # redirect → /dashboard
│
├── components/
│   ├── charts/                 # Area, BarH, Donut, Heatmap, Sparkbars, defs/tooltip
│   ├── dashboard/              # KpiCard, InsightCard, DeltaPill, Money
│   ├── filters/                # DateRangePicker, CurrencySwitcher, GlobalFilters
│   ├── layout/                 # Sidebar, Topbar, ThemeToggle, BrandMark, PageHeader
│   ├── providers/              # ThemeProvider
│   └── ui/                     # Card, Button, Badge, Tabs, Select, Popover, ...
│
└── lib/
    ├── analytics/              # KPIs, séries temporais, ABC, RFM, insights, sellers
    ├── hooks/                  # useDataset, useFilteredOrders
    ├── mock/                   # seed determinístico + catálogo de nomes/produtos
    ├── store/                  # Zustand: filtros globais (persistente)
    ├── types/                  # domínio (Order, Customer, Product, ...)
    └── utils/                  # format, currency, dates
```

---

## Como executar

### Requisitos

- Node.js ≥ 20
- npm ≥ 10 (ou pnpm / bun)

### Local

```bash
npm install
npm run dev
```

Abra http://localhost:3000 — o `/` redireciona para `/dashboard`.

### Build de produção

```bash
npm run build
npm run start
```

### Docker

```bash
docker compose up --build
```

Acessível em http://localhost:3000.

---

## Funcionalidades

### Filtros globais

Persistidos em `localStorage` via Zustand `persist`. Todos os componentes
reagem em tempo real — sem reload, sem flicker.

- **Período**: hoje · ontem · 7d · 30d · mês atual · ano atual · 12m · custom
- **Comparativo automático**: cada KPI mostra Δ vs. período anterior equivalente
- **Região, Canal, Vendedor, Categoria**: pills + dropdown contextual

### Dashboard Executivo

KPIs heróicos (Faturamento, Lucro, Ticket, Pedidos) com:

- Números editoriais em **Instrument Serif** (tabular nums)
- Sparkline embutida
- Delta com seta tonal (positivo/negativo)
- Hairline gradient no topo do card (assinatura visual)

Painéis: evolução temporal (mensal/diário/lucro), insights automáticos,
composição por categoria (donut), receita por canal, heatmap dia × semana,
meta vs. realizado, top produtos, top vendedores.

### Análise de Vendas

Evolução temporal (linha + barras), heatmap de sazonalidade, distribuição
regional, tabela de pedidos recentes com status.

### Produtos

Curva ABC completa (A/B/C com thresholds 80%/95%), ranking, mix por categoria,
tabela com share acumulado.

### Clientes

Segmentação RFM (VIP / Fiel / Promissor / Novo / Em risco / Inativo), LTV,
ticket médio, recência, curva ABC de clientes.

### Vendedores

Ranking com Meta vs. Realizado (progress bar tonal), pedidos, ticket médio,
margem, comissão estimada baseada em taxa individual.

### Financeiro

DRE simplificado linha-a-linha, fluxo de receita/lucro, indicadores financeiros
(margem bruta, margem líquida, % impostos, % despesas).

### Importação

Drag & drop de XLSX/CSV (XLS), parser simulado com 4 estágios visíveis
(Upload → Parser → Validação → Persistência), schema esperado documentado
inline, histórico de uploads.

---

## Sistema de design

**Diretriz**: editorial corporativo com hairlines de 1px definindo tudo. Inspirado
em Linear, Stripe, Bloomberg Terminal, Financial Times.

### Tipografia

- **Display & Numbers heróicos**: Instrument Serif (com `tabular-nums` + `ss01`)
  — números executivos parecem impressos em jornal financeiro
- **UI**: Geist Sans (Vercel)
- **Mono / tabular figures em tabelas e charts**: Geist Mono

### Paleta

Tokens HSL em CSS variables (`src/app/globals.css`):

| Token       | Light                 | Dark                  | Uso                       |
| ----------- | --------------------- | --------------------- | ------------------------- |
| background  | `220 14% 98%`         | `222 22% 5%`          | Body                      |
| surface     | `0 0% 100%`           | `222 18% 8%`          | Cards                     |
| border      | `220 13% 89%`         | `220 13% 16%`         | Hairlines                 |
| accent      | `226 71% 56%`         | `226 84% 66%`         | Cobalto · ações principais |
| positive    | `152 76% 36%`         | `152 60% 48%`         | Δ positivo                |
| negative    | `0 72% 51%`           | `0 72% 62%`           | Δ negativo                |
| warning     | `32 95% 44%`          | `36 95% 60%`          | Alertas                   |

### Microelementos

- **Hairline gradient** no topo de cards-KPI (assinatura)
- **Grain overlay** sutil no dark mode (textura cinemática)
- **Pinstripe grid** no dropzone de importação
- **Glass topbar** com `backdrop-filter`
- **Pulse dot** verde no badge "sincronizado"
- **Reveal stagger** de 40ms entre seções no carregamento

### Componentes

KpiCard, InsightCard, DeltaPill, BarChartH, DonutChart, Heatmap, SparkBars, e
toda a biblioteca shadcn-style (Card, Button, Badge, Tabs, Select, Popover,
Dropdown, Tooltip, Progress, Skeleton, Separator, Input, ScrollArea).

---

## Dados mockados

Gerados deterministicamente por **mulberry32** em
[`src/lib/mock/seed.ts`](src/lib/mock/seed.ts). Mesma seed → mesmo dataset (build
reprodutível, screenshots consistentes).

- **200 produtos** distribuídos em 7 categorias, com faixas de preço e margem
  realistas por categoria (Eletrônicos têm margem baixa; Beleza tem margem alta)
- **500 clientes** segmentados por RFM após processamento das vendas
- **20 vendedores** com metas mensais variando entre R$80k–R$320k
- **5.400 pedidos brutos** ao longo de 12 meses (após filtros de sazonalidade
  e cancelamentos, ~4.500 ficam efetivamente válidos)
- **Sazonalidade** modelada: dezembro picam +42%, Black Friday +60%, fim de
  semana B2B cai 18%
- **80/20 ativos**: 62% das compras concentradas nos top 20% de clientes
- **Cancelamentos** (~4%), devoluções (~3%), pendentes (~6%)

---

## Multimoeda

Suporte a **BRL · USD · EUR · GBP** com conversão automática em tempo real.

```ts
// lib/mock/seed.ts
export const EXCHANGE_RATES: ExchangeRate[] = [
  { code: "BRL", rateToBRL: 1,    symbol: "R$", name: "Real" },
  { code: "USD", rateToBRL: 5.08, symbol: "$",  name: "Dólar Americano" },
  { code: "EUR", rateToBRL: 5.42, symbol: "€",  name: "Euro" },
  { code: "GBP", rateToBRL: 6.34, symbol: "£",  name: "Libra" },
];
```

Para integração futura com APIs cambiais (Open Exchange Rates, ECB, BCB Olinda),
basta substituir `EXCHANGE_RATES` por um React Query hook que busque taxas
ao vivo. Componente `<Money brl={...} />` é o único ponto de formatação visual.

---

## Roadmap

### Próxima fase — Backend

- [ ] NestJS + Fastify adapter
- [ ] Prisma + PostgreSQL com schema completo (Customer, Product, Order, Item, Seller, Goal, Category, Currency, Rate, Region, User, Permission)
- [ ] Migrations e seed equivalente ao mock
- [ ] Endpoints REST `/api/v1/{kpis|orders|customers|...}` com paginação
- [ ] Autenticação JWT + refresh tokens
- [ ] RBAC por perfil (admin / gerente / vendedor)
- [ ] Logs de auditoria + criptografia

### Fase seguinte — Ingestão real

- [ ] Parser XLSX (SheetJS) + CSV
- [ ] Mapeamento de colunas configurável por organização
- [ ] Validação Zod + relatório de erros
- [ ] Persistência transacional com rollback
- [ ] Webhooks de status

### Integrações

- [ ] APIs cambiais ao vivo
- [ ] Conectores ERP (TOTVS, SAP, Bling)
- [ ] CRMs (HubSpot, Pipedrive, RD Station)
- [ ] Marketplaces (Mercado Livre, Shopee, Amazon)
- [ ] Plataformas e-commerce (Shopify, VTEX, Magento)

---

## Licença

Proprietária · Dash BI © 2026
#   b i - m g s i s  
 