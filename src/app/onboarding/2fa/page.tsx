import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireSession } from "@/modules/auth/session";
import { AuthFrame } from "@/ui/auth-frame";
import { Enrollment } from "./enrollment";

export const metadata: Metadata = { title: "Zwei-Faktor-Schutz einrichten" };

export default async function TwoFactorOnboardingPage() {
  const session = await requireSession();
  if ((session.user as { twoFactorEnabled?: boolean }).twoFactorEnabled) redirect("/app");

  return (
    <AuthFrame
      step="Einmalige Einrichtung"
      title="Zwei-Faktor-Schutz"
      intro="Ohne zweiten Faktor gibt es keinen Zugriff auf den Arbeitsbereich. Die Einrichtung dauert etwa eine Minute."
    >
      <Enrollment />
    </AuthFrame>
  );
}
