import { CITIES_GEO } from "@/lib/mock/cities-geo";
import type { ImportedOrder } from "@/lib/types/dataset";

export interface CityMetrics {
  city: string;
  country: "BR" | "PY";
  totalSales: number;
  orderCount: number;
  avgTicket: number;
  lat: number;
  lng: number;
}

// Bounds aproximados para cada país (fallback para coordenadas automáticas)
const COUNTRY_BOUNDS = {
  BR: { latMin: -33.87, latMax: 5.27, lngMin: -74.1, lngMax: -34.77 },
  PY: { latMin: -27.6, latMax: -21.8, lngMin: -62.6, lngMax: -54.3 },
};

// Siglas das 27 unidades federativas do Brasil → coordenada da capital.
// Usado para (1) detectar que a cidade é brasileira e (2) posicioná-la
// próximo do estado correto quando ela não está em CITIES_GEO.
const BR_STATE_CENTROIDS: Record<string, { lat: number; lng: number }> = {
  AC: { lat: -9.97, lng: -67.81 },
  AL: { lat: -9.65, lng: -35.74 },
  AP: { lat: 0.03, lng: -51.07 },
  AM: { lat: -3.12, lng: -60.02 },
  BA: { lat: -12.97, lng: -38.5 },
  CE: { lat: -3.73, lng: -38.52 },
  DF: { lat: -15.78, lng: -47.93 },
  ES: { lat: -20.32, lng: -40.34 },
  GO: { lat: -16.69, lng: -49.26 },
  MA: { lat: -2.53, lng: -44.3 },
  MT: { lat: -15.6, lng: -56.1 },
  MS: { lat: -20.44, lng: -54.65 },
  MG: { lat: -19.92, lng: -43.94 },
  PA: { lat: -1.46, lng: -48.5 },
  PB: { lat: -7.12, lng: -34.86 },
  PR: { lat: -25.43, lng: -49.27 },
  PE: { lat: -8.05, lng: -34.88 },
  PI: { lat: -5.09, lng: -42.8 },
  RJ: { lat: -22.91, lng: -43.17 },
  RN: { lat: -5.79, lng: -35.21 },
  RS: { lat: -30.03, lng: -51.23 },
  RO: { lat: -8.76, lng: -63.9 },
  RR: { lat: 2.82, lng: -60.67 },
  SC: { lat: -27.59, lng: -48.55 },
  SP: { lat: -23.55, lng: -46.63 },
  SE: { lat: -10.95, lng: -37.07 },
  TO: { lat: -10.18, lng: -48.33 },
};

// Hash determinístico de uma string → inteiro 32 bits
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = hash & hash;
  }
  return hash;
}

// Remove acentos e baixa a caixa
function stripAccents(str: string): string {
  return str
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

// Separa o nome da cidade da sigla do estado (UF). Exemplos aceitos:
// "São Paulo - SP", "São Paulo/SP", "São Paulo, SP", "São Paulo (SP)", "SAO PAULO SP"
function parseCityParts(raw: string): { name: string; uf: string | null } {
  let s = raw.trim();
  let uf: string | null = null;

  // UF entre parênteses: "São Paulo (SP)"
  const paren = s.match(/\(([A-Za-z]{2})\)\s*$/);
  if (paren) {
    uf = paren[1]!.toUpperCase();
    s = s.slice(0, paren.index).trim();
  } else {
    // UF após separador ( - / , ) ou espaço no final: "São Paulo - SP"
    const sep = s.match(/^(.+?)\s*[-/,]\s*([A-Za-z]{2})\s*$/);
    if (sep) {
      uf = sep[2]!.toUpperCase();
      s = sep[1]!.trim();
    } else {
      const space = s.match(/^(.+?)\s+([A-Za-z]{2})\s*$/);
      if (space && BR_STATE_CENTROIDS[space[2]!.toUpperCase()]) {
        uf = space[2]!.toUpperCase();
        s = space[1]!.trim();
      }
    }
  }

  if (uf && !BR_STATE_CENTROIDS[uf]) uf = null; // só aceita UF brasileira válida
  return { name: s, uf };
}

// Normaliza nome de cidade: sem acento, minúsculo, sem parênteses, sem UF
function normalizeCityName(city: string): string {
  const { name } = parseCityParts(city);
  return stripAccents(name)
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

// Mapa normalizado das cidades conhecidas para lookup rápido
function createCityLookup(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const cityName in CITIES_GEO) {
    map[normalizeCityName(cityName)] = cityName;
  }
  return map;
}

const CITY_LOOKUP = createCityLookup();

// Gera coordenadas pseudo-aleatórias determinísticas dentro dos bounds do país
function generateCityCoordinates(
  cityName: string,
  country: "BR" | "PY"
): { lat: number; lng: number } {
  const bounds = COUNTRY_BOUNDS[country];
  const hash = hashString(cityName);
  const seed1 = Math.abs(hash % 10000) / 10000;
  const seed2 = Math.abs((hash * 73856093) % 10000) / 10000;
  return {
    lat: bounds.latMin + seed1 * (bounds.latMax - bounds.latMin),
    lng: bounds.lngMin + seed2 * (bounds.lngMax - bounds.lngMin),
  };
}

// Coordenada próxima da capital do estado, com pequeno deslocamento
// determinístico para cidades diferentes do mesmo estado não se sobreporem
function coordinatesNearState(uf: string, cityName: string): { lat: number; lng: number } {
  const center = BR_STATE_CENTROIDS[uf]!;
  const hash = hashString(cityName);
  const jitterLat = ((Math.abs(hash % 1000) / 1000) - 0.5) * 1.6; // ±0,8°
  const jitterLng = ((Math.abs((hash >> 5) % 1000) / 1000) - 0.5) * 1.6;
  return { lat: center.lat + jitterLat, lng: center.lng + jitterLng };
}

// Detecta o país da cidade combinando UF, padrões de nome e a moeda do pedido
function detectCountry(
  cityName: string,
  uf: string | null,
  currencyId: string
): "BR" | "PY" {
  // 1. UF brasileira explícita
  if (uf) return "BR";

  const nameLower = stripAccents(cityName);

  // 2. Padrões típicos do Paraguai
  if (
    nameLower.includes("municipio") ||
    nameLower.includes("departamento") ||
    nameLower.includes("planta urbana")
  ) {
    return "PY";
  }

  // 3. Moeda do pedido como pista: R$ (1) → Brasil · G$ (3) → Paraguai
  if (currencyId === "1") return "BR";
  if (currencyId === "3") return "PY";

  // 4. Sem informação suficiente
  return "PY";
}

export function aggregateSalesByCity(orders: ImportedOrder[]): Record<string, CityMetrics> {
  const cityData: Record<string, CityMetrics> = {};
  const coordCache: Record<string, { lat: number; lng: number; country: "BR" | "PY" }> = {};

  for (const order of orders) {
    const cityRaw = order.clientCity?.trim();
    if (!cityRaw) continue; // Ignora se não tem cidade

    const { name: cityName, uf } = parseCityParts(cityRaw);
    const normalized = normalizeCityName(cityRaw);
    if (!normalized) continue;

    // 1. Tenta achar na lista de cidades conhecidas (coordenadas reais)
    const cityStandardKnown = CITY_LOOKUP[normalized];
    let cityKey: string;
    let geoData: { lat: number; lng: number; country: "BR" | "PY" } | null = null;

    if (cityStandardKnown) {
      cityKey = cityStandardKnown;
      geoData = CITIES_GEO[cityStandardKnown]!;
    } else {
      // 2. Cidade desconhecida — geocodifica e guarda em cache
      cityKey = uf ? `${cityName} - ${uf}` : cityName;
      const cacheKey = `${normalized}|${uf ?? ""}`;
      if (!coordCache[cacheKey]) {
        const country = detectCountry(cityName, uf, order.currencyId);
        const coords =
          country === "BR" && uf
            ? coordinatesNearState(uf, normalized)
            : generateCityCoordinates(normalized, country);
        coordCache[cacheKey] = { ...coords, country };
      }
      geoData = coordCache[cacheKey];
    }

    if (!geoData) continue;

    if (!cityData[cityKey]) {
      cityData[cityKey] = {
        city: cityKey,
        country: geoData.country,
        totalSales: 0,
        orderCount: 0,
        avgTicket: 0,
        lat: geoData.lat,
        lng: geoData.lng,
      };
    }

    cityData[cityKey].totalSales += order.totalBRL;
    cityData[cityKey].orderCount += 1;
  }

  // Calcula ticket médio
  for (const city in cityData) {
    if (cityData[city].orderCount > 0) {
      cityData[city].avgTicket = cityData[city].totalSales / cityData[city].orderCount;
    }
  }

  return cityData;
}

export function separateByContinry(
  cities: Record<string, CityMetrics>
): { br: Record<string, CityMetrics>; py: Record<string, CityMetrics> } {
  const br: Record<string, CityMetrics> = {};
  const py: Record<string, CityMetrics> = {};

  for (const [name, metrics] of Object.entries(cities)) {
    if (metrics.country === "BR") {
      br[name] = metrics;
    } else {
      py[name] = metrics;
    }
  }

  return { br, py };
}

export function getMaxSales(cities: Record<string, CityMetrics>): number {
  return Math.max(...Object.values(cities).map((c) => c.totalSales), 0);
}
