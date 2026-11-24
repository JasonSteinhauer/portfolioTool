import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageView } from "@/content/page-components/render";
import { pageConfigSchema } from "@/content/page-components/schema";
import { getDb } from "@/lib/db/client";
import { composePayloadSchema, mergeComposition } from "@/modules/ai/compose";
import { listProposals } from "@/modules/ai/language";
import { requireOwner } from "@/modules/auth/session";
import { getPage, PageNotFoundError } from "@/modules/portfolio/service";
import { Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { ComposeDecisionForm } from "./compose-decision-form";

export const metadata: Metadata = { title: "KI-Entwurf" };

const TYPE_LABELS: Record<string, string> = {
  hero: "Hero",
  projectOverview: "Überblick",
  resultHighlights: "Ergebnisse",
  insights: "Erkenntnisse",
};

export default async function PageAiProposal({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOwner();
  const { id } = await params;
  const db = getDb();
  const page = await getPage(db, actor, id).catch((error: unknown) => {
    if (error instanceof PageNotFoundError) notFound();
    throw error;
  });
  const [proposal] = (await listProposals(db, actor, { type: "portfolio_page", id: page.id })).filter(
    (p) => p.kind === "compose",
  );

  const back = (
    <Meta>
      <Link href={`/app/portfolio/${page.id}`} className="hover:text-text-primary">
        ← {page.title}
      </Link>
    </Meta>
  );
  if (!proposal) {
    return (
      <>
        <PageHeader title="KI-Entwurf" meta={back} />
        <p className="text-text-secondary">Kein offener KI-Entwurf.</p>
      </>
    );
  }

  const payload = composePayloadSchema.parse(proposal.payload);
  const components = pageConfigSchema.parse({ schemaVersion: 1, components: payload.components }).components;
  const merged = mergeComposition(page.config, components);

  return (
    <>
      <PageHeader title="KI-Entwurf prüfen" meta={back} />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section
          aria-label="Vorschau des KI-Entwurfs"
          className="min-w-0 border-2 border-dashed border-border-strong p-6"
        >
          <PageView config={merged} />
        </section>
        <aside className="flex flex-col gap-6">
          <ComposeDecisionForm pageId={page.id} proposalId={proposal.id} />
          {payload.dropped > 0 ? (
            <p className="text-sm text-text-secondary" data-testid="ai-dropped">
              {payload.dropped} Aussage{payload.dropped === 1 ? "" : "n"} ohne gültige Quelle wurde
              {payload.dropped === 1 ? "" : "n"} verworfen.
            </p>
          ) : null}
          <section aria-labelledby="citations">
            <h2 id="citations" className="mb-2 text-sm font-semibold">
              Quellen je Abschnitt
            </h2>
            <ul className="flex flex-col gap-3 text-sm" data-testid="ai-citations">
              {components.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{TYPE_LABELS[c.type] ?? c.type}</span>
                  <ul className="mt-1 flex flex-col gap-0.5 font-mono text-[11px] text-text-secondary">
                    {(payload.citations[c.id] ?? []).map((sourceId) => (
                      <li key={sourceId}>{payload.sourceLabels[sourceId] ?? sourceId}</li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </section>
          <p className="text-xs text-text-secondary">
            Übernommen wird in den Entwurf – veröffentlicht wird erst mit „Freigeben“.
          </p>
        </aside>
      </div>
    </>
  );
}
