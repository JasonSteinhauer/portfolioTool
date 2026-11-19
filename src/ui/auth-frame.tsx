import type { ReactNode } from "react";
import { Meta } from "./card";

/** Rahmen für Login- und Onboarding-Seiten: reduziert, technisch, ohne Navigation. */
export function AuthFrame({
  step,
  title,
  intro,
  children,
}: {
  step: string;
  title: string;
  intro?: ReactNode;
  children: ReactNode;
}) {
  return (
    <main id="main" className="flex min-h-dvh items-center justify-center px-6 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-2">
          <span aria-hidden="true" className="block size-3 bg-accent" />
          <span className="font-heading text-[15px] font-semibold tracking-tight">dev.portfolio</span>
        </div>
        <div className="border-2 border-border-default bg-surface p-8 shadow-card">
          <Meta>{step}</Meta>
          <h1 className="mt-2 text-2xl font-semibold">{title}</h1>
          {intro ? <div className="mt-3 text-sm text-text-secondary">{intro}</div> : null}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="border-l-2 border-danger bg-danger/10 px-3 py-2 text-sm text-text-primary">
      {message}
    </p>
  );
}
