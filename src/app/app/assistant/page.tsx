import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { listOpenProposalTargets, listRecentJobs, monthlyUsage } from "@/modules/ai/gateway";
import { aiRuntime } from "@/modules/ai/runtime";
import { requireOwner } from "@/modules/auth/session";
import { Badge, Card, Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "KI-Assistent" };

const dateFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

const JOB_KIND: Record<string, string> = {
  "report.language": "Sprachvorschläge",
  "report.rewrite": "KI-Fassung",
  "page.compose": "Seitenentwurf",
};
const JOB_STATUS: Record<string, string> = {
  succeeded: "erfolgreich",
  failed: "fehlgeschlagen",
  queued: "wartet",
  running: "läuft",
  cancelled: "abgebrochen",
};

export default async function AssistantPage() {
  const { actor } = await requireOwner();
  const db = getDb();
  const ai = aiRuntime();
  const [usage, jobs, open] = await Promise.all([
    monthlyUsage(db, actor, ai.config),
    listRecentJobs(db, actor, 10),
    listOpenProposalTargets(db, actor),
  ]);
  const usd = (micro: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", maximumFractionDigits: 2 }).format(
      micro / 1_000_000,
    );
  const percent =
    usage.budgetMicroUsd > 0 ? Math.min(100, Math.round((usage.spentMicroUsd / usage.budgetMicroUsd) * 100)) : 100;

  return (
    <>
      <PageHeader
        title="KI-Assistent"
        meta={<Meta>Vorschläge zur Freigabe</Meta>}
        actions={
          <Badge tone={ai.provider ? "accent" : undefined}>
            {ai.provider ? `${ai.provider.name} · ${ai.provider.model}` : "nicht eingerichtet"}
          </Badge>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-6">
          <Card className="flex flex-col gap-3 p-6" data-testid="ai-open-proposals">
            <h2 className="text-lg font-semibold">Offene Vorschläge</h2>
            {open.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Keine offenen Vorschläge. Starte die KI direkt in einem Report („Sprachvorschläge“ oder „KI-Fassung“)
                oder auf einer Portfolio-Seite („KI-Entwurf“).
              </p>
            ) : (
              <ul className="divide-y divide-line-subtle border-y border-line-subtle">
                {open.map((t) => (
                  <li key={`${t.type}-${t.id}`}>
                    <Link
                      href={t.type === "report" ? `/app/reports/${t.id}/ai` : `/app/portfolio/${t.id}/ai`}
                      className="flex flex-wrap items-center justify-between gap-3 px-2 py-3 hover:bg-hover-surface"
                    >
                      <span className="flex min-w-0 flex-col gap-1">
                        <span className="truncate font-medium">{t.title}</span>
                        <Meta>
                          {t.type === "report" ? "Report" : "Portfolio-Seite"} · {dateFormat.format(t.latest)}
                        </Meta>
                      </span>
                      <Badge tone="accent">
                        {t.count} {t.count === 1 ? "Vorschlag" : "Vorschläge"}
                      </Badge>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="flex flex-col gap-3 p-6">
            <h2 className="text-lg font-semibold">So arbeitet die KI</h2>
            <ul className="flex list-disc flex-col gap-1.5 pl-5 text-sm text-text-secondary">
              <li>
                Sie macht nur Vorschläge – übernommen wird erst, wenn du zustimmst. Jede Übernahme erzeugt eine Version.
              </li>
              <li>Pro Report musst du die KI im Editor freigeben. „Intern / sensibel“ bleibt immer gesperrt.</li>
              <li>E-Mail- und IP-Adressen werden vor dem Senden geschwärzt, Zugangsdaten nie gesendet.</li>
              <li>Gespeichert werden nur Kosten und Verweise, keine Inhalte.</li>
            </ul>
          </Card>
        </div>

        <aside className="flex flex-col gap-6">
          <Card className="flex flex-col gap-3 p-6" data-testid="ai-budget">
            <h2 className="text-lg font-semibold">Budget diesen Monat</h2>
            <p className="text-sm">
              <strong>{usd(usage.spentMicroUsd)}</strong> von {usd(usage.budgetMicroUsd)} · {usage.jobs} Aufträge
            </p>
            <progress
              aria-label="Verbrauchtes KI-Budget"
              value={percent}
              max={100}
              className="h-2 w-full accent-[var(--accent)]"
            >
              {percent} %
            </progress>
            <Link href="/app/settings" className="text-sm underline decoration-accent underline-offset-4">
              Details in den Einstellungen
            </Link>
          </Card>
          <Card className="flex flex-col gap-3 p-6">
            <h2 className="text-lg font-semibold">Zuletzt</h2>
            {jobs.length === 0 ? (
              <p className="text-sm text-text-secondary">Noch keine Aufträge.</p>
            ) : (
              <ul className="flex flex-col gap-2 text-sm">
                {jobs.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0">
                      {JOB_KIND[j.kind] ?? j.kind}
                      <span className="block text-xs text-text-secondary">{dateFormat.format(j.createdAt)}</span>
                    </span>
                    <span className={j.status === "failed" ? "text-xs text-danger" : "text-xs text-text-secondary"}>
                      {JOB_STATUS[j.status] ?? j.status}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
