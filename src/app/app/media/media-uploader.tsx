"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type DragEvent } from "react";
import { uploadFile } from "@/ui/media/upload";

type Item = { name: string; state: "pending" | "done" | "duplicate" | "error"; message?: string };

/** Upload-Fläche der Mediathek: Auswahl oder Drag & Drop, mehrere Dateien nacheinander. */
export function MediaUploader({ accept }: { accept: string }) {
  const router = useRouter();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handle(files: FileList | File[]) {
    const list = Array.from(files);
    if (list.length === 0) return;
    setBusy(true);
    setItems(list.map((f) => ({ name: f.name, state: "pending" })));
    for (const [index, file] of list.entries()) {
      const result = await uploadFile(file);
      setItems((prev) =>
        prev.map((item, i) =>
          i !== index
            ? item
            : result.ok
              ? { ...item, state: result.duplicate ? "duplicate" : "done" }
              : { ...item, state: "error", message: result.message },
        ),
      );
    }
    setBusy(false);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  function onDrop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void handle(event.dataTransfer.files);
  }

  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={inputId}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex cursor-pointer flex-col items-center gap-2 border-2 border-dashed px-6 py-10 text-center transition-colors focus-within:border-accent ${
          dragging ? "border-accent bg-hover-surface" : "border-border-strong hover:border-text-primary"
        }`}
      >
        <span className="font-medium">
          {busy ? "Lade hoch …" : "Dateien hochladen – hierher ziehen oder auswählen"}
        </span>
        <span className="text-xs text-text-secondary">
          PNG, JPEG, WebP, PDF, Text (txt, log, csv, json, md, kql, yaml) · max. 10 MB · Bilder werden ohne Metadaten
          (EXIF/GPS) gespeichert
        </span>
        <input
          ref={inputRef}
          id={inputId}
          type="file"
          multiple
          accept={accept}
          disabled={busy}
          className="sr-only"
          onChange={(e) => e.target.files && void handle(e.target.files)}
        />
      </label>
      {/* Live-Region existiert immer, damit Screenreader Änderungen ansagen. */}
      <div role="status" aria-live="polite" data-testid="upload-status">
        {items.length > 0 ? (
          <ul className="flex flex-col gap-1 font-mono text-xs">
            {items.map((item, i) => (
              <li key={`${item.name}-${i}`} className={item.state === "error" ? "text-danger" : "text-text-secondary"}>
                {item.name}:{" "}
                {item.state === "pending"
                  ? "wird hochgeladen …"
                  : item.state === "done"
                    ? "hochgeladen"
                    : item.state === "duplicate"
                      ? "bereits vorhanden"
                      : `abgelehnt – ${item.message}`}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
