import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { listPages } from "@/modules/portfolio/service";
import { listShareLinks } from "@/modules/sharing/service";
import { Button } from "@/ui/button";
import { Badge, Card, Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { revokeShareLinkAction } from "../actions";
import { CreateLinkForm } from "./create-link-form";

export const metadata: Metadata = { title: "Freigabelinks" };

const dateFormat = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Berlin",
});

export default async function SharingPage() {
  const { actor } = await requireOwner();
  const db = getDb();
  const [links, pages] = await Promise.all([listShareLinks(db, actor), listPages(db, actor)]);

  return (
    <>
      <PageHeader
        title="Freigabelinks"
        meta={
          <Meta>
            <Link href="/app/portfolio" className="hover:text-text-primary">
              ← Portfolio
            </Link>
          </Meta>
        }
      />
      <Card className="mb-10 flex flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold">Neuer Link</h2>
        <p className="max-w-prose text-sm text-text-secondary">
          Wer den Link hat, sieht nur freigegebene Inhalte – nie Entwürfe, Reports oder Anhänge. Ein Widerruf wirkt
          sofort.
        </p>
        <CreateLinkForm pages={pages.filter((p) => p.publishedVersion).map((p) => ({ id: p.id, title: p.title }))} />
      </Card>

      <h2 className="mb-4 text-lg font-semibold">Bestehende Links</h2>
      {links.length === 0 ? (
        <p className="text-sm text-text-secondary">Noch keine Links.</p>
      ) : (
        <ul className="divide-y divide-line-subtle border-y border-line-subtle" data-testid="share-link-list">
          {links.map((link) => {
            const expired = link.expired;
            const state = link.revokedAt ? "Widerrufen" : expired ? "Abgelaufen" : "Aktiv";
            return (
              <li key={link.id} className="flex flex-wrap items-center justify-between gap-3 px-2 py-3">
                <span className="flex flex-col gap-1">
                  <span className="font-medium">{link.label}</span>
                  <Meta>
                    {link.scopeType === "showcase" ? "Showcase" : `Seite: ${link.pageTitle ?? "–"}`} · erstellt{" "}
                    {dateFormat.format(link.createdAt)}
                    {link.expiresAt ? ` · bis ${dateFormat.format(link.expiresAt)}` : " · unbegrenzt"} ·{" "}
                    {link.accessCount} Aufrufe
                  </Meta>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={state === "Aktiv" ? "accent" : "default"}>{state}</Badge>
                  {state === "Aktiv" ? (
                    <form action={revokeShareLinkAction}>
                      <input type="hidden" name="linkId" value={link.id} />
                      <Button type="submit" variant="danger" size="sm">
                        Widerrufen
                      </Button>
                    </form>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
