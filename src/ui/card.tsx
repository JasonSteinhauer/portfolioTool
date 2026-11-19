import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn";

type CardProps = HTMLAttributes<HTMLDivElement> & { interactive?: boolean };

/** Rechteckige Karte: starke Kante, erhöhte Fläche, sichtbarer Schatten. */
export function Card({ interactive, className, ...props }: CardProps) {
  return (
    <div
      className={cn(
        "border-2 border-border-default bg-surface shadow-card",
        interactive &&
          "transition-[border-color,box-shadow,transform] duration-[var(--motion-normal)] ease-technical " +
            "hover:-translate-y-0.5 hover:border-border-strong hover:shadow-hover",
        className,
      )}
      {...props}
    />
  );
}

/** Technische Metadaten (Datum, Typ, IDs) in Monospace. */
export function Meta({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary", className)}>
      {children}
    </span>
  );
}

export function Badge({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center border px-2 font-mono text-[11px] uppercase tracking-[0.06em]",
        tone === "accent" ? "border-accent text-text-primary" : "border-border-default text-text-secondary",
      )}
    >
      {children}
    </span>
  );
}
