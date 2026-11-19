import type { Metadata } from "next";
import Link from "next/link";
import { requireOwner } from "@/modules/auth/session";
import { Card, Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "Dashboard" };

const START_ITEMS = [
  { href: "/app/reports", label: "Reports", text: "Lernen, Arbeit und Ergebnisse dokumentieren.", increment: 2 },
  { href: "/app/media", label: "Medien", text: "Screenshots und Dateien zentral verwalten.", increment: 3 },
  { href: "/app/portfolio", label: "Portfolio", text: "Ausgewählte Arbeiten freigeben und teilen.", increment: 4 },
];

export default async function DashboardPage() {
  const { user } = await requireOwner();
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader title={`Hallo ${firstName}`} meta={<Meta>Dashboard</Meta>} />

      <section aria-labelledby="dash-start" className="mb-12">
        <h2 id="dash-start" className="mb-4 text-lg font-semibold">
          Noch keine Inhalte
        </h2>
        <p className="mb-6 max-w-prose text-text-secondary">
          Hier erscheinen künftig deine letzten Reports, Entwürfe, Projekte und Vorschläge. Die Bereiche werden
          inkrementell freigeschaltet.
        </p>
        <div className="grid gap-6 md:grid-cols-3">
          {START_ITEMS.map((item) => (
            <Link key={item.href} href={item.href} className="block focus-visible:outline-offset-4">
              <Card interactive className="flex h-full flex-col gap-2 p-6">
                <Meta>Inkrement {item.increment}</Meta>
                <h3 className="text-lg font-semibold">{item.label}</h3>
                <p className="text-sm text-text-secondary">{item.text}</p>
              </Card>
            </Link>
          ))}
        </div>
      </section>
    </>
  );
}
