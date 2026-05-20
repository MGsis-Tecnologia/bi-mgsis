"use client";

import * as React from "react";
import { Clock } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { useTranslation } from "@/lib/hooks/use-translation";

export default function ContasPagarPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow={t("pagar.header.eyebrow")}
        title={t("pagar.header.title")}
        description={t("pagar.header.desc")}
      />

      <div className="flex flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-border py-24 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Clock className="h-5 w-5 text-muted-foreground" />
        </div>
        <p className="text-sm text-muted-foreground">{t("pagar.coming_soon")}</p>
      </div>
    </div>
  );
}
