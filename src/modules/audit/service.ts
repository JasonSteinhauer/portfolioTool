import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/lib/db/schema";

type Db = PostgresJsDatabase<typeof schema>;

/** Alle protokollierten Aktionen an einer Stelle – verhindert Tippfehler und Wildwuchs. */
export const AUDIT_ACTIONS = [
  "auth.login.succeeded",
  "auth.login.failed",
  "auth.login.rate_limited",
  "auth.2fa.challenge_succeeded",
  "auth.2fa.challenge_failed",
  "auth.2fa.enrollment_started",
  "auth.2fa.enabled",
  "auth.2fa.disabled",
  "auth.2fa.backup_codes_regenerated",
  "auth.logout",
  "auth.session.revoked",
  "auth.owner.created",
  "report.created",
  "report.finalized",
  "report.deleted",
  "report.restored",
  "report.version_restored",
  "report.project_changed",
  "report.link_added",
  "report.link_removed",
  "project.created",
  "project.deleted",
  "competency.created",
  "competency.deleted",
  "media.uploaded",
  "media.deleted",
  "media.restored",
  "page.published",
  "page.unpublished",
  "share_link.created",
  "share_link.revoked",
  "ai.job.succeeded",
  "ai.job.failed",
  "ai.proposal.accepted",
  "ai.proposal.rejected",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export type AuditEventInput = {
  actorType: "user" | "ai" | "system" | "viewer";
  actorId?: string | null;
  action: AuditAction;
  targetType?: string | null;
  targetId?: string | null;
  /** Nur Metadaten. Niemals Passwörter, Tokens, Codes oder Inhalte. */
  metadata?: Record<string, string | number | boolean | null>;
  ipHash?: string | null;
};

const FORBIDDEN_METADATA_KEYS = /pass|token|secret|code|otp|cookie/i;

export async function recordAudit(db: Db, event: AuditEventInput): Promise<void> {
  const metadata = event.metadata ?? {};
  for (const key of Object.keys(metadata)) {
    if (FORBIDDEN_METADATA_KEYS.test(key)) {
      throw new Error(`Audit-Metadaten dürfen kein Feld "${key}" enthalten`);
    }
  }
  await db.insert(schema.auditEvents).values({
    actorType: event.actorType,
    actorId: event.actorId ?? null,
    action: event.action,
    targetType: event.targetType ?? null,
    targetId: event.targetId ?? null,
    metadata,
    ipHash: event.ipHash ?? null,
  });
}
