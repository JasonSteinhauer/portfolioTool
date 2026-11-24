import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { listRecentJobs, monthlyUsage } from "@/modules/ai/gateway";
import { aiRuntime } from "@/modules/ai/runtime";
import { listOwnSessions } from "@/modules/auth/service";
import { requireOwner } from "@/modules/auth/session";
import { Button } from "@/ui/button";
import { Badge, Card, Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { revokeSessionAction } from "../actions";
import { BackupCodesForm } from "./backup-codes-form";
import { DisableTwoFactorForm } from "./disable-two-factor-form";

export const metadata: Metadata = { title: "Einstellungen" };

const dateFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

function describeAgent(userAgent: string | null): string {
  if (!userAgent) return "Unbekanntes Gerät";
  const browser = /Edg\//.test(userAgent)
    ? "Edge"
    : /Firefox\//.test(userAgent)
      ? "Firefox"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Android/.test(userAgent)
      ? "Android"
      : /iPhone|iPad/.test(userAgent)
        ? "iOS"
        : /Mac OS X/.test(userAgent)
          ? "macOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : "unbekanntes System";
  return `${browser} · ${os}`;
}

export default async function SettingsPage() {
  const { actor, user, sessionId } = await requireOwner();
  const sessions = await listOwnSessions(actor, sessionId);
  const ai = aiRuntime();
  const [usage, jobs] = await Promise.all([
    monthlyUsage(getDb(), actor, ai.config),
    listRecentJobs(getDb(), actor, 10),
  ]);
  const usd = (micro: number) =>
    new Intl.NumberFormat("de-DE", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(
      micro / 1_000_000,
    );
  const percent = Math.min(100, Math.round((usage.spentMicroUsd / usage.budgetMicroUsd) * 100));

  return (
    <>
      <PageHeader title="Einstellungen" meta={<Meta>Konto & Sicherheit</Meta>} />

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold">Konto</h2>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-text-secondary">Name</dt>
            <dd>{user.name}</dd>
            <dt className="text-text-secondary">E-Mail</dt>
            <dd className="font-mono">{user.email}</dd>
          </dl>
        </Card>

        <Card className="flex flex-col gap-4 p-6" data-testid="two-factor-card">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Zwei-Faktor-Schutz</h2>
            <Badge tone={user.twoFactorEnabled ? "accent" : "default"}>{user.twoFactorEnabled ? "Aktiv" : "Aus"}</Badge>
          </div>
          {user.twoFactorEnabled ? (
            <>
              <p className="text-sm text-text-secondary">
                Backup-Codes helfen, wenn die Authenticator-App nicht verfügbar ist. Neu erzeugen macht alle bisherigen
                Codes ungültig.
              </p>
              <BackupCodesForm />
              <details className="border-t border-line-subtle pt-4">
                <summary className="cursor-pointer text-sm text-text-secondary hover:text-text-primary">
                  Zwei-Faktor-Schutz ausschalten
                </summary>
                <div className="pt-4">
                  <DisableTwoFactorForm />
                </div>
              </details>
            </>
          ) : (
            <>
              <p className="text-sm text-text-secondary">
                Optional. Mit einem zweiten Faktor reicht ein geleaktes Passwort allein nicht mehr für den Zugriff. Auf
                eigenen Geräten kannst du einen Code 30 Tage lang merken lassen.
              </p>
              <Link
                href="/onboarding/2fa"
                className="inline-flex h-10 items-center justify-center border-2 border-border-strong px-4 text-sm hover:bg-hover-surface"
              >
                Jetzt einrichten
              </Link>
            </>
          )}
        </Card>

        <Card className="flex flex-col gap-4 p-6 lg:col-span-2">
          <h2 className="text-lg font-semibold">Aktive Sitzungen</h2>
          <ul className="divide-y divide-line-subtle border-y border-line-subtle" data-testid="session-list">
            {sessions.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-4 py-3">
                <div className="flex flex-col gap-1">
                  <span className="text-sm">
                    {describeAgent(s.userAgent)}
                    {s.current ? (
                      <span className="ml-2">
                        <Badge tone="accent">Diese Sitzung</Badge>
                      </span>
                    ) : null}
                  </span>
                  <Meta>
                    Angemeldet {dateFormat.format(s.createdAt)} · zuletzt aktiv {dateFormat.format(s.updatedAt)}
                  </Meta>
                </div>
                <form action={revokeSessionAction}>
                  <input type="hidden" name="sessionId" value={s.id} />
                  <Button type="submit" variant={s.current ? "secondary" : "danger"} size="sm">
                    {s.current ? "Abmelden" : "Beenden"}
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="flex flex-col gap-4 p-6 lg:col-span-2" data-testid="ai-usage-card">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">KI-Nutzung</h2>
            <Badge tone={ai.provider ? "accent" : undefined}>
              {ai.provider ? `${ai.provider.name} · ${ai.provider.model}` : "nicht eingerichtet"}
            </Badge>
          </div>
          <div className="flex flex-col gap-2">
            <p className="text-sm">
              Diesen Monat: <strong>{usd(usage.spentMicroUsd)}</strong> von {usd(usage.budgetMicroUsd)} Budget ·{" "}
              {usage.jobs} Aufträge
            </p>
            {/* Natives <progress>: kein Inline-Style nötig (strikte CSP). */}
            <progress
              aria-label="Verbrauchtes KI-Budget"
              value={percent}
              max={100}
              className="h-2 w-full max-w-md accent-[var(--accent)]"
            >
              {percent} %
            </progress>
            <p className="text-xs text-text-secondary">
              Ist das Budget erreicht, werden keine KI-Aufträge mehr ausgeführt. Gespeichert werden nur Zahlen und
              Verweise – keine Inhalte.
            </p>
          </div>
          {jobs.length > 0 ? (
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Letzte KI-Aufträge</caption>
              <thead className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
                <tr>
                  <th className="py-1 font-normal">Zeit</th>
                  <th className="py-1 font-normal">Art</th>
                  <th className="py-1 font-normal">Status</th>
                  <th className="py-1 text-right font-normal">Kosten</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map((job) => (
                  <tr key={job.id} className="border-t border-line-subtle">
                    <td className="py-1.5">{dateFormat.format(job.createdAt)}</td>
                    <td className="py-1.5">
                      {job.kind === "report.language"
                        ? "Sprachvorschläge"
                        : job.kind === "page.compose"
                          ? "Seitenentwurf"
                          : job.kind}
                    </td>
                    <td className="py-1.5">
                      {job.status === "succeeded"
                        ? "erfolgreich"
                        : job.status === "failed"
                          ? `fehlgeschlagen${job.error ? ` – ${job.error}` : ""}`
                          : job.status}
                    </td>
                    <td className="py-1.5 text-right font-mono text-xs">{usd(job.costMicroUsd ?? 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </Card>
      </div>
    </>
  );
}
