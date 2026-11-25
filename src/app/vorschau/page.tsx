import type { Metadata } from "next";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { getViewerHome } from "@/modules/sharing/service";
import { homeNav, ViewerHome } from "@/ui/viewer/home";
import { workFromSnapshot } from "@/ui/viewer/map";
import { brandFromName, PreviewBanner, ViewerShell } from "@/ui/viewer/shell";

export const metadata: Metadata = { title: "Startseite" };

/**
 * Startseite, wie sie Empfänger eines Showcase-Links sehen: freigegebenes Profil und freigegebene
 * Seiten im Showcase – nichts aus Entwürfen.
 */
export default async function PreviewHome() {
  const { actor } = await requireOwner();
  const { profile, pages } = await getViewerHome(getDb(), {
    id: "vorschau",
    ownerId: actor.userId,
    scopeType: "showcase",
    scopeId: null,
  });
  const works = pages.map((p) =>
    workFromSnapshot(p.snapshot, p.pageId, `/vorschau/${p.pageId}?stand=freigegeben`, p.approvedAt),
  );
  return (
    <ViewerShell
      brand={brandFromName(profile?.name)}
      homeHref="/vorschau"
      nav={homeNav(profile, works)}
      banner={
        <PreviewBanner backHref="/app/portfolio">
          Vorschau – so sehen Empfänger eines Showcase-Links die Startseite (nur Freigegebenes).
        </PreviewBanner>
      }
    >
      <ViewerHome profile={profile} works={works} />
    </ViewerShell>
  );
}
