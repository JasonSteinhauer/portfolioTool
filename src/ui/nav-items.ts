/** Navigationseinträge des Workspace (ohne React, testbar). */
export type NavItem = { href: string; label: string };

export const WORKSPACE_NAV: NavItem[] = [
  { href: "/app", label: "Dashboard" },
  { href: "/app/reports", label: "Reports" },
  { href: "/app/projects", label: "Projekte" },
  { href: "/app/development", label: "Entwicklung" },
  { href: "/app/media", label: "Medien" },
  { href: "/app/assistant", label: "KI-Assistent" },
  { href: "/app/portfolio", label: "Portfolio" },
  { href: "/app/settings", label: "Einstellungen" },
];

export function isActive(pathname: string, href: string): boolean {
  if (href === "/app") return pathname === "/app";
  return pathname === href || pathname.startsWith(`${href}/`);
}
