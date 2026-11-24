import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

const controlBase =
  "w-full border-2 border-border-default bg-bg px-3 text-sm text-text-primary placeholder:text-text-secondary/70 " +
  "transition-[border-color,box-shadow] duration-[var(--motion-fast)] ease-technical " +
  "hover:border-border-strong focus-visible:border-accent focus-visible:shadow-accent focus-visible:outline-none " +
  "aria-[invalid=true]:border-danger disabled:opacity-50";

type FieldProps = {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => ReactNode;
};

/** Label, Hinweis und Fehlermeldung – korrekt per id/aria verknüpft. */
export function Field({ label, hint, error, required, children }: FieldProps) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-[13px] font-medium text-text-primary">
        {label}
        {required ? (
          <span className="ml-1 text-accent-text" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint ? (
        <p id={hintId} className="text-xs text-text-secondary">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="font-mono text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(controlBase, "h-10", className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn(controlBase, "min-h-28 py-2 leading-relaxed", className)} {...props} />;
}
