import { redirect } from "next/navigation";
import { getDatabaseUrl } from "@/lib/server/db-config";
import { testConnection } from "@/lib/server/db";

export default async function Home() {
  const url = await getDatabaseUrl();
  if (!url) redirect("/setup");

  try {
    await testConnection(url);
  } catch {
    redirect("/setup");
  }

  redirect("/login");
}
