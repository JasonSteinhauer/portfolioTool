import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportDocument } from "@/content/report-document";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { getReport, ReportNotFoundError } from "@/modules/reports/service";
import { Button } from "@/ui/button";
import { Badge, Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { trashReportAction } from "../actions";
import { listFavoriteIds } from "@/modules/portfolio/service";
import { createPageFromReportAction, toggleFavoriteAction } from "../../portfolio/actions";
import { listProposals } from "@/modules/ai/language";
import { aiRuntime } from "@/modules/ai/runtime";
import { AiRequestButton } from "@/ui/ai/ai-request-button";
import { requestLanguageAction, requestRewriteAction } from "../../ai/actions";
import { FinalizeForm } from "./finalize-form";

export const metadata: Metadata = { title: "Report" };

const dateTimeFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

const CLASSIFICATION = {
  private: "Privat",
  internal_sensitive: "Intern / sensibel",
  publishable: "Veröffentlichbar",
} as const;

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOwner();
  const { id } = await params;
  const report = await getReport(getDb(), actor, id).catch((error: unknown) => {
    if (error instanceof ReportNotFoundError) notFound();
    throw error;
  });

  const [favorites, pendingAi] = await Promise.all([
    listFavoriteIds(getDb(), actor, "report"),
    listProposals(getDb(), actor, { type: "report", id: report.id }),
  ]);
  const favorite = favorites.has(report.id);
  const aiDisabled = !aiRuntime().provider
    ? "KI ist nicht eingerichtet."
    : report.classification === "internal_sensitive"
      ? "Intern / sensibel: KI ist für diesen Report gesperrt."
      : !report.aiAllowed
        ? "Im Editor unter „KI erlauben“ freigeben, um Vorschläge zu erhalten."
        : undefined;
  const labels = Object.fromEntries(report.type.fieldSchema.map((f) => [f.key, f.label]));

  return (
    <article>
      <PageHeader
        title={report.title}
        meta={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{report.type.name}</Badge>
            <Badge>{report.status === "final" ? "Abgeschlossen" : "Entwurf"}</Badge>
            <Badge>{CLASSIFICATION[report.classification]}</Badge>
            <Meta>Geändert {dateTimeFormat.format(report.updatedAt)}</Meta>
          </div>
        }
        actions={
          <div className="flex flex-wrap items-start gap-2">
            <Link
              href={`/app/reports/${report.id}/edit`}
              className="inline-flex h-8 items-center border-2 border-accent bg-accent px-3 text-[13px] font-medium text-white hover:bg-accent-hover"
            >
              Bearbeiten
            </Link>
            <Link
              href={`/app/reports/${report.id}/versions`}
              className="inline-flex h-8 items-center border-2 border-border-strong px-3 text-[13px] hover:bg-hover-surface"
            >
              Versionen
            </Link>
            {report.status !== "final" ? <FinalizeForm reportId={report.id} labels={labels} /> : null}
            <form action={toggleFavoriteAction}>
              <input type="hidden" name="itemType" value="report" />
              <input type="hidden" name="itemId" value={report.id} />
              <input type="hidden" name="returnTo" value={`/app/reports/${report.id}`} />
              <Button type="submit" variant="ghost" size="sm" aria-pressed={favorite}>
                {favorite ? "★ Favorit" : "☆ Als Favorit"}
              </Button>
            </form>
            <form action={createPageFromReportAction}>
              <input type="hidden" name="reportId" value={report.id} />
              <Button type="submit" variant="secondary" size="sm">
                Portfolio-Seite
              </Button>
            </form>
          </div>
        }
      />

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 max-w-3xl">
          <ReportDocument
            typeName={report.type.name}
            title={report.title}
            fieldSchema={report.type.fieldSchema}
            structuredFields={report.structuredFields as Record<string, unknown>}
            content={report.content}
            status={report.status}
            hideTitle
          />
        </div>
        <aside className="flex flex-col gap-6">
          <section
            aria-labelledby="ai-heading"
            className="flex flex-col gap-3 border-2 border-border-default bg-surface p-5"
          >
            <h2 id="ai-heading" className="text-sm font-semibold">
              KI-Assistenz
            </h2>
            <p className="text-xs text-text-secondary">
              Korrektur oder ausformulierte Fassung deiner Stichpunkte – mit Vorschau. Nichts wird ohne deine Zustimmung
              geändert; E-Mail- und IP-Adressen werden vor dem Senden geschwärzt.
            </p>
            <AiRequestButton
              action={requestLanguageAction}
              name="reportId"
              value={report.id}
              label="Sprachvorschläge erzeugen"
              disabledReason={aiDisabled}
            />
            <AiRequestButton
              action={requestRewriteAction}
              name="reportId"
              value={report.id}
              label="KI-Fassung (Stichpunkte ausformulieren)"
              disabledReason={aiDisabled ? " " : undefined}
            />
            {pendingAi.length > 0 ? (
              <Link
                href={`/app/reports/${report.id}/ai`}
                className="text-sm font-medium underline decoration-accent underline-offset-4"
              >
                {pendingAi.length} offene Vorschläge ansehen
              </Link>
            ) : null}
          </section>
          <form action={trashReportAction}>
            <input type="hidden" name="reportId" value={report.id} />
            <Button type="submit" variant="danger" size="sm" className="w-full">
              In den Papierkorb
            </Button>
          </form>
        </aside>
      </div>
    </article>
  );
}
