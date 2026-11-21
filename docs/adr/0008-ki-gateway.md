# ADR 0008 – KI-Gateway, Vorschläge statt Änderungen

- Status: angenommen (21.11.2026)

## Kontext

Die KI soll beim Formulieren und beim Präsentieren helfen, ohne dass Inhalte unkontrolliert die App
verlassen, Kosten aus dem Ruder laufen oder erfundene Aussagen im Portfolio landen.

## Entscheidung

- **Standard aus:** `AI_PROVIDER=none`. Ohne Einrichtung verlässt kein Inhalt die App.
- **Provider-Port** (`src/modules/ai/provider.ts`): Anthropic-Adapter (Messages-API per `fetch`, Standard
  `claude-haiku-5-5`) und ein deterministischer Test-Provider (nur Tests/Entwicklung; in Produktion nur mit
  `AI_ALLOW_FAKE=1`). Weitere Anbieter brauchen nur einen Adapter.
- **Gateway** (`gateway.ts`) ist der einzige Weg zu einem Modell:
  - Monatsbudget (Standard 5 USD), konservative Vorab-Schätzung, Blockade bei Überschreitung
  - Rate-Limit (30 Aufträge/Stunde), Größenlimit (~40 000 Tokens, unter der 100 000-Token-Preisstufe)
  - jeder Auftrag in `ai_jobs` – nur Verweise und Zahlen (Tokens, Kosten), **keine Inhalte**
  - Antworten werden mit Zod validiert; ein zweiter Versuch bei ungültigem JSON, dann Abbruch
  - Fehlermeldungen des Anbieters werden nie durchgereicht (könnten Eingaben spiegeln)
- **Datensparsamkeit** (`redact.ts`): E-Mail- und IP-Adressen werden vor dem Senden durch Platzhalter
  ersetzt und danach wiederhergestellt. Texte mit Geheimnissen (API-Keys, Tokens, Passwörter, private
  Schlüssel) werden gar nicht erst gesendet bzw. nie zurückgeschrieben.
- **Sperren:** Reports ohne „KI erlauben“ und alle `internal_sensitive`-Reports sind serverseitig gesperrt.
- **Prompt-Injection:** Inhalte stehen als JSON zwischen `<daten>`-Markern und gelten laut Systemprompt als
  Daten. Wichtiger: Die Antwort kann nur Vorschläge für bekannte Schlüssel erzeugen – unbekannte Schlüssel,
  verlorene Platzhalter, starke Umformulierungen und unbelegte Aussagen werden verworfen.
- **Vorschläge statt Änderungen** (`ai_proposals`):
  - _Sprachvorschläge:_ je Texteinheit (Titel, Textfelder, Überschriften, Erkenntnisse, unformatierte
    Absätze) mit Wort-Diff; einzeln auswählbar. Übernommen wird nur, wenn der Text seit dem Auftrag
    unverändert ist; vorher und nachher werden als Version gesichert (`ai_accepted`).
  - _Seitenentwurf:_ Hero, Überblick, Ergebnisse, Erkenntnisse – jede Aussage mit Quell-IDs aus dem Report.
    Code und Bilder bleiben unangetastet. Übernahme nur, wenn die Seite seit dem Auftrag unverändert ist;
    veröffentlicht wird weiterhin erst mit „Freigeben“.
  - Ein neuer Auftrag macht offene Vorschläge desselben Ziels „überholt“.

## Konsequenzen

- Preise stehen als Env-Werte mit Stand Oktober 2026 (0,10 $/0,50 $ je Mio. Tokens) und müssen bei
  Preisänderungen angepasst werden; das Budget rechnet aufgerundet.
- Formatierte Absätze (fett, Links …) werden nicht sprachlich überarbeitet, um Formatierung nicht zu verlieren.
- Für den echten Betrieb braucht es einen Anthropic-API-Schlüssel (`ANTHROPIC_API_KEY`).
