"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./cn";
import { isActive, WORKSPACE_NAV, type NavItem } from "./nav-items";

/**
 * Horizontale Hauptnavigation. Aktiver Eintrag: magentafarbene Unterstreichung + aria-current.
 * `currentPath` erlaubt die Darstellung außerhalb der echten Route (Styleguide).
 */
export function TopNav({ items = WORKSPACE_NAV, currentPath }: { items?: NavItem[]; currentPath?: string }) {
  const pathname = usePathname();
  const active = currentPath ?? pathname;

  return (
    <nav aria-label="Hauptnavigation" className="-mb-0.5 overflow-x-auto">
      <ul className="flex min-w-max items-stretch gap-1">
        {items.map((item) => {
          const current = isActive(active, item.href);
          return (
            <li key={item.href} className="flex">
              <Link
                href={item.href}
                aria-current={current ? "page" : undefined}
                className={cn(
                  "relative flex h-12 items-center px-3 text-sm transition-colors duration-[var(--motion-fast)] ease-technical",
                  "after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:transition-colors after:duration-[var(--motion-fast)]",
                  current
                    ? "text-text-primary after:bg-accent"
                    : "text-text-secondary after:bg-transparent hover:text-text-primary hover:after:bg-line-technical",
                )}
              >
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
