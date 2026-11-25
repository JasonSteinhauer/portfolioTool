import type { Metadata } from "next";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { listProjects, MAX_PROJECT_DEPTH, toProjectTree } from "@/modules/projects/service";
import { Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { createProjectAction } from "../actions";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = { title: "Neues Projekt" };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requireOwner();
  const parent = (await searchParams).parent;
  const tree = toProjectTree(await listProjects(getDb(), actor));
  const parents = tree.filter((p) => p.depth < MAX_PROJECT_DEPTH);
  return (
    <>
      <PageHeader title="Neues Projekt" meta={<Meta>Projekte</Meta>} />
      <ProjectForm
        action={createProjectAction}
        parents={parents}
        defaultParentId={typeof parent === "string" && parents.some((p) => p.id === parent) ? parent : undefined}
        submitLabel="Projekt anlegen"
      />
    </>
  );
}
