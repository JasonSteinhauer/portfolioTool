import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { listReports } from "@/modules/reports/service";
import { Button } from "@/ui/button";
import { Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { restoreReportAction } from "../actions";

export const metadata: Metadata = { title: "Papierkorb" };

const dateFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

export default async function TrashPage() {
  const { actor } = await requireOwner();
  const reports = await listReports(getDb(), actor, { trash: true });

  return (
    <>
      <PageHeader
        title="Papierkorb"
        meta={
          <Meta>
            <Link href="/app/reports" className="hover:text-text-primary">
              ← Reports
            </Link>
          </Meta>
        }
      />
      <p className="mb-6 max-w-prose text-sm text-text-secondary">
        Gelöschte Reports bleiben mit allen Versionen erhalten und lassen sich wiederherstellen. Endgültiges Löschen
        folgt mit der erweiterten Verwaltung.
      </p>
      {reports.length === 0 ? (
        <p className="text-text-secondary">Der Papierkorb ist leer.</p>
      ) : (
        <ul className="divide-y divide-line-subtle border-y border-line-subtle">
          {reports.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-2 py-4">
              <span className="flex flex-col gap-1">
                <span className="font-medium">{r.title}</span>
                <Meta>
                  {r.typeName} · gelöscht {r.deletedAt ? dateFormat.format(r.deletedAt) : ""}
                </Meta>
              </span>
              <form action={restoreReportAction}>
                <input type="hidden" name="reportId" value={r.id} />
                <Button type="submit" variant="secondary" size="sm">
                  Wiederherstellen
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
