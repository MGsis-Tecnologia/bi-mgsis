"use client";

import * as React from "react";
import { TrendingUp, CheckCircle2, AlertCircle, Package, Zap } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatNumber, formatCurrency } from "@/lib/utils/format";
import { KPICard } from "@/components/charts/kpi-card";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

interface Resumo {
  kpis: {
    totalOrcamentos: number;
    orcamentosConfirmados: number;
    taxaConversao: number;
    valorTotal: number;
    valorConfirmado: number;
    valorEmRisco: number;
  };
  evolucao: Array<{ mes: string; criados: number; confirmados: number; taxa: number }>;
  vendedores: Array<{ vendedor: string; total: number; confirmados: number; taxa: number; valor: number }>;
  produtos: Array<{ produto: string; vezesProposto: number; vezesConfirmado: number; taxa: number }>;
  pendentes: Array<{ orcamento_id: string; cliente_nome: string; valor: number; dias: number }>;
}

export default function ProspeccaoPage() {
  const [loading, setLoading] = React.useState(true);
  const [data, setData] = React.useState<Resumo>({
    kpis: {
      totalOrcamentos: 0,
      orcamentosConfirmados: 0,
      taxaConversao: 0,
      valorTotal: 0,
      valorConfirmado: 0,
      valorEmRisco: 0,
    },
    evolucao: [],
    vendedores: [],
    produtos: [],
    pendentes: [],
  });

  const [filtros, setFiltros] = React.useState({
    dataInicio: "",
    dataFim: "",
    status: "todos",
  });

  React.useEffect(() => {
    fetchData();
  }, [filtros]);

  async function fetchData() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filtros.dataInicio) params.append("dataInicio", filtros.dataInicio);
      if (filtros.dataFim) params.append("dataFim", filtros.dataFim);
      if (filtros.status !== "todos") params.append("status", filtros.status);

      const res = await fetch(`/api/prospeccao/resumo?${params}`);
      if (!res.ok) throw new Error("Erro ao carregar");
      const json = await res.json();
      setData(json);
    } catch (err) {
      console.error("Erro:", err);
    } finally {
      setLoading(false);
    }
  }

  const { kpis, evolucao, vendedores, produtos, pendentes } = data;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="Análise de Oportunidades"
        title="Prospeccção"
        description="Orçamentos, propostas e taxa de conversão"
      />

      {/* SEÇÃO 1: KPIs PRINCIPAIS */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <KPICard
          label="Total de Orçamentos"
          value={formatNumber(kpis.totalOrcamentos)}
          icon={<Zap className="h-5 w-5" />}
          trend={kpis.totalOrcamentos > 0 ? "up" : "neutral"}
        />
        <KPICard
          label="Confirmados"
          value={formatNumber(kpis.orcamentosConfirmados)}
          icon={<CheckCircle2 className="h-5 w-5" />}
          trend="up"
        />
        <KPICard
          label="Taxa de Conversão"
          value={`${kpis.taxaConversao.toFixed(1)}%`}
          icon={<TrendingUp className="h-5 w-5" />}
          trend={kpis.taxaConversao >= 50 ? "up" : "neutral"}
        />
        <KPICard
          label="Valor em Risco"
          value={formatCurrency(kpis.valorEmRisco)}
          icon={<AlertCircle className="h-5 w-5" />}
          trend="down"
        />
      </div>

      {/* SEÇÃO 2: EVOLUÇÃO TEMPORAL */}
      {evolucao.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Evolução: Orçamentos vs Conversão</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={evolucao} margin={{ right: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey="mes" stroke="rgba(0,0,0,0.3)" />
                <YAxis yAxisId="left" stroke="rgba(0,0,0,0.3)" />
                <YAxis yAxisId="right" orientation="right" stroke="rgba(0,0,0,0.3)" />
                <Tooltip
                  contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "none", borderRadius: "6px" }}
                  labelStyle={{ color: "#fff" }}
                />
                <Legend />
                <Line yAxisId="left" type="monotone" dataKey="criados" stroke="#3b82f6" name="Criados" strokeWidth={2} />
                <Line yAxisId="left" type="monotone" dataKey="confirmados" stroke="#10b981" name="Confirmados" strokeWidth={2} />
                <Line yAxisId="right" type="monotone" dataKey="taxa" stroke="#f59e0b" name="Taxa %" strokeDasharray="5 5" strokeWidth={2} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* SEÇÃO 3: CONVERSÃO POR VENDEDOR */}
      {vendedores.length > 0 && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Performance por Vendedor (Gráfico)</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={vendedores} margin={{ right: 30 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.1)" />
                  <XAxis dataKey="vendedor" stroke="rgba(0,0,0,0.3)" angle={-45} textAnchor="end" height={80} />
                  <YAxis yAxisId="left" stroke="rgba(0,0,0,0.3)" />
                  <YAxis yAxisId="right" orientation="right" stroke="rgba(0,0,0,0.3)" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "rgba(0,0,0,0.8)", border: "none", borderRadius: "6px" }}
                    labelStyle={{ color: "#fff" }}
                  />
                  <Legend />
                  <Bar yAxisId="left" dataKey="total" fill="#3b82f6" name="Total" />
                  <Bar yAxisId="left" dataKey="confirmados" fill="#10b981" name="Confirmados" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-sm">Ranking de Vendedores</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="border-b border-border">
                    <tr>
                      <th className="px-3 py-2 text-left font-medium">Vendedor</th>
                      <th className="px-3 py-2 text-right font-medium">Total</th>
                      <th className="px-3 py-2 text-right font-medium">Confirmados</th>
                      <th className="px-3 py-2 text-right font-medium">Taxa (%)</th>
                      <th className="px-3 py-2 text-right font-medium">Valor Confirmado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {vendedores.map((v, i) => (
                      <tr key={i} className="hover:bg-muted/30">
                        <td className="px-3 py-2 font-medium">{v.vendedor}</td>
                        <td className="px-3 py-2 text-right">{formatNumber(v.total)}</td>
                        <td className="px-3 py-2 text-right font-medium text-positive">{formatNumber(v.confirmados)}</td>
                        <td className="px-3 py-2 text-right font-medium">{v.taxa.toFixed(1)}%</td>
                        <td className="px-3 py-2 text-right">{formatCurrency(v.valor)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}

      {/* SEÇÃO 4: ANÁLISE DE PRODUTOS */}
      {produtos.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Taxa de Conversão por Produto</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="border-b border-border">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Produto</th>
                    <th className="px-3 py-2 text-right font-medium">Vezes Proposto</th>
                    <th className="px-3 py-2 text-right font-medium">Confirmado</th>
                    <th className="px-3 py-2 text-right font-medium">Taxa (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {produtos.map((p, i) => (
                    <tr key={i} className="hover:bg-muted/30">
                      <td className="px-3 py-2">{p.produto}</td>
                      <td className="px-3 py-2 text-right">{formatNumber(p.vezesProposto)}</td>
                      <td className="px-3 py-2 text-right font-medium text-positive">{formatNumber(p.vezesConfirmado)}</td>
                      <td className="px-3 py-2 text-right font-medium">{p.taxa.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* SEÇÃO 5: ORÇAMENTOS PENDENTES (RISCO) */}
      {pendentes.length > 0 && (
        <Card className="border-l-4 border-l-warning">
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-warning" />
              Orçamentos Pendentes (Mais de 30 dias)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {pendentes.slice(0, 5).map((p, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border border-border/50 bg-muted/30 p-3">
                  <div>
                    <p className="text-sm font-medium">{p.cliente_nome}</p>
                    <p className="text-xs text-muted-foreground">{p.orcamento_id}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{formatCurrency(p.valor)}</p>
                    <p className="text-xs text-warning">{p.dias} dias pendente</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ESTADO VAZIO */}
      {loading && kpis.totalOrcamentos === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="mx-auto h-12 w-12 text-muted-foreground/30 mb-4" />
            <p className="text-sm text-muted-foreground">
              Nenhum dados de orçamento. Vá em Importação e importe seu CSV de orçamentos.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
