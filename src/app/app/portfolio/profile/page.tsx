import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { getProfile } from "@/modules/portfolio/service";
import { Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { ProfileEditor } from "./profile-editor";

export const metadata: Metadata = { title: "Profil" };

export default async function ProfilePage() {
  const { actor, user } = await requireOwner();
  const { profile, current } = await getProfile(getDb(), actor, user.name);

  return (
    <>
      <PageHeader
        title="Profil"
        meta={
          <Meta>
            <Link href="/app/portfolio" className="hover:text-text-primary">
              ← Portfolio
            </Link>{" "}
            · Über mich, Expertise, Kontakt
          </Meta>
        }
      />
      <p className="mb-6 max-w-prose text-sm text-text-secondary">
        Erscheint oben auf der Showcase-Seite. Wie Fallstudien wird es erst mit der Freigabe für Personen mit Link
        sichtbar.
      </p>
      <ProfileEditor initial={profile} publishedVersion={current?.versionNo ?? null} />
    </>
  );
}
