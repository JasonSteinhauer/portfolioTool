"use client";

import { useRef, useState } from "react";
import { CODE_LANGUAGES, INSIGHT_VARIANTS, type Block, type BlockType } from "@/content/blocks/schema";
import { newBlockId } from "@/content/blocks/utils";
import type { MediaSummary } from "@/modules/media/service";
import { cn } from "@/ui/cn";
import { MediaPickerDialog, useMediaAsset } from "@/ui/media/media-picker";
import { mediaUrl } from "@/ui/media/upload";
import { RichTextEditor } from "./rich-text-editor";

const control =
  "w-full border-2 border-border-default bg-bg px-3 text-sm text-text-primary placeholder:text-text-secondary/70 hover:border-border-strong focus-visible:border-accent focus-visible:outline-none";

type SimpleBlockType = Exclude<BlockType, "image" | "attachment">;

export const BLOCK_LABELS: Record<BlockType, string> = {
  richText: "Text",
  heading: "Überschrift",
  image: "Bild",
  code: "Code",
  link: "Link",
  insight: "Erkenntnis",
  attachment: "Anhang",
};

const INSIGHT_LABELS = {
  insight: "Erkenntnis",
  finding: "Befund",
  decision: "Entscheidung",
  warning: "Warnung",
} as const;

export function createBlock(type: SimpleBlockType): Block {
  const id = newBlockId();
  switch (type) {
    case "richText":
      return { id, type, doc: { type: "doc", content: [{ type: "paragraph" }] } };
    case "heading":
      return { id, type, level: 2, text: "" };
    case "code":
      return { id, type, language: "text", code: "" };
    case "link":
      return { id, type, url: "", title: "" };
    case "insight":
      return { id, type, variant: "insight", title: "", text: "" };
  }
}

export function mediaBlock(type: "image" | "attachment", asset: MediaSummary): Block {
  return type === "image"
    ? { id: newBlockId(), type, mediaId: asset.id, alt: asset.altText ?? "" }
    : { id: newBlockId(), type, mediaId: asset.id, label: asset.title ?? asset.originalFilename ?? undefined };
}

export function AddBlockMenu({ onAdd, label = "Block hinzufügen" }: { onAdd: (block: Block) => void; label?: string }) {
  const [picker, setPicker] = useState<"image" | "attachment" | null>(null);
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">+ Block</span>
      {(Object.keys(BLOCK_LABELS) as BlockType[]).map((type) => (
        <button
          key={type}
          type="button"
          onClick={() => (type === "image" || type === "attachment" ? setPicker(type) : onAdd(createBlock(type)))}
          className="h-8 border-2 border-border-default px-3 text-[13px] hover:border-border-strong hover:bg-hover-surface"
        >
          {BLOCK_LABELS[type]}
        </button>
      ))}
      <MediaPickerDialog
        open={picker !== null}
        kind={picker === "image" ? "image" : "any"}
        title={picker === "image" ? "Bild einfügen" : "Anhang einfügen"}
        onClose={() => setPicker(null)}
        onPick={(asset) => {
          if (picker) onAdd(mediaBlock(picker, asset));
          setPicker(null);
        }}
      />
    </div>
  );
}

type BlockEditorProps = {
  block: Block;
  index: number;
  count: number;
  error?: string;
  onChange: (block: Block) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
  onInsertAfter: (block: Block) => void;
};

export function BlockEditor({
  block,
  index,
  count,
  error,
  onChange,
  onMove,
  onRemove,
  onInsertAfter,
}: BlockEditorProps) {
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [showInsert, setShowInsert] = useState(false);
  const tabReleased = useRef(false);
  const name = BLOCK_LABELS[block.type];
  const label = `Block ${index + 1}: ${name}`;

  return (
    <div
      role="group"
      aria-label={label}
      data-testid="block"
      data-block-type={block.type}
      className={cn("border-2 border-border-default bg-surface", error && "border-danger")}
    >
      <div className="flex items-center justify-between gap-2 border-b border-line-subtle px-3 py-1">
        <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
          {String(index + 1).padStart(2, "0")} · {name}
        </span>
        <div className="flex items-center gap-1">
          <IconButton label={`${label} nach oben`} disabled={index === 0} onClick={() => onMove(-1)}>
            ↑
          </IconButton>
          <IconButton label={`${label} nach unten`} disabled={index === count - 1} onClick={() => onMove(1)}>
            ↓
          </IconButton>
          <IconButton label={`Nach ${label} einfügen`} onClick={() => setShowInsert((v) => !v)}>
            +
          </IconButton>
          {confirmRemove ? (
            <>
              <button
                type="button"
                onClick={onRemove}
                className="h-7 border border-danger px-2 text-xs text-danger hover:bg-danger hover:text-bg"
              >
                Entfernen
              </button>
              <button
                type="button"
                onClick={() => setConfirmRemove(false)}
                className="h-7 px-2 text-xs text-text-secondary hover:text-text-primary"
              >
                Abbrechen
              </button>
            </>
          ) : (
            <IconButton label={`${label} entfernen`} onClick={() => setConfirmRemove(true)}>
              ×
            </IconButton>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-3 p-3">
        {block.type === "richText" ? (
          <RichTextEditor label={label} value={block.doc} onChange={(doc) => onChange({ ...block, doc })} />
        ) : null}

        {block.type === "heading" ? (
          <div className="flex gap-2">
            <select
              aria-label={`${label} – Ebene`}
              value={block.level}
              onChange={(e) => onChange({ ...block, level: Number(e.target.value) === 3 ? 3 : 2 })}
              className={cn(control, "h-10 w-24")}
            >
              <option value={2}>H2</option>
              <option value={3}>H3</option>
            </select>
            <input
              aria-label={`${label} – Text`}
              value={block.text}
              maxLength={200}
              placeholder="Überschrift"
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              className={cn(control, "h-10 font-heading text-base font-semibold")}
            />
          </div>
        ) : null}

        {block.type === "code" ? (
          <>
            <div className="flex flex-wrap gap-2">
              <select
                aria-label={`${label} – Sprache`}
                value={block.language}
                onChange={(e) => onChange({ ...block, language: e.target.value as (typeof CODE_LANGUAGES)[number] })}
                className={cn(control, "h-10 w-40 font-mono")}
              >
                {CODE_LANGUAGES.map((lang) => (
                  <option key={lang} value={lang}>
                    {lang}
                  </option>
                ))}
              </select>
              <input
                aria-label={`${label} – Dateiname`}
                value={block.filename ?? ""}
                maxLength={200}
                placeholder="Dateiname (optional)"
                onChange={(e) => onChange({ ...block, filename: e.target.value || undefined })}
                className={cn(control, "h-10 min-w-0 flex-1 font-mono")}
              />
            </div>
            <textarea
              aria-label={`${label} – Code`}
              value={block.code}
              spellCheck={false}
              onChange={(e) => onChange({ ...block, code: e.target.value })}
              onKeyDown={(e) => {
                // Esc gibt die Tab-Taste frei, damit man das Feld per Tastatur verlassen kann (keine Tastaturfalle).
                if (e.key === "Escape") {
                  tabReleased.current = true;
                  return;
                }
                if (e.key === "Tab" && tabReleased.current) {
                  tabReleased.current = false;
                  return;
                }
                if (e.key === "Tab" && !e.shiftKey) {
                  e.preventDefault();
                  const el = e.currentTarget;
                  const { selectionStart, selectionEnd } = el;
                  const next = `${block.code.slice(0, selectionStart)}  ${block.code.slice(selectionEnd)}`;
                  onChange({ ...block, code: next });
                  requestAnimationFrame(() => el.setSelectionRange(selectionStart + 2, selectionStart + 2));
                }
              }}
              rows={Math.min(24, Math.max(4, block.code.split("\n").length + 1))}
              className={cn(control, "py-2 font-mono text-[13px] leading-relaxed")}
            />
            <p className="text-xs text-text-secondary">Tab rückt ein. Mit Esc und dann Tab verlässt du das Feld.</p>
          </>
        ) : null}

        {block.type === "link" ? (
          <>
            <input
              aria-label={`${label} – URL`}
              type="url"
              value={block.url}
              placeholder="https://…"
              onChange={(e) => onChange({ ...block, url: e.target.value })}
              className={cn(control, "h-10 font-mono")}
            />
            <input
              aria-label={`${label} – Titel`}
              value={block.title}
              maxLength={200}
              placeholder="Titel"
              onChange={(e) => onChange({ ...block, title: e.target.value })}
              className={cn(control, "h-10")}
            />
            <input
              aria-label={`${label} – Beschreibung`}
              value={block.description ?? ""}
              maxLength={500}
              placeholder="Beschreibung (optional)"
              onChange={(e) => onChange({ ...block, description: e.target.value || undefined })}
              className={cn(control, "h-10")}
            />
          </>
        ) : null}

        {block.type === "insight" ? (
          <>
            <div className="flex gap-2">
              <select
                aria-label={`${label} – Art`}
                value={block.variant}
                onChange={(e) => onChange({ ...block, variant: e.target.value as (typeof INSIGHT_VARIANTS)[number] })}
                className={cn(control, "h-10 w-40")}
              >
                {INSIGHT_VARIANTS.map((v) => (
                  <option key={v} value={v}>
                    {INSIGHT_LABELS[v]}
                  </option>
                ))}
              </select>
              <input
                aria-label={`${label} – Titel`}
                value={block.title}
                maxLength={200}
                placeholder="Kernaussage"
                onChange={(e) => onChange({ ...block, title: e.target.value })}
                className={cn(control, "h-10 font-semibold")}
              />
            </div>
            <textarea
              aria-label={`${label} – Erläuterung`}
              value={block.text}
              maxLength={2000}
              rows={3}
              placeholder="Erläuterung"
              onChange={(e) => onChange({ ...block, text: e.target.value })}
              className={cn(control, "py-2")}
            />
          </>
        ) : null}

        {block.type === "image" || block.type === "attachment" ? (
          <MediaBlockFields block={block} label={label} onChange={onChange} />
        ) : null}

        {error ? (
          <p role="alert" className="font-mono text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>

      {showInsert ? (
        <div className="border-t border-line-subtle px-3 py-2">
          <AddBlockMenu
            label={`Nach ${label} einfügen`}
            onAdd={(next) => {
              onInsertAfter(next);
              setShowInsert(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function IconButton({
  label,
  children,
  disabled,
  onClick,
}: {
  label: string;
  children: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 items-center justify-center text-sm text-text-secondary hover:bg-hover-surface hover:text-text-primary disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function MediaBlockFields({
  block,
  label,
  onChange,
}: {
  block: Extract<Block, { type: "image" | "attachment" }>;
  label: string;
  onChange: (block: Block) => void;
}) {
  const asset = useMediaAsset(block.mediaId);
  const [picking, setPicking] = useState(false);
  const isImage = block.type === "image";

  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <div className="flex h-32 w-full shrink-0 items-center justify-center overflow-hidden border-2 border-border-default bg-bg sm:w-44">
        {isImage ? (
          // eslint-disable-next-line @next/next/no-img-element -- private Datei
          <img src={mediaUrl(block.mediaId)} alt="" className="h-full w-full object-contain" />
        ) : (
          <span className="px-2 text-center font-mono text-xs text-text-secondary">
            {asset?.originalFilename ?? "Datei"}
          </span>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        {block.type === "image" ? (
          <>
            <input
              aria-label={`${label} – Bildbeschreibung`}
              value={block.alt}
              maxLength={300}
              placeholder="Bildbeschreibung (Alt-Text) – was ist zu sehen?"
              onChange={(e) => onChange({ ...block, alt: e.target.value })}
              className={cn(control, "h-10")}
            />
            <input
              aria-label={`${label} – Bildunterschrift`}
              value={block.caption ?? ""}
              maxLength={500}
              placeholder="Bildunterschrift (optional)"
              onChange={(e) => onChange({ ...block, caption: e.target.value || undefined })}
              className={cn(control, "h-10")}
            />
            {block.alt.trim() === "" ? (
              <p className="text-xs text-text-secondary">
                Ohne Beschreibung kann das Bild nicht im Portfolio freigegeben werden.
              </p>
            ) : null}
          </>
        ) : (
          <input
            aria-label={`${label} – Bezeichnung`}
            value={block.label ?? ""}
            maxLength={200}
            placeholder="Bezeichnung (optional)"
            onChange={(e) => onChange({ ...block, label: e.target.value || undefined })}
            className={cn(control, "h-10")}
          />
        )}
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="h-8 self-start border-2 border-border-default px-3 text-[13px] hover:border-border-strong hover:bg-hover-surface"
        >
          {isImage ? "Bild ersetzen" : "Datei ersetzen"}
        </button>
      </div>
      <MediaPickerDialog
        open={picking}
        kind={isImage ? "image" : "any"}
        title={isImage ? "Bild ersetzen" : "Datei ersetzen"}
        onClose={() => setPicking(false)}
        onPick={(picked) => {
          onChange({ ...block, mediaId: picked.id });
          setPicking(false);
        }}
      />
    </div>
  );
}
