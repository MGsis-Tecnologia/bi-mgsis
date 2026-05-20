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

// Bounds aproximados para cada país (para gerar coordenadas automáticas)
const COUNTRY_BOUNDS = {
  BR: {
    latMin: -33.87,
    latMax: 5.27,
    lngMin: -74.1,
    lngMax: -34.77,
  },
  PY: {
    latMin: -27.6,
    latMax: -21.8,
    lngMin: -62.6,
    lngMax: -54.3,
  },
};

// Normaliza nome de cidade: lowercase, remove acentos e caracteres especiais entre parênteses
function normalizeCityName(city: string): string {
  return city
    .trim()
    .toLowerCase()
    .normalize("NFD") // Remove acentos
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s*\([^)]*\)/g, "") // Remove conteúdo entre parênteses
    .replace(/\s+/g, " ") // Normaliza espaços
    .trim();
}

// Cria um mapa normalizado de cidades para rápida lookup
function createCityLookup(): Record<string, string> {
  const map: Record<string, string> = {};
  for (const cityName in CITIES_GEO) {
    const normalized = normalizeCityName(cityName);
    map[normalized] = cityName;
  }
  return map;
}

// Gera coordenadas pseudo-aleatórias determinísticas para uma cidade desconhecida
// Usa hash do nome para garantir que a mesma cidade sempre tenha as mesmas coordenadas
function generateCityCoordinates(
  cityName: string,
  country: "BR" | "PY"
): { lat: number; lng: number } {
  const bounds = COUNTRY_BOUNDS[country];

  // Hash simples do nome para gerar números pseudo-aleatórios determinísticos
  let hash = 0;
  for (let i = 0; i < cityName.length; i++) {
    const char = cityName.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }

  // Converte hash em valores entre 0 e 1
  const seed1 = Math.abs(hash % 10000) / 10000;
  const seed2 = Math.abs((hash * 73856093) % 10000) / 10000;

  // Gera coordenadas dentro dos bounds do país
  const lat = bounds.latMin + seed1 * (bounds.latMax - bounds.latMin);
  const lng = bounds.lngMin + seed2 * (bounds.lngMax - bounds.lngMin);

  return { lat, lng };
}

// Detecta país pela sigla comum ou padrões no nome
function detectCountry(cityName: string): "BR" | "PY" {
  const nameLower = cityName.toLowerCase();

  // Se tem padrões típicos do Paraguai
  if (
    nameLower.includes("municipio") ||
    nameLower.includes("departamento") ||
    nameLower.includes("planta urbana")
  ) {
    return "PY";
  }

  // Heurística: mais cidades conhecidas do PY no CSV
  // Default para Paraguai se não conseguir identificar
  return "PY";
}

const CITY_LOOKUP = createCityLookup();

export function aggregateSalesByCity(orders: ImportedOrder[]): Record<string, CityMetrics> {
  const cityData: Record<string, CityMetrics> = {};
  const coordCache: Record<string, { lat: number; lng: number; country: "BR" | "PY" }> = {};

  for (const order of orders) {
    const cityRaw = order.clientCity?.trim();
    if (!cityRaw) continue; // Ignora se não tem cidade

    // Normaliza e busca a cidade
    const normalized = normalizeCityName(cityRaw);
    let cityStandard = CITY_LOOKUP[normalized];
    let geoData = cityStandard ? CITIES_GEO[cityStandard] : null;

    // Se não encontrou na lista, gera coordenadas automaticamente
    if (!cityStandard) {
      if (!coordCache[normalized]) {
        const country = detectCountry(cityRaw);
        const coords = generateCityCoordinates(cityRaw, country);
        coordCache[normalized] = { ...coords, country };
        console.log(`Cidade auto-gerada: "${cityRaw}" (${country}) → [${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)}]`);
      }

      cityStandard = cityRaw; // Usa o nome original como chave
      geoData = coordCache[normalized];
    }

    if (!geoData) continue; // Safety check

    if (!cityData[cityStandard]) {
      cityData[cityStandard] = {
        city: cityStandard,
        country: geoData.country,
        totalSales: 0,
        orderCount: 0,
        avgTicket: 0,
        lat: geoData.lat,
        lng: geoData.lng,
      };
    }

    cityData[cityStandard].totalSales += order.totalBRL;
    cityData[cityStandard].orderCount += 1;
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
