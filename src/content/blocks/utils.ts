import type { Block, ContentDocument, RichTextBlockNode } from "./schema";

const ID_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

/** Erzeugt eine stabile, zufällige Block-ID (`blk_` + 16 Zeichen). */
export function newBlockId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let id = "blk_";
  for (const byte of bytes) id += ID_ALPHABET[byte % ID_ALPHABET.length];
  return id;
}

function richTextNodeText(node: RichTextBlockNode): string[] {
  if (node.type === "paragraph") {
    return [(node.content ?? []).map((inline) => (inline.type === "text" ? inline.text : " ")).join("")];
  }
  return node.content.flatMap((item) => item.content.flatMap(richTextNodeText));
}

function blockText(block: Block): string[] {
  switch (block.type) {
    case "richText":
      return block.doc.content.flatMap(richTextNodeText);
    case "heading":
      return [block.text];
    case "image":
      return [block.alt, block.caption ?? ""];
    case "attachment":
      return [block.label ?? ""];
    case "code":
      return [block.filename ?? "", block.code];
    case "link":
      return [block.title, block.description ?? ""];
    case "insight":
      return [block.title, block.text];
  }
}

/** Reiner Text eines Dokuments – Grundlage für die Volltextsuche. */
export function extractPlainText(doc: ContentDocument): string {
  return doc.blocks
    .flatMap(blockText)
    .map((t) => t.trim())
    .filter(Boolean)
    .join("\n");
}

/** Alle Medien, auf die das Dokument verweist (für `report_media`). */
export function collectMediaRefs(doc: ContentDocument): { blockId: string; mediaId: string }[] {
  return doc.blocks.flatMap((block) =>
    block.type === "image" || block.type === "attachment" ? [{ blockId: block.id, mediaId: block.mediaId }] : [],
  );
}
