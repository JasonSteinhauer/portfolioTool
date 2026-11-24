import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { listFavoriteReports, listPages, listShowcase } from "@/modules/portfolio/service";
import { Button } from "@/ui/button";
import { Badge, Card, Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { createPageFromReportAction, showcaseAction } from "./actions";

export const metadata: Metadata = { title: "Portfolio" };

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });

function ShowcaseButton({
  pageId,
  op,
  label,
  disabled,
}: {
  pageId: string;
  op: string;
  label: string;
  disabled?: boolean;
}) {
  return (
    <form action={showcaseAction}>
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="op" value={op} />
      <button
        type="submit"
        disabled={disabled}
        aria-label={label}
        title={label}
        className="flex h-8 min-w-8 items-center justify-center px-2 text-sm text-text-secondary hover:bg-hover-surface hover:text-text-primary disabled:opacity-30"
      >
        {op === "up" ? "↑" : op === "down" ? "↓" : op === "remove" ? "×" : "+ Showcase"}
      </button>
    </form>
  );
}

export default async function PortfolioPage() {
  const { actor } = await requireOwner();
  const db = getDb();
  const [pages, showcase, favoriteReports] = await Promise.all([
    listPages(db, actor),
    listShowcase(db, actor),
    listFavoriteReports(db, actor),
  ]);
  const reportsWithoutPage = favoriteReports.filter((r) => !r.pageId);

  return (
    <>
      <PageHeader
        title="Portfolio"
        meta={<Meta>Präsentieren</Meta>}
        actions={
          <>
            <Link
              href="/app/portfolio/profile"
              className="inline-flex h-10 items-center border-2 border-border-strong px-4 text-sm hover:bg-hover-surface"
            >
              Profil
            </Link>
            <Link
              href="/app/portfolio/sharing"
              className="inline-flex h-10 items-center border-2 border-accent bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Freigabelinks
            </Link>
          </>
        }
      />

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-labelledby="pf-pages" className="flex flex-col gap-4">
          <h2 id="pf-pages" className="text-lg font-semibold">
            Seiten
          </h2>
          {pages.length === 0 ? (
            <p className="text-sm text-text-secondary">
              Noch keine Seiten. Öffne einen Report und wähle „Portfolio-Seite erstellen“.
            </p>
          ) : (
            <ul className="divide-y divide-line-subtle border-y border-line-subtle" data-testid="page-list">
              {pages.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 px-2 py-3">
                  <Link href={`/app/portfolio/${p.id}`} className="flex min-w-0 flex-col gap-1 hover:text-text-primary">
                    <span className="truncate font-medium">
                      {p.favorite ? (
                        <span aria-label="Favorit" className="mr-2 text-accent-text">
                          ★
                        </span>
                      ) : null}
                      {p.title}
                    </span>
                    <Meta>
                      /{p.slug} · geändert {dateFormat.format(p.updatedAt)}
                    </Meta>
                  </Link>
                  <div className="flex items-center gap-2">
                    <Badge tone={p.publishedVersion ? "accent" : "default"}>
                      {p.publishedVersion ? `Freigegeben v${p.publishedVersion}` : "Entwurf"}
                    </Badge>
                    {!p.inShowcase ? (
                      <ShowcaseButton pageId={p.id} op="add" label={`${p.title} zum Showcase hinzufügen`} />
                    ) : null}
                  </div>
                </li>
              ))}
            </ul>
          )}

          {reportsWithoutPage.length > 0 ? (
            <div className="mt-6 flex flex-col gap-3">
              <h3 className="font-semibold">Favorisierte Reports ohne Seite</h3>
              <ul className="flex flex-col gap-2">
                {reportsWithoutPage.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center justify-between gap-3 border-2 border-border-default bg-surface px-4 py-3"
                  >
                    <span>
                      <span className="mr-2 text-accent-text">★</span>
                      {r.title}
                    </span>
                    <form action={createPageFromReportAction}>
                      <input type="hidden" name="reportId" value={r.id} />
                      <Button type="submit" size="sm" variant="secondary">
                        Seite erstellen
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <aside aria-labelledby="pf-showcase">
          <Card className="flex flex-col gap-4 p-6">
            <h2 id="pf-showcase" className="text-lg font-semibold">
              Showcase
            </h2>
            <p className="text-sm text-text-secondary">
              Diese Auswahl sehen Personen mit einem Showcase-Link – in dieser Reihenfolge. Nur freigegebene Seiten
              erscheinen.
            </p>
            {showcase.length === 0 ? (
              <p className="text-sm text-text-secondary">Noch leer.</p>
            ) : (
              <ol className="flex flex-col gap-2" data-testid="showcase-list">
                {showcase.map((item, index) => (
                  <li
                    key={item.pageId}
                    className="flex items-center justify-between gap-2 border border-border-default bg-bg px-3 py-2"
                  >
                    <span className="min-w-0">
                      <span className="mr-2 font-mono text-xs text-text-secondary">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="truncate">{item.title}</span>
                      {!item.published ? (
                        <span className="ml-2 font-mono text-[11px] text-danger">nicht freigegeben</span>
                      ) : null}
                    </span>
                    <span className="flex">
                      <ShowcaseButton
                        pageId={item.pageId}
                        op="up"
                        label={`${item.title} nach oben`}
                        disabled={index === 0}
                      />
                      <ShowcaseButton
                        pageId={item.pageId}
                        op="down"
                        label={`${item.title} nach unten`}
                        disabled={index === showcase.length - 1}
                      />
                      <ShowcaseButton
                        pageId={item.pageId}
                        op="remove"
                        label={`${item.title} aus dem Showcase entfernen`}
                      />
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </aside>
      </div>
    </>
  );
}
