import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { getProject, ProjectNotFoundError } from "@/modules/projects/service";
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
  return (
    <>
      <PageHeader title="Projekt bearbeiten" meta={<Meta>{project.title}</Meta>} />
      <ProjectForm action={updateProjectAction} project={project} submitLabel="Speichern" />
    </>
  );
}
