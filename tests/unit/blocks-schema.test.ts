import { describe, expect, it } from "vitest";
import {
  BLOCK_ID_PATTERN,
  contentDocumentSchema,
  emptyDocument,
  isSafeLinkUrl,
  LIMITS,
  type ContentDocument,
} from "@/content/blocks/schema";
import { collectMediaRefs, extractPlainText, newBlockId } from "@/content/blocks/utils";

const MEDIA_ID = "6f1c2c1e-6c8b-4f7a-9d2e-0a1b2c3d4e5f";

function sampleDoc(): ContentDocument {
  return {
    schemaVersion: 1,
    blocks: [
      { id: "blk_heading00001", type: "heading", level: 2, text: "Ausgangslage" },
      {
        id: "blk_richtext0001",
        type: "richText",
        doc: {
          type: "doc",
          content: [
            {
              type: "paragraph",
              content: [
                { type: "text", text: "Alert ", marks: [{ type: "bold" }] },
                {
                  type: "text",
                  text: "Quelle",
                  marks: [{ type: "link", attrs: { href: "https://attack.mitre.org/" } }],
                },
              ],
            },
            {
              type: "bulletList",
              content: [
                { type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Punkt A" }] }] },
              ],
            },
          ],
        },
      },
      { id: "blk_code00000001", type: "code", language: "kusto", code: "SigninLogs | take 10", filename: "query.kql" },
      { id: "blk_image0000001", type: "image", mediaId: MEDIA_ID, alt: "Screenshot des Alerts" },
      { id: "blk_link00000001", type: "link", url: "https://example.org/report", title: "Referenz" },
      { id: "blk_insight00001", type: "insight", variant: "finding", title: "Befund", text: "MFA fehlte." },
    ],
  };
}

describe("contentDocumentSchema", () => {
  it("akzeptiert ein gültiges Dokument mit allen Blocktypen", () => {
    expect(contentDocumentSchema.parse(sampleDoc())).toEqual(sampleDoc());
  });

  it("akzeptiert ein leeres Dokument", () => {
    expect(contentDocumentSchema.safeParse(emptyDocument()).success).toBe(true);
  });

  it("lehnt unbekannte Blocktypen ab (z. B. rohes HTML)", () => {
    const doc = { schemaVersion: 1, blocks: [{ id: "blk_html00000001", type: "html", html: "<script>x</script>" }] };
    expect(contentDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("lehnt zusätzliche Felder ab (strict)", () => {
    const doc = sampleDoc();
    (doc.blocks[0] as Record<string, unknown>).onclick = "alert(1)";
    expect(contentDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("lehnt javascript:-Links in Rich Text ab", () => {
    const doc = sampleDoc();
    const block = doc.blocks[1];
    if (block.type !== "richText") throw new Error("Testdaten");
    const para = block.doc.content[0];
    if (para.type !== "paragraph" || !para.content) throw new Error("Testdaten");
    para.content[1] = { type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] };
    expect(contentDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("lehnt nicht erlaubte Marks und Knoten im Rich Text ab", () => {
    const withStyleMark = {
      schemaVersion: 1,
      blocks: [
        {
          id: "blk_richtext0001",
          type: "richText",
          doc: {
            type: "doc",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "x", marks: [{ type: "textStyle", attrs: { color: "red" } }] }],
              },
            ],
          },
        },
      ],
    };
    const withIframe = {
      schemaVersion: 1,
      blocks: [
        {
          id: "blk_richtext0001",
          type: "richText",
          doc: { type: "doc", content: [{ type: "iframe", attrs: { src: "https://evil" } }] },
        },
      ],
    };
    expect(contentDocumentSchema.safeParse(withStyleMark).success).toBe(false);
    expect(contentDocumentSchema.safeParse(withIframe).success).toBe(false);
  });

  it("lehnt doppelte Block-IDs ab", () => {
    const doc = sampleDoc();
    doc.blocks[1] = { ...doc.blocks[0] };
    const result = contentDocumentSchema.safeParse(doc);
    expect(result.success).toBe(false);
    expect(result.error?.issues.some((i) => i.message.includes("Doppelte Block-ID"))).toBe(true);
  });

  it("lehnt nicht erlaubte Code-Sprachen und falsche Schema-Versionen ab", () => {
    const badLang = {
      schemaVersion: 1,
      blocks: [{ id: "blk_code00000001", type: "code", language: "brainfuck", code: "+" }],
    };
    expect(contentDocumentSchema.safeParse(badLang).success).toBe(false);
    expect(contentDocumentSchema.safeParse({ schemaVersion: 2, blocks: [] }).success).toBe(false);
  });

  it("lehnt mailto: in Link-Blöcken ab (nur Web-URLs)", () => {
    const doc = {
      schemaVersion: 1,
      blocks: [{ id: "blk_link00000001", type: "link", url: "mailto:a@b.de", title: "x" }],
    };
    expect(contentDocumentSchema.safeParse(doc).success).toBe(false);
  });

  it("begrenzt die Anzahl der Blöcke", () => {
    const blocks = Array.from({ length: LIMITS.maxBlocks + 1 }, (_, i) => ({
      id: `blk_${String(i).padStart(10, "0")}`,
      type: "heading" as const,
      level: 2 as const,
      text: "x",
    }));
    expect(contentDocumentSchema.safeParse({ schemaVersion: 1, blocks }).success).toBe(false);
  });
});

describe("isSafeLinkUrl", () => {
  it.each([
    ["https://example.org", true],
    ["http://localhost:3000/x", true],
    ["mailto:me@example.org", true],
    ["javascript:alert(1)", false],
    ["  JaVaScRiPt:alert(1)", false],
    ["data:text/html;base64,PHNjcmlwdD4=", false],
    ["vbscript:msgbox", false],
    ["//evil.example", false],
    ["/relative/path", false],
    ["", false],
  ])("%s → %s", (url, expected) => {
    expect(isSafeLinkUrl(url)).toBe(expected);
  });
});

describe("Block-Hilfsfunktionen", () => {
  it("erzeugt gültige, eindeutige Block-IDs", () => {
    const ids = new Set(Array.from({ length: 1_000 }, newBlockId));
    expect(ids.size).toBe(1_000);
    for (const id of ids) expect(id).toMatch(BLOCK_ID_PATTERN);
  });

  it("extrahiert durchsuchbaren Text aus allen Blöcken", () => {
    const text = extractPlainText(sampleDoc());
    for (const fragment of [
      "Ausgangslage",
      "Alert Quelle",
      "Punkt A",
      "SigninLogs",
      "Screenshot des Alerts",
      "MFA fehlte.",
    ]) {
      expect(text).toContain(fragment);
    }
  });

  it("sammelt Medienverweise mit Block-ID", () => {
    expect(collectMediaRefs(sampleDoc())).toEqual([{ blockId: "blk_image0000001", mediaId: MEDIA_ID }]);
  });
});
