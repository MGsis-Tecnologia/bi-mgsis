# 🗺️ Plano de Implementação: Mapa de Calor de Vendas por Cidade

## 📋 Requisitos Confirmados

1. ✅ **Adicionar coluna "pedido_cidade"** ao import CSV
2. ✅ **SEM filtros por cidade** (mantém simples)
3. ✅ **Mapa de calor com separação**:
   - Brasil mostra APENAS vendas do Brasil
   - Paraguai mostra APENAS vendas do Paraguai
4. ✅ **Cidades não encontradas**: ignora silenciosamente

---

## 🛠️ FASE 1: ADICIONAR COLUNA DE CIDADE AO CSV

### O Que Vou Fazer:

**Arquivo: `src/lib/types/dataset.ts`**
- Adicionar campo `pedido_cidade: string` em `OrderLineItem`
- Adicionar campo `clientCity: string` em `ImportedOrder`

**Arquivo: `src/lib/parsers/csv-parser.ts`**
- Ao fazer parse do CSV, procurar coluna `pedido_cidade`
- Se não encontrar, deixar vazio `""`
- Passar para estrutura tipada

**Arquivo: `src/lib/mock/seed.ts`**
- Ao gerar dados FAKE de teste, sortear aleatoriamente:
  - 85% cidades do Brasil
  - 15% cidades do Paraguai
- Adicionar essas cidades ao cliente gerado

**Resultado:**
```typescript
// Cada order terá:
{
  id: "PED-001",
  clientCity: "São Paulo",  // ← NOVA COLUNA
  totalBRL: 1500,
  // ... resto
}
```

✅ **Mudanças:** 3 arquivos, campos apenas adicionados (não remove nada)

---

## 🛠️ FASE 2: CRIAR DADOS GEOGRÁFICOS

### O Que Vou Fazer:

**Arquivo: `src/lib/mock/cities-geo.json` (NOVO)**
- Lista simples com cidade → país, latitude, longitude
- 25 cidades Brasil + 6 cidades Paraguai = 31 total

```json
{
  "Brasil": {
    "São Paulo": { "lat": -23.55, "lng": -46.63 },
    "Rio de Janeiro": { "lat": -22.90, "lng": -43.17 },
    ...mais 23 cidades
  },
  "Paraguai": {
    "Assunção": { "lat": -25.26, "lng": -57.57 },
    "Ciudad del Este": { "lat": -25.50, "lng": -54.61 },
    ...mais 4 cidades
  }
}
```

**Arquivo: `src/lib/analytics/geo-sales.ts` (NOVO)**
- Função que agregará vendas por cidade
- Retorna: `{ "São Paulo": { sales: 50000, count: 12, country: "BR" }, ... }`

```typescript
export function aggregateSalesByCity(orders: ImportedOrder[]) {
  const cityData: Record<string, {
    city: string;
    country: "BR" | "PY";
    totalSales: number;
    orderCount: number;
    lat: number;
    lng: number;
  }> = {};
  
  for (const order of orders) {
    const city = order.clientCity;
    if (!city) continue;  // ← Ignora se não tem cidade
    
    // Tenta encontrar a cidade nos dados geográficos
    const geoData = lookupCity(city);
    if (!geoData) continue;  // ← Ignora se não encontra
    
    if (!cityData[city]) {
      cityData[city] = {
        city,
        country: geoData.country,
        totalSales: 0,
        orderCount: 0,
        lat: geoData.lat,
        lng: geoData.lng,
      };
    }
    
    cityData[city].totalSales += order.totalBRL;
    cityData[city].orderCount += 1;
  }
  
  return cityData;
}
```

✅ **Mudanças:** 1 JSON + 1 novo arquivo TS

---

## 🛠️ FASE 3: CRIAR COMPONENTE MAPA

### O Que Vou Fazer:

**Arquivo: `src/components/charts/sales-heatmap-geo.tsx` (NOVO)**
- Componente React que renderiza mapa com Leaflet
- Recebe dados agregados de cidades
- Mostra círculos coloridos para cada cidade

```typescript
interface SalesHeatmapGeoProps {
  cities: Record<string, CityData>;  // { "São Paulo": {...}, "Assunção": {...} }
  currency: string;
}

export function SalesHeatmapGeo({ cities, currency }: SalesHeatmapGeoProps) {
  // Retorna:
  // - MapContainer (Leaflet) mostrando Brasil + Paraguai
  // - CircleMarkers para cada cidade
  // - Cores por intensidade de venda (branco → vermelho)
  // - Tooltip ao passar mouse: "São Paulo - R$ 50.000 (12 vendas)"
}
```

**Estilo:**
- Cor: branco (sem venda) → vermelho (máximo)
- Tamanho: círculo pequeno (poucos pedidos) → grande (muitos pedidos)
- Hover: tooltip com cidade, valor, quantidade

✅ **Mudanças:** 1 novo componente React

---

## 🛠️ FASE 4: INTEGRAR NA PÁGINA DE VENDAS

### O Que Vou Fazer:

**Arquivo: `src/app/(dashboard)/vendas/page.tsx`**

Adicionar na página (entre os gráficos existentes):

```typescript
const citiesData = React.useMemo(
  () => aggregateSalesByCity(orders),
  [orders]
);

// Retornar novo Card com:
<Card>
  <CardHeader>
    <CardTitle>Mapa de Vendas por Cidade</CardTitle>
  </CardHeader>
  <CardContent>
    <SalesHeatmapGeo cities={citiesData} currency={currency} />
  </CardContent>
</Card>
```

✅ **Mudanças:** 1 importação + 1 Card adicionado

---

## 📊 FLUXO VISUAL DA SOLUÇÃO

```
CSV Importado (com coluna "pedido_cidade")
        ↓
OrderLineItem[] (com clientCity)
        ↓
ImportedOrder[] (com clientCity)
        ↓
useMemo: aggregateSalesByCity(orders)
        ↓
cityData = {
  "São Paulo": { sales: 50000, country: "BR", lat: -23.55, lng: -46.63 },
  "Assunção": { sales: 8000, country: "PY", lat: -25.26, lng: -57.57 },
  ...ignoradas: cidades não encontradas
}
        ↓
<SalesHeatmapGeo cities={cityData} />
        ↓
Mapa Leaflet renderiza:
- Brasil com cidades em cores
- Paraguai com cidades em cores
- Legenda de intensidade
```

---

## 🔍 COMPORTAMENTO POR CASO

### ✅ Caso 1: Cidade do Brasil Encontrada
```
Order: { clientCity: "São Paulo", totalBRL: 5000 }
         ↓
Encontra em cities-geo.json: { country: "BR", lat: -23.55, lng: -46.63 }
         ↓
Agrega: cityData["São Paulo"].totalSales += 5000
         ↓
Renderiza: Círculo vermelho em São Paulo no mapa
```

### ✅ Caso 2: Cidade do Paraguai Encontrada
```
Order: { clientCity: "Assunción", totalBRL: 2000 }
         ↓
Encontra em cities-geo.json: { country: "PY", lat: -25.26, lng: -57.57 }
         ↓
Agrega: cityData["Assunción"].totalSales += 2000
         ↓
Renderiza: Círculo vermelho em Assunción no mapa
```

### ❌ Caso 3: Cidade NÃO Encontrada
```
Order: { clientCity: "Desconhecida", totalBRL: 1000 }
         ↓
NÃO encontra em cities-geo.json
         ↓
Ignora (continue; no loop)
         ↓
NÃO renderiza nada
         ↓
Console.log silencioso (ou warning, você decide)
```

---

## 📦 DEPENDÊNCIAS A INSTALAR

```bash
npm install react-leaflet leaflet @types/leaflet
```

Arquivo: `package.json` será modificado automaticamente.

---

## 📁 RESUMO DOS ARQUIVOS

| Arquivo | Tipo | O Quê |
|---------|------|-------|
| `dataset.ts` | Modificar | Adicionar `clientCity: string` |
| `csv-parser.ts` | Modificar | Parse coluna `pedido_cidade` |
| `seed.ts` | Modificar | Gerar cidades (85% BR, 15% PY) |
| `cities-geo.json` | **NOVO** | Coordenadas de 31 cidades |
| `geo-sales.ts` | **NOVO** | Função de agregação |
| `sales-heatmap-geo.tsx` | **NOVO** | Componente Leaflet |
| `vendas/page.tsx` | Modificar | Integrar mapa |

**Total:** 3 modificações + 3 novos arquivos

---

## ⏱️ ESTIMATIVA

- **Fase 1** (CSV): 30 min
- **Fase 2** (Dados geo): 1 h
- **Fase 3** (Componente): 1.5 h
- **Fase 4** (Integração): 30 min
- **Testes**: 30 min

**Total: ~4 horas** para MVP funcional

---

## ✅ CHECKLIST DE IMPLEMENTAÇÃO

- [ ] Fase 1: Adicionar coluna `pedido_cidade`
- [ ] Fase 2: Criar `cities-geo.json` e `geo-sales.ts`
- [ ] Fase 3: Criar componente `SalesHeatmapGeo`
- [ ] Fase 4: Integrar em `vendas/page.tsx`
- [ ] Instalar dependências Leaflet
- [ ] Testar com dados fake (seed.ts)
- [ ] Testar com CSV real (se disponível)
- [ ] Refinamentos visuais (cores, tamanhos)

---

## 🎨 EXEMPLOS VISUAIS (Texto)

### Como vai ficar:

```
┌─────────────────────────────────────────┐
│ Mapa de Vendas por Cidade               │
├─────────────────────────────────────────┤
│                                         │
│   [Mapa Leaflet do Brasil + Paraguai]  │
│                                         │
│   ○ São Paulo (vermelho) - R$ 50k      │
│   ○ Rio de Janeiro (vermelho) - R$ 30k│
│   ○ Curitiba (laranja) - R$ 15k       │
│   ○ Assunción (vermelho) - R$ 8k      │
│   ○ Ciudad del Este (rosa) - R$ 3k    │
│                                         │
│   [Legenda: Branco - Sem vendas]       │
│   [Legenda: Vermelho - Máximo]         │
│                                         │
└─────────────────────────────────────────┘
```

---

## ❓ DÚVIDAS ESCLARECIDAS

**P: Se o CSV não tiver coluna "pedido_cidade", o que acontece?**
R: Campo fica vazio `""`. Dados não são agregados (caso 3 acima). ✅

**P: Preciso normalizar nomes de cidades (acentos, maiúsculas)?**
R: Sim, vou fazer lookup case-insensitive e sem acentos. ✅

**P: Se a venda vier sem cidade, quebra algo?**
R: Não, ignora silenciosamente (continue no loop). ✅

**P: Como fica a cor de cada círculo?**
R: `intensity = totalSales / maxSales` → gradiente HSL. ✅

**P: O mapa é responsivo (mobile)?**
R: Sim, Leaflet é responsivo por padrão. ✅

---

## 🚀 PRÓXIMO PASSO

**Você aceita este plano?** Se sim:
1. Confirma os requisitos acima ✅
2. Eu começo pela **Fase 1** (CSV)
3. Você revisa cada fase antes de ir pra próxima

**Alguma mudança ou dúvida?** Me diz agora! 😊
