<div align="center">
  <img src="https://via.placeholder.com/150/000000/FFFFFF/?text=Dash+BI" alt="Dash BI Logo" width="120" height="120" style="border-radius: 20px;">
  <br />
  <h1>📊 Dash BI</h1>
  <p><strong>Plataforma de inteligência comercial executiva</strong></p>
  <p>Análise de vendas, clientes, produtos e performance — com estética editorial corporativa estilo Linear / Stripe / Bloomberg.</p>

  <p>
    <img src="https://img.shields.io/badge/Next.js-15-000000?style=for-the-badge&logo=next.js" alt="Next.js 15" />
    <img src="https://img.shields.io/badge/TypeScript-5-3178c6?style=for-the-badge&logo=typescript" alt="TypeScript 5" />
    <img src="https://img.shields.io/badge/TailwindCSS-3.4-38bdf8?style=for-the-badge&logo=tailwind-css" alt="TailwindCSS" />
  </p>
</div>

<hr />

<div align="center">
  <a href="#visão-geral">Visão geral</a> •
  <a href="#arquitetura">Arquitetura</a> •
  <a href="#stack">Stack</a> •
  <a href="#estrutura">Estrutura</a> •
  <a href="#como-executar">Como Executar</a> •
  <a href="#funcionalidades">Funcionalidades</a> •
  <a href="#roadmap">Roadmap</a>
</div>

<hr />

## 👁️ Visão geral

<p>
  <b>Dash BI</b> é um dashboard gerencial corporativo voltado para análise de vendas e performance comercial. Esta entrega cobre o <b>frontend completo</b> com:
</p>

<ul>
  <li><b>6 áreas operacionais</b> (Executivo, Vendas, Produtos, Clientes, Vendedores, Financeiro)</li>
  <li><b>1 área operacional</b> (Importação Excel/CSV — stub funcional com pipeline)</li>
  <li><b>Filtros globais com persistência</b> (período, região, canal, vendedor, categoria, moeda)</li>
  <li><b>Multimoeda</b> (BRL, USD, EUR, GBP) com conversão em tempo real</li>
  <li><b>Dataset mockado determinístico</b> (~5.000 pedidos / 12 meses / 500 clientes / 200 produtos / 20 vendedores)</li>
  <li><b>Dark/Light mode</b> com transição limpa</li>
  <li><b>Análises avançadas:</b> KPIs com comparativo, curva ABC (produtos e clientes), RFM, top performers, sazonalidade (heatmap), DRE simplificado, insights automáticos</li>
</ul>

<blockquote>
  <p>💡 O backend (NestJS + Prisma + PostgreSQL) e a importação Excel real são fases posteriores deste roadmap; o <b>frontend já está arquitetado para consumi-los</b> via uma camada de hooks (<code>src/lib/hooks/use-dataset.ts</code>) que pode ser plugada em React Query sem refatoração de componentes.</p>
</blockquote>

## 🏗️ Arquitetura

<details>
<summary><b>Clique para ver a representação da arquitetura</b></summary>
<br>

<pre>
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
</pre>

</details>

<ul>
  <li><b>Clean Architecture</b>: dados, análises, apresentação e composição — cada camada com responsabilidade única.</li>
  <li><b>Tipagem forte</b>: domínio modelado em <code>lib/types</code>, sem o uso de <code>any</code>.</li>
  <li><b>Acoplamento mínimo</b>: charts, KPIs e tabelas consomem apenas tipos isolados.</li>
  <li><b>Performance</b>: cálculos memoizados, dataset gerado uma vez por sessão.</li>
</ul>

## 🛠️ Stack Tecnológico

<div align="center">
  <table>
    <thead>
      <tr>
        <th>Camada</th>
        <th>Tecnologia</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><b>Framework</b></td>
        <td>Next.js 15 (App Router, RSC, Turbopack)</td>
      </tr>
      <tr>
        <td><b>Linguagem</b></td>
        <td>TypeScript 5.7</td>
      </tr>
      <tr>
        <td><b>Estilização</b></td>
        <td>TailwindCSS 3.4 + CSS Variables</td>
      </tr>
      <tr>
        <td><b>UI & Charts</b></td>
        <td>shadcn/ui (Radix), Recharts, TanStack Table</td>
      </tr>
      <tr>
        <td><b>Estado & Form</b></td>
        <td>Zustand, React Hook Form + Zod</td>
      </tr>
      <tr>
        <td><b>Tema & Animação</b></td>
        <td>next-themes, Framer Motion</td>
      </tr>
    </tbody>
  </table>
</div>

## 🚀 Como executar

<h3>Requisitos</h3>
<p>
  <img src="https://img.shields.io/badge/Node.js-%E2%89%A5%2020-339933?style=flat-square&logo=node.js" alt="Node.js">
  <img src="https://img.shields.io/badge/npm-%E2%89%A5%2010-CB3837?style=flat-square&logo=npm" alt="npm">
</p>

<h3>Rodando Localmente</h3>

```bash
# Instalar dependências
npm install

# Iniciar servidor de desenvolvimento
npm run dev
```

<p>Abra <code>http://localhost:3000</code> — a raiz redireciona para <code>/dashboard</code>.</p>

<h3>Via Docker</h3>

```bash
docker compose up --build
```

## ✨ Funcionalidades em Destaque

<details>
<summary><b>Filtros Globais</b></summary>
<p>Persistidos em <code>localStorage</code> via Zustand <code>persist</code>. Todos os componentes reagem em tempo real — sem reload, sem flicker.</p>
</details>

<details>
<summary><b>Dashboard Executivo</b></summary>
<p>KPIs heróicos (Faturamento, Lucro, Ticket, Pedidos) com design editorial. Análises temporais, top produtos e insights automáticos.</p>
</details>

<details>
<summary><b>Análise de Clientes & Produtos</b></summary>
<p>Segmentação RFM avançada (VIP, Fiel, Promissor, Inativo), curva ABC completa (A/B/C) e mix por categoria.</p>
</details>

<details>
<summary><b>Financeiro & Importação</b></summary>
<p>DRE simplificado e pipeline visível para importação via Drag & Drop de planilhas XLSX e arquivos CSV.</p>
</details>

## 🎨 Sistema de Design

<p><b>Diretriz:</b> Editorial corporativo com hairlines de 1px definindo tudo. Inspirado em Linear, Stripe e Bloomberg Terminal.</p>

<ul>
  <li><b>Tipografia heróica:</b> Instrument Serif para números executivos.</li>
  <li><b>Microinterações:</b> Hairline gradients, grain overlay no dark mode, glass topbar e pinstripe grid.</li>
</ul>

## 🗺️ Roadmap

<h3>Próxima fase — Backend</h3>
<ul>
  <li>✅ NestJS + Fastify adapter</li>
  <li>✅ Prisma + PostgreSQL</li>
  <li>✅ Endpoints REST com paginação</li>
  <li>✅ Autenticação JWT e RBAC</li>
</ul>

<h3>Integrações Futuras</h3>
<ul>
  <li>🔄 APIs cambiais ao vivo</li>
  <li>🔄 Conectores ERP (TOTVS, SAP, Bling)</li>
  <li>🔄 CRMs (HubSpot, Pipedrive)</li>
</ul>

<hr />

<div align="center">
  <p>Proprietária · Dash BI © 2026</p>
  <p><b>b i - m g s i s</b></p>
</div>