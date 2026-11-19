import type { Metadata } from "next";
import { requireOwner } from "@/modules/auth/session";
import { Meta } from "@/ui/card";
import { ComingSoon } from "@/ui/coming-soon";
import { PageHeader } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "Portfolio" };

export default async function Page() {
  await requireOwner();
  return (
    <>
      <PageHeader title="Portfolio" meta={<Meta>Präsentieren</Meta>} />
      <ComingSoon
        increment={4}
        what="Seiten aus Reports zusammenstellen, als Snapshot freigeben, kuratieren und über widerrufbare Links teilen."
      />
    </>
  );
}
