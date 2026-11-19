"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { signIn, verifySecondFactor } from "@/modules/auth/service";

export type FormState = { error?: string };

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await signIn({ email: formData.get("email"), password: formData.get("password") }, await headers());
  if (!result.ok) return { error: result.error };

  switch (result.data.next) {
    case "two-factor":
      redirect("/login/verify");
    case "app":
      redirect("/app");
  }
}

export async function verifyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const result = await verifySecondFactor(
    {
      method: formData.get("method") === "backup" ? "backup" : "totp",
      code: formData.get("code"),
      trustDevice: formData.get("trustDevice") === "on",
    },
    await headers(),
  );
  if (!result.ok) return { error: result.error };
  redirect("/app");
}
