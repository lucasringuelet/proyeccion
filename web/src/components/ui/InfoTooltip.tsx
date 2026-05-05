import * as React from "react";
import { HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Align = "left" | "right" | "center";

interface InfoTooltipProps {
  children: React.ReactNode;
  /** Hacia qué lado se extiende el cartelito desde el (?). */
  align?: Align;
  className?: string;
}

/**
 * Cartelito informativo. Aparece al hacer hover (o focus por teclado) sobre
 * el icono de ayuda. CSS-only — no necesita JS de posicionamiento.
 */
export function InfoTooltip({
  children,
  align = "left",
  className,
}: InfoTooltipProps) {
  return (
    <span className={cn("relative inline-flex items-center group/tt", className)}>
      <button
        type="button"
        tabIndex={0}
        aria-label="Más información"
        className="ml-1 text-slate-400 hover:text-slate-600 focus:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 rounded-full"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      <span
        role="tooltip"
        className={cn(
          "pointer-events-none absolute z-50 top-full mt-2 w-72 rounded-md bg-slate-900 text-white text-xs leading-relaxed p-3 shadow-lg",
          "opacity-0 translate-y-1 transition-all duration-150",
          "group-hover/tt:opacity-100 group-hover/tt:translate-y-0 group-focus-within/tt:opacity-100 group-focus-within/tt:translate-y-0",
          align === "left" && "left-0",
          align === "right" && "right-0",
          align === "center" && "left-1/2 -translate-x-1/2 group-hover/tt:translate-y-0",
        )}
      >
        {children}
      </span>
    </span>
  );
}
