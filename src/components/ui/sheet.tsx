"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Painel lateral, sobre o Dialog do Radix — traz foco preso, Esc e clique fora
 * de graça, o que uma div solta não teria.
 *
 * **z-[90] de propósito.** A escala desta aplicação: topbar 30, menu mobile
 * 40/50, tabela maximizada do Estoque `fixed inset-0 z-[70]`, popover e select
 * 80. O painel precisa abrir por cima de tudo isso, senão sumiria justamente
 * quando a tabela está em tela cheia — que é quando mais se clica numa linha.
 */
const Sheet = DialogPrimitive.Root;
const SheetClose = DialogPrimitive.Close;

const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPrimitive.Portal>
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-[90] bg-foreground/20 backdrop-blur-[1px]",
        "data-[state=open]:animate-in data-[state=open]:fade-in-0",
        "data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
      )}
    />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-y-0 right-0 z-[90] flex w-[min(100vw,700px)] flex-col",
        "border-l border-border bg-surface shadow-2xl shadow-foreground/10",
        "duration-200 data-[state=open]:animate-in data-[state=open]:slide-in-from-right",
        "data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close
        className={cn(
          "absolute right-4 top-4 rounded-md p-1 text-muted-foreground transition-colors",
          "hover:bg-muted/60 hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        )}
      >
        <X className="h-4 w-4" />
        <span className="sr-only">Fechar</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPrimitive.Portal>
));
SheetContent.displayName = DialogPrimitive.Content.displayName;

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-sm font-semibold text-foreground", className)}
    {...props}
  />
));
SheetTitle.displayName = DialogPrimitive.Title.displayName;

/**
 * Obrigatória para o Radix não reclamar de painel sem descrição acessível.
 * Costuma ficar visível como a linha de contexto abaixo do título.
 */
const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-[11px] text-muted-foreground", className)}
    {...props}
  />
));
SheetDescription.displayName = DialogPrimitive.Description.displayName;

export { Sheet, SheetClose, SheetContent, SheetDescription, SheetTitle };
