import type { ReactNode } from "react";
import type { Block, ContentDocument, RichTextBlockNode, RichTextDoc } from "./schema";

/**
 * Rendert das Dokumentmodell ausschließlich über React-Elemente – kein innerHTML.
 * Wird von Vorschau (Client), Report-Ansicht (Server) und später vom Portfolio genutzt.
 */

type Inline = NonNullable<Extract<RichTextBlockNode, { type: "paragraph" }>["content"]>[number];

function renderInline(node: Inline, key: number): ReactNode {
  if (node.type === "hardBreak") return <br key={key} />;
  let element: ReactNode = node.text;
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case "bold":
        element = <strong>{element}</strong>;
        break;
      case "italic":
        element = <em>{element}</em>;
        break;
      case "strike":
        element = <s>{element}</s>;
        break;
      case "code":
        element = <code className="bg-surface-elevated px-1 font-mono text-[0.9em]">{element}</code>;
        break;
      case "link":
        element = (
          <a
            href={mark.attrs.href}
            target="_blank"
            rel="noopener noreferrer nofollow"
            className="text-text-primary underline decoration-accent underline-offset-4 hover:decoration-2"
          >
            {element}
          </a>
        );
        break;
    }
  }
  return <span key={key}>{element}</span>;
}

function renderRichNode(node: RichTextBlockNode, key: number): ReactNode {
  switch (node.type) {
    case "paragraph":
      return <p key={key}>{(node.content ?? []).map(renderInline)}</p>;
    case "bulletList":
      return (
        <ul key={key} className="list-disc space-y-1 pl-6 marker:text-accent-text">
          {node.content.map((item, i) => (
            <li key={i}>{item.content.map(renderRichNode)}</li>
          ))}
        </ul>
      );
    case "orderedList":
      return (
        <ol
          key={key}
          start={node.attrs?.start}
          className="list-decimal space-y-1 pl-6 marker:font-mono marker:text-text-secondary"
        >
          {node.content.map((item, i) => (
            <li key={i}>{item.content.map(renderRichNode)}</li>
          ))}
        </ol>
      );
  }
}

export function RichText({ doc }: { doc: RichTextDoc }) {
  return <div className="space-y-3 leading-relaxed">{doc.content.map(renderRichNode)}</div>;
}

const INSIGHT_LABELS = {
  insight: "Erkenntnis",
  finding: "Befund",
  decision: "Entscheidung",
  warning: "Warnung",
} as const;

function renderBlock(block: Block): ReactNode {
  switch (block.type) {
    case "richText":
      return <RichText doc={block.doc} />;
    case "heading":
      return block.level === 2 ? (
        <h2 className="pt-4 text-xl font-semibold">{block.text}</h2>
      ) : (
        <h3 className="pt-2 text-lg font-semibold">{block.text}</h3>
      );
    case "code":
      return (
        <figure className="border-2 border-border-default bg-bg">
          <figcaption className="flex justify-between border-b border-line-subtle px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
            <span>{block.filename ?? "Code"}</span>
            <span>{block.language}</span>
          </figcaption>
          <pre className="overflow-x-auto p-4 font-mono text-[13px] leading-relaxed">
            <code>{block.code}</code>
          </pre>
        </figure>
      );
    case "link":
      return (
        <a
          href={block.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="block border-2 border-border-default bg-surface p-4 transition-colors hover:border-border-strong"
        >
          <span className="block font-medium">{block.title || block.url}</span>
          {block.description ? (
            <span className="mt-1 block text-sm text-text-secondary">{block.description}</span>
          ) : null}
          <span className="mt-2 block truncate font-mono text-xs text-text-secondary">{block.url}</span>
        </a>
      );
    case "insight":
      return (
        <aside className="border-l-2 border-accent bg-surface px-5 py-4">
          <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
            {INSIGHT_LABELS[block.variant]}
          </span>
          <p className="mt-1 font-semibold">{block.title}</p>
          {block.text ? <p className="mt-2 whitespace-pre-line text-text-secondary">{block.text}</p> : null}
        </aside>
      );
    case "image":
      return (
        <figure className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element -- private Datei, kein Bild-Optimizer */}
          <img
            src={`/api/media/${block.mediaId}`}
            alt={block.alt}
            loading="lazy"
            className="max-h-[36rem] w-auto max-w-full border-2 border-border-default bg-bg"
          />
          {block.caption ? <figcaption className="text-sm text-text-secondary">{block.caption}</figcaption> : null}
        </figure>
      );
    case "attachment":
      return (
        <a
          href={`/api/media/${block.mediaId}?download`}
          className="inline-flex items-center gap-3 self-start border-2 border-border-default bg-surface px-4 py-3 hover:border-border-strong"
        >
          <span aria-hidden="true" className="font-mono text-xs text-accent-text">
            ↓
          </span>
          <span className="font-medium">{block.label || "Anhang herunterladen"}</span>
        </a>
      );
  }
}

/** Unvollständige Blöcke (z. B. gerade eingefügt) werden nicht angezeigt. */
function isRenderable(block: Block): boolean {
  switch (block.type) {
    case "heading":
      return block.text.trim() !== "";
    case "link":
      return block.url !== "";
    case "insight":
      return block.title.trim() !== "" || block.text.trim() !== "";
    case "code":
      return block.code.trim() !== "";
    case "richText":
      return block.doc.content.some((n) => n.type !== "paragraph" || (n.content?.length ?? 0) > 0);
    default:
      return true;
  }
}

export function DocumentView({ doc }: { doc: ContentDocument }) {
  const blocks = doc.blocks.filter(isRenderable);
  if (blocks.length === 0) {
    return <p className="text-text-secondary">Noch kein Inhalt.</p>;
  }
  return (
    <div className="flex flex-col gap-5">
      {blocks.map((block) => (
        <section key={block.id} data-block-id={block.id}>
          {renderBlock(block)}
        </section>
      ))}
    </div>
  );
}
