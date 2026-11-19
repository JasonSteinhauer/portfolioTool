import { z } from "zod";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import type * as schema from "@/lib/db/schema";
import { recordAudit } from "@/modules/audit/service";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, type Auth } from "./auth";

/**
 * Passwortregeln: Länge schlägt Komplexität (NIST SP 800-63B). Zusätzlich offensichtliche
 * Schwachstellen ablehnen. 2FA ist ohnehin Pflicht.
 */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen`)
  .max(PASSWORD_MAX_LENGTH, `Höchstens ${PASSWORD_MAX_LENGTH} Zeichen`)
  .refine((v) => new Set(v).size >= 6, { message: "Zu wenig unterschiedliche Zeichen" })
  .refine((v) => !/^(password|passwort|123456|qwertz|qwerty)/i.test(v), { message: "Zu leicht zu erraten" });

export const ownerInputSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  name: z.string().trim().min(1).max(100),
  password: passwordSchema,
});

export type OwnerInput = z.input<typeof ownerInputSchema>;

export class OwnerAlreadyExistsError extends Error {
  constructor(email: string) {
    super(`Es existiert bereits ein Konto für ${email}`);
    this.name = "OwnerAlreadyExistsError";
  }
}

/**
 * Legt den Owner an (Registrierung ist in der App deaktiviert). Nutzt die interne API von
 * Better Auth, damit Passwort-Hashing (scrypt) und Datenmodell identisch zum Login sind.
 */
export async function createOwner(auth: Auth, db: PostgresJsDatabase<typeof schema>, input: OwnerInput) {
  const data = ownerInputSchema.parse(input);
  const ctx = await auth.$context;

  if (await ctx.internalAdapter.findUserByEmail(data.email)) {
    throw new OwnerAlreadyExistsError(data.email);
  }

  const user = await ctx.internalAdapter.createUser(
    { email: data.email, name: data.name, emailVerified: true },
    { method: "admin" },
  );
  await ctx.internalAdapter.linkAccount({
    userId: user.id,
    providerId: "credential",
    accountId: user.id,
    password: await ctx.password.hash(data.password),
  });

  await recordAudit(db, {
    actorType: "system",
    action: "auth.owner.created",
    targetType: "user",
    targetId: user.id,
  });

  return { id: user.id, email: data.email };
}
