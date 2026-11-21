import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { listMedia, toSummary } from "@/modules/media/service";
import { getPage, listFavoriteIds, PageNotFoundError } from "@/modules/portfolio/service";
import { Button } from "@/ui/button";
import { Meta } from "@/ui/card";
import { MediaLibraryProvider } from "@/ui/media/media-picker";
import { PageHeader } from "@/ui/workspace-shell";
import { toggleFavoriteAction, unpublishPageAction } from "../actions";
import { listProposals } from "@/modules/ai/language";
import { aiRuntime } from "@/modules/ai/runtime";
import { getReport } from "@/modules/reports/service";
import { AiRequestButton } from "@/ui/ai/ai-request-button";
import { requestCompositionAction } from "../../ai/actions";
import { PageEditor } from "./page-editor";

export const metadata: Metadata = { title: "Portfolio-Seite" };

export default async function PortfolioPageEditor({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOwner();
  const { id } = await params;
  const db = getDb();
  const page = await getPage(db, actor, id).catch((error: unknown) => {
    if (error instanceof PageNotFoundError) notFound();
    throw error;
  });
  const [favorites, media] = await Promise.all([
    listFavoriteIds(db, actor, "page"),
    listMedia(db, actor, { kind: "image" }),
  ]);
  const favorite = favorites.has(page.id);
  const [pendingAi, sourceReport] = await Promise.all([
    listProposals(db, actor, { type: "portfolio_page", id: page.id }),
    page.sourceReportId ? getReport(db, actor, page.sourceReportId).catch(() => null) : null,
  ]);
  const aiDisabled = !aiRuntime().provider
    ? "KI ist nicht eingerichtet."
    : !sourceReport
      ? "Ohne Quell-Report kein KI-Entwurf."
      : sourceReport.classification === "internal_sensitive" || !sourceReport.aiAllowed
        ? "Im Quell-Report ist KI nicht freigegeben."
        : undefined;

  return (
    <>
      <PageHeader
        title={page.title}
        meta={
          <Meta>
            <Link href="/app/portfolio" className="hover:text-text-primary">
              ← Portfolio
            </Link>
            {page.sourceReportId ? (
              <>
                {" · "}
                <Link href={`/app/reports/${page.sourceReportId}`} className="hover:text-text-primary">
                  Quell-Report
                </Link>
              </>
            ) : null}
          </Meta>
        }
        actions={
          <>
            <form action={toggleFavoriteAction}>
              <input type="hidden" name="itemType" value="page" />
              <input type="hidden" name="itemId" value={page.id} />
              <input type="hidden" name="returnTo" value={`/app/portfolio/${page.id}`} />
              <Button type="submit" variant="ghost" size="sm" aria-pressed={favorite}>
                {favorite ? "★ Favorit" : "☆ Als Favorit"}
              </Button>
            </form>
            {page.current ? (
              <form action={unpublishPageAction}>
                <input type="hidden" name="pageId" value={page.id} />
                <Button type="submit" variant="danger" size="sm">
                  Freigabe zurückziehen
                </Button>
              </form>
            ) : null}
          </>
        }
      />
      <section
        aria-labelledby="ai-compose"
        className="mb-8 flex flex-col gap-3 border-2 border-border-default bg-surface p-5 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="max-w-xl">
          <h2 id="ai-compose" className="text-sm font-semibold">
            KI-Entwurf
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            Formuliert Hero, Überblick, Ergebnisse und Erkenntnisse aus dem Quell-Report – nur mit belegten Aussagen.
            Code und Bilder bleiben unverändert. Vorher speichern: Der Entwurf gilt nur für den gespeicherten Stand.
          </p>
          {pendingAi.length > 0 ? (
            <Link
              href={`/app/portfolio/${page.id}/ai`}
              className="mt-2 inline-block text-sm font-medium underline decoration-accent underline-offset-4"
            >
              Offenen KI-Entwurf ansehen
            </Link>
          ) : null}
        </div>
        <AiRequestButton
          action={requestCompositionAction}
          name="pageId"
          value={page.id}
          label="KI-Entwurf erzeugen"
          disabledReason={aiDisabled}
        />
      </section>
      <MediaLibraryProvider initial={media.map(toSummary)}>
        <PageEditor
          pageId={page.id}
          initialMeta={{ title: page.title, slug: page.slug, locale: page.locale }}
          initialConfig={page.config}
          publishedVersion={page.current?.versionNo ?? null}
        />
      </MediaLibraryProvider>
    </>
  );
}
