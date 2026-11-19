import type { Metadata } from "next";
import { listOwnSessions } from "@/modules/auth/service";
import { requireOwner } from "@/modules/auth/session";
import { Button } from "@/ui/button";
import { Badge, Card, Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { revokeSessionAction } from "../actions";
import { BackupCodesForm } from "./backup-codes-form";

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

  return (
    <>
      <PageHeader title="Einstellungen" meta={<Meta>Konto & Sicherheit</Meta>} />

      <div className="grid gap-8 lg:grid-cols-2">
        <Card className="flex flex-col gap-4 p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-lg font-semibold">Konto</h2>
            <Badge tone="accent">2FA aktiv</Badge>
          </div>
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-2 text-sm">
            <dt className="text-text-secondary">Name</dt>
            <dd>{user.name}</dd>
            <dt className="text-text-secondary">E-Mail</dt>
            <dd className="font-mono">{user.email}</dd>
          </dl>
        </Card>

        <Card className="flex flex-col gap-4 p-6">
          <h2 className="text-lg font-semibold">Backup-Codes</h2>
          <p className="text-sm text-text-secondary">
            Für den Fall, dass die Authenticator-App nicht verfügbar ist. Neu erzeugen macht alle bisherigen Codes
            ungültig.
          </p>
          <BackupCodesForm />
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
      </div>
    </>
  );
}
