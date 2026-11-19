import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/modules/auth/session";
import { AuthFrame } from "@/ui/auth-frame";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = { title: "Zwei-Faktor-Bestätigung" };

export default async function VerifyPage() {
  if (await getCurrentSession()) redirect("/app");

  return (
    <AuthFrame
      step="Zweiter Faktor"
      title="Bestätigen"
      intro={
        <>
          Gib den aktuellen Code ein. Abgebrochen?{" "}
          <Link href="/login" className="text-text-primary underline decoration-accent underline-offset-4">
            Zurück zum Login
          </Link>
        </>
      }
    >
      <VerifyForm />
    </AuthFrame>
  );
}
