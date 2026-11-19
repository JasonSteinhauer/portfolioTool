"use client";

import Bold from "@tiptap/extension-bold";
import Code from "@tiptap/extension-code";
import Document from "@tiptap/extension-document";
import HardBreak from "@tiptap/extension-hard-break";
import Italic from "@tiptap/extension-italic";
import Link from "@tiptap/extension-link";
import { BulletList, ListItem, OrderedList } from "@tiptap/extension-list";
import Paragraph from "@tiptap/extension-paragraph";
import Strike from "@tiptap/extension-strike";
import Text from "@tiptap/extension-text";
import { Placeholder, UndoRedo } from "@tiptap/extensions";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { useState } from "react";
import { normalizeRichText } from "@/content/blocks/normalize";
import { isSafeLinkUrl, type RichTextDoc } from "@/content/blocks/schema";
import { cn } from "@/ui/cn";

/**
 * Rich-Text-Editor mit genau den Knoten und Marks, die das Dokumentmodell erlaubt.
 * Keine Überschriften/Code-Blöcke/Bilder hier – dafür gibt es eigene Blöcke.
 */
export function RichTextEditor({
  value,
  onChange,
  label,
}: {
  value: RichTextDoc;
  onChange: (doc: RichTextDoc) => void;
  label: string;
}) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [linkError, setLinkError] = useState<string>();

  const editor = useEditor({
    immediatelyRender: false,
    // Basis-CSS liegt in globals.css – Inline-Styles würden die CSP verletzen.
    injectCSS: false,
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Bold,
      Italic,
      Strike,
      Code,
      BulletList,
      OrderedList,
      ListItem,
      UndoRedo,
      Placeholder.configure({ placeholder: "Text schreiben …" }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto"],
        isAllowedUri: (url) => isSafeLinkUrl(url),
      }),
    ],
    content: value.content.length > 0 ? value : { type: "doc", content: [{ type: "paragraph" }] },
    editorProps: {
      attributes: {
        "aria-label": label,
        role: "textbox",
        "aria-multiline": "true",
        class:
          "min-h-24 px-3 py-2 leading-relaxed focus:outline-none [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:list-decimal [&_ol]:pl-6 [&_p.is-editor-empty:first-child]:before:text-text-secondary/60 [&_p.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] [&_p.is-editor-empty:first-child]:before:float-left [&_p.is-editor-empty:first-child]:before:pointer-events-none [&_a]:underline [&_a]:decoration-accent [&_code]:bg-surface-elevated [&_code]:px-1 [&_code]:font-mono",
      },
    },
    onUpdate: ({ editor: e }) => onChange(normalizeRichText(e.getJSON())),
  });

  const active = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            strike: e.isActive("strike"),
            code: e.isActive("code"),
            link: e.isActive("link"),
            bulletList: e.isActive("bulletList"),
            orderedList: e.isActive("orderedList"),
          }
        : null,
  });

  if (!editor) {
    return <div className="min-h-24 border-2 border-border-default bg-bg" aria-busy="true" />;
  }

  const tool = (name: string, pressed: boolean | undefined, run: () => void, text: string, className?: string) => (
    <button
      type="button"
      aria-label={name}
      aria-pressed={pressed ?? false}
      onMouseDown={(e) => e.preventDefault()}
      onClick={run}
      className={cn(
        "h-8 min-w-8 border border-transparent px-2 text-[13px] text-text-secondary hover:bg-hover-surface hover:text-text-primary",
        pressed && "border-accent text-text-primary",
        className,
      )}
    >
      {text}
    </button>
  );

  const applyLink = () => {
    const url = linkUrl.trim();
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      setLinkOpen(false);
      return;
    }
    if (!isSafeLinkUrl(url)) {
      setLinkError("Nur http(s)- oder mailto-Links.");
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
    setLinkOpen(false);
    setLinkError(undefined);
  };

  return (
    <div className="border-2 border-border-default bg-bg focus-within:border-accent">
      <div
        role="toolbar"
        aria-label={`${label} – Formatierung`}
        className="flex flex-wrap items-center gap-1 border-b border-line-subtle px-1 py-1"
      >
        {tool("Fett", active?.bold, () => editor.chain().focus().toggleBold().run(), "B", "font-bold")}
        {tool("Kursiv", active?.italic, () => editor.chain().focus().toggleItalic().run(), "I", "italic")}
        {tool(
          "Durchgestrichen",
          active?.strike,
          () => editor.chain().focus().toggleStrike().run(),
          "S",
          "line-through",
        )}
        {tool("Code", active?.code, () => editor.chain().focus().toggleCode().run(), "</>", "font-mono")}
        <span className="mx-1 h-5 w-px bg-line-subtle" aria-hidden="true" />
        {tool("Aufzählung", active?.bulletList, () => editor.chain().focus().toggleBulletList().run(), "• Liste")}
        {tool(
          "Nummerierte Liste",
          active?.orderedList,
          () => editor.chain().focus().toggleOrderedList().run(),
          "1. Liste",
        )}
        <span className="mx-1 h-5 w-px bg-line-subtle" aria-hidden="true" />
        {tool(
          "Link",
          active?.link,
          () => {
            setLinkUrl((editor.getAttributes("link").href as string | undefined) ?? "");
            setLinkError(undefined);
            setLinkOpen((open) => !open);
          },
          "Link",
        )}
      </div>
      {linkOpen ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-line-subtle px-2 py-2">
          <input
            type="url"
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                applyLink();
              }
            }}
            placeholder="https://… (leer = Link entfernen)"
            aria-label="Link-Adresse"
            className="h-8 min-w-0 flex-1 border border-border-default bg-surface px-2 font-mono text-[13px] focus-visible:border-accent focus-visible:outline-none"
          />
          <button
            type="button"
            onClick={applyLink}
            className="h-8 border border-border-strong px-3 text-[13px] hover:bg-hover-surface"
          >
            Übernehmen
          </button>
          {linkError ? <span className="w-full font-mono text-xs text-danger">{linkError}</span> : null}
        </div>
      ) : null}
      <EditorContent editor={editor} />
    </div>
  );
}
