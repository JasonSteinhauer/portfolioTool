import { describe, expect, it } from "vitest";
import { assertCan, can, ForbiddenError, type Actor } from "@/modules/auth/policy";
import { getClientIp, hashIdentifier } from "@/lib/security/request";

const owner: Actor = { type: "user", userId: "user_a", role: "owner" };

describe("can()", () => {
  it("erlaubt dem Owner alles auf eigenen Ressourcen", () => {
    expect(can(owner, "report:update", { ownerId: "user_a" })).toBe(true);
    expect(can(owner, "portfolio_page:publish", { ownerId: "user_a" })).toBe(true);
    expect(can(owner, "share_link:create")).toBe(true);
  });

  it("verweigert Zugriff auf fremde Ressourcen", () => {
    expect(can(owner, "report:read", { ownerId: "user_b" })).toBe(false);
    expect(can(owner, "media:delete", { ownerId: "" })).toBe(false);
  });

  it("verweigert ohne Akteur und bei unbekannten Rollen oder Aktionen", () => {
    expect(can(null, "report:read")).toBe(false);
    expect(can(undefined, "report:read")).toBe(false);
    expect(can({ ...owner, role: "viewer" as never }, "report:read", { ownerId: "user_a" })).toBe(false);
    expect(can(owner, "report:hack" as never)).toBe(false);
  });

  it("assertCan wirft ForbiddenError", () => {
    expect(() => assertCan(owner, "report:delete", { ownerId: "user_b" })).toThrow(ForbiddenError);
    expect(() => assertCan(owner, "report:delete", { ownerId: "user_a" })).not.toThrow();
  });
});

describe("Request-Hilfen", () => {
  it("liest die Client-IP aus x-forwarded-for (erster Eintrag)", () => {
    expect(getClientIp(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
    expect(getClientIp(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
  });

  it("verwirft manipulierte oder fehlende Werte", () => {
    expect(getClientIp(new Headers())).toBe("unknown");
    expect(getClientIp(new Headers({ "x-forwarded-for": "<script>" }))).toBe("unknown");
    expect(getClientIp(new Headers({ "x-forwarded-for": "a".repeat(100) }))).toBe("unknown");
  });

  it("pseudonymisiert stabil und abhängig vom Secret", () => {
    const a = hashIdentifier("secret-1", "Owner@Example.org ");
    expect(a).toBe(hashIdentifier("secret-1", "owner@example.org"));
    expect(a).not.toBe(hashIdentifier("secret-2", "owner@example.org"));
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("owner");
  });
});
