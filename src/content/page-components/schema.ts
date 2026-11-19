import { z } from "zod";
import { CODE_LANGUAGES, INSIGHT_VARIANTS, safeLinkUrl } from "@/content/blocks/schema";

/**
 * Komponenten-Registry für Portfolio-Seiten.
 *
 * Eine Seite ist eine validierte Liste dieser Komponenten – nie HTML, CSS oder Skript.
 * Jede Komponente kann auf Quellblöcke des Reports verweisen (`sourceBlockIds`), damit
 * später KI-Vorschläge auf belegte Inhalte geprüft werden können.
 */

export const PAGE_SCHEMA_VERSION = 1 as const;

const text = (max: number) => z.string().trim().max(max);
const componentId = z.string().regex(/^cmp_[A-Za-z0-9_-]{8,32}$/);
const sourceBlockIds = z.array(z.string().max(40)).max(50).optional();

export const PAGE_COMPONENT_TYPES = [
  "hero",
  "projectOverview",
  "resultHighlights",
  "codeShowcase",
  "insights",
] as const;
export type PageComponentType = (typeof PAGE_COMPONENT_TYPES)[number];

export const pageComponentSchema = z.discriminatedUnion("type", [
  z
    .object({
      id: componentId,
      type: z.literal("hero"),
      eyebrow: text(80),
      title: text(200).min(1, "Titel fehlt"),
      summary: text(600),
      tags: z.array(text(40).min(1)).max(10),
      sourceBlockIds,
    })
    .strict(),
  z
    .object({
      id: componentId,
      type: z.literal("projectOverview"),
      heading: text(120),
      body: text(4_000),
      facts: z.array(z.object({ label: text(60).min(1), value: text(200).min(1) }).strict()).max(10),
      sourceBlockIds,
    })
    .strict(),
  z
    .object({
      id: componentId,
      type: z.literal("resultHighlights"),
      heading: text(120),
      items: z.array(z.object({ title: text(120).min(1), text: text(600) }).strict()).max(8),
      sourceBlockIds,
    })
    .strict(),
  z
    .object({
      id: componentId,
      type: z.literal("codeShowcase"),
      heading: text(120),
      language: z.enum(CODE_LANGUAGES),
      filename: text(200).optional(),
      code: z.string().max(20_000),
      caption: text(400),
      sourceBlockIds,
    })
    .strict(),
  z
    .object({
      id: componentId,
      type: z.literal("insights"),
      heading: text(120),
      items: z
        .array(z.object({ variant: z.enum(INSIGHT_VARIANTS), title: text(200).min(1), text: text(2_000) }).strict())
        .max(12),
      sourceBlockIds,
    })
    .strict(),
]);

export type PageComponent = z.infer<typeof pageComponentSchema>;

export const pageConfigSchema = z
  .object({
    schemaVersion: z.literal(PAGE_SCHEMA_VERSION),
    components: z.array(pageComponentSchema).max(30),
  })
  .strict()
  .superRefine((config, ctx) => {
    const ids = new Set<string>();
    config.components.forEach((c, i) => {
      if (ids.has(c.id))
        ctx.addIssue({ code: "custom", path: ["components", i, "id"], message: "Doppelte Komponenten-ID" });
      ids.add(c.id);
    });
  });

export type PageConfig = z.infer<typeof pageConfigSchema>;

/** Über-mich, Expertise und Kontakt – eine Seite vom Typ `profile`. */
export const profileConfigSchema = z
  .object({
    schemaVersion: z.literal(PAGE_SCHEMA_VERSION),
    name: text(100).min(1, "Name fehlt"),
    role: text(120),
    about: text(3_000),
    expertise: z.array(z.object({ area: text(80).min(1), detail: text(300) }).strict()).max(12),
    contact: z
      .object({
        email: z.union([z.literal(""), z.email()]),
        links: z.array(z.object({ label: text(60).min(1), url: safeLinkUrl }).strict()).max(6),
      })
      .strict(),
  })
  .strict();

export type ProfileConfig = z.infer<typeof profileConfigSchema>;

export function newComponentId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(12));
  return `cmp_${Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("")}`;
}

export function emptyComponent(type: PageComponentType): PageComponent {
  const id = newComponentId();
  switch (type) {
    case "hero":
      return { id, type, eyebrow: "", title: "Titel", summary: "", tags: [] };
    case "projectOverview":
      return { id, type, heading: "Überblick", body: "", facts: [] };
    case "resultHighlights":
      return { id, type, heading: "Ergebnisse", items: [] };
    case "codeShowcase":
      return { id, type, heading: "Code", language: "text", code: "", caption: "" };
    case "insights":
      return { id, type, heading: "Erkenntnisse", items: [] };
  }
}
