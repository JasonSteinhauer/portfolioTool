import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageView } from "@/content/page-components/render";
import { getDb } from "@/lib/db/client";
import { getViewerPage } from "@/modules/sharing/service";
import { getViewerLink } from "@/modules/sharing/viewer";

export const metadata: Metadata = { title: "Fallstudie" };

/** Eine freigegebene Fallstudie – nur, wenn der Link sie umfasst und sie aktuell freigegeben ist. */
export default async function ViewerCaseStudy({ params }: { params: Promise<{ slug: string }> }) {
  const link = await getViewerLink();
  if (!link) notFound();
  const { slug } = await params;
  const page = await getViewerPage(getDb(), link, slug);
  if (!page) notFound();

  return (
    <article lang={page.snapshot.locale} className="flex flex-col gap-10">
      <Link
        href="/p"
        className="font-mono text-xs uppercase tracking-[0.08em] text-text-secondary hover:text-text-primary"
      >
        ← Übersicht
      </Link>
      <PageView config={page.snapshot.page} />
    </article>
  );
}
