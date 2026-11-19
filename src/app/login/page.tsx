import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/session";
import { AuthFrame } from "@/ui/auth-frame";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage() {
  const session = await getCurrentSession();
  if (session) redirect("/app");

  return (
    <AuthFrame
      step="Schritt 1 / 2 · Passwort"
      title="Anmelden"
      intro="Privater Arbeitsbereich. Zugang nur für den Owner."
    >
      <LoginForm />
    </AuthFrame>
  );
}
