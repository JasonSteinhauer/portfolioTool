import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { getMedia, listMediaUsage, MediaNotFoundError } from "@/modules/media/service";
import { Meta } from "@/ui/card";
import { formatBytes, mediaUrl } from "@/ui/media/upload";
import { PageHeader } from "@/ui/workspace-shell";
import { MediaDetailForms } from "./media-detail-forms";

export const metadata: Metadata = { title: "Datei" };

export default async function MediaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireOwner();
  const { id } = await params;
  const db = getDb();
  let asset;
  try {
    asset = await getMedia(db, actor, id);
  } catch (error) {
    if (error instanceof MediaNotFoundError) notFound();
    throw error;
  }
  const usage = await listMediaUsage(db, actor, id);

  return (
    <>
      <PageHeader
        title={asset.title ?? "Datei"}
        meta={
          <Meta>
            <Link href="/app/media" className="hover:text-text-primary">
              ← Mediathek
            </Link>
          </Meta>
        }
      />
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-h-64 items-center justify-center border-2 border-border-default bg-bg p-4">
          {asset.kind === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- private Datei, kein Bild-Optimizer
            <img src={mediaUrl(asset.id)} alt={asset.altText ?? ""} className="max-h-[70vh] w-auto max-w-full" />
          ) : (
            <a
              href={`${mediaUrl(asset.id)}?download`}
              className="font-medium underline decoration-accent underline-offset-4"
            >
              {asset.originalFilename} herunterladen
            </a>
          )}
        </div>
        <div className="flex flex-col gap-8">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            <dt className="text-text-secondary">Datei</dt>
            <dd className="truncate">{asset.originalFilename}</dd>
            <dt className="text-text-secondary">Typ</dt>
            <dd>{asset.mimeType}</dd>
            <dt className="text-text-secondary">Größe</dt>
            <dd>
              {formatBytes(asset.sizeBytes)}
              {asset.width ? ` · ${asset.width}×${asset.height} px` : ""}
            </dd>
          </dl>
          <MediaDetailForms
            mediaId={asset.id}
            isImage={asset.kind === "image"}
            title={asset.title ?? ""}
            altText={asset.altText ?? ""}
          />
          <section aria-labelledby="usage">
            <h2 id="usage" className="mb-2 text-sm font-semibold">
              Verwendet in
            </h2>
            {usage.length === 0 ? (
              <p className="text-sm text-text-secondary">Noch in keinem Report.</p>
            ) : (
              <ul className="flex flex-col gap-1 text-sm" data-testid="media-usage">
                {usage.map((r) => (
                  <li key={r.id}>
                    <Link href={`/app/reports/${r.id}`} className="hover:underline hover:decoration-accent">
                      {r.title}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}
