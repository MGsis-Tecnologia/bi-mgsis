import { redirect } from "next/navigation";
import { getDatabaseUrl } from "@/lib/server/db-config";
import { testConnection } from "@/lib/server/db";
import { DbError } from "@/components/layout/db-error";

export const dynamic = "force-dynamic";

export default async function Home() {
  const url = getDatabaseUrl();
  if (!url) return <DbError />;

  try {
    await testConnection(url);
  } catch (err) {
    return <DbError detail={`Falha ao conectar: ${(err as Error).message}`} />;
  }

  redirect("/login");
}
