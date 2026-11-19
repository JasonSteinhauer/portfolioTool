import { redirect } from "next/navigation";

/** Einstieg: Der Workspace entscheidet selbst, ob Login oder 2FA-Einrichtung nötig ist. */
export default function HomePage() {
  redirect("/app");
}
