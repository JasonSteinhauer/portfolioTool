"use client";

import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { MediaSummary } from "@/modules/media/service";
import { formatBytes, mediaUrl, uploadFile } from "./upload";

type Library = { assets: MediaSummary[]; add: (asset: MediaSummary) => void };

const MediaLibraryContext = createContext<Library | null>(null);

/** Stellt dem Editor die Mediathek bereit; neue Uploads erscheinen sofort im Picker. */
export function MediaLibraryProvider({ initial, children }: { initial: MediaSummary[]; children: ReactNode }) {
  const [assets, setAssets] = useState(initial);
  const add = (asset: MediaSummary) => setAssets((prev) => [asset, ...prev.filter((a) => a.id !== asset.id)]);
  return <MediaLibraryContext.Provider value={{ assets, add }}>{children}</MediaLibraryContext.Provider>;
}

export function useMediaLibrary(): Library {
  const library = useContext(MediaLibraryContext);
  if (!library) throw new Error("MediaLibraryProvider fehlt");
  return library;
}

export function useMediaAsset(id: string): MediaSummary | undefined {
  return useMediaLibrary().assets.find((a) => a.id === id);
}

/**
 * Auswahl-Dialog (natives `<dialog>`: Fokus bleibt im Dialog, Esc schließt).
 * `kind = "image"` zeigt nur Bilder; Anhänge dürfen jede Datei sein.
 */
export function MediaPickerDialog({
  open,
  kind,
  title,
  onPick,
  onClose,
}: {
  open: boolean;
  kind: "image" | "any";
  title: string;
  onPick: (asset: MediaSummary) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const { assets, add } = useMediaLibrary();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<string>("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const visible = assets.filter(
    (a) =>
      (kind === "any" || a.kind === "image") &&
      (!query.trim() ||
        `${a.title ?? ""} ${a.originalFilename ?? ""}`.toLowerCase().includes(query.trim().toLowerCase())),
  );

  async function upload(file: File) {
    setBusy(true);
    setStatus("Lade hoch …");
    const result = await uploadFile(file);
    setBusy(false);
    if (!result.ok) {
      setStatus(`Abgelehnt – ${result.message}`);
      return;
    }
    if (kind === "image" && result.asset.kind !== "image") {
      setStatus("Das ist kein Bild – für Dateien den Block „Anhang“ verwenden.");
      add(result.asset);
      return;
    }
    add(result.asset);
    setStatus("");
    onPick(result.asset);
  }

  return (
    <dialog
      ref={ref}
      aria-labelledby={headingId}
      onClose={onClose}
      onCancel={onClose}
      className="m-auto w-[min(48rem,calc(100vw-2rem))] border-2 border-border-strong bg-bg p-0 text-text-primary backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between border-b-2 border-border-default px-5 py-3">
        <h2 id={headingId} className="font-semibold">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          className="h-8 px-3 text-sm text-text-secondary hover:text-text-primary"
        >
          Schließen
        </button>
      </div>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-10 cursor-pointer items-center border-2 border-accent bg-accent px-4 text-sm font-medium text-white focus-within:shadow-accent hover:bg-accent-hover">
            {busy ? "Lade hoch …" : "Neue Datei hochladen"}
            <input
              type="file"
              className="sr-only"
              disabled={busy}
              accept={kind === "image" ? "image/png,image/jpeg,image/webp" : undefined}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void upload(file);
              }}
            />
          </label>
          <input
            type="search"
            aria-label="Mediathek durchsuchen"
            placeholder="Suchen …"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-10 min-w-0 flex-1 border-2 border-border-default bg-bg px-3 text-sm focus-visible:border-accent focus-visible:outline-none"
          />
        </div>
        <p role="status" className="min-h-4 font-mono text-xs text-text-secondary">
          {status}
        </p>
        {visible.length === 0 ? (
          <p className="text-sm text-text-secondary">Keine passenden Dateien in der Mediathek.</p>
        ) : (
          <ul className="grid max-h-[55vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
            {visible.map((asset) => (
              <li key={asset.id}>
                <button
                  type="button"
                  onClick={() => onPick(asset)}
                  aria-label={`Auswählen: ${asset.title ?? asset.originalFilename}`}
                  className="flex w-full flex-col border-2 border-border-default text-left hover:border-accent focus-visible:border-accent focus-visible:outline-none"
                >
                  <span className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-surface">
                    {asset.kind === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element -- private Datei
                      <img src={mediaUrl(asset.id)} alt="" loading="lazy" className="h-full w-full object-contain" />
                    ) : (
                      <span className="font-mono text-xs text-text-secondary">
                        {asset.mimeType === "application/pdf" ? "PDF" : "Text"}
                      </span>
                    )}
                  </span>
                  <span className="truncate px-2 pt-1 text-sm">{asset.title}</span>
                  <span className="px-2 pb-1 font-mono text-[11px] text-text-secondary">
                    {formatBytes(asset.sizeBytes)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}
