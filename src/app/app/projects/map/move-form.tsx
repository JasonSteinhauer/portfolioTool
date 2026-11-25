"use client";

import { useActionState } from "react";
import { Button } from "@/ui/button";
import { moveNodeAction, type MoveNodeState } from "../actions";

const select =
  "h-10 w-full min-w-0 border-2 border-border-default bg-bg px-3 text-sm hover:border-border-strong focus-visible:border-accent focus-visible:outline-none";

/** Verschieben ohne Ziehen (Tastatur, Touch) – gleichwertige Alternative zu Drag & Drop. */
export function MoveForm({
  kind,
  nodeId,
  title,
  currentTargetId,
  options,
}: {
  kind: "report" | "project";
  nodeId: string;
  title: string;
  currentTargetId: string | null;
  options: { id: string; title: string; depth: number }[];
}) {
  const [state, submit, pending] = useActionState<MoveNodeState, FormData>(moveNodeAction, {});
  return (
    <form action={submit} className="flex flex-col gap-2 border-t border-line-subtle pt-4" data-testid="map-move-form">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="nodeId" value={nodeId} />
      <input type="hidden" name="doneMessage" value={`„${title}“ verschoben.`} />
      <label htmlFor="move-target" className="text-xs text-text-secondary">
        {kind === "report" ? "Verschieben in Projekt" : "Unterordnen unter"}
      </label>
      <select id="move-target" name="targetId" defaultValue={currentTargetId ?? ""} className={select}>
        <option value="">{kind === "report" ? "Ohne Projekt" : "– oberste Ebene –"}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {"— ".repeat(o.depth - 1)}
            {o.title}
          </option>
        ))}
      </select>
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        Verschieben
      </Button>
      <p role="status" className="text-xs">
        {state.error ? <span className="text-danger">{state.error}</span> : state.ok ? state.message : ""}
      </p>
    </form>
  );
}
