import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: { default: "Portfolio", template: "%s · Portfolio" },
  robots: { index: false, follow: false, nocache: true },
};

/** Rahmen der freigegebenen Ansicht – die Gestaltung liefert `ViewerShell` in den Seiten. */
export default function ViewerLayout({ children }: { children: ReactNode }) {
  return children;
}
