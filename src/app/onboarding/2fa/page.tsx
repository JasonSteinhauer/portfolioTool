import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSession } from "@/modules/auth/session";
import { AuthFrame } from "@/ui/auth-frame";
import { Enrollment } from "./enrollment";

export const metadata: Metadata = { title: "Zwei-Faktor-Schutz einrichten" };

export default async function TwoFactorOnboardingPage() {
  const session = await requireSession();
  if ((session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) redirect("/app/settings");

  return (
    <AuthFrame
      step="Optional · empfohlen"
      title="Zwei-Faktor-Schutz"
      intro={
        <>
          Schützt dein Konto, falls das Passwort einmal in falsche Hände gerät. Dauert etwa eine Minute.{" "}
          <Link href="/app/settings" className="text-text-primary underline decoration-accent underline-offset-4">
            Abbrechen
          </Link>
        </>
      }
    >
      <Enrollment />
    </AuthFrame>
  );
}
