import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { listReports } from "@/modules/reports/service";
import { Card, Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "Dashboard" };

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });

const UPCOMING = [
  { href: "/app/media", label: "Medien", text: "Screenshots und Dateien zentral verwalten.", increment: 3 },
  { href: "/app/portfolio", label: "Portfolio", text: "Ausgewählte Arbeiten freigeben und teilen.", increment: 4 },
];

type ReportRow = Awaited<ReturnType<typeof listReports>>[number];

function ReportList({ title, reports, empty }: { title: string; reports: ReportRow[]; empty: string }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {reports.length === 0 ? (
        <p className="text-sm text-text-secondary">{empty}</p>
      ) : (
        <ul className="divide-y divide-line-subtle border-y border-line-subtle">
          {reports.map((r) => (
            <li key={r.id}>
              <Link href={`/app/reports/${r.id}`} className="flex flex-col gap-1 px-2 py-3 hover:bg-hover-surface">
                <span className="truncate font-medium">{r.title}</span>
                <Meta>
                  {r.typeName} · {dateFormat.format(r.updatedAt)}
                </Meta>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function DashboardPage() {
  const { actor, user } = await requireOwner();
  const db = getDb();
  const [recent, drafts] = await Promise.all([
    listReports(db, actor, {}, 5),
    listReports(db, actor, { status: "draft" }, 5),
  ]);
  const firstName = user.name.split(" ")[0];

  return (
    <>
      <PageHeader
        title={`Hallo ${firstName}`}
        meta={<Meta>Dashboard</Meta>}
        actions={
          <Link
            href="/app/reports/new"
            className="inline-flex h-10 items-center border-2 border-accent bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
          >
            Neuer Report
          </Link>
        }
      />
      <div className="mb-12 grid gap-10 lg:grid-cols-2">
        <ReportList
          title="Zuletzt bearbeitet"
          reports={recent}
          empty="Noch keine Reports – leg mit „Neuer Report“ los."
        />
        <ReportList title="Entwürfe" reports={drafts} empty="Keine offenen Entwürfe." />
      </div>
      <section aria-label="Demnächst" className="grid gap-6 md:grid-cols-2">
        {UPCOMING.map((item) => (
          <Link key={item.href} href={item.href} className="block">
            <Card interactive className="flex h-full flex-col gap-2 p-6">
              <Meta>Inkrement {item.increment}</Meta>
              <h3 className="text-lg font-semibold">{item.label}</h3>
              <p className="text-sm text-text-secondary">{item.text}</p>
            </Card>
          </Link>
        ))}
      </section>
    </>
  );
}
