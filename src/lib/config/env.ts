import { z } from "zod";

/**
 * Zentrale, validierte Konfiguration. Fehlende oder falsche Werte führen beim Start
 * zu einem klaren Fehler statt zu stillen Fehlfunktionen.
 *
 * Secrets werden ausschließlich serverseitig gelesen. Nichts hiervon darf in Client-Code
 * importiert werden (siehe `server-only` in `server-env.ts`).
 */
export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url().refine((v) => v.startsWith("postgres://") || v.startsWith("postgresql://"), {
    message: "DATABASE_URL muss eine postgres://-URL sein",
  }),
  APP_URL: z.url().default("http://localhost:3000"),
  /**
   * Signiert Session-Cookies und verschlüsselt TOTP-Secrets/Backup-Codes.
   * Mindestens 32 Zeichen, z. B. `openssl rand -base64 32`.
   * ACHTUNG: Ein Wechsel macht bestehende 2FA-Einrichtungen unbrauchbar (Neueinrichtung nötig).
   */
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET muss mindestens 32 Zeichen lang sein")
    .refine((v) => !/^(changeme|secret|x+)$/i.test(v) && new Set(v).size >= 10, {
      message: "BETTER_AUTH_SECRET ist zu schwach – zufällig erzeugen (openssl rand -base64 32)",
    }),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("\n");
    throw new Error(`Ungültige Umgebungskonfiguration:\n${issues}`);
  }
  return result.data;
}
