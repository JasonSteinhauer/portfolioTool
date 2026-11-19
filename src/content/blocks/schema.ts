import { z } from "zod";

/**
 * Strukturiertes Dokumentmodell für Reports.
 *
 * Grundsatz: Es wird NIE HTML gespeichert. Ein Report ist eine Liste typisierter Blöcke;
 * Rich Text ist ein eingeschränktes ProseMirror/TipTap-JSON mit einer Allowlist an Knoten
 * und Marks. Gerendert wird ausschließlich über eigene Renderer.
 *
 * Jede Änderung an diesem Schema, die alte Daten ungültig macht, braucht eine neue
 * `schemaVersion` und eine Migration der gespeicherten Dokumente.
 */

export const CONTENT_SCHEMA_VERSION = 1 as const;

export const LIMITS = {
  maxBlocks: 500,
  maxTextLength: 20_000,
  maxCodeLength: 50_000,
  maxTitleLength: 200,
  maxUrlLength: 2_048,
  maxSerializedBytes: 1_000_000,
} as const;

// ---------------------------------------------------------------------------
// URLs
// ---------------------------------------------------------------------------

const ALLOWED_LINK_PROTOCOLS = new Set(["http:", "https:", "mailto:"]);
const ALLOWED_WEB_PROTOCOLS = new Set(["http:", "https:"]);

function hasProtocol(value: string, allowed: Set<string>): boolean {
  try {
    return allowed.has(new URL(value).protocol);
  } catch {
    return false;
  }
}

/** Erlaubt nur http(s) und mailto – blockiert u. a. `javascript:` und `data:`. */
export function isSafeLinkUrl(value: string): boolean {
  return hasProtocol(value, ALLOWED_LINK_PROTOCOLS);
}

export const safeLinkUrl = z
  .string()
  .trim()
  .max(LIMITS.maxUrlLength)
  .refine(isSafeLinkUrl, { message: "Nur http(s)- und mailto-Links sind erlaubt" });

export const safeWebUrl = z
  .string()
  .trim()
  .max(LIMITS.maxUrlLength)
  .refine((v) => hasProtocol(v, ALLOWED_WEB_PROTOCOLS), {
    message: "Nur http(s)-Links sind erlaubt",
  });

// ---------------------------------------------------------------------------
// Rich Text (eingeschränktes TipTap-JSON)
// ---------------------------------------------------------------------------

const markSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("bold") }).strict(),
  z.object({ type: z.literal("italic") }).strict(),
  z.object({ type: z.literal("strike") }).strict(),
  z.object({ type: z.literal("code") }).strict(),
  z.object({ type: z.literal("link"), attrs: z.object({ href: safeLinkUrl }).strict() }).strict(),
]);

const textNodeSchema = z
  .object({
    type: z.literal("text"),
    text: z.string().min(1).max(LIMITS.maxTextLength),
    marks: z.array(markSchema).max(5).optional(),
  })
  .strict();

const hardBreakSchema = z.object({ type: z.literal("hardBreak") }).strict();

const inlineSchema = z.discriminatedUnion("type", [textNodeSchema, hardBreakSchema]);

const paragraphSchema = z
  .object({
    type: z.literal("paragraph"),
    content: z.array(inlineSchema).max(2_000).optional(),
  })
  .strict();

export type RichTextBlockNode =
  | z.infer<typeof paragraphSchema>
  | { type: "bulletList"; content: ListItemNode[] }
  | { type: "orderedList"; attrs?: { start?: number }; content: ListItemNode[] };

export type ListItemNode = { type: "listItem"; content: RichTextBlockNode[] };

const listItemSchema: z.ZodType<ListItemNode> = z.lazy(() =>
  z
    .object({
      type: z.literal("listItem"),
      content: z.array(richTextBlockNodeSchema).min(1).max(50),
    })
    .strict(),
);

const richTextBlockNodeSchema: z.ZodType<RichTextBlockNode> = z.lazy(() =>
  z.union([
    paragraphSchema,
    z
      .object({
        type: z.literal("bulletList"),
        content: z.array(listItemSchema).min(1).max(200),
      })
      .strict(),
    z
      .object({
        type: z.literal("orderedList"),
        attrs: z
          .object({ start: z.number().int().min(0).max(10_000).optional() })
          .strict()
          .optional(),
        content: z.array(listItemSchema).min(1).max(200),
      })
      .strict(),
  ]),
);

export const richTextDocSchema = z
  .object({
    type: z.literal("doc"),
    content: z.array(richTextBlockNodeSchema).max(2_000),
  })
  .strict();

export type RichTextDoc = z.infer<typeof richTextDocSchema>;

// ---------------------------------------------------------------------------
// Blöcke
// ---------------------------------------------------------------------------

export const BLOCK_ID_PATTERN = /^blk_[A-Za-z0-9_-]{8,32}$/;
const blockId = z.string().regex(BLOCK_ID_PATTERN, "Ungültige Block-ID");
const mediaId = z.uuid();

export const CODE_LANGUAGES = [
  "text",
  "bash",
  "powershell",
  "python",
  "javascript",
  "typescript",
  "json",
  "yaml",
  "toml",
  "sql",
  "kusto",
  "html",
  "css",
  "markdown",
  "dockerfile",
  "ini",
  "xml",
  "go",
  "rust",
  "c",
  "cpp",
  "csharp",
  "java",
] as const;

export const INSIGHT_VARIANTS = ["insight", "finding", "decision", "warning"] as const;

const shortText = (max: number = LIMITS.maxTitleLength) => z.string().trim().max(max);

export const blockSchema = z.discriminatedUnion("type", [
  z.object({ id: blockId, type: z.literal("richText"), doc: richTextDocSchema }).strict(),
  z
    .object({
      id: blockId,
      type: z.literal("heading"),
      level: z.union([z.literal(2), z.literal(3)]),
      // Leer erlaubt: frisch eingefügte Blöcke sollen Autosave nicht blockieren (Renderer überspringt sie).
      text: shortText(),
    })
    .strict(),
  z
    .object({
      id: blockId,
      type: z.literal("image"),
      mediaId,
      alt: shortText(300),
      caption: shortText(500).optional(),
    })
    .strict(),
  z
    .object({
      id: blockId,
      type: z.literal("attachment"),
      mediaId,
      label: shortText().optional(),
    })
    .strict(),
  z
    .object({
      id: blockId,
      type: z.literal("code"),
      language: z.enum(CODE_LANGUAGES),
      code: z.string().max(LIMITS.maxCodeLength),
      filename: shortText().optional(),
    })
    .strict(),
  z
    .object({
      id: blockId,
      type: z.literal("link"),
      url: z.union([z.literal(""), safeWebUrl]),
      title: shortText(),
      description: shortText(500).optional(),
    })
    .strict(),
  z
    .object({
      id: blockId,
      type: z.literal("insight"),
      variant: z.enum(INSIGHT_VARIANTS),
      title: shortText(),
      text: shortText(2_000),
    })
    .strict(),
]);

export type Block = z.infer<typeof blockSchema>;
export type BlockType = Block["type"];

export const contentDocumentSchema = z
  .object({
    schemaVersion: z.literal(CONTENT_SCHEMA_VERSION),
    blocks: z.array(blockSchema).max(LIMITS.maxBlocks),
  })
  .strict()
  .superRefine((doc, ctx) => {
    const seen = new Set<string>();
    doc.blocks.forEach((block, index) => {
      if (seen.has(block.id)) {
        ctx.addIssue({
          code: "custom",
          path: ["blocks", index, "id"],
          message: `Doppelte Block-ID ${block.id}`,
        });
      }
      seen.add(block.id);
    });
    const bytes = new TextEncoder().encode(JSON.stringify(doc)).length;
    if (bytes > LIMITS.maxSerializedBytes) {
      ctx.addIssue({ code: "custom", path: [], message: "Dokument ist zu groß" });
    }
  });

export type ContentDocument = z.infer<typeof contentDocumentSchema>;

export function emptyDocument(): ContentDocument {
  return { schemaVersion: CONTENT_SCHEMA_VERSION, blocks: [] };
}
