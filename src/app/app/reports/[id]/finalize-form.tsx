"use client";

import { useActionState } from "react";
import { Button } from "@/ui/button";
import { finalizeReportAction, type FinalizeState } from "../actions";

export function FinalizeForm({ reportId, labels }: { reportId: string; labels: Record<string, string> }) {
  const [state, action, pending] = useActionState<FinalizeState, FormData>(finalizeReportAction, {});
  const missing = Object.keys(state.fieldErrors ?? {}).map(
    (key) => labels[key.replace("structuredFields.", "")] ?? key,
  );

  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <input type="hidden" name="reportId" value={reportId} />
      <Button type="submit" variant="secondary" size="sm" disabled={pending}>
        Abschließen
      </Button>
      {missing.length > 0 ? (
        <p role="alert" className="max-w-xs text-right font-mono text-xs text-danger">
          Zum Abschließen fehlen: {missing.join(", ")}
        </p>
      ) : null}
    </form>
  );
}
