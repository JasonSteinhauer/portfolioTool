import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { DocumentView } from "@/content/blocks/render";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { getReport, listVersions, ReportNotFoundError } from "@/modules/reports/service";
import { Button } from "@/ui/button";
import { Badge, Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { restoreVersionAction } from "../../actions";

export const metadata: Metadata = { title: "Versionen" };

const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});
const REASONS = {
  manual: "Manuell gespeichert",
  checkpoint: "Automatischer Zwischenstand",
  restore: "Wiederhergestellt",
  ai_accepted: "KI-Vorschlag übernommen",
} as const;

export default async function VersionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOwner();
  const { id } = await params;
  const db = getDb();
  const report = await getReport(db, actor, id).catch((error: unknown) => {
    if (error instanceof ReportNotFoundError) notFound();
    throw error;
  });
  const versions = await listVersions(db, actor, id);

  return (
    <>
      <PageHeader
        title="Versionen"
        meta={
          <Meta>
            <Link href={`/app/reports/${report.id}`} className="hover:text-text-primary">
              ← {report.title}
            </Link>
          </Meta>
        }
      />
      <p className="mb-6 max-w-prose text-sm text-text-secondary">
        Beim Wiederherstellen wird der aktuelle Stand vorher als Version gesichert – es geht nichts verloren.
      </p>
      {versions.length === 0 ? (
        <p className="text-text-secondary">
          Noch keine Versionen. Versionen entstehen beim manuellen Speichern, beim Abschließen und automatisch alle 10
          Minuten.
        </p>
      ) : (
        <ol className="flex flex-col gap-3" data-testid="version-list">
          {versions.map((v) => (
            <li key={v.id} className="border-2 border-border-default bg-surface">
              <details>
                <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <span className="flex flex-wrap items-center gap-3">
                    <span className="font-mono text-sm">v{v.versionNo}</span>
                    <span>{v.title}</span>
                    <Badge>{REASONS[v.reason]}</Badge>
                  </span>
                  <Meta>{dateTimeFormat.format(v.createdAt)}</Meta>
                </summary>
                <div className="border-t border-line-subtle p-4">
                  <DocumentView doc={v.content} />
                  <form action={restoreVersionAction} className="mt-6">
                    <input type="hidden" name="reportId" value={report.id} />
                    <input type="hidden" name="versionId" value={v.id} />
                    <Button type="submit" variant="secondary" size="sm">
                      v{v.versionNo} wiederherstellen
                    </Button>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
