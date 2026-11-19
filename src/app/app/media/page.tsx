import type { Metadata } from "next";
import { requireOwner } from "@/modules/auth/session";
import { Meta } from "@/ui/card";
import { ComingSoon } from "@/ui/coming-soon";
import { PageHeader } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "Medien" };

export default async function Page() {
  await requireOwner();
  return (
    <>
      <PageHeader title="Medien" meta={<Meta>Mediathek</Meta>} />
      <ComingSoon
        increment={3}
        what="Zentrale Mediathek für Screenshots, Dokumente und Code-Dateien – mit sicherem Upload, Duplikaterkennung und Verwendungsnachweis."
      />
    </>
  );
}
