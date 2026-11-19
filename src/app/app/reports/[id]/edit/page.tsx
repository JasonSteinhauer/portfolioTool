import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { getReport, ReportNotFoundError } from "@/modules/reports/service";
import { ReportEditor } from "./report-editor";

export const metadata: Metadata = { title: "Report bearbeiten" };

export default async function EditReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOwner();
  const { id } = await params;
  const report = await getReport(getDb(), actor, id).catch((error: unknown) => {
    if (error instanceof ReportNotFoundError) notFound();
    throw error;
  });

  return (
    <ReportEditor
      reportId={report.id}
      typeName={report.type.name}
      fieldSchema={report.type.fieldSchema}
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
  );
}
