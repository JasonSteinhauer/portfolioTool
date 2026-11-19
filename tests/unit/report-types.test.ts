import { describe, expect, it } from "vitest";
import {
  buildStructuredFieldsSchema,
  DEFAULT_REPORT_TYPES,
  fieldSchemaSchema,
  REPORT_TYPE_KEYS,
} from "@/modules/reports/report-types";

const caseAnalysis = DEFAULT_REPORT_TYPES.find((t) => t.key === "case-analysis")!;
const caseFields = fieldSchemaSchema.parse(caseAnalysis.fields);

describe("Standard-Report-Typen", () => {
  it("enthält genau die sechs spezifizierten Typen", () => {
    expect(DEFAULT_REPORT_TYPES.map((t) => t.key).sort()).toEqual([...REPORT_TYPE_KEYS].sort());
  });

  it.each(DEFAULT_REPORT_TYPES.map((t) => [t.key, t] as const))("%s hat ein gültiges Feldschema", (_key, type) => {
    expect(fieldSchemaSchema.safeParse(type.fields).success).toBe(true);
  });

  it("lehnt Auswahlfelder ohne Optionen und doppelte Schlüssel ab", () => {
    expect(fieldSchemaSchema.safeParse([{ key: "level", label: "Level", type: "select" }]).success).toBe(false);
    expect(
      fieldSchemaSchema.safeParse([
        { key: "topic", label: "A", type: "text" },
        { key: "topic", label: "B", type: "text" },
      ]).success,
    ).toBe(false);
  });
});

describe("buildStructuredFieldsSchema (Fallanalyse)", () => {
  const draft = buildStructuredFieldsSchema(caseFields, "draft");
  const final = buildStructuredFieldsSchema(caseFields, "final");

  const complete = {
    occurredOn: "2026-11-19",
    context: "Synthetischer Alert: 40 fehlgeschlagene Logins in 2 Minuten.",
    question: "Handelt es sich um einen Brute-Force-Angriff?",
    severity: "medium",
    tools: ["Sentinel", "KQL"],
  };

  it("erlaubt unvollständige Entwürfe", () => {
    expect(draft.safeParse({ context: "" }).success).toBe(true);
    expect(draft.safeParse({}).success).toBe(true);
  });

  it("erzwingt Pflichtfelder beim Abschließen", () => {
    expect(final.safeParse({ context: "x" }).success).toBe(false);
    expect(final.safeParse(complete).success).toBe(true);
    expect(final.safeParse({ ...complete, question: "" }).success).toBe(false);
  });

  it("prüft Typen auch im Entwurf", () => {
    expect(draft.safeParse({ severity: "apocalyptic" }).success).toBe(false);
    expect(draft.safeParse({ occurredOn: "19.11.2026" }).success).toBe(false);
    expect(draft.safeParse({ tools: "Sentinel" }).success).toBe(false);
  });

  it("lehnt unbekannte Felder ab", () => {
    expect(draft.safeParse({ injected: "x" }).success).toBe(false);
  });

  it("lehnt unsichere URLs in URL-Feldern ab", () => {
    const milestone = fieldSchemaSchema.parse(DEFAULT_REPORT_TYPES.find((t) => t.key === "milestone")!.fields);
    const schema = buildStructuredFieldsSchema(milestone, "draft");
    expect(schema.safeParse({ evidenceUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(schema.safeParse({ evidenceUrl: "https://example.org/cert" }).success).toBe(true);
  });
});
