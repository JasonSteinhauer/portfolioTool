import type { Metadata } from "next";
import { requireOwner } from "@/modules/auth/session";
import { Meta } from "@/ui/card";
import { ComingSoon } from "@/ui/coming-soon";
import { PageHeader } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "Projekte" };

export default async function Page() {
  await requireOwner();
  return (
    <>
      <PageHeader title="Projekte" meta={<Meta>Struktur</Meta>} />
      <ComingSoon
        increment={2}
        what="Projekte bündeln zusammengehörige Reports und bilden die Grundlage für Fallstudien im Portfolio."
      />
    </>
  );
}
