import type { Metadata } from "next";
import { requireOwner } from "@/modules/auth/session";
import { Meta } from "@/ui/card";
import { ComingSoon } from "@/ui/coming-soon";
import { PageHeader } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "KI-Assistent" };

export default async function Page() {
  await requireOwner();
  return (
    <>
      <PageHeader title="KI-Assistent" meta={<Meta>Optional</Meta>} />
      <ComingSoon
        increment={7}
        what="Sprachvorschläge und Seitenkompositionen als Vorschläge zur Freigabe. Die Plattform bleibt ohne KI voll nutzbar."
      />
    </>
  );
}
