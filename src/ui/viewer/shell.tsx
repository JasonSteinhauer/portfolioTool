import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Rahmen der Präsentation (Stil „Terminal“): dunkles Raster, Kopfzeile mit Marke und Sprungmarken,
 * Fußzeile. Wird vom Viewer (/p) und von der Betrachter-Vorschau (/vorschau) gemeinsam genutzt,
 * damit die Vorschau exakt zeigt, was Empfänger sehen.
 */

export type ViewerNavItem = { href: string; label: string };

export function brandFromName(name: string | null | undefined): string {
  const first = (name ?? "").trim().split(/\s+/)[0] ?? "";
  const clean = first
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9-]/g, "");
  return `~/${clean || "portfolio"}`;
}

export function ViewerShell({
  brand,
  homeHref,
  nav = [],
  banner,
  progress = false,
  children,
}: {
  brand: string;
  homeHref: string;
  nav?: ViewerNavItem[];
  /** z. B. der Hinweis der Betrachter-Vorschau. */
  banner?: ReactNode;
  /** Lesefortschritt (Berichte). */
  progress?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="pv-grid min-h-dvh text-[#e6e8eb]">
      {progress ? (
        <div aria-hidden="true" className="pv-progress fixed inset-x-0 top-0 z-50 h-[3px] bg-[#ff4fa3]" />
      ) : null}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-[#ff4fa3] focus:px-3 focus:py-2 focus:text-[#0a0c0f]"
      >
        Zum Inhalt springen
      </a>
      {banner}
      <header className="sticky top-0 z-40 border-b border-[#1c2128] bg-[#0a0c0f]/90 backdrop-blur">
        <nav
          aria-label="Portfolio"
          className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-6 py-4 font-mono text-sm sm:px-8"
        >
          <Link href={homeHref} className="font-bold text-[#e6e8eb]">
            {brand}
            <span aria-hidden="true" className="text-[#ff5cae]">
              _
            </span>
          </Link>
          {nav.length > 0 ? (
            <ul className="flex flex-wrap gap-x-6 gap-y-1">
              {nav.map((item) => (
                <li key={item.href}>
                  <a href={item.href} className="text-[#9aa3ad] transition-colors hover:text-[#ff5cae]">
                    {item.label}
                  </a>
                </li>
              ))}
            </ul>
          ) : null}
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer className="mx-auto max-w-6xl px-6 pb-12 pt-6 text-center font-mono text-xs text-[#8b939c] sm:px-8">
        Privat geteilt · nicht öffentlich indexiert
      </footer>
    </div>
  );
}

/** Hinweisleiste der Betrachter-Vorschau. */
export function PreviewBanner({ children, backHref }: { children: ReactNode; backHref: string }) {
  return (
    <div
      role="note"
      aria-label="Vorschau"
      className="border-b border-[#3a1a2c] bg-[#1a0f16] font-mono text-[13px] text-[#ffc2df]"
      data-testid="preview-banner"
    >
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-2.5 sm:px-8">
        <span>
          <span aria-hidden="true">● </span>
          {children}
        </span>
        <Link href={backHref} className="text-[#ffc2df] underline underline-offset-4 hover:text-white">
          Zurück zum Arbeitsbereich
        </Link>
      </div>
    </div>
  );
}

/** Abschnittsüberschrift im Stil `// 01 — titel`. */
export function SectionLabel({ index, children }: { index: number; children: string }) {
  return (
    <p className="pv-rv m-0 font-mono text-sm text-[#ff5cae]">
      {"// "}
      {String(index).padStart(2, "0")} — {children.toLowerCase()}
    </p>
  );
}
