import type { Block, ContentDocument } from "@/content/blocks/schema";
import { extractPlainText } from "@/content/blocks/utils";
import type { FieldDefinition } from "@/modules/reports/report-types";
import { newComponentId, PAGE_SCHEMA_VERSION, type PageComponent, type PageConfig } from "./schema";

/**
 * Erstellt einen ersten Seitenentwurf aus einem Report – deterministisch, ohne KI.
 * Es werden ausschließlich vorhandene Inhalte übernommen (nichts erfunden); jede Komponente
 * verweist auf ihre Quellblöcke. Der Owner überarbeitet den Entwurf vor der Freigabe.
 */
type ReportLike = {
  title: string;
  typeName: string;
  structuredFields: Record<string, unknown>;
  fieldSchema: FieldDefinition[];
  content: ContentDocument;
};

const asText = (value: unknown) => (typeof value === "string" ? value.trim() : "");
const dateFormat = new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric", timeZone: "UTC" });

export function pageConfigFromReport(report: ReportLike): PageConfig {
  const fields = report.structuredFields;
  const label = (key: string) => report.fieldSchema.find((f) => f.key === key)?.label ?? key;
  const components: PageComponent[] = [];

  // Hero: Titel, Typ/Datum, kurze Zusammenfassung aus der ersten passenden Angabe.
  const date = asText(fields.occurredOn);
  const tags = Array.isArray(fields.tools)
    ? fields.tools.filter((t): t is string => typeof t === "string").slice(0, 10)
    : [];
  const summary =
    asText(fields.question) ||
    asText(fields.goal) ||
    asText(fields.keyTakeaways) ||
    asText(fields.achievement) ||
    asText(fields.task);
  components.push({
    id: newComponentId(),
    type: "hero",
    eyebrow: [report.typeName, date ? dateFormat.format(new Date(`${date}T12:00:00Z`)) : ""]
      .filter(Boolean)
      .join(" · ")
      .slice(0, 80),
    title: report.title.slice(0, 200),
    summary: summary.slice(0, 600),
    tags,
  });

  // Überblick: lange Textfelder als Fließtext, kurze Felder als Fakten.
  const longFields = report.fieldSchema.filter((f) => f.type === "textarea" && asText(fields[f.key]));
  const facts = report.fieldSchema
    .filter((f) => (f.type === "text" || f.type === "select") && asText(fields[f.key]))
    .map((f) => {
      const raw = asText(fields[f.key]);
      const value = f.type === "select" ? (f.options?.find((o) => o.value === raw)?.label ?? raw) : raw;
      return { label: label(f.key).slice(0, 60), value: value.slice(0, 200) };
    })
    .slice(0, 10);
  if (longFields.length > 0 || facts.length > 0) {
    components.push({
      id: newComponentId(),
      type: "projectOverview",
      heading: "Überblick",
      body: longFields
        .map((f) => `${f.label}\n${asText(fields[f.key])}`)
        .join("\n\n")
        .slice(0, 4_000),
      facts,
    });
  }

  // Code: der erste Code-Block des Reports.
  const code = report.content.blocks.find((b) => b.type === "code" && b.code.trim() !== "");
  if (code && code.type === "code") {
    components.push({
      id: newComponentId(),
      type: "codeShowcase",
      heading: "Code",
      language: code.language,
      filename: code.filename,
      code: code.code.slice(0, 20_000),
      caption: "",
      sourceBlockIds: [code.id],
    });
  }

  // Bilder: alle Bild-Blöcke (Screenshots) in Report-Reihenfolge.
  const images = report.content.blocks.filter((b): b is Extract<Block, { type: "image" }> => b.type === "image");
  if (images.length > 0) {
    components.push({
      id: newComponentId(),
      type: "gallery",
      heading: "Bilder",
      items: images.slice(0, 12).map((b) => ({ mediaId: b.mediaId, alt: b.alt, caption: b.caption ?? "" })),
      sourceBlockIds: images.map((b) => b.id),
    });
  }

  // Erkenntnisse: alle Erkenntnis-/Befund-Blöcke mit Inhalt.
  const insights = report.content.blocks.filter((b) => b.type === "insight" && (b.title.trim() || b.text.trim()));
  if (insights.length > 0) {
    components.push({
      id: newComponentId(),
      type: "insights",
      heading: "Erkenntnisse",
      items: insights
        .slice(0, 12)
        .map((b) =>
          b.type === "insight"
            ? { variant: b.variant, title: b.title || "Erkenntnis", text: b.text }
            : { variant: "insight" as const, title: "", text: "" },
        ),
      sourceBlockIds: insights.map((b) => b.id),
    });
  }

  // Ergebnisse: Schlussfolgerung / Ergebnis / Lessons Learned, falls vorhanden.
  const results = ["conclusion", "result", "outcome", "lessonsLearned"]
    .filter((key) => asText(fields[key]))
    .map((key) => ({ title: label(key).slice(0, 120), text: asText(fields[key]).slice(0, 600) }));
  if (results.length > 0) {
    components.push({ id: newComponentId(), type: "resultHighlights", heading: "Ergebnisse", items: results });
  }

  // Fallback: Reiner Text, wenn sonst nichts außer dem Hero vorhanden ist.
  if (components.length === 1) {
    const plain = extractPlainText(report.content).slice(0, 4_000);
    if (plain)
      components.push({ id: newComponentId(), type: "projectOverview", heading: "Inhalt", body: plain, facts: [] });
  }

  return { schemaVersion: PAGE_SCHEMA_VERSION, components };
}
