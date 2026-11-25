import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, inject, it } from "vitest";
import * as schema from "@/lib/db/schema";
import { seedReportTypes } from "@/lib/db/seed";
import { decideComposition, requestComposition } from "@/modules/ai/compose";
import { parseAiConfig, type AiConfig } from "@/modules/ai/config";
import { AiBlockedError, AiJobFailedError, AiUnavailableError, monthlyUsage, runAiJob } from "@/modules/ai/gateway";
import { decideLanguageProposals, listProposals, requestLanguageSuggestions } from "@/modules/ai/language";
import { AiProviderError, FakeProvider, type AiProvider } from "@/modules/ai/provider";
import type { Actor } from "@/modules/auth/policy";
import { createPageFromReport, getPage, savePage } from "@/modules/portfolio/service";
import { createReport, getReport, listVersions, saveReport } from "@/modules/reports/service";

const client = postgres(inject("testDatabaseUrl"), { max: 2, onnotice: () => {} });
const db = drizzle(client, { schema });

const owner: Actor = { type: "user", userId: "user_ai_owner", role: "owner" };
const other: Actor = { type: "user", userId: "user_ai_other", role: "owner" };
/** Synthetisch, zur Laufzeit zusammengesetzt (damit der Secret-Scan des Repos nicht anschlägt). */
const SYNTHETIC_SECRET = ["tok", "en=", "abcd1234geheim"].join("");
const config: AiConfig = parseAiConfig({ AI_PROVIDER: "fake", NODE_ENV: "test" });

function deps(provider: AiProvider | null = new FakeProvider(), actor = owner, cfg = config) {
  return { db, actor, provider, config: cfg };
}

async function report(
  options: { aiAllowed?: boolean; classification?: "private" | "internal_sensitive" | "publishable" } = {},
) {
  const { id } = await createReport(db, owner, { typeKey: "case-analysis" });
  const saved = await saveReport(db, owner, id, {
    title: "phishing-welle  eingegrenzt",
    structuredFields: {
      occurredOn: "2026-11-18",
      context: "synthetische Umgebung, Meldung von alice@example.test über 10.0.0.12",
      question: "warum wurden das das Konten gesperrt",
      conclusion: "Fehlkonfiguration der Regel",
    },
    content: {
      schemaVersion: 1,
      blocks: [
        { id: "blk_head00000001", type: "heading", level: 2, text: "ablauf" },
        {
          id: "blk_text00000001",
          type: "richText",
          doc: {
            type: "doc",
            content: [
              { type: "paragraph", content: [{ type: "text", text: "die regel   schlug an" }] },
              { type: "paragraph", content: [{ type: "text", text: "fett", marks: [{ type: "bold" }] }] },
              { type: "paragraph", content: [{ type: "text", text: `zugang mit ${SYNTHETIC_SECRET} gesehen` }] },
            ],
          },
        },
        {
          id: "blk_ins000000001",
          type: "insight",
          variant: "finding",
          title: "mfa fehlte",
          text: "bei zwei konten fehlte mfa",
        },
        { id: "blk_code00000001", type: "code", language: "kusto", code: "SigninLogs | take 10" },
      ],
    },
    classification: options.classification ?? "private",
    aiAllowed: options.aiAllowed ?? true,
    revision: 1,
  });
  expect(saved.ok).toBe(true);
  return id;
}

beforeAll(async () => {
  await seedReportTypes(db);
  await db.insert(schema.users).values([
    { id: owner.userId, name: "AI Owner", email: "ai-owner@example.test" },
    { id: other.userId, name: "AI Other", email: "ai-other@example.test" },
  ]);
});

afterAll(async () => {
  await client.end();
});

describe("Gateway", () => {
  it("ohne Provider: KI nicht verfügbar", async () => {
    await expect(
      runAiJob(deps(null), { kind: "x", inputRefs: {}, system: "s", user: "u", maxOutputTokens: 10, parse: (t) => t }),
    ).rejects.toThrow(AiUnavailableError);
  });

  it("protokolliert Aufträge mit Kosten – ohne Inhalte", async () => {
    const provider = new FakeProvider(() => '{"ok":true}');
    const { jobId, result } = await runAiJob(deps(provider), {
      kind: "test.echo",
      inputRefs: { reportId: "r1" },
      system: "System",
      user: "Geheimer Inhalt, der nicht in ai_jobs landen darf",
      maxOutputTokens: 100,
      parse: (t) => JSON.parse(t) as { ok: boolean },
    });
    expect(result).toEqual({ ok: true });
    const [job] = await db.select().from(schema.aiJobs).where(eq(schema.aiJobs.id, jobId));
    expect(job).toMatchObject({ status: "succeeded", provider: "fake", inputRefs: { reportId: "r1" } });
    expect(job.costMicroUsd).toBeGreaterThan(0);
    expect(JSON.stringify(job)).not.toContain("Geheimer Inhalt");
  });

  it("versucht bei ungültiger Antwort genau einmal erneut, dann Abbruch", async () => {
    const provider = new FakeProvider(() => "kein json");
    await expect(
      runAiJob(deps(provider), {
        kind: "test.bad",
        inputRefs: {},
        system: "s",
        user: "u",
        maxOutputTokens: 10,
        parse: (t) => JSON.parse(t),
      }),
    ).rejects.toThrow(AiJobFailedError);
    expect(provider.calls).toHaveLength(2);
    expect(provider.calls[1].user).toContain("ausschließlich");
  });

  it("nicht wiederholbare Anbieterfehler brechen sofort ab", async () => {
    let calls = 0;
    const provider: AiProvider = {
      name: "broken",
      model: "x",
      complete: async () => {
        calls++;
        throw new AiProviderError("KI-Zugang ungültig (API-Schlüssel prüfen).", false);
      },
    };
    await expect(
      runAiJob(deps(provider), {
        kind: "test.auth",
        inputRefs: {},
        system: "s",
        user: "u",
        maxOutputTokens: 10,
        parse: (t) => t,
      }),
    ).rejects.toThrow(/API-Schlüssel/);
    expect(calls).toBe(1);
  });

  it("blockiert bei ausgeschöpftem Budget und zu langen Eingaben", async () => {
    const tiny = { ...config, monthlyBudgetMicroUsd: 1 };
    await expect(
      runAiJob(deps(new FakeProvider(), owner, tiny), {
        kind: "t",
        inputRefs: {},
        system: "s",
        user: "u".repeat(1000),
        maxOutputTokens: 1000,
        parse: (t) => t,
      }),
    ).rejects.toThrow(/Budget/);
    await expect(
      runAiJob(deps(), {
        kind: "t",
        inputRefs: {},
        system: "s",
        user: "x".repeat(130_000),
        maxOutputTokens: 10,
        parse: (t) => t,
      }),
    ).rejects.toThrow(/zu lang/);
    const usage = await monthlyUsage(db, owner, config);
    expect(usage.spentMicroUsd).toBeGreaterThan(0);
    expect((await monthlyUsage(db, other, config)).jobs).toBe(0);
  });
});

describe("Sprachvorschläge", () => {
  it("sind gesperrt ohne KI-Freigabe oder bei intern-sensiblen Reports", async () => {
    const blocked = await report({ aiAllowed: false });
    await expect(requestLanguageSuggestions(deps(), blocked)).rejects.toThrow(AiBlockedError);
    const sensitive = await report({ classification: "internal_sensitive", aiAllowed: true });
    await expect(requestLanguageSuggestions(deps(), sensitive)).rejects.toThrow(AiBlockedError);
    // Fremder Owner sieht den Report nicht.
    const mine = await report();
    await expect(requestLanguageSuggestions(deps(new FakeProvider(), other), mine)).rejects.toThrow();
  });

  it("schwärzt E-Mail/IP, sendet keine Geheimnisse und setzt Platzhalter zurück", async () => {
    const id = await report();
    const provider = new FakeProvider();
    await requestLanguageSuggestions(deps(provider), id);
    const sent = provider.calls[0].user;
    expect(sent).not.toContain("alice@example.test");
    expect(sent).not.toContain("10.0.0.12");
    expect(sent).toContain("[E-MAIL-1]");
    expect(sent).not.toContain(SYNTHETIC_SECRET);
    expect(sent).not.toContain("SigninLogs"); // Code wird nicht sprachlich bearbeitet
    expect(sent).not.toContain('"fett"'); // formatierte Absätze bleiben unangetastet

    const proposals = await listProposals(db, owner, { type: "report", id });
    const context = proposals.find((p) => (p.payload as { key: string }).key === "field:context");
    expect((context?.payload as { after: string }).after).toContain("alice@example.test");
    expect((context?.payload as { after: string }).after).toContain("10.0.0.12");
  });

  it("übernimmt ausgewählte Vorschläge mit Versionen; geänderte Texte werden als überholt markiert", async () => {
    const id = await report();
    await requestLanguageSuggestions(deps(), id);
    const proposals = await listProposals(db, owner, { type: "report", id });
    const byKey = (key: string) => proposals.find((p) => (p.payload as { key: string }).key === key)!;
    const title = byKey("title");
    const question = byKey("field:question");
    const paragraph = byKey("block:blk_text00000001:p0");
    const insight = byKey("block:blk_ins000000001:text");
    expect((question.payload as { after: string }).after).toContain("dass das");

    // Nutzer ändert die Frage selbst, bevor er entscheidet.
    const before = await getReport(db, owner, id);
    await saveReport(db, owner, id, {
      title: before.title,
      structuredFields: { ...(before.structuredFields as object), question: "Selbst umformuliert" },
      content: before.content,
      classification: before.classification,
      aiAllowed: true,
      revision: before.revision,
    });

    const result = await decideLanguageProposals(db, owner, id, {
      accept: [title.id, question.id, paragraph.id],
      reject: [insight.id],
    });
    expect(result).toEqual({ ok: true, accepted: 2, rejected: 1, stale: 1 });

    const after = await getReport(db, owner, id);
    expect(after.title).toBe("Phishing-welle eingegrenzt");
    expect((after.structuredFields as { question: string }).question).toBe("Selbst umformuliert");
    const para = after.content.blocks.find((b) => b.id === "blk_text00000001");
    expect(para?.type === "richText" && para.doc.content[0]).toEqual({
      type: "paragraph",
      content: [{ type: "text", text: "Die regel schlug an" }],
    });
    // Formatierter Absatz unverändert
    expect(para?.type === "richText" && para.doc.content[1]).toMatchObject({
      content: [{ text: "fett", marks: [{ type: "bold" }] }],
    });

    const versions = await listVersions(db, owner, id);
    expect(versions.map((v) => v.reason)).toContain("ai_accepted");
    expect(await listProposals(db, owner, { type: "report", id })).toHaveLength(proposals.length - 4);
  });

  it("ein neuer Auftrag ersetzt offene Vorschläge", async () => {
    const id = await report();
    await requestLanguageSuggestions(deps(), id);
    const first = await listProposals(db, owner, { type: "report", id });
    await requestLanguageSuggestions(deps(), id);
    const second = await listProposals(db, owner, { type: "report", id });
    expect(second.map((p) => p.id)).not.toContain(first[0].id);
    expect(await listProposals(db, owner, { type: "report", id }, ["superseded"])).toHaveLength(first.length);
  });

  it("Prompt-Injection im Report führt nicht zu fremden Schlüsseln oder Inhalten", async () => {
    const id = await report();
    const provider = new FakeProvider(() =>
      JSON.stringify({
        vorschlaege: [
          { key: "field:secret", text: "neu" },
          {
            key: "title",
            text: "Ein komplett anderer, viel längerer Titel, der nichts mehr mit dem Original zu tun hat",
          },
          { key: "field:context", text: "ohne platzhalter" },
        ],
      }),
    );
    const { count } = await requestLanguageSuggestions(deps(provider), id);
    expect(count).toBe(0);
  });
});

describe("KI-Fassung (ausformulieren)", () => {
  it("formuliert nur längere Texte aus und übernimmt nach Zustimmung", async () => {
    const id = await report();
    const before = await getReport(db, owner, id);
    await saveReport(db, owner, id, {
      title: before.title,
      structuredFields: { ...(before.structuredFields as object), conclusion: "regel angepasst,\nalarm geschlossen" },
      content: before.content,
      classification: before.classification,
      aiAllowed: true,
      revision: before.revision,
    });
    const provider = new FakeProvider();
    await requestLanguageSuggestions(deps(provider), id, "rewrite");
    expect(provider.calls[0].kind).toBe("report.rewrite");
    // Titel und Überschriften werden nicht ausformuliert
    expect(provider.calls[0].user).not.toContain('"key":"title"');
    expect(provider.calls[0].user).not.toContain("blk_head00000001");

    const proposals = await listProposals(db, owner, { type: "report", id });
    const conclusion = proposals.find((p) => (p.payload as { key: string }).key === "field:conclusion")!;
    expect(conclusion.payload).toMatchObject({ mode: "rewrite", after: "Regel angepasst. Alarm geschlossen." });

    const result = await decideLanguageProposals(db, owner, id, { accept: [conclusion.id], reject: [] });
    expect(result).toMatchObject({ ok: true, accepted: 1 });
    const after = await getReport(db, owner, id);
    expect((after.structuredFields as { conclusion: string }).conclusion).toBe("Regel angepasst. Alarm geschlossen.");
  });
});

describe("Seitenkomposition", () => {
  it("erzeugt einen belegten Entwurf, verwirft Unbelegtes und übernimmt mit Code/Bildern", async () => {
    const id = await report();
    const page = await createPageFromReport(db, owner, id);
    await requestComposition(deps(), page.id);
    const [proposal] = await listProposals(db, owner, { type: "portfolio_page", id: page.id });
    const payload = proposal.payload as {
      components: { type: string; title?: string; items?: { title: string }[] }[];
      dropped: number;
      citations: Record<string, string[]>;
    };
    expect(payload.dropped).toBe(1);
    expect(JSON.stringify(payload.components)).not.toContain("Erfundene Aussage");
    expect(Object.values(payload.citations).every((c) => c.length > 0)).toBe(true);
    // E-Mail aus der Quelle steht wieder im Klartext (nur für den Owner sichtbar)
    expect(JSON.stringify(payload.components)).not.toContain("[E-MAIL-");

    expect(await decideComposition(db, owner, page.id, proposal.id, "accept")).toEqual({ ok: true });
    const updated = await getPage(db, owner, page.id);
    const hero = updated.config.components.find((c) => c.type === "hero");
    expect(hero?.type === "hero" && hero.title).toContain("(KI-Entwurf)");
    expect(updated.config.components.some((c) => c.type === "codeShowcase")).toBe(true);
  });

  it("ist veraltet, wenn die Seite seit dem Auftrag geändert wurde", async () => {
    const id = await report();
    const page = await createPageFromReport(db, owner, id);
    await requestComposition(deps(), page.id);
    const [proposal] = await listProposals(db, owner, { type: "portfolio_page", id: page.id });
    const current = await getPage(db, owner, page.id);
    await savePage(db, owner, page.id, {
      title: current.title,
      slug: current.slug,
      locale: current.locale,
      config: { ...current.config, components: current.config.components.slice(0, 1) },
    });
    expect(await decideComposition(db, owner, page.id, proposal.id, "accept")).toEqual({ ok: false, reason: "stale" });
  });

  it("ist gesperrt, wenn der Quell-Report keine KI erlaubt", async () => {
    const id = await report({ aiAllowed: false });
    const page = await createPageFromReport(db, owner, id);
    await expect(requestComposition(deps(), page.id)).rejects.toThrow(AiBlockedError);
  });
});

describe("Rückfragen vor der KI-Fassung", () => {
  it("fragt bei Unklarem nach, nutzt die Antworten und fragt dann nicht erneut", async () => {
    const id = await report();
    const before = await getReport(db, owner, id);
    await saveReport(db, owner, id, {
      title: before.title,
      structuredFields: { ...(before.structuredFields as object), conclusion: "regel angepasst ??\nalarm geschlossen" },
      content: before.content,
      classification: before.classification,
      aiAllowed: true,
      revision: before.revision,
    });

    const provider = new FakeProvider();
    const first = await requestLanguageSuggestions(deps(provider), id, "rewrite");
    expect(first.count).toBe(0);
    expect(first.questions).toHaveLength(1);
    let pending = await listProposals(db, owner, { type: "report", id });
    expect(pending.map((p) => p.kind)).toEqual(["questions"]);

    const second = await requestLanguageSuggestions(deps(provider), id, "rewrite", {
      answers: [{ frage: first.questions[0], antwort: "Schwellwert von 5 auf 20 erhöht" }],
    });
    expect(second.questions).toEqual([]);
    expect(provider.calls[1].user).toContain('"keineRueckfragen":true');
    expect(provider.calls[1].user).toContain("Schwellwert von 5 auf 20");
    pending = await listProposals(db, owner, { type: "report", id });
    expect(pending.some((p) => p.kind === "questions")).toBe(false);
    const conclusion = pending.find((p) => (p.payload as { key: string }).key === "field:conclusion")!;
    expect((conclusion.payload as { after: string }).after).toContain("Schwellwert von 5 auf 20 erhöht");
  });

  it("Korrektur (proofread) und „ohne Rückfragen“ fragen nie", async () => {
    const id = await report();
    const before = await getReport(db, owner, id);
    await saveReport(db, owner, id, {
      title: before.title,
      structuredFields: { ...(before.structuredFields as object), conclusion: "unklar ??" },
      content: before.content,
      classification: before.classification,
      aiAllowed: true,
      revision: before.revision,
    });
    const provider = new FakeProvider();
    expect((await requestLanguageSuggestions(deps(provider), id, "proofread")).questions).toEqual([]);
    const skipped = await requestLanguageSuggestions(deps(provider), id, "rewrite", { noQuestions: true });
    expect(skipped.questions).toEqual([]);
    expect(provider.calls[1].user).toContain('"keineRueckfragen":true');
  });

  it("schwärzt Antworten und sendet keine mit Geheimnissen", async () => {
    const id = await report();
    const provider = new FakeProvider();
    await requestLanguageSuggestions(deps(provider), id, "rewrite", {
      answers: [
        { frage: "Wer?", antwort: "alice@example.test meldete es" },
        { frage: "Womit?", antwort: `mit ${SYNTHETIC_SECRET}` },
      ],
    });
    const user = provider.calls[0].user;
    expect(user).not.toContain("alice@example.test");
    expect(user).toContain("[E-MAIL-");
    expect(user).not.toContain(SYNTHETIC_SECRET);
  });
});
