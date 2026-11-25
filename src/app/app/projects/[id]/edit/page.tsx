import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import {
  descendantIds,
  getProject,
  listProjects,
  MAX_PROJECT_DEPTH,
  ProjectNotFoundError,
  toProjectTree,
} from "@/modules/projects/service";
import { Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { updateProjectAction } from "../../actions";
import { ProjectForm } from "../../project-form";

export const metadata: Metadata = { title: "Projekt bearbeiten" };

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOwner();
  const { id } = await params;
  const project = await getProject(getDb(), actor, id).catch((error: unknown) => {
    if (error instanceof ProjectNotFoundError) notFound();
    throw error;
  });
  const rows = await listProjects(getDb(), actor);
  const tree = toProjectTree(rows);
  const excluded = descendantIds(rows, project.id).add(project.id);
  const height = (id: string): number =>
    1 + Math.max(0, ...rows.filter((r) => r.parentProjectId === id).map((r) => height(r.id)));
  // Nur Eltern, unter die das Projekt samt Unterprojekten noch passt.
  const parents = tree.filter((p) => !excluded.has(p.id) && p.depth + height(project.id) <= MAX_PROJECT_DEPTH);
  return (
    <>
      <PageHeader title="Projekt bearbeiten" meta={<Meta>{project.title}</Meta>} />
      <ProjectForm action={updateProjectAction} project={project} parents={parents} submitLabel="Speichern" />
    </>
  );
}
