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
