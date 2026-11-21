"use client";

import Link from "next/link";
import { useActionState } from "react";
import { decideLanguageAction, type AiActionState } from "@/app/app/ai/actions";
import { TextDiff } from "@/ui/ai/text-diff";
import { Button } from "@/ui/button";

type Proposal = { id: string; label: string; before: string; after: string; reason: string };

export function LanguageProposalsForm({ reportId, proposals }: { reportId: string; proposals: Proposal[] }) {
  const [state, action, pending] = useActionState<AiActionState, FormData>(decideLanguageAction, {});

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

  return (
    <form action={action} className="flex flex-col gap-4">
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
                defaultChecked
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
  );
}
