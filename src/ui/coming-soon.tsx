import { Meta } from "./card";

/**
 * Ehrlicher Platzhalter für Bereiche, die in einem späteren Inkrement entstehen.
 * Bewusst ohne Attrappen-Funktionen (keine Buttons, die nichts tun).
 */
export function ComingSoon({ increment, what }: { increment: number; what: string }) {
  return (
    <div className="border-2 border-dashed border-border-default px-6 py-12">
      <Meta>Inkrement {increment}</Meta>
      <p className="mt-2 max-w-prose text-text-secondary">{what}</p>
    </div>
  );
}
