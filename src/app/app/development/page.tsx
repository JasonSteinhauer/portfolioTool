import type { Metadata } from "next";
import { requireOwner } from "@/modules/auth/session";
import { Meta } from "@/ui/card";
import { ComingSoon } from "@/ui/coming-soon";
import { PageHeader } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "Entwicklung" };

export default async function Page() {
  await requireOwner();
  return (
    <>
      <PageHeader title="Entwicklung" meta={<Meta>Kompetenzen</Meta>} />
      <ComingSoon
        increment={6}
        what="Fachgebiete, Kompetenzen und eine chronologische Timeline – belegt durch Reports, Projekte und Reflexionen statt durch Prozentwerte."
      />
    </>
  );
}
