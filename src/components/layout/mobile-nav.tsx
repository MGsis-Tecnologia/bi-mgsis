"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/lib/hooks/use-translation";
import { useNavGroups, type UseNavGroupsOptions } from "@/lib/hooks/use-nav-groups";

/**
 * Menu de navegação pra telas abaixo do breakpoint `lg` — a `<Sidebar>` de
 * desktop é `hidden lg:flex` e, até este componente, não existia NENHUM jeito
 * de navegar entre telas no celular (o Topbar só mostrava a logo). Mesma
 * lista/mesma regra de permissão da sidebar, via `useNavGroups` — só o
 * layout muda (gaveta deslizante em vez de coluna fixa).
 */
export function MobileNav(props: UseNavGroupsOptions) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const navGroups = useNavGroups(props);
  const [open, setOpen] = React.useState(false);

  // Fecha sozinho quando a rota muda (clicou num link).
  React.useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Abrir menu"
          className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 lg:hidden"
        >
          <Menu className="h-[18px] w-[18px]" />
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay
          className={cn(
            "fixed inset-0 z-40 bg-black/50 lg:hidden",
            "data-[state=open]:animate-in data-[state=open]:fade-in-0",
            "data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
          )}
        />
        <Dialog.Content
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col border-r border-border bg-surface lg:hidden",
            "data-[state=open]:animate-in data-[state=open]:slide-in-from-left data-[state=open]:duration-200",
            "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=closed]:duration-150"
          )}
        >
          <Dialog.Title className="sr-only">Menu de navegação</Dialog.Title>
          <Dialog.Description className="sr-only">
            Lista de telas do MGSIS Analytics
          </Dialog.Description>

          <div className="flex items-center justify-between border-b border-border px-4 py-4">
            <Link
              href="/dashboard"
              className="flex items-center gap-2"
              onClick={() => setOpen(false)}
            >
              <Image
                src="/logo-mgsis.png"
                alt="MGSIS Tecnologia"
                width={36}
                height={22}
                className="object-contain"
              />
              <span className="font-serif text-[15px] leading-none tracking-wide text-foreground">
                MGSIS Analytics
              </span>
            </Link>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Fechar menu"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40"
              >
                <X className="h-4 w-4" />
              </button>
            </Dialog.Close>
          </div>

          <nav className="flex-1 overflow-y-auto py-3">
            {navGroups.map((group) => (
              <div key={group.sectionKey} className="px-3 pb-4">
                <div className="px-2 pb-1.5 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {t(group.sectionKey)}
                </div>
                <ul className="flex flex-col gap-0.5">
                  {group.items.map((item) => {
                    const active = pathname === item.href;
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          className={cn(
                            "flex items-center gap-3 rounded-md px-2.5 py-2.5 text-[15px] transition-colors",
                            active
                              ? "bg-muted/70 text-foreground font-medium"
                              : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                          )}
                        >
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                          <span className="truncate">{t(item.labelKey)}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
