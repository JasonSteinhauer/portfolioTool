import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { aiRuntime } from "@/modules/ai/runtime";
import { listMedia, toSummary } from "@/modules/media/service";
import { getReport, ReportNotFoundError } from "@/modules/reports/service";
import { MediaLibraryProvider } from "@/ui/media/media-picker";
import { ReportEditor } from "./report-editor";

export const metadata: Metadata = { title: "Report bearbeiten" };

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOwner();
  const { id } = await params;
  const db = getDb();
  const report = await getReport(db, actor, id).catch((error: unknown) => {
    if (error instanceof ReportNotFoundError) notFound();
    throw error;
  });

  const media = (await listMedia(db, actor)).map(toSummary);

  return (
    <MediaLibraryProvider initial={media}>
      <ReportEditor
        reportId={report.id}
        typeName={report.type.name}
        fieldSchema={report.type.fieldSchema}
        aiAvailable={Boolean(aiRuntime().provider)}
        initial={{
          title: report.title,
          structuredFields: report.structuredFields,
          content: report.content,
          classification: report.classification,
          aiAllowed: report.aiAllowed,
          revision: report.revision,
          status: report.status,
        }}
      />
    </MediaLibraryProvider>
  );
}
