import type { RichTextDoc, RichTextBlockNode, ListItemNode } from "./schema";

/**
 * Bringt TipTap-JSON in das strikte Dokumentmodell: entfernt zusätzliche Attribute
 * (z. B. `target`, `rel`, `class` an Links), leere Textknoten und unbekannte Knoten.
 * Die serverseitige Zod-Validierung bleibt die eigentliche Sicherheitsgrenze.
 */
type Mark = { type: "bold" | "italic" | "strike" | "code" } | { type: "link"; attrs: { href: string } };
type Inline = { type: "hardBreak" } | { type: "text"; text: string; marks?: Mark[] };

type Json = { type?: unknown; text?: unknown; content?: unknown; marks?: unknown; attrs?: unknown };

function asArray(value: unknown): Json[] {
  return Array.isArray(value) ? (value as Json[]) : [];
}

function normalizeMarks(marks: unknown): Mark[] | undefined {
  const result = asArray(marks).flatMap((mark): Mark[] => {
    switch (mark.type) {
      case "bold":
      case "italic":
      case "strike":
      case "code":
        return [{ type: mark.type as "bold" | "italic" | "strike" | "code" }];
      case "link": {
        const href = (mark.attrs as { href?: unknown } | undefined)?.href;
        return typeof href === "string" ? [{ type: "link" as const, attrs: { href } }] : [];
      }
      default:
        return [];
    }
  });
  return result.length > 0 ? result : undefined;
}

function normalizeInline(nodes: unknown): Inline[] {
  return asArray(nodes).flatMap((node): Inline[] => {
    if (node.type === "hardBreak") return [{ type: "hardBreak" as const }];
    if (node.type === "text" && typeof node.text === "string" && node.text.length > 0) {
      const marks = normalizeMarks(node.marks);
      return [marks ? { type: "text" as const, text: node.text, marks } : { type: "text" as const, text: node.text }];
    }
    return [];
  });
}

function normalizeListItems(nodes: unknown): ListItemNode[] {
  return asArray(nodes).flatMap((node) => {
    if (node.type !== "listItem") return [];
    const content = normalizeBlocks(node.content);
    return content.length > 0 ? [{ type: "listItem" as const, content }] : [];
  });
}

function normalizeBlocks(nodes: unknown): RichTextBlockNode[] {
  return asArray(nodes).flatMap((node): RichTextBlockNode[] => {
    switch (node.type) {
      case "paragraph": {
        const content = normalizeInline(node.content);
        return [content.length > 0 ? { type: "paragraph", content } : { type: "paragraph" }];
      }
      case "bulletList": {
        const items = normalizeListItems(node.content);
        return items.length > 0 ? [{ type: "bulletList", content: items }] : [];
      }
      case "orderedList": {
        const items = normalizeListItems(node.content);
        const start = (node.attrs as { start?: unknown } | undefined)?.start;
        if (items.length === 0) return [];
        return [
          typeof start === "number" && start !== 1
            ? { type: "orderedList", attrs: { start }, content: items }
            : { type: "orderedList", content: items },
        ];
      }
      default:
        return [];
    }
  });
}

export function normalizeRichText(json: unknown): RichTextDoc {
  return { type: "doc", content: normalizeBlocks((json as Json | null)?.content) };
}
