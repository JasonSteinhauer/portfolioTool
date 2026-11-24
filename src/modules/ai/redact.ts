/**
 * Datensparsamkeit vor jedem KI-Aufruf: E-Mail-Adressen, IP-Adressen und typische Geheimnisse
 * (API-Keys, Tokens, Passwörter) werden durch Platzhalter ersetzt. Nach der Antwort werden nur
 * E-Mail-/IP-Platzhalter zurückgesetzt – Geheimnisse kommen nie zurück in einen Vorschlag.
 *
 * Ein Redaktor gilt für einen ganzen Auftrag, damit gleiche Werte gleiche Platzhalter bekommen.
 */
type Kind = "E-MAIL" | "IP" | "GEHEIMNIS";

const PATTERNS: { kind: Kind; regex: RegExp }[] = [
  // Geheimnisse zuerst (können E-Mail-/IP-ähnliche Teile enthalten)
  {
    kind: "GEHEIMNIS",
    regex:
      /\b(?:sk-[A-Za-z0-9_-]{16,}|sk-ant-[A-Za-z0-9_-]{16,}|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|xox[abpr]-[A-Za-z0-9-]{10,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})\b/g,
  },
  { kind: "GEHEIMNIS", regex: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { kind: "GEHEIMNIS", regex: /\b(?:Bearer|Basic)\s+[A-Za-z0-9._~+/=-]{12,}/g },
  {
    kind: "GEHEIMNIS",
    regex: /\b(?:password|passwort|passwd|pwd|secret|token|api[_-]?key)\s*[:=]\s*["']?[^\s"',;]{4,}/gi,
  },
  { kind: "E-MAIL", regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: "IP", regex: /\b(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)\b/g },
  { kind: "IP", regex: /\b(?:[0-9a-f]{1,4}:){7}[0-9a-f]{1,4}\b/gi },
];

export class Redactor {
  private readonly byValue = new Map<string, string>();
  private readonly byPlaceholder = new Map<string, { kind: Kind; value: string }>();
  private readonly counters: Record<Kind, number> = { "E-MAIL": 0, IP: 0, GEHEIMNIS: 0 };

  redact(text: string): string {
    let out = text;
    for (const { kind, regex } of PATTERNS) {
      out = out.replace(regex, (match) => {
        if (/^\[(E-MAIL|IP|GEHEIMNIS)-\d+\]$/.test(match)) return match;
        const existing = this.byValue.get(match);
        if (existing) return existing;
        const placeholder = `[${kind}-${++this.counters[kind]}]`;
        this.byValue.set(match, placeholder);
        this.byPlaceholder.set(placeholder, { kind, value: match });
        return placeholder;
      });
    }
    return out;
  }

  /** Setzt E-Mail-/IP-Platzhalter zurück. Geheimnis-Platzhalter bleiben stehen. */
  restore(text: string): string {
    return text.replace(/\[(E-MAIL|IP|GEHEIMNIS)-\d+\]/g, (placeholder) => {
      const entry = this.byPlaceholder.get(placeholder);
      return entry && entry.kind !== "GEHEIMNIS" ? entry.value : placeholder;
    });
  }

  /** Anzahl ersetzter Werte je Art – für Transparenz in der Oberfläche/Audit (ohne Werte). */
  summary(): Record<Kind, number> {
    return { ...this.counters };
  }

  hasSecrets(text: string): boolean {
    return /\[GEHEIMNIS-\d+\]/.test(text);
  }
}
