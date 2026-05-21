/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import * as React from "react";
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from "react-leaflet";
import { useFilters } from "@/lib/store/filters";
import { formatCurrency, formatNumber } from "@/lib/utils/format";
import { MAP_CENTER, MAP_ZOOM } from "@/lib/mock/cities-geo";
import type { CityMetrics } from "@/lib/analytics/geo-sales";
import "leaflet/dist/leaflet.css";

interface SalesHeatmapGeoProps {
  cities: Record<string, CityMetrics>;
  maxSales: number;
}

// Reenquadra o mapa para mostrar todas as cidades sempre que os dados mudam.
function FitBounds({ cities }: { cities: CityMetrics[] }) {
  const map = useMap();
  // Assinatura estável: muda quando as cidades/coordenadas mudam
  const signature = cities
    .map((c) => `${c.city}:${c.lat.toFixed(3)},${c.lng.toFixed(3)}`)
    .sort()
    .join("|");

  React.useEffect(() => {
    if (cities.length === 0) return;
    if (cities.length === 1) {
      map.setView([cities[0]!.lat, cities[0]!.lng], 9);
      return;
    }
    const bounds = cities.map((c) => [c.lat, c.lng] as [number, number]);
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 9 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, signature]);

  return null;
}

function getIntensityColor(value: number, max: number): string {
  if (max === 0 || value === 0) return "#f5f5f5"; // muted color

  const intensity = value / max;

  // Gradient: white -> red (using HSL)
  // HSL(0, 100%, 50%) = red
  // HSL(0, 0%, 95%) = very light gray (white-ish)
  const hue = 0; // red
  const saturation = Math.round(intensity * 100); // 0% (white) -> 100% (red)
  const lightness = Math.round(95 - intensity * 45); // 95% (white) -> 50% (red)

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function getCircleSize(value: number, max: number): number {
  if (max === 0) return 5;
  const intensity = value / max;
  return 8 + intensity * 22; // 8 to 30
}

export function SalesHeatmapGeo({ cities, maxSales }: SalesHeatmapGeoProps) {
  const currency = useFilters((s) => s.currency);
  const [mounted, setMounted] = React.useState(false);

  // Leaflet requires client-side rendering
  React.useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="w-full h-96 bg-muted/20 rounded-lg flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Carregando mapa...</p>
      </div>
    );
  }

  const citiesArray = Object.values(cities);
  if (citiesArray.length === 0) {
    return (
      <div className="w-full h-96 bg-muted/20 rounded-lg flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Nenhuma cidade com vendas encontrada</p>
      </div>
    );
  }

  return (
    <div className="w-full rounded-lg overflow-hidden border border-border">
      <MapContainer
        {...({
          center: MAP_CENTER,
          zoom: MAP_ZOOM,
          style: { height: "24rem", width: "100%" },
          scrollWheelZoom: true,
        } as any)}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          {...({} as any)}
        />

        <FitBounds cities={citiesArray} />

        {citiesArray.map((city) => (
          <CircleMarker
            key={city.city}
            {...({
              center: [city.lat, city.lng],
              radius: getCircleSize(city.totalSales, maxSales),
              fillColor: getIntensityColor(city.totalSales, maxSales),
              color: getIntensityColor(city.totalSales, maxSales),
              weight: 1,
              opacity: 0.8,
              fillOpacity: 0.75,
            } as any)}
          >
            <Popup>
              <div className="text-xs space-y-1">
                <p className="font-semibold">{city.city}</p>
                <p className="text-muted-foreground">
                  {city.country === "BR" ? "🇧🇷 Brasil" : "🇵🇾 Paraguai"}
                </p>
                <p>
                  <span className="text-muted-foreground">Vendas:</span>{" "}
                  {formatCurrency(city.totalSales, currency, { compact: true })}
                </p>
                <p>
                  <span className="text-muted-foreground">Pedidos:</span> {formatNumber(city.orderCount)}
                </p>
                <p>
                  <span className="text-muted-foreground">Ticket médio:</span>{" "}
                  {formatCurrency(city.avgTicket, currency)}
                </p>
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Legenda */}
      <div className="px-4 py-2 bg-muted/50 text-xs text-muted-foreground flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>Sem vendas</span>
          <div className="w-4 h-4 rounded bg-muted/40"></div>
        </div>
        <div className="flex items-center gap-2">
          <span>Máximo</span>
          <div className="w-4 h-4 rounded" style={{ backgroundColor: getIntensityColor(1, 1) }}></div>
        </div>
      </div>
    </div>
  );
}
