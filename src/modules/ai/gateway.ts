import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { recordAudit } from "@/modules/audit/service";
import { assertCan, type Actor } from "@/modules/auth/policy";
import { costMicroUsd, type AiConfig } from "./config";
import { AiProviderError, type AiProvider } from "./provider";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * KI-Gateway: der EINZIGE Weg zu einem Modell. Erzwingt Monatsbudget, Rate-Limit, Größenlimit,
 * protokolliert jeden Auftrag in `ai_jobs` (nur Verweise und Zahlen, keine Inhalte) und validiert
 * die Antwort, bevor irgendetwas daraus entsteht. Ergebnisse sind immer nur Vorschläge.
 */
export const AI_LIMITS = {
  /** ~40 000 Tokens – bleibt sicher unter der 100 000-Token-Preisstufe. */
  maxInputChars: 120_000,
  jobsPerHour: 30,
} as const;

export class AiUnavailableError extends Error {
  constructor() {
    super("KI ist nicht eingerichtet.");
    this.name = "AiUnavailableError";
  }
}

/** Auftrag wird nicht ausgeführt (Budget, Limit, Sperre) – Meldung ist für die Oberfläche gedacht. */
export class AiBlockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiBlockedError";
  }
}

/** Auftrag ist gescheitert (Anbieter, ungültige Antwort). */
export class AiJobFailedError extends Error {
  constructor(
    message: string,
    public readonly jobId: string,
  ) {
    super(message);
    this.name = "AiJobFailedError";
  }
}

export type AiDeps = { db: Db; actor: Actor; provider: AiProvider | null; config: AiConfig; now?: Date };

function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

export async function monthlyUsage(db: Db, actor: Actor, config: AiConfig, now = new Date()) {
  assertCan(actor, "ai_job:read");
  const [row] = await db
    .select({
      spent: sql<number>`coalesce(sum(${schema.aiJobs.costMicroUsd}), 0)::bigint`,
      jobs: sql<number>`count(*)::int`,
    })
    .from(schema.aiJobs)
    .where(and(eq(schema.aiJobs.ownerId, actor.userId), gte(schema.aiJobs.createdAt, monthStart(now))));
  const spentMicroUsd = Number(row?.spent ?? 0);
  return {
    spentMicroUsd,
    budgetMicroUsd: config.monthlyBudgetMicroUsd,
    remainingMicroUsd: Math.max(0, config.monthlyBudgetMicroUsd - spentMicroUsd),
    jobs: Number(row?.jobs ?? 0),
  };
}

export async function listRecentJobs(db: Db, actor: Actor, limit = 20) {
  assertCan(actor, "ai_job:read");
  return db
    .select({
      id: schema.aiJobs.id,
      kind: schema.aiJobs.kind,
      status: schema.aiJobs.status,
      model: schema.aiJobs.model,
      inputTokens: schema.aiJobs.inputTokens,
      outputTokens: schema.aiJobs.outputTokens,
      costMicroUsd: schema.aiJobs.costMicroUsd,
      error: schema.aiJobs.error,
      createdAt: schema.aiJobs.createdAt,
    })
    .from(schema.aiJobs)
    .where(eq(schema.aiJobs.ownerId, actor.userId))
    .orderBy(desc(schema.aiJobs.createdAt))
    .limit(limit);
}

/** Holt den JSON-Teil aus einer Modellantwort (toleriert ```-Zäune und Text drumherum). */
export function extractJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("Keine JSON-Antwort");
  return JSON.parse(candidate.slice(start, end + 1));
}

export async function runAiJob<T>(
  deps: AiDeps,
  job: {
    kind: string;
    inputRefs: Record<string, unknown>;
    system: string;
    user: string;
    maxOutputTokens: number;
    /** Wirft bei ungültiger Antwort → ein zweiter Versuch, dann Abbruch. */
    parse: (text: string) => T;
  },
): Promise<{ jobId: string; result: T }> {
  const { db, actor, provider, config } = deps;
  const now = deps.now ?? new Date();
  assertCan(actor, "ai_job:create");
  if (!provider) throw new AiUnavailableError();

  const inputChars = job.system.length + job.user.length;
  if (inputChars > AI_LIMITS.maxInputChars) {
    throw new AiBlockedError("Der Inhalt ist für einen KI-Auftrag zu lang. Bitte den Report kürzen oder aufteilen.");
  }

  const limit = await consumeRateLimit(
    db,
    `ai:user:${actor.userId}`,
    { limit: AI_LIMITS.jobsPerHour, windowMs: 60 * 60_000 },
    now,
  );
  if (!limit.allowed) throw new AiBlockedError("Zu viele KI-Aufträge in kurzer Zeit – bitte später erneut.");

  // Konservative Schätzung (≈ 3 Zeichen pro Token, volle Ausgabe, zwei Versuche).
  const estimate = 2 * costMicroUsd(config, Math.ceil(inputChars / 3), job.maxOutputTokens);
  const usage = await monthlyUsage(db, actor, config, now);
  if (usage.spentMicroUsd + estimate > usage.budgetMicroUsd) {
    throw new AiBlockedError("Das monatliche KI-Budget ist ausgeschöpft. Es wird zum Monatsanfang zurückgesetzt.");
  }

  const [created] = await db
    .insert(schema.aiJobs)
    .values({
      ownerId: actor.userId,
      kind: job.kind,
      status: "running",
      provider: provider.name,
      model: provider.model,
      inputRefs: job.inputRefs,
      startedAt: now,
    })
    .returning({ id: schema.aiJobs.id });

  let inputTokens = 0;
  let outputTokens = 0;
  let failure = "Die KI-Antwort war ungültig.";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await provider.complete({
        kind: job.kind,
        system: job.system,
        user:
          attempt === 0
            ? job.user
            : `${job.user}\n\nWICHTIG: Deine letzte Antwort war kein gültiges JSON nach Vorgabe. Antworte ausschließlich mit dem JSON-Objekt.`,
        maxOutputTokens: job.maxOutputTokens,
      });
      inputTokens += response.inputTokens;
      outputTokens += response.outputTokens;
      const result = job.parse(response.text);
      const cost = costMicroUsd(config, inputTokens, outputTokens);
      await db
        .update(schema.aiJobs)
        .set({ status: "succeeded", inputTokens, outputTokens, costMicroUsd: cost, finishedAt: new Date() })
        .where(eq(schema.aiJobs.id, created.id));
      await recordAudit(db, {
        actorType: "user",
        actorId: actor.userId,
        action: "ai.job.succeeded",
        targetType: "ai_job",
        targetId: created.id,
        metadata: {
          kind: job.kind,
          model: provider.model,
          usageIn: inputTokens,
          usageOut: outputTokens,
          costMicroUsd: cost,
        },
      });
      return { jobId: created.id, result };
    } catch (error) {
      if (error instanceof AiProviderError) {
        failure = error.message;
        if (!error.retryable) break;
      }
      // sonst: Antwort ungültig → zweiter Versuch
    }
  }

  const cost = costMicroUsd(config, inputTokens, outputTokens);
  await db
    .update(schema.aiJobs)
    .set({ status: "failed", inputTokens, outputTokens, costMicroUsd: cost, error: failure, finishedAt: new Date() })
    .where(eq(schema.aiJobs.id, created.id));
  await recordAudit(db, {
    actorType: "user",
    actorId: actor.userId,
    action: "ai.job.failed",
    targetType: "ai_job",
    targetId: created.id,
    metadata: {
      kind: job.kind,
      model: provider.model,
      usageIn: inputTokens,
      usageOut: outputTokens,
      costMicroUsd: cost,
    },
  });
  throw new AiJobFailedError(failure, created.id);
}

/**
 * Offene KI-Vorschläge über alle Reports und Seiten hinweg – gruppiert nach Ziel, mit Titel.
 * Gelöschte Ziele werden ausgeblendet.
 */
export async function listOpenProposalTargets(db: Db, actor: Actor) {
  assertCan(actor, "ai_job:read");
  const rows = await db
    .select({
      targetType: schema.aiProposals.targetType,
      targetId: schema.aiProposals.targetId,
      count: sql<number>`count(*)::int`,
      latest: sql<Date>`max(${schema.aiProposals.createdAt})`,
      reportTitle: schema.reports.title,
      pageTitle: schema.portfolioPages.title,
    })
    .from(schema.aiProposals)
    .innerJoin(schema.aiJobs, eq(schema.aiJobs.id, schema.aiProposals.aiJobId))
    .leftJoin(
      schema.reports,
      and(
        eq(schema.aiProposals.targetType, "report"),
        eq(schema.reports.id, schema.aiProposals.targetId),
        isNull(schema.reports.deletedAt),
      ),
    )
    .leftJoin(
      schema.portfolioPages,
      and(
        eq(schema.aiProposals.targetType, "portfolio_page"),
        eq(schema.portfolioPages.id, schema.aiProposals.targetId),
      ),
    )
    .where(and(eq(schema.aiJobs.ownerId, actor.userId), eq(schema.aiProposals.status, "pending")))
    .groupBy(
      schema.aiProposals.targetType,
      schema.aiProposals.targetId,
      schema.reports.title,
      schema.portfolioPages.title,
    )
    .orderBy(desc(sql`max(${schema.aiProposals.createdAt})`));
  return rows
    .filter((r) => r.targetId && (r.reportTitle ?? r.pageTitle))
    .map((r) => ({
      type: r.targetType as "report" | "portfolio_page",
      id: r.targetId!,
      title: (r.reportTitle ?? r.pageTitle)!,
      count: r.count,
      latest: new Date(r.latest),
    }));
}
