import type { Block, ContentDocument } from "@/content/blocks/schema";

/**
 * Texteinheiten eines Reports (rein funktional, auch im Browser nutzbar): was die KI bearbeiten
 * darf und wie ein Vorschlag auf den Report angewendet wird.
 */
export type TextUnit = { key: string; label: string; text: string; maxLength: number; multiline: boolean };

export const MAX_UNITS = 80;
export const MAX_UNIT_CHARS = 2_000;

function paragraphText(node: Extract<Block, { type: "richText" }>["doc"]["content"][number]): string | null {
  if (node.type !== "paragraph" || !node.content?.length) return null;
  if (!node.content.every((n) => n.type === "text" && !n.marks?.length)) return null;
  return node.content.map((n) => (n.type === "text" ? n.text : "")).join("");
}

/** Alle sprachlich bearbeitbaren Einheiten eines Reports (ohne Code, Links, formatierte Absätze). */
export function extractTextUnits(report: {
  title: string;
  structuredFields: Record<string, unknown>;
  content: ContentDocument;
  fieldSchema: { key: string; label: string; type: string; maxLength?: number }[];
}): TextUnit[] {
  const units: TextUnit[] = [{ key: "title", label: "Titel", text: report.title, maxLength: 200, multiline: false }];
  for (const field of report.fieldSchema) {
    const value = report.structuredFields[field.key];
    if ((field.type === "text" || field.type === "textarea") && typeof value === "string") {
      units.push({
        key: `field:${field.key}`,
        label: field.label,
        text: value,
        maxLength: field.maxLength ?? (field.type === "text" ? 200 : 2_000),
        multiline: field.type === "textarea",
      });
    }
  }
  report.content.blocks.forEach((block, index) => {
    const n = index + 1;
    if (block.type === "heading") {
      units.push({
        key: `block:${block.id}:text`,
        label: `Block ${n}: Überschrift`,
        text: block.text,
        maxLength: 200,
        multiline: false,
      });
    }
    if (block.type === "insight") {
      units.push({
        key: `block:${block.id}:title`,
        label: `Block ${n}: Titel`,
        text: block.title,
        maxLength: 200,
        multiline: false,
      });
      units.push({
        key: `block:${block.id}:text`,
        label: `Block ${n}: Text`,
        text: block.text,
        maxLength: 5_000,
        multiline: true,
      });
    }
    if (block.type === "richText") {
      block.doc.content.forEach((node, p) => {
        const text = paragraphText(node);
        if (text !== null) {
          units.push({
            key: `block:${block.id}:p${p}`,
            label: `Block ${n}: Absatz ${p + 1}`,
            text,
            maxLength: 20_000,
            multiline: false,
          });
        }
      });
    }
  });
  return units.filter((u) => u.text.trim().length > 0 && u.text.length <= MAX_UNIT_CHARS);
}

/** Wendet einen Text auf eine Einheit an (unveränderliche Kopie). `null`, wenn die Einheit nicht mehr existiert. */
export function applyUnit(
  report: { title: string; structuredFields: Record<string, unknown>; content: ContentDocument },
  key: string,
  text: string,
): { title: string; structuredFields: Record<string, unknown>; content: ContentDocument } | null {
  if (key === "title") return { ...report, title: text };
  if (key.startsWith("field:")) {
    const fieldKey = key.slice(6);
    if (typeof report.structuredFields[fieldKey] !== "string") return null;
    return { ...report, structuredFields: { ...report.structuredFields, [fieldKey]: text } };
  }
  const match = /^block:([^:]+):(text|title|p(\d+))$/.exec(key);
  if (!match) return null;
  const [, blockId, part, para] = match;
  let found = false;
  const blocks = report.content.blocks.map((block): Block => {
    if (block.id !== blockId) return block;
    if (block.type === "heading" && part === "text") {
      found = true;
      return { ...block, text };
    }
    if (block.type === "insight" && (part === "text" || part === "title")) {
      found = true;
      return { ...block, [part]: text };
    }
    if (block.type === "richText" && para !== undefined) {
      const index = Number(para);
      const node = block.doc.content[index];
      if (!node || paragraphText(node) === null) return block;
      found = true;
      const content = [...block.doc.content];
      content[index] = { type: "paragraph", content: text ? [{ type: "text", text }] : [] };
      return { ...block, doc: { ...block.doc, content } };
    }
    return block;
  });
  return found ? { ...report, content: { ...report.content, blocks } } : null;
}
