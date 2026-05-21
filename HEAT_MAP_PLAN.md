# 🗺️ Plano de Implementação: Mapa de Calor de Vendas por Cidade

## 📊 Análise Atual do Projeto

### Stack Tecnológico
- **Framework**: Next.js 16 + TypeScript
- **Gráficos**: Recharts 2.15
- **UI**: Radix UI + TailwindCSS
- **Dados**: CSV/Excel importado em IndexedDB
- **Estado**: Zustand

### Dados Disponíveis
✅ **O que temos:**
- 25 cidades distribuídas em 5 regiões (Sudeste, Sul, Centro-Oeste, Nordeste, Norte)
- Informações de clientes com localização (implícita via geração de dados)
- Histórico de vendas com valores em BRL
- Filtros globais: intervalo de datas, moeda, etc.

⚠️ **O que falta:**
- Campo `city` ou `clientCity` na interface `ImportedClient`
- Informações geográficas (latitude/longitude) das cidades
- Agregações de vendas por cidade
- Componente de mapa interativo

---

## 🎯 Objetivo Final

Criar uma nova visualização na página de vendas (`/vendas`) que:
1. **Exiba um mapa geográfico do Brasil** com as cidades atendidas
2. **Use cores (intensidade)** para representar volume/valor de vendas por cidade
3. **Seja interativo**: hover mostra valores, filtros globais funcionam
4. **Acompanhe os filtros**: aplique filtros de data, moeda e intervalo

---

## 🏗️ Arquitetura da Solução

### 1. **Camada de Dados**

#### 1.1 Atualizar tipos (`src/lib/types/dataset.ts`)
```typescript
// Adicionar campos de localização
interface ImportedClient {
  id: string;
  name: string;
  city?: string;        // ← NOVO
  state?: string;       // ← NOVO (opcional)
  region?: string;      // ← NOVO (calculado)
}
```

#### 1.2 Dados Geográficos (`src/lib/mock/geo-data.ts` - novo arquivo)
```typescript
// Coordenadas (lat/long) e informações das cidades
export const CITY_COORDINATES = {
  "São Paulo": { lat: -23.55, lng: -46.63 },
  "Rio de Janeiro": { lat: -22.90, lng: -43.17 },
  // ... demais cidades
};

export const CITY_BOUNDARIES = {
  // Será usado para renderizar regiões no mapa
  sudeste: { center: [...], bounds: [...] },
  // ... demais regiões
};
```

#### 1.3 Função de Agregação (`src/lib/analytics/geo-sales.ts` - novo arquivo)
```typescript
export function salesByCityAndRegion(orders: ImportedOrder[])
  : { 
      cities: Record<string, CityMetrics>;
      regions: Record<string, RegionMetrics>;
    }

interface CityMetrics {
  city: string;
  region: string;
  totalSales: number;
  orderCount: number;
  avgTicket: number;
  coordinates: [lat: number, lng: number];
}
```

---

### 2. **Componente de Mapa** 

#### 2.1 Opções de Biblioteca
| Opção | Prós | Contras | Recomendação |
|-------|------|---------|--------------|
| **Leaflet + React-Leaflet** | Excelente, leve, muitos recursos | Requer CSS externo | ⭐ **Recomendado** |
| **Mapbox GL** | Muito poderoso, mapas lindos | Pago, mais complexo | Para futura escala |
| **SVG customizado** | Sem dependências, controle total | Mapas estáticos, complexo desenhar | Para MVP simples |
| **Deck.gl** | Ótimo para big data | Steep learning curve | Overkill agora |

**Recomendação**: Começar com **Leaflet + React-Leaflet** (leve, rápido, gratuito)

#### 2.2 Novo Componente (`src/components/charts/sales-heatmap-map.tsx`)
```typescript
interface SalesHeatmapMapProps {
  cities: Record<string, CityMetrics>;
  regions: Record<string, RegionMetrics>;
  currency: string;
  maxValue: number;
}

export function SalesHeatmapMap({ cities, regions, currency, maxValue }: SalesHeatmapMapProps) {
  // Renderizar:
  // 1. Mapa do Brasil com regiões
  // 2. Círculos/hexágonos em cada cidade com intensidade de cor
  // 3. Tooltips interativos
}
```

---

### 3. **Integração na UI**

#### Local na página de vendas
```
Page Vendas
├── PageHeader
├── KPI Cards (revenue, orders, etc)
├── Evolution Chart (mensal/diário)
├── [NOVO] Mapa de Calor Geográfico
│   └── SalesHeatmapMap
├── Sazonalidade (Heatmap temporal)
└── Pedidos Recentes
```

---

## 📋 Checklist de Implementação

### Fase 1: Dados & Analytics (1-2 horas)
- [ ] Adicionar campo `city` a `ImportedClient`
- [ ] Atualizar gerador de dados (`seed.ts`) para incluir cidades
- [ ] Criar `geo-data.ts` com coordenadas e regiões
- [ ] Criar `geo-sales.ts` com funções de agregação
- [ ] Testar agregação com dados mockados

### Fase 2: Componente Visual (2-3 horas)
- [ ] Instalar `react-leaflet`, `leaflet`
- [ ] Criar `SalesHeatmapMap.tsx`
- [ ] Implementar:
  - [ ] Renderização do mapa base
  - [ ] Círculos com intensidade por cidade
  - [ ] Escala de cores (branco → vermelho)
  - [ ] Tooltips com valores
  - [ ] Responsividade

### Fase 3: Integração & UX (1-2 horas)
- [ ] Conectar filtros globais (data, moeda)
- [ ] Adicionar a `vendas/page.tsx`
- [ ] Testar com dados reais
- [ ] Refinamentos visuais (cores, layout, performance)

### Fase 4: Extras (opcional, 1-2 horas)
- [ ] Legenda de cores com min/max
- [ ] Clique na cidade → tabela de vendas dessa cidade
- [ ] Animação ao carregar dados
- [ ] Exportar mapa como PNG

---

## 🛠️ Detalhes Técnicos

### Dependências a Adicionar
```json
{
  "react-leaflet": "^4.2.1",
  "leaflet": "^1.9.4",
  "@types/leaflet": "^1.9.8"
}
```

### Paleta de Cores Sugerida
```typescript
// Usar CSS variables existentes do projeto
const intensityColor = (value: number, max: number) => {
  const intensity = value / max;
  // gradient: hsl(var(--muted)) → hsl(var(--destructive))
  // white → red
}
```

### Performance
- Mapa é renderizado **client-side** apenas
- Agregação cacheada com `useMemo`
- Lazy-load Leaflet se necessário

---

## 🎨 Variações Futuras

1. **Modo cluster**: Agrupamento de cidades próximas em zoom out
2. **Comparativo**: Dois mapas lado a lado (período A vs B)
3. **Animação temporal**: Play button para ver evolução mês a mês
4. **Ranking sidebar**: Top 10 cidades com scroll sincronizado
5. **Export**: Baixar mapa como imagem ou relatório PDF

---

## ⏱️ Estimativa Total

| Fase | Tempo | Prioridade |
|------|-------|-----------|
| Dados & Analytics | 1-2h | 🔴 Crítica |
| Componente Visual | 2-3h | 🔴 Crítica |
| Integração | 1-2h | 🟡 Alta |
| Extras | 1-2h | 🟢 Baixa |
| **TOTAL** | **5-9h** | |

---

## 📌 Próximos Passos

1. ✅ Revisar este plano com o time
2. ⏭️ **[AGORA]** Fase 1: Começar com dados e coordenadas
3. Feedback & ajustes de requisitos
4. Implementação iterativa com testes

---

## 🔗 Referências no Projeto

- Componente Heatmap existente: `src/components/charts/heatmap.tsx`
- Tipos de dados: `src/lib/types/dataset.ts`
- Gerador de dados: `src/lib/mock/seed.ts` e `catalog.ts`
- Página de vendas: `src/app/(dashboard)/vendas/page.tsx`
- Funções de análise: `src/lib/analytics/`
