import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BrandMark } from "@/components/layout/brand-mark";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      <div className="mb-6"><BrandMark /></div>
      <div className="font-serif text-[80px] leading-none tracking-editorial">404</div>
      <h1 className="mt-2 text-lg font-medium">Página não encontrada</h1>
      <p className="mt-1 max-w-md text-center text-sm text-muted-foreground">
        A rota solicitada não existe ou foi movida. Volte ao dashboard para continuar.
      </p>
      <Button asChild className="mt-6" variant="outline">
        <Link href="/dashboard">
          <ArrowLeft className="h-4 w-4" />
          Voltar ao dashboard
        </Link>
      </Button>
    </div>
  );
}
