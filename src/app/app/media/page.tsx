import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { ACCEPT_ATTRIBUTE, countMediaUsage, listMedia } from "@/modules/media/service";
import { Meta } from "@/ui/card";
import { formatBytes, mediaUrl } from "@/ui/media/upload";
import { PageHeader } from "@/ui/workspace-shell";
import { restoreMediaAction } from "./actions";
import { MediaUploader } from "./media-uploader";

export const metadata: Metadata = { title: "Medien" };

const FILTERS = [
  { value: "", label: "Alle" },
  { value: "image", label: "Bilder" },
  { value: "document", label: "Dokumente" },
] as const;

export default async function MediaPage({
  searchParams,
}: {
  searchParams: Promise<{ kind?: string; q?: string; trash?: string }>;
}) {
  const { actor } = await requireOwner();
  const params = await searchParams;
  const kind = params.kind === "image" || params.kind === "document" ? params.kind : undefined;
  const trash = params.trash === "1";
  const db = getDb();
  const [assets, usage] = await Promise.all([
    listMedia(db, actor, { kind, query: params.q, trash }),
    countMediaUsage(db, actor),
  ]);

  return (
    <>
      <PageHeader
        title={trash ? "Medien · Papierkorb" : "Medien"}
        meta={
          <Meta>
            {trash ? (
              <Link href="/app/media" className="hover:text-text-primary">
                ← Mediathek
              </Link>
            ) : (
              <Link href="/app/media?trash=1" className="hover:text-text-primary">
                Papierkorb
              </Link>
            )}
          </Meta>
        }
      />

      {!trash ? (
        <section aria-label="Hochladen" className="mb-10">
          <MediaUploader accept={ACCEPT_ATTRIBUTE} />
        </section>
      ) : null}

      <form role="search" className="mb-6 flex flex-wrap items-end gap-3" action="/app/media">
        {trash ? <input type="hidden" name="trash" value="1" /> : null}
        <label className="flex flex-col gap-1 text-[13px] font-medium">
          Suchen
          <input
            type="search"
            name="q"
            defaultValue={params.q ?? ""}
            className="h-10 w-64 border-2 border-border-default bg-bg px-3 text-sm focus-visible:border-accent focus-visible:outline-none"
          />
        </label>
        <fieldset className="flex gap-1">
          <legend className="sr-only">Art</legend>
          {FILTERS.map((f) => (
            <label
              key={f.value}
              className="flex h-10 cursor-pointer items-center border-2 border-border-default px-3 text-sm has-[:checked]:border-accent"
            >
              <input
                type="radio"
                name="kind"
                value={f.value}
                defaultChecked={(kind ?? "") === f.value}
                className="sr-only"
              />
              {f.label}
            </label>
          ))}
        </fieldset>
        <button type="submit" className="h-10 border-2 border-border-strong px-4 text-sm hover:bg-hover-surface">
          Anwenden
        </button>
      </form>

      {assets.length === 0 ? (
        <p className="text-text-secondary">
          {trash ? "Der Papierkorb ist leer." : "Noch keine Dateien – lade oben welche hoch."}
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4" data-testid="media-grid">
          {assets.map((asset) => {
            const used = usage.get(asset.id) ?? 0;
            return (
              <li key={asset.id} className="flex flex-col border-2 border-border-default bg-surface">
                <div className="flex aspect-[4/3] items-center justify-center overflow-hidden border-b-2 border-border-default bg-bg">
                  {asset.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element -- private Datei, kein Bild-Optimizer
                    <img
                      src={mediaUrl(asset.id)}
                      alt={asset.altText ?? ""}
                      loading="lazy"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span
                      aria-hidden="true"
                      className="font-mono text-xs uppercase tracking-[0.08em] text-text-secondary"
                    >
                      {asset.mimeType === "application/pdf" ? "PDF" : "Text"}
                    </span>
                  )}
                </div>
                <div className="flex flex-1 flex-col gap-1 p-3">
                  {trash ? (
                    <span className="truncate font-medium">{asset.title}</span>
                  ) : (
                    <Link
                      href={`/app/media/${asset.id}`}
                      className="truncate font-medium hover:underline hover:decoration-accent"
                    >
                      {asset.title}
                    </Link>
                  )}
                  <Meta>
                    {formatBytes(asset.sizeBytes)}
                    {asset.width ? ` · ${asset.width}×${asset.height}` : ""}
                    {used > 0 ? ` · in ${used} Report${used === 1 ? "" : "s"}` : ""}
                  </Meta>
                  {asset.kind === "image" && !asset.altText ? (
                    <span className="font-mono text-[11px] text-danger">Bildbeschreibung fehlt</span>
                  ) : null}
                  {trash ? (
                    <form action={restoreMediaAction} className="mt-2">
                      <input type="hidden" name="mediaId" value={asset.id} />
                      <button
                        type="submit"
                        className="h-8 border-2 border-border-strong px-3 text-[13px] hover:bg-hover-surface"
                      >
                        Wiederherstellen
                      </button>
                    </form>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
