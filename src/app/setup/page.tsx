import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { configuredSetupToken, ownerExists } from "@/modules/auth/setup";
import { AuthFrame } from "@/ui/auth-frame";
import { SetupForm } from "./setup-form";

export const metadata: Metadata = { title: "Einrichtung", robots: { index: false, follow: false } };

/** Einmalige Ersteinrichtung – nur ohne bestehendes Konto und mit gesetztem SETUP_TOKEN. */
export default async function SetupPage() {
  if (!configuredSetupToken() || (await ownerExists(getDb()))) notFound();
  return (
    <AuthFrame
      step="Einrichtung"
      title="Owner-Konto anlegen"
      intro="Einmalig: Danach ist diese Seite dauerhaft gesperrt."
    >
      <SetupForm />
    </AuthFrame>
  );
}
