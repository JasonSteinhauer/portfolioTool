import type { Metadata } from "next";
import { requireOwner } from "@/modules/auth/session";
import { Meta } from "@/ui/card";
import { ComingSoon } from "@/ui/coming-soon";
import { PageHeader } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "Reports" };

export default async function Page() {
  await requireOwner();
  return (
    <>
      <PageHeader title="Reports" meta={<Meta>Dokumentieren</Meta>} />
      <ComingSoon
        increment={2}
        what="Lern-, Tätigkeits-, Projekt- und Reflexionsberichte, Fallanalysen und Meilensteine – mit strukturierten Formularen, Blockeditor, Autosave und Versionsverlauf."
      />
    </>
  );
}
