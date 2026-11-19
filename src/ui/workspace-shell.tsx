import Link from "next/link";
import type { ReactNode } from "react";
import { TopNav } from "./top-nav";

/** Rahmen des privaten Workspace: Marke, horizontale Navigation, globale Erstellen-Aktion. */
export function WorkspaceShell({
  children,
  currentPath,
  createAction,
}: {
  children: ReactNode;
  currentPath?: string;
  createAction?: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-white"
      >
        Zum Inhalt springen
      </a>
      <header className="sticky top-0 z-40 border-b-2 border-border-default bg-bg/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-content flex-wrap items-center gap-x-6 px-6">
          <Link
            href="/app"
            className="flex shrink-0 items-center gap-2 py-3"
            aria-label="Development Portfolio – Dashboard"
          >
            <span aria-hidden="true" className="block size-3 bg-accent" />
            <span className="font-heading text-[15px] font-semibold tracking-tight">dev.portfolio</span>
          </Link>
          {/* Mobil: eigene Zeile in voller Breite (scrollbar); ab xl: zwischen Marke und Aktion. */}
          <div className="order-last -mx-6 w-[calc(100%+3rem)] min-w-0 border-t border-line-subtle px-3 xl:order-none xl:mx-0 xl:w-auto xl:flex-1 xl:self-end xl:border-t-0 xl:px-0">
            <TopNav currentPath={currentPath} />
          </div>
          <div className="ml-auto shrink-0 xl:ml-0">{createAction}</div>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-content flex-1 px-6 py-8">
        {children}
      </main>
    </div>
  );
}

/** Seitentitel mit technischer Trennlinie. */
export function PageHeader({ title, meta, actions }: { title: string; meta?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-line-technical pb-4">
      <div className="flex flex-col gap-2">
        {meta}
        <h1 className="text-[28px] font-semibold">{title}</h1>
      </div>
      {actions ? <div className="flex gap-2">{actions}</div> : null}
    </div>
  );
}
