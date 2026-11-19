/**
 * Zentrale Autorisierung. JEDER Zugriff auf fachliche Daten geht durch `can()`.
 *
 * Heute gibt es nur die Rolle `owner`. Neue Rollen (z. B. `reviewer`) werden hier als
 * zusätzliche Regeln ergänzt – ohne Änderungen in den Modulen.
 */

export type Role = "owner";

export type Actor = {
  type: "user";
  userId: string;
  role: Role;
};

export const RESOURCE_TYPES = [
  "report",
  "project",
  "competency",
  "media",
  "portfolio_page",
  "collection",
  "share_link",
  "ai_job",
  "settings",
  "audit",
] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const OPERATIONS = ["read", "create", "update", "delete", "publish", "share"] as const;
export type Operation = (typeof OPERATIONS)[number];

export type Action = `${ResourceType}:${Operation}`;

/** Ressourcen, die einem Nutzer gehören. `null` = Aktion ohne konkrete Ressource (z. B. create). */
export type OwnedResource = { ownerId: string } | null;

/** Aktionen, die nur auf eigenen Ressourcen und nie automatisiert erfolgen dürfen. */
const KNOWN_ACTIONS = new Set<string>(RESOURCE_TYPES.flatMap((r) => OPERATIONS.map((o) => `${r}:${o}`)));

export function can(actor: Actor | null | undefined, action: Action, resource: OwnedResource = null): boolean {
  if (!actor || actor.type !== "user") return false;
  if (!KNOWN_ACTIONS.has(action)) return false;

  switch (actor.role) {
    case "owner":
      // Der Owner darf alles – aber nur mit seinen eigenen Daten.
      return resource === null || resource.ownerId === actor.userId;
    default:
      return false;
  }
}

/**
 * Wird geworfen, wenn eine Aktion nicht erlaubt ist. Nach außen als 404 behandeln,
 * damit nicht verraten wird, ob eine fremde Ressource existiert.
 */
export class ForbiddenError extends Error {
  constructor(public readonly action: Action) {
    super(`Nicht erlaubt: ${action}`);
    this.name = "ForbiddenError";
  }
}

export function assertCan(
  actor: Actor | null | undefined,
  action: Action,
  resource: OwnedResource = null,
): asserts actor is Actor {
  if (!can(actor, action, resource)) throw new ForbiddenError(action);
}
