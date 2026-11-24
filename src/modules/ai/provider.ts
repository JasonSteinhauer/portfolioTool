import type { AiConfig } from "./config";
import { Redactor } from "./redact";

/**
 * Provider-Port: die Fachlogik kennt nur `complete()`. Adapter: Anthropic (Standard) und ein
 * deterministischer Test-Provider. Weitere Anbieter (z. B. Mistral) brauchen nur einen Adapter.
 */
export type AiRequest = {
  /** Art des Auftrags – nur der Test-Provider wertet das aus. */
  kind: string;
  system: string;
  user: string;
  maxOutputTokens: number;
};

export type AiResponse = { text: string; inputTokens: number; outputTokens: number };

export interface AiProvider {
  readonly name: string;
  readonly model: string;
  complete(request: AiRequest): Promise<AiResponse>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

type Fetch = typeof fetch;

export class AnthropicProvider implements AiProvider {
  readonly name = "anthropic";

  constructor(
    private readonly apiKey: string,
    readonly model: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly timeoutMs = 60_000,
  ) {}

  async complete(request: AiRequest): Promise<AiResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: request.maxOutputTokens,
          system: request.system,
          messages: [{ role: "user", content: request.user }],
        }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new AiProviderError("KI-Dienst nicht erreichbar.", true);
    }

    if (!response.ok) {
      // Nie den Antworttext des Anbieters durchreichen (könnte Eingaben spiegeln). Er wird nur auf
      // bekannte Ursachen geprüft und in eine eigene, feste Meldung übersetzt.
      const body = (await response.json().catch(() => null)) as { error?: { type?: string; message?: string } } | null;
      const errorType = body?.error?.type ?? "unbekannt";
      const providerText = (body?.error?.message ?? "").toLowerCase();
      const retryable = response.status === 429 || response.status >= 500;
      const message = /credit[ _]balance|purchase credits|plans (&|and) billing/.test(providerText)
        ? "Kein Guthaben im Anthropic-Konto. Unter console.anthropic.com → Billing Guthaben aufladen."
        : response.status === 401 || response.status === 403 || errorType === "authentication_error"
          ? "KI-Zugang ungültig (API-Schlüssel prüfen)."
          : response.status === 404 || errorType === "not_found_error"
            ? "Das eingestellte KI-Modell ist nicht verfügbar (AI_MODEL prüfen)."
            : response.status === 429
              ? "KI-Dienst ausgelastet oder Ausgabenlimit erreicht – bitte später erneut."
              : response.status === 529 || errorType === "overloaded_error"
                ? "KI-Dienst ist überlastet – bitte später erneut."
                : `KI-Dienst antwortet mit Fehler ${response.status} (${errorType}).`;
      // Nur für die Server-Logs (nie in der Oberfläche): Anbieter-Text gekürzt und geschwärzt,
      // damit Konfigurationsfehler diagnostizierbar sind.
      const logText = new Redactor().redact((body?.error?.message ?? "").slice(0, 300)).replace(/\s+/g, " ");
      console.warn(`[ai] anthropic ${response.status} ${errorType}: ${logText}`);
      throw new AiProviderError(message, retryable);
    }

    const data = (await response.json().catch(() => null)) as {
      content?: { type: string; text?: string }[];
      usage?: { input_tokens?: number; output_tokens?: number };
      stop_reason?: string;
    } | null;
    const text = (data?.content ?? [])
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    if (!data || !text) throw new AiProviderError("Leere Antwort vom KI-Dienst.", true);
    return {
      text,
      inputTokens: Math.max(0, Number(data.usage?.input_tokens ?? 0)),
      outputTokens: Math.max(0, Number(data.usage?.output_tokens ?? 0)),
    };
  }
}

/** Deterministischer Provider für Tests und lokale Entwicklung – erzeugt Antworten ohne Netzwerk. */
export class FakeProvider implements AiProvider {
  readonly name = "fake";
  readonly model = "fake-deterministic";
  readonly calls: AiRequest[] = [];

  constructor(private readonly responder: (request: AiRequest) => string = defaultFakeResponder) {}

  async complete(request: AiRequest): Promise<AiResponse> {
    this.calls.push(request);
    const text = this.responder(request);
    return {
      text,
      inputTokens: Math.ceil((request.system.length + request.user.length) / 4),
      outputTokens: Math.ceil(text.length / 4),
    };
  }
}

/** Liest den JSON-Block zwischen <daten> … </daten> aus dem Prompt. */
function extractData(user: string): unknown {
  const match = /<daten>\s*([\s\S]*?)\s*<\/daten>/.exec(user);
  return match ? JSON.parse(match[1]) : null;
}

/** Leichte, nachvollziehbare „Korrekturen“: Leerraum, Großschreibung am Anfang, Satzzeichen. */
export function fakePolish(text: string): string {
  let out = text.replace(/\s+/g, " ").trim();
  if (!out) return out;
  out = out.charAt(0).toUpperCase() + out.slice(1);
  out = out.replace(/\bdas das\b/gi, "dass das").replace(/\bseit dem\b/g, "seitdem");
  if (out.length > 30 && !/[.!?:)]$/.test(out)) out += ".";
  return out;
}

export function defaultFakeResponder(request: AiRequest): string {
  const data = extractData(request.user) as Record<string, unknown> | null;
  if (request.kind === "report.language") {
    const units = (data?.texte ?? []) as { key: string; text: string }[];
    return JSON.stringify({
      vorschlaege: units
        .map((u) => ({ key: u.key, text: fakePolish(u.text), begruendung: "Rechtschreibung und Zeichensetzung" }))
        .filter((s, i) => s.text !== units[i].text),
    });
  }
  if (request.kind === "page.compose") {
    const quellen = (data?.quellen ?? []) as { id: string; art: string; label: string; text: string }[];
    const title = quellen.find((q) => q.id === "field:title");
    const question = quellen.find((q) => q.id === "field:question");
    const fields = quellen.filter((q) => q.art === "feld" && q.id !== "field:title").slice(0, 4);
    const insights = quellen.filter((q) => q.art === "erkenntnis").slice(0, 3);
    return JSON.stringify({
      hero: {
        eyebrow: "Fallstudie",
        titel: title ? `${title.text} (KI-Entwurf)` : "Fallstudie (KI-Entwurf)",
        zusammenfassung: question?.text.slice(0, 300) ?? "",
        quellen: [title?.id, question?.id].filter(Boolean),
      },
      ueberblick: {
        text: fields
          .map((q) => q.text)
          .join(" ")
          .slice(0, 400),
        quellen: fields.map((q) => q.id),
        fakten: fields.map((q) => ({ label: q.label.slice(0, 60), wert: q.text.slice(0, 200), quellen: [q.id] })),
      },
      ergebnisse: insights
        .slice(0, 2)
        .map((q) => ({ titel: q.label.slice(0, 120) || "Ergebnis", text: q.text.slice(0, 300), quellen: [q.id] })),
      erkenntnisse: [
        ...insights.map((q) => ({
          art: "finding",
          titel: q.label || "Erkenntnis",
          text: q.text.slice(0, 500),
          quellen: [q.id],
        })),
        // Absichtlich unbelegt: muss bei der Validierung verworfen werden.
        {
          art: "insight",
          titel: "Erfundene Aussage",
          text: "Diese Aussage hat keine Quelle.",
          quellen: ["block:blk_gibtesnicht0"],
        },
      ],
    });
  }
  return "{}";
}

export function createProvider(config: AiConfig): AiProvider | null {
  if (config.provider === "anthropic") return new AnthropicProvider(config.apiKey!, config.model);
  if (config.provider === "fake") return new FakeProvider();
  return null;
}
