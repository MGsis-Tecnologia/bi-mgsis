// Geographic data for Brazilian and Paraguayan cities
export interface CityGeo {
  lat: number;
  lng: number;
  country: "BR" | "PY";
}

export const CITIES_GEO: Record<string, CityGeo> = {
  // Brasil - Sudeste
  "São Paulo": { lat: -23.5505, lng: -46.6333, country: "BR" },
  "Rio de Janeiro": { lat: -22.9068, lng: -43.1729, country: "BR" },
  "Belo Horizonte": { lat: -19.9167, lng: -43.9345, country: "BR" },
  Campinas: { lat: -22.8845, lng: -47.0581, country: "BR" },
  Vitória: { lat: -20.3155, lng: -40.3384, country: "BR" },
  Santos: { lat: -23.9645, lng: -46.3344, country: "BR" },

  // Brasil - Sul
  Curitiba: { lat: -25.4284, lng: -49.2733, country: "BR" },
  "Porto Alegre": { lat: -30.0331, lng: -51.2304, country: "BR" },
  Florianópolis: { lat: -27.5969, lng: -48.5495, country: "BR" },
  Joinville: { lat: -26.3045, lng: -48.8487, country: "BR" },
  "Caxias do Sul": { lat: -29.1676, lng: -51.1789, country: "BR" },

  // Brasil - Centro-Oeste
  Brasília: { lat: -15.8267, lng: -47.8711, country: "BR" },
  Goiânia: { lat: -16.6869, lng: -49.2645, country: "BR" },
  Cuiabá: { lat: -15.5939, lng: -56.0913, country: "BR" },
  "Campo Grande": { lat: -20.4697, lng: -54.6201, country: "BR" },

  // Brasil - Nordeste
  Salvador: { lat: -12.9714, lng: -38.5014, country: "BR" },
  Recife: { lat: -8.0476, lng: -34.877, country: "BR" },
  Fortaleza: { lat: -3.7319, lng: -38.5267, country: "BR" },
  Natal: { lat: -5.795, lng: -35.209, country: "BR" },
  Maceió: { lat: -9.6498, lng: -35.735, country: "BR" },
  "São Luís": { lat: -2.5551, lng: -44.3055, country: "BR" },

  // Brasil - Norte
  Manaus: { lat: -3.1190, lng: -60.0217, country: "BR" },
  Belém: { lat: -1.4558, lng: -48.4908, country: "BR" },
  "Porto Velho": { lat: -8.7619, lng: -63.9039, country: "BR" },
  Palmas: { lat: -10.2105, lng: -48.3281, country: "BR" },

  // Paraguai - Principais Cidades e Departamentos
  Assunción: { lat: -25.2637, lng: -57.5759, country: "PY" },
  "Ciudad del Este": { lat: -25.5, lng: -54.6, country: "PY" },
  Encarnación: { lat: -27.333, lng: -55.833, country: "PY" },
  Villarrica: { lat: -26.05, lng: -56.07, country: "PY" },
  "Pedro Juan Caballero": { lat: -22.54, lng: -55.76, country: "PY" },
  Concepción: { lat: -23.38, lng: -57.48, country: "PY" },
  // Cidades adicionais do Paraguai
  Curuguaty: { lat: -24.48, lng: -55.5, country: "PY" },
  Vaqueria: { lat: -27.55, lng: -56.45, country: "PY" },
  Naranjal: { lat: -27.5, lng: -56.15, country: "PY" },
  "Corpus Christi": { lat: -27.08, lng: -55.5, country: "PY" },
  "Capitan Meza": { lat: -26.15, lng: -55.95, country: "PY" },
  Katuete: { lat: -26.95, lng: -56.25, country: "PY" },
  "Santa Rosa": { lat: -26.25, lng: -56.5, country: "PY" },
  "San Cristobal": { lat: -26.3, lng: -56.3, country: "PY" },
  Capiibary: { lat: -26.8, lng: -55.7, country: "PY" },
  "Maria Auxiliadora": { lat: -27.15, lng: -55.8, country: "PY" },
  Fram: { lat: -27.4, lng: -55.9, country: "PY" },
  // Mais cidades do Paraguai (departamentos principais)
  "San Juan Bautista": { lat: -25.38, lng: -56.98, country: "PY" },
  Filadelfia: { lat: -23.08, lng: -60.02, country: "PY" },
  "Mariano Roque Alonso": { lat: -25.35, lng: -57.35, country: "PY" },
  "San Antonio": { lat: -25.52, lng: -56.42, country: "PY" },
  Caaguazu: { lat: -24.95, lng: -55.5, country: "PY" },
  "Coronel Oviedo": { lat: -25.43, lng: -55.48, country: "PY" },
  Vileta: { lat: -25.88, lng: -56.48, country: "PY" },
  Caazapa: { lat: -26.18, lng: -55.82, country: "PY" },
  "Nueva Italia": { lat: -26.07, lng: -55.15, country: "PY" },
  "Salto del Guairá": { lat: -24.08, lng: -54.28, country: "PY" },
  Tembiapora: { lat: -23.25, lng: -54.6, country: "PY" },
};

// Map bounds for the region (SW and NE corners)
export const MAP_BOUNDS = [
  [-33.87, -74.1], // SW: South of Brazil
  [5.27, -34.77], // NE: North of Brazil
];

// Default map center (between Brazil and Paraguay)
export const MAP_CENTER: [number, number] = [-15, -55];
export const MAP_ZOOM = 4;
