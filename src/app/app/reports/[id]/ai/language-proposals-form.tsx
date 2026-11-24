"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import { decideLanguageAction, type AiActionState } from "@/app/app/ai/actions";
import type { ContentDocument } from "@/content/blocks/schema";
import { ReportDocument } from "@/content/report-document";
import { applyUnit } from "@/modules/ai/text-units";
import type { FieldDefinition } from "@/modules/reports/report-types";
import { TextDiff } from "@/ui/ai/text-diff";
import { Button } from "@/ui/button";

type Proposal = { id: string; key: string; label: string; before: string; after: string; reason: string };

export type ReportSnapshot = {
  typeName: string;
  title: string;
  fieldSchema: FieldDefinition[];
  structuredFields: Record<string, unknown>;
  content: ContentDocument;
  status: "draft" | "final" | "archived";
};

/**
 * Auswahl der KI-Vorschläge mit Live-Vorschau: rechts steht der gestaltete Bericht mit genau den
 * angehakten Änderungen (markiert). Übernommen wird erst mit „Ausgewählte übernehmen“.
 */
export function LanguageProposalsForm({
  reportId,
  proposals,
  report,
}: {
  reportId: string;
  proposals: Proposal[];
  report: ReportSnapshot;
}) {
  const [state, action, pending] = useActionState<AiActionState, FormData>(decideLanguageAction, {});
  const [selected, setSelected] = useState(() => new Set(proposals.map((p) => p.id)));

  const preview = useMemo(() => {
    let draft = { title: report.title, structuredFields: report.structuredFields, content: report.content };
    const changed = new Set<string>();
    for (const p of proposals) {
      if (!selected.has(p.id)) continue;
      const next = applyUnit(draft, p.key, p.after);
      if (next) {
        draft = next;
        changed.add(p.key.startsWith("block:") ? "content" : p.key);
      }
    }
    return { ...draft, changed };
  }, [proposals, selected, report]);

  if (state.notice) {
    return (
      <div role="status" className="flex flex-col gap-4">
        <p className="font-medium">Erledigt: {state.notice}.</p>
        <Link href={`/app/reports/${reportId}`} className="underline decoration-accent underline-offset-4">
          Zurück zum Report
        </Link>
      </div>
    );
  }

  if (proposals.length === 0) return <p className="text-text-secondary">Keine offenen Vorschläge.</p>;

  const toggle = (id: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  return (
    <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form action={action} className="flex min-w-0 flex-col gap-4">
        <input type="hidden" name="reportId" value={reportId} />
        <ul className="flex flex-col gap-3" data-testid="ai-proposals">
          {proposals.map((p) => (
            <li key={p.id} className="border-2 border-border-default bg-surface p-4">
              <input type="hidden" name="proposalId" value={p.id} />
              <label className="flex cursor-pointer gap-3">
                <input
                  type="checkbox"
                  name="accept"
                  value={p.id}
                  checked={selected.has(p.id)}
                  onChange={(e) => toggle(p.id, e.target.checked)}
                  className="mt-1 size-4 accent-[var(--accent)]"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-2">
                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
                    {p.label}
                    {p.reason ? ` · ${p.reason}` : ""}
                  </span>
                  <TextDiff before={p.before} after={p.after} />
                </span>
              </label>
            </li>
          ))}
        </ul>
        {state.error ? (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" name="intent" value="accept" disabled={pending}>
            Ausgewählte übernehmen
          </Button>
          <Button type="submit" name="intent" value="reject" variant="secondary" disabled={pending}>
            Alle verwerfen
          </Button>
        </div>
      </form>

      <aside
        aria-label="Vorschau mit ausgewählten Änderungen"
        tabIndex={0}
        className="min-w-0 border-2 border-border-default bg-surface p-6 xl:sticky xl:top-24 xl:max-h-[calc(100dvh-8rem)] xl:overflow-y-auto"
        data-testid="ai-preview"
      >
        <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.08em] text-text-secondary">
          Vorschau · {selected.size} von {proposals.length} Änderungen · markiert = geändert
        </p>
        <ReportDocument
          typeName={report.typeName}
          title={preview.title}
          fieldSchema={report.fieldSchema}
          structuredFields={preview.structuredFields}
          content={preview.content}
          status={report.status}
          highlight={preview.changed}
        />
      </aside>
    </div>
  );
}
