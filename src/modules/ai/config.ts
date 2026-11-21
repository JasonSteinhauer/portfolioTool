import { z } from "zod";

/**
 * KI-Konfiguration (nur serverseitig). Standard ist `none`: ohne ausdrückliche Einrichtung
 * verlässt kein Inhalt die App.
 *
 * Preise: Claude Haiku 5.5, Anthropic-API, Prompts ≤ 100 000 Tokens (Stand Oktober 2026,
 * platform.claude.com/docs/en/about-claude/pricing). Längere Prompts kosten das Fünffache – das
 * Gateway begrenzt die Eingabe deshalb deutlich darunter. Bei Preisänderungen per Env anpassen.
 */
export const aiConfigSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    AI_PROVIDER: z.enum(["none", "anthropic", "fake"]).default("none"),
    /** Der Test-Provider ist in Produktion nur mit ausdrücklicher Freigabe erlaubt (E2E). */
    AI_ALLOW_FAKE: z.enum(["0", "1"]).default("0"),
    ANTHROPIC_API_KEY: z.string().trim().optional(),
    AI_MODEL: z.string().trim().min(1).default("claude-haiku-5-5"),
    AI_MONTHLY_BUDGET_USD: z.coerce.number().positive().max(100).default(5),
    AI_PRICE_INPUT_USD_PER_MTOK: z.coerce.number().positive().default(0.1),
    AI_PRICE_OUTPUT_USD_PER_MTOK: z.coerce.number().positive().default(0.5),
  })
  .superRefine((env, ctx) => {
    if (env.AI_PROVIDER === "anthropic" && (!env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY.length < 20)) {
      ctx.addIssue({ code: "custom", path: ["ANTHROPIC_API_KEY"], message: "fehlt oder ist zu kurz" });
    }
    if (env.AI_PROVIDER === "fake" && env.NODE_ENV === "production" && env.AI_ALLOW_FAKE !== "1") {
      ctx.addIssue({ code: "custom", path: ["AI_PROVIDER"], message: "Test-Provider ist in Produktion nicht erlaubt" });
    }
  });

export type AiConfig = {
  provider: "none" | "anthropic" | "fake";
  apiKey?: string;
  model: string;
  monthlyBudgetMicroUsd: number;
  priceInputMicroUsdPerToken: number;
  priceOutputMicroUsdPerToken: number;
};

export function parseAiConfig(source: Record<string, string | undefined>): AiConfig {
  const result = aiConfigSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Ungültige KI-Konfiguration:\n${issues}`);
  }
  const env = result.data;
  return {
    provider: env.AI_PROVIDER,
    apiKey: env.ANTHROPIC_API_KEY,
    model: env.AI_PROVIDER === "fake" ? "fake-deterministic" : env.AI_MODEL,
    monthlyBudgetMicroUsd: Math.round(env.AI_MONTHLY_BUDGET_USD * 1_000_000),
    // USD pro Million Tokens = Mikro-USD pro Token
    priceInputMicroUsdPerToken: env.AI_PRICE_INPUT_USD_PER_MTOK,
    priceOutputMicroUsdPerToken: env.AI_PRICE_OUTPUT_USD_PER_MTOK,
  };
}

/** Kosten in Mikro-USD (aufgerundet, damit das Budget nie unterschätzt wird). */
export function costMicroUsd(config: AiConfig, inputTokens: number, outputTokens: number): number {
  return Math.ceil(inputTokens * config.priceInputMicroUsdPerToken + outputTokens * config.priceOutputMicroUsdPerToken);
}
