/**
 * Contrato do insight exibido na sidebar e no painel do dashboard.
 *
 * A geração ficava aqui, percorrendo a lista de pedidos no navegador. Com a
 * fase C o navegador não tem mais a lista: quem monta os insights é
 * `insights-agg.ts`, a partir dos números já agregados pelo servidor. Os
 * textos e limiares estão lá, num lugar só.
 */
export interface Insight {
  id: string;
  tone: "positive" | "negative" | "warning" | "neutral";
  title: string;
  body: string;
  metric?: string;
}
