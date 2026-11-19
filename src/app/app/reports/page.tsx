import type { Metadata } from "next";
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { requireOwner } from "@/modules/auth/session";
import { listFilterSchema, listReports, listReportTypes } from "@/modules/reports/service";
import { Badge, Meta } from "@/ui/card";
import { PageHeader } from "@/ui/workspace-shell";

export const metadata: Metadata = { title: "Reports" };

const dateFormat = new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" });
const control =
  "h-10 border-2 border-border-default bg-bg px-3 text-sm hover:border-border-strong focus-visible:border-accent focus-visible:outline-none";

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { actor } = await requireOwner();
  const raw = await searchParams;
  const filter = listFilterSchema.parse({
    q: typeof raw.q === "string" && raw.q ? raw.q : undefined,
    type: typeof raw.type === "string" && raw.type ? raw.type : undefined,
    status: typeof raw.status === "string" && raw.status ? raw.status : undefined,
  });
  const db = getDb();
  const [reports, types] = await Promise.all([listReports(db, actor, filter), listReportTypes(db)]);
  const filtered = Boolean(filter.q || filter.type || filter.status);

  return (
    <>
      <PageHeader
        title="Reports"
        meta={<Meta>Dokumentieren</Meta>}
        actions={
          <>
            <Link
              href="/app/reports/trash"
              className="inline-flex h-10 items-center px-3 text-sm text-text-secondary hover:text-text-primary"
            >
              Papierkorb
            </Link>
            <Link
              href="/app/reports/new"
              className="inline-flex h-10 items-center border-2 border-accent bg-accent px-4 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Neuer Report
            </Link>
          </>
        }
      />

      <form role="search" className="mb-8 flex flex-wrap gap-3" action="/app/reports">
        <input
          name="q"
          type="search"
          defaultValue={filter.q}
          placeholder="Volltextsuche …"
          aria-label="Reports durchsuchen"
          className={`${control} min-w-56 flex-1`}
        />
        <select name="type" defaultValue={filter.type ?? ""} aria-label="Typ" className={control}>
          <option value="">Alle Typen</option>
          {types.map((t) => (
            <option key={t.key} value={t.key}>
              {t.name}
            </option>
          ))}
        </select>
        <select name="status" defaultValue={filter.status ?? ""} aria-label="Status" className={control}>
          <option value="">Alle Status</option>
          <option value="draft">Entwurf</option>
          <option value="final">Abgeschlossen</option>
        </select>
        <button type="submit" className="h-10 border-2 border-border-strong px-4 text-sm hover:bg-hover-surface">
          Filtern
        </button>
      </form>

      {reports.length === 0 ? (
        <div className="border-2 border-dashed border-border-default px-6 py-12 text-center">
          <p className="text-text-secondary">
            {filtered ? "Keine Reports passen zu diesen Filtern." : "Noch keine Reports."}
          </p>
          {!filtered ? (
            <Link
              href="/app/reports/new"
              className="mt-4 inline-block text-text-primary underline decoration-accent underline-offset-4"
            >
              Ersten Report anlegen
            </Link>
          ) : null}
        </div>
      ) : (
        <ul className="divide-y divide-line-subtle border-y border-line-subtle" data-testid="report-list">
          {reports.map((r) => (
            <li key={r.id}>
              <Link
                href={`/app/reports/${r.id}`}
                className="flex flex-wrap items-center justify-between gap-3 px-2 py-4 transition-colors hover:bg-hover-surface"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="truncate font-medium">{r.title}</span>
                  <Meta>
                    {r.typeName} · geändert {dateFormat.format(r.updatedAt)}
                  </Meta>
                </span>
                <Badge tone={r.status === "final" ? "accent" : "default"}>
                  {r.status === "final" ? "Abgeschlossen" : "Entwurf"}
                </Badge>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
