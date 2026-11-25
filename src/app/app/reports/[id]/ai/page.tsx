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
import { QuestionsForm } from "./questions-form";

export const metadata: Metadata = { title: "KI-Vorschläge" };

export default async function ReportAiPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOwner();
  const { id } = await params;
  const db = getDb();
  const report = await getReport(db, actor, id).catch((error: unknown) => {
    if (error instanceof ReportNotFoundError) notFound();
    throw error;
  });
  const pending = await listProposals(db, actor, { type: "report", id });
  const proposals = pending.filter((p) => p.kind === "language");
  const questions = pending
    .filter((p) => p.kind === "questions")
    .flatMap((p) => (p.payload as { questions?: string[] }).questions ?? [])
    .slice(0, 3);

  return (
    <>
      <PageHeader
        title={
          questions.length > 0 || proposals.some((p) => (p.payload as { mode?: string }).mode === "rewrite")
            ? "KI-Fassung"
            : "Sprachvorschläge"
        }
        meta={
          <Meta>
            <Link href={`/app/reports/${report.id}`} className="hover:text-text-primary">
              ← {report.title}
            </Link>
          </Meta>
        }
      />
      {questions.length > 0 ? (
        <div className="mb-10">
          <QuestionsForm reportId={report.id} questions={questions} />
        </div>
      ) : null}
      {questions.length > 0 && proposals.length === 0 ? null : (
        <>
          <p className="mb-6 max-w-2xl text-sm text-text-secondary">
            Wähle aus, was übernommen werden soll – die Vorschau rechts zeigt das Ergebnis sofort. Nicht ausgewählte
            Vorschläge werden verworfen. Vor dem Übernehmen wird der bisherige Stand als Version gesichert.
          </p>
          <LanguageProposalsForm
            reportId={report.id}
            proposals={proposals.map((p) => {
              const payload = p.payload as { key: string; label: string; before: string; after: string };
              return {
                id: p.id,
                key: payload.key,
                label: payload.label,
                before: payload.before,
                after: payload.after,
                reason: p.rationale ?? "",
              };
            })}
            report={{
              typeName: report.type.name,
              title: report.title,
              fieldSchema: report.type.fieldSchema,
              structuredFields: report.structuredFields as Record<string, unknown>,
              content: report.content,
              status: report.status,
            }}
          />
        </>
      )}
    </>
  );
}
