import type { Metadata } from "next";
import type { ReactNode } from "react";
import { requireOwner } from "@/modules/auth/session";

export const metadata: Metadata = {
  title: { default: "Vorschau", template: "%s · Vorschau" },
  robots: { index: false, follow: false, nocache: true },
};

/** Betrachter-Vorschau: nur für den Owner, sieht aus wie der Viewer. */
export default async function PreviewLayout({ children }: { children: ReactNode }) {
  await requireOwner();
  return children;
}
