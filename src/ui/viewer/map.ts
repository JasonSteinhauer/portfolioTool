import type { PageComponent } from "@/content/page-components/schema";
import type { CaseStudySnapshot, RelatedEntry } from "@/modules/portfolio/service";
import type { ViewerRelated } from "./document";
import type { ViewerWork } from "./home";

/** Reine Abbildungen von Snapshots auf die Präsentations-Bausteine (Viewer und Vorschau). */

export function workFromSnapshot(
  snapshot: Pick<CaseStudySnapshot, "title" | "page">,
  id: string,
  href: string,
  date: Date,
): ViewerWork {
  const hero = snapshot.page.components.find((c): c is Extract<PageComponent, { type: "hero" }> => c.type === "hero");
  const full = snapshot.page.components.find(
    (c): c is Extract<PageComponent, { type: "fullReport" }> => c.type === "fullReport",
  );
  return {
    id,
    href,
    title: snapshot.title,
    eyebrow: hero?.eyebrow ?? "",
    summary: hero?.summary ?? "",
    tags: [...(hero?.tags ?? []), ...(full?.tags ?? [])],
    date,
    kindLabel: full ? "Bericht" : "Fallstudie",
  };
}

/** Verknüpfungen: klickbar nur, wenn die Zielseite sichtbar ist (`hrefForPage` liefert dann eine URL). */
export function resolveRelated(
  related: RelatedEntry[] | undefined,
  hrefForPage: (pageId: string) => string | null,
): ViewerRelated[] {
  return (related ?? []).map((r) => ({
    title: r.title,
    relation: r.relation,
    href: r.pageId ? hrefForPage(r.pageId) : null,
  }));
}
