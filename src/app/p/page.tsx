import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { getViewerHome } from "@/modules/sharing/service";
import { getViewerLink } from "@/modules/sharing/viewer";
import { homeNav, ViewerHome } from "@/ui/viewer/home";
import { workFromSnapshot } from "@/ui/viewer/map";
import { brandFromName, ViewerShell } from "@/ui/viewer/shell";

export const metadata: Metadata = { title: "Portfolio" };

/** One-Pager: Über mich, ausgewählte Arbeiten, Expertise, Entwicklung, Kontakt. */
export default async function ViewerHomePage() {
  const link = await getViewerLink();
  if (!link) notFound();
  const { profile, pages } = await getViewerHome(getDb(), link);

  // Ein Seiten-Link führt direkt zur Seite.
  if (link.scopeType === "page" && pages.length === 1) redirect(`/p/${pages[0].slug}`);

  const works = pages.map((p) => workFromSnapshot(p.snapshot, p.pageId, `/p/${p.slug}`, p.approvedAt));
  return (
    <ViewerShell brand={brandFromName(profile?.name)} homeHref="/p" nav={homeNav(profile, works)}>
      <ViewerHome profile={profile} works={works} />
    </ViewerShell>
  );
}
