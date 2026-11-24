import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Portfolio", template: "%s · Portfolio" },
  robots: { index: false, follow: false, nocache: true },
};

/** Rahmen der freigegebenen Portfolio-Ansicht – bewusst ohne Workspace-Navigation. */
export default function ViewerLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh">
      <div aria-hidden="true" className="h-1 bg-accent" />
      <main id="main" className="mx-auto w-full max-w-content px-6 py-16 sm:px-10">
        {children}
      </main>
      <footer className="mx-auto max-w-content border-t border-line-subtle px-6 py-8 font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary sm:px-10">
        Privat geteilt · nicht öffentlich indexiert
      </footer>
    </div>
  );
}
