import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/session";
import { AuthFrame } from "@/ui/auth-frame";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Anmelden" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ eingerichtet?: string }> }) {
  const session = await getCurrentSession();
  if (session) redirect("/app");
  const { eingerichtet } = await searchParams;

  return (
    <AuthFrame step="Anmeldung" title="Anmelden" intro="Privater Arbeitsbereich. Zugang nur für den Owner.">
      {eingerichtet ? (
        <p role="status" className="mb-5 border-l-2 border-accent pl-3 text-sm">
          Konto angelegt. Melde dich jetzt an und richte danach in den Einstellungen die 2FA ein.
        </p>
      ) : null}
      <LoginForm />
    </AuthFrame>
  );
}
