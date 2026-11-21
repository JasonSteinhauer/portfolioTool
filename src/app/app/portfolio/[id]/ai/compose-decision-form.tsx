"use client";

import { useActionState } from "react";
import { decideCompositionAction, type AiActionState } from "@/app/app/ai/actions";
import { Button } from "@/ui/button";

export function ComposeDecisionForm({ pageId, proposalId }: { pageId: string; proposalId: string }) {
  const [state, action, pending] = useActionState<AiActionState, FormData>(decideCompositionAction, {});
  return (
    <form action={action} className="flex flex-col gap-3">
      <input type="hidden" name="pageId" value={pageId} />
      <input type="hidden" name="proposalId" value={proposalId} />
      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="intent" value="accept" disabled={pending}>
          In den Entwurf übernehmen
        </Button>
        <Button type="submit" name="intent" value="reject" variant="secondary" disabled={pending}>
          Verwerfen
        </Button>
      </div>
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
