import { getDatabaseUrl } from "@/lib/server/db-config";
import { testConnection } from "@/lib/server/db";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { DatasetBootstrap } from "@/components/layout/dataset-bootstrap";
import { DbError } from "@/components/layout/db-error";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const url = getDatabaseUrl();
  if (!url) return <DbError />;

  try {
    await testConnection(url);
  } catch (err) {
    return <DbError detail={`Falha ao conectar: ${(err as Error).message}`} />;
  }

  return (
    <TooltipProvider delayDuration={200}>
      <DatasetBootstrap />
      <div className="flex min-h-screen bg-background">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar />
          <main className="flex-1 px-4 md:px-6 lg:px-8 py-6 lg:py-8 max-w-[1440px] w-full mx-auto">
            {children}
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
