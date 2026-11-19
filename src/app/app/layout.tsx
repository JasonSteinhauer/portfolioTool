import Link from "next/link";
import type { ReactNode } from "react";
import { requireOwner } from "@/modules/auth/session";
import { Button } from "@/ui/button";
import { WorkspaceShell } from "@/ui/workspace-shell";
import { logoutAction } from "./actions";

/**
 * Rahmen des Workspace. Prüft die Anmeldung – zusätzlich prüft JEDE Seite selbst
 * (Layouts werden bei Client-Navigation nicht erneut ausgeführt).
 */
export default async function WorkspaceLayout({ children }: { children: ReactNode }) {
  const { user } = await requireOwner();

  return (
    <WorkspaceShell
      createAction={
        <div className="flex items-center gap-2">
          <Link
            href="/app/reports"
            className="inline-flex h-8 items-center gap-2 border-2 border-accent bg-accent px-3 text-[13px] font-medium text-white transition-colors duration-[var(--motion-fast)] hover:border-accent-hover hover:bg-accent-hover"
          >
            <span aria-hidden="true">+</span> Erstellen
          </Link>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm" title={`Angemeldet als ${user.email}`}>
              Abmelden
            </Button>
          </form>
        </div>
      }
    >
      {children}
    </WorkspaceShell>
  );
}
