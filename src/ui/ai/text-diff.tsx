/**
 * Wortweiser Vergleich (LCS) für Vorschläge – zeigt Entferntes durchgestrichen, Neues hervorgehoben.
 * Für lange Texte fällt er auf „vorher/nachher“ ohne Markierung zurück (Rechenaufwand begrenzt).
 */
type Part = { type: "same" | "del" | "ins"; text: string };

export function diffWords(before: string, after: string): Part[] | null {
  const a = before.split(/(\s+)/).filter(Boolean);
  const b = after.split(/(\s+)/).filter(Boolean);
  if (a.length * b.length > 250_000) return null;
  const dp = Array.from({ length: a.length + 1 }, () => new Uint16Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const parts: Part[] = [];
  const push = (type: Part["type"], text: string) => {
    const last = parts[parts.length - 1];
    if (last && last.type === type) last.text += text;
    else parts.push({ type, text });
  };
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      push("same", a[i]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) push("del", a[i++]);
    else push("ins", b[j++]);
  }
  while (i < a.length) push("del", a[i++]);
  while (j < b.length) push("ins", b[j++]);
  return parts;
}

export function TextDiff({ before, after }: { before: string; after: string }) {
  const parts = diffWords(before, after);
  if (!parts) {
    return (
      <div className="flex flex-col gap-1 text-sm">
        <p className="text-text-secondary line-through">{before}</p>
        <p>{after}</p>
      </div>
    );
  }
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, k) =>
        part.type === "same" ? (
          <span key={k}>{part.text}</span>
        ) : part.type === "del" ? (
          <del key={k} className="bg-danger/10 text-text-secondary">
            <span className="sr-only">[entfernt: </span>
            {part.text}
            <span className="sr-only">]</span>
          </del>
        ) : (
          <ins key={k} className="bg-accent/15 no-underline">
            <span className="sr-only">[neu: </span>
            {part.text}
            <span className="sr-only">]</span>
          </ins>
        ),
      )}
    </p>
  );
}
