import { describe, expect, it, vi } from "vitest";
import { mergeComposition, validateComposition } from "@/modules/ai/compose";
import { costMicroUsd, parseAiConfig } from "@/modules/ai/config";
import { extractJson } from "@/modules/ai/gateway";
import { applyUnit, extractTextUnits, validateSuggestions } from "@/modules/ai/language";
import { AnthropicProvider, AiProviderError } from "@/modules/ai/provider";
import { Redactor } from "@/modules/ai/redact";
import { diffWords } from "@/ui/ai/text-diff";

describe("KI-Konfiguration", () => {
  it("ist standardmäßig aus", () => {
    expect(parseAiConfig({}).provider).toBe("none");
  });

  it("verlangt einen Schlüssel für Anthropic und verbietet den Test-Provider in Produktion", () => {
    expect(() => parseAiConfig({ AI_PROVIDER: "anthropic" })).toThrow(/ANTHROPIC_API_KEY/);
    expect(() => parseAiConfig({ AI_PROVIDER: "fake", NODE_ENV: "production" })).toThrow(/Produktion/);
    expect(parseAiConfig({ AI_PROVIDER: "fake", NODE_ENV: "production", AI_ALLOW_FAKE: "1" }).provider).toBe("fake");
    const config = parseAiConfig({ AI_PROVIDER: "anthropic", ANTHROPIC_API_KEY: "test-key-".padEnd(28, "0") });
    expect(config).toMatchObject({ model: "claude-haiku-5-5", monthlyBudgetMicroUsd: 5_000_000 });
  });

  it("berechnet Kosten in Mikro-USD (Haiku 5.5: 0,10 $ / 0,50 $ je Mio. Tokens)", () => {
    const config = parseAiConfig({});
    expect(costMicroUsd(config, 1_000_000, 0)).toBe(100_000);
    expect(costMicroUsd(config, 0, 1_000_000)).toBe(500_000);
    expect(costMicroUsd(config, 3, 1)).toBe(1); // aufgerundet
  });
});

describe("Schwärzung", () => {
  it("ersetzt E-Mail, IP und Geheimnisse konsistent und stellt nur E-Mail/IP wieder her", () => {
    const r = new Redactor();
    const secretPart = ["api_", "key=SUPERSECRET123 ", "Bear", "er abcdefghijklmnop"].join("");
    const text = `Mail von a.b@example.test an 192.168.1.10, nochmal a.b@example.test; ${secretPart}`;
    const redacted = r.redact(text);
    expect(redacted).toMatch(
      /^Mail von \[E-MAIL-1\] an \[IP-1\], nochmal \[E-MAIL-1\]; \[GEHEIMNIS-\d\] \[GEHEIMNIS-\d\]$/,
    );
    expect(redacted).not.toContain("SUPERSECRET");
    expect(r.restore("Mail von [E-MAIL-1] an [IP-1] [GEHEIMNIS-1]")).toBe(
      "Mail von a.b@example.test an 192.168.1.10 [GEHEIMNIS-1]",
    );
    expect(r.summary()).toEqual({ "E-MAIL": 1, IP: 1, GEHEIMNIS: 2 });
    expect(r.hasSecrets(redacted)).toBe(true);
  });

  it("erkennt typische Schlüsselformate und private Schlüssel", () => {
    const r = new Redactor();
    for (const secret of [
      // Zur Laufzeit zusammengesetzt, damit der Secret-Scan des Repos nicht anschlägt (alles synthetisch).
      ["AK", "IA", "ABCDEFGHIJKLMNOP"].join(""),
      ["gh", "p_", "a".repeat(36)].join(""),
      ["sk", "-ant-api03-", "b".repeat(20)].join(""),
      ["eyJhbGciOiJIUzI1NiJ9", "eyJzdWIiOiIxMjM0NTY3ODkwIn0", "c2lnbmF0dXJlLXRlc3Q"].join("."),
      ["-----BEGIN", " PRIVATE KEY-----\nMIIE\n-----END", " PRIVATE KEY-----"].join(""),
      ["Pass", "wort: ", "Sommer2026!"].join(""),
    ]) {
      expect(r.redact(`x ${secret} y`), secret).toMatch(/^x \[GEHEIMNIS-\d+\] y$/);
    }
  });
});

describe("Anthropic-Adapter", () => {
  it("sendet Messages-API-Anfragen und liest Text und Verbrauch", async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({
        content: [{ type: "text", text: '{"ok":true}' }],
        usage: { input_tokens: 12, output_tokens: 3 },
      }),
    );
    const provider = new AnthropicProvider(
      "test-key-000000000000",
      "claude-haiku-5-5",
      fetchMock as unknown as typeof fetch,
    );
    const result = await provider.complete({ kind: "x", system: "S", user: "U", maxOutputTokens: 50 });
    expect(result).toEqual({ text: '{"ok":true}', inputTokens: 12, outputTokens: 3 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect((init.headers as Record<string, string>)["x-api-key"]).toBe("test-key-000000000000");
    expect(JSON.parse(init.body as string)).toMatchObject({
      model: "claude-haiku-5-5",
      max_tokens: 50,
      system: "S",
      messages: [{ role: "user", content: "U" }],
    });
  });

  it("gibt keine Anbieter-Fehlertexte weiter und markiert Wiederholbarkeit", async () => {
    const make = (status: number) =>
      new AnthropicProvider(
        "k".repeat(24),
        "m",
        (async () => new Response("echo: geheimer prompt", { status })) as unknown as typeof fetch,
      );
    const auth = await make(401)
      .complete({ kind: "x", system: "", user: "", maxOutputTokens: 1 })
      .catch((e: unknown) => e);
    expect(auth).toBeInstanceOf(AiProviderError);
    expect((auth as AiProviderError).retryable).toBe(false);
    expect((auth as Error).message).not.toContain("geheimer");
    const busy = await make(529)
      .complete({ kind: "x", system: "", user: "", maxOutputTokens: 1 })
      .catch((e: unknown) => e);
    expect((busy as AiProviderError).retryable).toBe(true);
  });
});

describe("Anthropic-Fehler", () => {
  const call = (status: number, body: unknown) =>
    new AnthropicProvider("k".repeat(24), "m", (async () => Response.json(body, { status })) as unknown as typeof fetch)
      .complete({ kind: "x", system: "", user: "", maxOutputTokens: 1 })
      .then(
        () => {
          throw new Error("Fehler erwartet");
        },
        (e: unknown) => e as AiProviderError,
      );

  it("übersetzt bekannte Ursachen in feste Meldungen – ohne den Anbieter-Text", async () => {
    const credit = await call(400, {
      type: "error",
      error: { type: "invalid_request_error", message: "Your credit balance is too low to access the Anthropic API." },
    });
    expect(credit.message).toMatch(/Kein Guthaben/);
    expect(credit.retryable).toBe(false);
    const credit2 = await call(400, {
      type: "error",
      error: { type: "invalid_request_error", message: "credit_balance_too_low" },
    });
    expect(credit2.message).toMatch(/Kein Guthaben/);
    expect(
      (await call(404, { type: "error", error: { type: "not_found_error", message: "model: x" } })).message,
    ).toMatch(/Modell/);
    const other = await call(400, { type: "error", error: { type: "invalid_request_error", message: "echo GEHEIM" } });
    expect(other.message).toBe("KI-Dienst antwortet mit Fehler 400 (invalid_request_error).");
    expect(other.message).not.toContain("GEHEIM");
  });
});

describe("Antworten auswerten", () => {
  it("extractJson toleriert Zäune und Text drumherum", () => {
    expect(extractJson('Hier:\n```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('vorher {"a":{"b":2}} nachher')).toEqual({ a: { b: 2 } });
    expect(() => extractJson("nichts")).toThrow();
  });

  const report = {
    title: "titel",
    structuredFields: { question: "frage mit a@example.test" },
    fieldSchema: [{ key: "question", label: "Frage", type: "textarea" }],
    content: {
      schemaVersion: 1 as const,
      blocks: [
        {
          id: "blk_text00000001",
          type: "richText" as const,
          doc: {
            type: "doc" as const,
            content: [{ type: "paragraph" as const, content: [{ type: "text" as const, text: "absatz" }] }],
          },
        },
      ],
    },
  };

  it("Texteinheiten lesen und schreiben", () => {
    const units = extractTextUnits(report);
    expect(units.map((u) => u.key)).toEqual(["title", "field:question", "block:blk_text00000001:p0"]);
    const next = applyUnit(report, "block:blk_text00000001:p0", "Absatz.");
    expect(next?.content.blocks[0]).toMatchObject({ doc: { content: [{ content: [{ text: "Absatz." }] }] } });
    expect(applyUnit(report, "block:blk_unbekannt0001:p0", "x")).toBeNull();
    expect(applyUnit(report, "field:nichtda", "x")).toBeNull();
  });

  it("validateSuggestions verwirft fremde Schlüssel, verlorene Platzhalter und Umformulierungen", () => {
    const r = new Redactor();
    const sent = extractTextUnits(report).map((unit) => ({ unit, redacted: r.redact(unit.text) }));
    const result = validateSuggestions(
      {
        vorschlaege: [
          { key: "title", text: "Titel" },
          { key: "title", text: "Doppelt" },
          { key: "field:question", text: "Frage mit [E-MAIL-1]?" },
          { key: "field:hack", text: "x" },
          { key: "block:blk_text00000001:p0", text: "Ein völlig anderer und viel längerer Absatz" },
        ],
      },
      sent,
      r,
    );
    expect(result.map((s) => [s.key, s.after])).toEqual([
      ["title", "Titel"],
      ["field:question", "Frage mit a@example.test?"],
    ]);
  });

  it("Ausformulieren erlaubt längere Texte, Korrektur nicht", () => {
    const r = new Redactor();
    const unit = { key: "field:question", label: "Frage", text: "kurz, knapp", maxLength: 2000, multiline: true };
    const sent = [{ unit, redacted: unit.text }];
    const longer = { vorschlaege: [{ key: "field:question", text: "Die Antwort war kurz und knapp formuliert." }] };
    expect(validateSuggestions(longer, sent, r, "proofread")).toHaveLength(0);
    expect(validateSuggestions(longer, sent, r, "rewrite")).toHaveLength(1);
  });

  it("validateComposition behält nur belegte Aussagen", () => {
    const r = new Redactor();
    const sources = [
      { id: "field:title", art: "feld", label: "Titel", text: "T" },
      { id: "block:blk_ins000000001", art: "erkenntnis", label: "MFA", text: "fehlte" },
    ];
    const result = validateComposition(
      {
        hero: { titel: "Fall", quellen: ["field:title"] },
        ergebnisse: [
          { titel: "Gut", quellen: ["block:blk_ins000000001"] },
          { titel: "Erfunden", quellen: [] },
        ],
        erkenntnisse: [{ art: "unsinn", titel: "MFA", text: "x", quellen: ["block:blk_ins000000001", "block:fake"] }],
      },
      sources,
      r,
    );
    expect(result.dropped).toBe(1);
    expect(result.components.map((c) => c.type)).toEqual(["hero", "resultHighlights", "insights"]);
    const insights = result.components.find((c) => c.type === "insights");
    expect(insights?.type === "insights" && insights.items[0].variant).toBe("insight");
    expect(insights?.sourceBlockIds).toEqual(["block:blk_ins000000001"]);
    expect(() => validateComposition({ hero: { titel: "x", quellen: ["block:fake"] } }, sources, r)).toThrow();
  });

  it("mergeComposition behält Code, Bilder und Tags", () => {
    const current = {
      schemaVersion: 1 as const,
      components: [
        { id: "cmp_hero00000001", type: "hero" as const, eyebrow: "", title: "Alt", summary: "", tags: ["KQL"] },
        {
          id: "cmp_code00000001",
          type: "codeShowcase" as const,
          heading: "Code",
          language: "kusto" as const,
          code: "x",
          caption: "",
        },
      ],
    };
    const merged = mergeComposition(current, [
      { id: "cmp_hero00000002", type: "hero", eyebrow: "", title: "Neu", summary: "", tags: [] },
    ]);
    expect(merged.components.map((c) => c.id)).toEqual(["cmp_hero00000002", "cmp_code00000001"]);
    expect(merged.components[0].type === "hero" && merged.components[0].tags).toEqual(["KQL"]);
  });
});

describe("Wort-Diff", () => {
  it("markiert Entferntes und Neues", () => {
    expect(diffWords("das das Konto", "dass das Konto")).toEqual([
      { type: "del", text: "das" },
      { type: "ins", text: "dass" },
      { type: "same", text: " das Konto" },
    ]);
  });
});
