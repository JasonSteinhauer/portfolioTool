import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportDocument } from "@/content/report-document";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { getReport, listReports, ReportNotFoundError } from "@/modules/reports/service";
import { listLinks, type LinkedReport } from "@/modules/links/service";
import { listProjects } from "@/modules/projects/service";
import { assignReportAction, removeLinkAction } from "../../projects/actions";
import { LinkForm } from "./link-form";
import { listCompetencies, listReportCompetencies } from "@/modules/development/service";
import { AttachCompetencyForm } from "../../development/dev-forms";
import { detachCompetencyAction } from "../../development/actions";
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

  const [favorites, pendingAi, links, projects, allReports] = await Promise.all([
    listFavoriteIds(getDb(), actor, "report"),
    listProposals(getDb(), actor, { type: "report", id: report.id }),
    listLinks(getDb(), actor, report.id),
    listProjects(getDb(), actor),
    listReports(getDb(), actor, {}, 300),
  ]);
  const [reportCompetencies, allCompetencies] = await Promise.all([
    listReportCompetencies(getDb(), actor, report.id),
    listCompetencies(getDb(), actor),
  ]);
  const attached = new Set(reportCompetencies.map((c) => c.id));
  const linked = new Set([...links.buildsOn, ...links.leadsTo].map((l) => l.id));
  const linkOptions = allReports.filter((r) => r.id !== report.id && !linked.has(r.id));
  const self = `/app/reports/${report.id}`;
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
            aria-labelledby="structure-heading"
            className="flex flex-col gap-4 border-2 border-border-default bg-surface p-5"
            data-testid="report-structure"
          >
            <h2 id="structure-heading" className="text-sm font-semibold">
              Projekt &amp; Verknüpfungen
            </h2>
            <form action={assignReportAction} className="flex flex-col gap-2">
              <input type="hidden" name="reportId" value={report.id} />
              <input type="hidden" name="returnTo" value={self} />
              <label htmlFor="report-project" className="text-xs text-text-secondary">
                Projekt
              </label>
              <div className="flex gap-2">
                <select
                  id="report-project"
                  name="projectId"
                  defaultValue={report.projectId ?? ""}
                  className="h-8 min-w-0 flex-1 border-2 border-border-default bg-bg px-2 text-sm focus-visible:border-accent focus-visible:outline-none"
                >
                  <option value="">Ohne Projekt</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </select>
                <Button type="submit" size="sm" variant="secondary">
                  Zuordnen
                </Button>
              </div>
            </form>
            <LinkList title="Baut auf" items={links.buildsOn} reportId={report.id} side="source" self={self} />
            <LinkList title="Führt zu" items={links.leadsTo} reportId={report.id} side="target" self={self} />
            <LinkForm reportId={report.id} options={linkOptions.map((r) => ({ id: r.id, title: r.title }))} />
            <Link
              href={`/app/projects/map?${report.projectId ? `project=${report.projectId}&` : ""}selected=${report.id}`}
              className="text-sm underline decoration-accent underline-offset-4"
            >
              Auf der Karte zeigen
            </Link>
          </section>
          <section
            aria-labelledby="competencies-heading"
            className="flex flex-col gap-3 border-2 border-border-default bg-surface p-5"
          >
            <h2 id="competencies-heading" className="text-sm font-semibold">
              Kompetenzen (Belege)
            </h2>
            {reportCompetencies.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {reportCompetencies.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      {c.name}
                      {c.note ? <span className="block text-xs text-text-secondary">{c.note}</span> : null}
                    </span>
                    <form action={detachCompetencyAction}>
                      <input type="hidden" name="reportId" value={report.id} />
                      <input type="hidden" name="competencyId" value={c.id} />
                      <Button type="submit" variant="ghost" size="sm" aria-label={`Kompetenz „${c.name}“ entfernen`}>
                        ×
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            ) : null}
            <AttachCompetencyForm
              reportId={report.id}
              options={allCompetencies.filter((c) => !attached.has(c.id)).map((c) => ({ id: c.id, name: c.name }))}
            />
          </section>
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

function LinkList({
  title,
  items,
  reportId,
  side,
  self,
}: {
  title: string;
  items: LinkedReport[];
  reportId: string;
  /** Rolle des ANDEREN Reports in der Verknüpfung. */
  side: "source" | "target";
  self: string;
}) {
  return (
    <div>
      <Meta>{title}</Meta>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-text-secondary">–</p>
      ) : (
        <ul className="mt-1 flex flex-col gap-1">
          {items.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2 text-sm">
              <Link
                href={`/app/reports/${l.id}`}
                className="min-w-0 truncate underline decoration-accent underline-offset-4"
              >
                {l.title}
              </Link>
              <form action={removeLinkAction}>
                <input type="hidden" name="sourceId" value={side === "source" ? l.id : reportId} />
                <input type="hidden" name="targetId" value={side === "source" ? reportId : l.id} />
                <input type="hidden" name="returnTo" value={self} />
                <Button type="submit" variant="ghost" size="sm" aria-label={`Verknüpfung mit „${l.title}“ entfernen`}>
                  ×
                </Button>
              </form>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
