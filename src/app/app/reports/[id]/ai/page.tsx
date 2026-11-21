import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { listProposals } from "@/modules/ai/language";
import { requireOwner } from "@/modules/auth/session";
import { getReport, ReportNotFoundError } from "@/modules/reports/service";
import { Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { LanguageProposalsForm } from "./language-proposals-form";

export const metadata: Metadata = { title: "KI-Vorschläge" };

export default async function ReportAiPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOwner();
  const { id } = await params;
  const db = getDb();
  const report = await getReport(db, actor, id).catch((error: unknown) => {
    if (error instanceof ReportNotFoundError) notFound();
    throw error;
  });
  const proposals = (await listProposals(db, actor, { type: "report", id })).filter((p) => p.kind === "language");

  return (
    <>
      <PageHeader
        title="Sprachvorschläge"
        meta={
          <Meta>
            <Link href={`/app/reports/${report.id}`} className="hover:text-text-primary">
              ← {report.title}
            </Link>
          </Meta>
        }
      />
      <p className="mb-6 max-w-2xl text-sm text-text-secondary">
        Wähle aus, was übernommen werden soll. Nicht ausgewählte Vorschläge werden verworfen. Vor dem Übernehmen wird
        der bisherige Stand als Version gesichert.
      </p>
      <LanguageProposalsForm
        reportId={report.id}
        proposals={proposals.map((p) => {
          const payload = p.payload as { label: string; before: string; after: string };
          return {
            id: p.id,
            label: payload.label,
            before: payload.before,
            after: payload.after,
            reason: p.rationale ?? "",
          };
        })}
      />
    </>
  );
}
