"use client";

import { useActionState } from "react";
import { answerQuestionsAction, type AiActionState } from "@/app/app/ai/actions";
import { Button } from "@/ui/button";
import { Field, Textarea } from "@/ui/field";

/** Rückfragen der KI vor der KI-Fassung – kurz beantworten oder überspringen. */
export function QuestionsForm({ reportId, questions }: { reportId: string; questions: string[] }) {
  const [state, submit, pending] = useActionState<AiActionState, FormData>(answerQuestionsAction, {});
  return (
    <form
      action={submit}
      className="flex max-w-2xl flex-col gap-5 border-2 border-accent bg-surface p-6"
      data-testid="ai-questions"
    >
      <div>
        <h2 className="text-lg font-semibold">Kurze Rückfragen der KI</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Damit die KI-Fassung nichts erfinden muss, fehlt noch etwas. Deine Antworten werden nur für diesen Auftrag
          genutzt (geschwärzt wie alle Daten) und nicht gespeichert – übernimm sie bei Bedarf selbst in den Report.
        </p>
      </div>
      <input type="hidden" name="reportId" value={reportId} />
      {questions.map((q, i) => (
        <div key={i}>
          <input type="hidden" name={`frage-${i}`} value={q} />
          <Field label={q}>
            {(f) => <Textarea {...f} name={`antwort-${i}`} maxLength={2000} className="min-h-20" />}
          </Field>
        </div>
      ))}
      {state.error ? (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" name="intent" value="answer" disabled={pending}>
          {pending ? "KI arbeitet …" : "Antworten senden & KI-Fassung erzeugen"}
        </Button>
        <Button type="submit" name="intent" value="skip" variant="ghost" disabled={pending}>
          Ohne Antworten fortfahren
        </Button>
      </div>
    </form>
  );
}
