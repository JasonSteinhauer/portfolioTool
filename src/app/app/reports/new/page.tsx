import type { Metadata } from "next";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { listReportTypes } from "@/modules/reports/service";
import { Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { createReportAction } from "../actions";

export const metadata: Metadata = { title: "Neuer Report" };

export default async function NewReportPage() {
  await requireOwner();
  const types = await listReportTypes(getDb());

  return (
    <>
      <PageHeader title="Neuer Report" meta={<Meta>Typ wählen</Meta>} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {types.map((type) => (
          <form key={type.key} action={createReportAction}>
            <input type="hidden" name="typeKey" value={type.key} />
            <button
              type="submit"
              className="flex h-full w-full flex-col gap-2 border-2 border-border-default bg-surface p-6 text-left shadow-card transition-[border-color,box-shadow,transform] duration-[var(--motion-normal)] ease-technical hover:-translate-y-0.5 hover:border-accent hover:shadow-hover"
            >
              <span className="text-lg font-semibold">{type.name}</span>
              <span className="text-sm text-text-secondary">{type.description}</span>
              <Meta className="mt-auto pt-2">{type.fieldSchema.length} Felder · frei erweiterbar mit Blöcken</Meta>
            </button>
          </form>
        ))}
      </div>
    </>
  );
}
