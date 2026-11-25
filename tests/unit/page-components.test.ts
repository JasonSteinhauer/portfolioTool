import { describe, expect, it } from "vitest";
import { pageConfigFromReport } from "@/content/page-components/from-report";
import {
  emptyComponent,
  newComponentId,
  PAGE_COMPONENT_TYPES,
  pageConfigSchema,
  profileConfigSchema,
} from "@/content/page-components/schema";
import { slugify, SLUG_PATTERN } from "@/modules/portfolio/service";
import { TOKEN_PATTERN, generateToken, hashToken } from "@/modules/sharing/service";

describe("Seitenkomponenten", () => {
  it("jede leere Komponente ist gültig", () => {
    const config = { schemaVersion: 1, components: PAGE_COMPONENT_TYPES.map(emptyComponent) };
    expect(pageConfigSchema.safeParse(config).success).toBe(true);
  });

  it("lehnt unbekannte Felder, Typen und doppelte IDs ab", () => {
    const hero = emptyComponent("hero");
    expect(pageConfigSchema.safeParse({ schemaVersion: 1, components: [{ ...hero, html: "<b>x</b>" }] }).success).toBe(
      false,
    );
    expect(pageConfigSchema.safeParse({ schemaVersion: 1, components: [{ ...hero, type: "script" }] }).success).toBe(
      false,
    );
    expect(pageConfigSchema.safeParse({ schemaVersion: 1, components: [hero, hero] }).success).toBe(false);
    expect(pageConfigSchema.safeParse({ schemaVersion: 1, components: [{ ...hero, title: "  " }] }).success).toBe(
      false,
    );
  });

  it("Komponenten-IDs haben ein festes Format und sind eindeutig", () => {
    const ids = new Set(Array.from({ length: 200 }, newComponentId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(id).toMatch(/^cmp_[A-Za-z0-9]{12}$/);
  });
});

describe("Profil", () => {
  const base = {
    schemaVersion: 1,
    name: "Alex Beispiel",
    role: "",
    about: "",
    expertise: [],
    contact: { email: "", links: [] },
  };

  it("akzeptiert ein minimales Profil", () => {
    expect(profileConfigSchema.safeParse(base).success).toBe(true);
  });

  it("lehnt unsichere Link-Schemata ab", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "vbscript:x"]) {
      const profile = { ...base, contact: { email: "", links: [{ label: "x", url }] } };
      expect(profileConfigSchema.safeParse(profile).success, url).toBe(false);
    }
    const ok = {
      ...base,
      contact: { email: "a@example.test", links: [{ label: "GitHub", url: "https://github.com/x" }] },
    };
    expect(profileConfigSchema.safeParse(ok).success).toBe(true);
  });
});

describe("Seite aus Report", () => {
  it("übernimmt nur vorhandene Inhalte und verweist auf Quellblöcke", () => {
    const config = pageConfigFromReport({
      title: "Fallanalyse (synthetisch)",
      typeName: "Fallanalyse",
      structuredFields: { occurredOn: "2026-11-01", question: "Brute Force?", tools: ["KQL", "Sentinel"] },
      fieldSchema: [
        { key: "occurredOn", label: "Datum", type: "date" },
        { key: "question", label: "Fragestellung", type: "textarea" },
      ] as never,
      content: {
        schemaVersion: 1,
        blocks: [{ id: "blk_code00000001", type: "code", language: "kusto", code: "SigninLogs | take 10" }],
      } as never,
    });
    expect(pageConfigSchema.safeParse(config).success).toBe(true);
    const [hero] = config.components;
    expect(hero).toMatchObject({ type: "hero", title: "Fallanalyse (synthetisch)", summary: "Brute Force?" });
    expect(hero.type === "hero" && hero.tags).toEqual(["KQL", "Sentinel"]);
    const code = config.components.find((c) => c.type === "codeShowcase");
    expect(code?.sourceBlockIds).toEqual(["blk_code00000001"]);
  });
});

describe("Slugs und Tokens", () => {
  it("slugify erzeugt gültige Adressen", () => {
    for (const input of ["Fallanalyse: Phishing-Welle (synthetisch)", "Äöü ß", "a", "   ", "x".repeat(300)]) {
      expect(slugify(input), input).toMatch(SLUG_PATTERN);
    }
    expect(slugify("Größe & Übung")).toBe("groesse-uebung");
  });

  it("Tokens sind 256 Bit zufällig; gespeichert wird nur der Hash", () => {
    const token = generateToken();
    expect(token).toMatch(TOKEN_PATTERN);
    expect(generateToken()).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });
});

describe("Vollständiger Bericht aus Report", () => {
  it("übernimmt Eckdaten, Abschnitte und Blöcke – ohne Anhänge", async () => {
    const { fullReportFromReport } = await import("@/content/page-components/from-report");
    const full = fullReportFromReport({
      title: "T",
      typeName: "Projektbericht",
      fieldSchema: [
        { key: "role", label: "Rolle", type: "text", required: false },
        { key: "goal", label: "Ziel", type: "textarea", required: false },
        { key: "tools", label: "Werkzeuge", type: "tags", required: false },
      ],
      structuredFields: { role: "Entwicklung", goal: "Ziel A", tools: ["TS", "SQL"] },
      content: {
        schemaVersion: 1,
        blocks: [
          { id: "blk_code00000001", type: "code", language: "typescript", code: "1" },
          { id: "blk_attach000001", type: "attachment", mediaId: "00000000-0000-4000-8000-000000000001", label: "x" },
          { id: "blk_heading00001", type: "heading", level: 2, text: "" },
        ],
      },
    });
    expect(full.facts).toEqual([{ label: "Rolle", value: "Entwicklung" }]);
    expect(full.sections).toEqual([{ title: "Ziel", text: "Ziel A" }]);
    expect(full.tags).toEqual(["TS", "SQL"]);
    expect(full.blocks.map((b) => b.type)).toEqual(["code"]);
  });
});
