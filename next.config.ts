import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // A checagem de tipos e o lint rodam localmente (npm run type-check / build).
  // Pulá-los no build do container evita o passo mais pesado de RAM — que
  // estoura a memória em VPS enxuto (OOM no "Running TypeScript ...").
  typescript: { ignoreBuildErrors: true },
  eslint: { ignoreDuringBuilds: true },
  experimental: {
    optimizePackageImports: ["lucide-react", "recharts", "date-fns"],
  },
};

export default nextConfig;
