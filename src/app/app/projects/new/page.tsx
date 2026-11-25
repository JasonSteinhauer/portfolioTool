import type { Metadata } from "next";
import { requireOwner } from "@/modules/auth/session";
import { Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";
import { createProjectAction } from "../actions";
import { ProjectForm } from "../project-form";

export const metadata: Metadata = { title: "Neues Projekt" };

export default async function NewProjectPage() {
  await requireOwner();
  return (
    <>
      <PageHeader title="Neues Projekt" meta={<Meta>Projekte</Meta>} />
      <ProjectForm action={createProjectAction} submitLabel="Projekt anlegen" />
    </>
  );
}
