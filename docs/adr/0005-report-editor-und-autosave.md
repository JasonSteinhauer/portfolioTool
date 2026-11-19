# ADR 0005 – Report-Editor, Speichern und Versionen

- Status: angenommen (19.11.2026), Speicherverhalten nach Review des Owners geändert (19.11.2026)

## Entscheidung

- **Hybrider Editor:** Formularfelder je Report-Typ (aus `report_types.field_schema`) plus eine Blockliste.
  Blöcke: Text (TipTap, nur erlaubte Knoten/Marks), Überschrift, Code, Link, Erkenntnis. Bild/Anhang folgen
  mit der Mediathek (Inkrement 3). Sortieren per Schaltflächen (↑/↓) statt Drag & Drop – tastaturbedienbar.
- **Speichern beim Verlassen** (Entscheidung des Owners nach Review, statt Autosave bei jeder Änderung):
  beim Tab-Wechsel/Minimieren (`visibilitychange`), beim Schließen (`pagehide`), beim Wechsel in einen
  anderen Bereich der App, mit „Fertig“, Strg+S und „Speichern“. Damit das auch beim Schließen ankommt,
  speichert der Editor per `fetch(…, { keepalive: true })` über `POST /api/reports/[id]/save` (nur
  Same-Origin, nur JSON, Owner-Session). Browser begrenzen keepalive auf 64 KB – größere Reports werden
  beim Tab-Wechsel normal gespeichert; beim harten Schließen eines sehr großen Reports kann der letzte
  Stand fehlen.
- **Konflikte:** Jede Speicherung trägt die Revision, auf der sie basiert. Weicht sie ab, wird **nicht**
  überschrieben: Der Editor meldet einen Konflikt und pausiert (zweiter Tab, zweites Gerät). Eine
  Verlassen-Warnung erscheint nur, wenn sich Änderungen nicht speichern ließen (Konflikt, Fehler, ungültig).
- **Validierung** immer serverseitig: Blockdokument (Zod, strikt), Formularfelder je Typ im Modus
  „Entwurf“ (Pflichtfelder optional). „Abschließen“ prüft im Modus „final“. Fehlen später Pflichtfelder,
  wird der Report automatisch wieder zum Entwurf.
- **Versionen:** beim manuellen Speichern, beim Abschließen und automatisch höchstens alle 10 Minuten.
  Wiederherstellen sichert vorher den aktuellen Stand – Wiederherstellen ist damit selbst umkehrbar.
- **Löschen** verschiebt in den Papierkorb (Soft Delete) inkl. Wiederherstellung. Endgültiges Löschen folgt
  mit der erweiterten Verwaltung.
- **Einstufung:** `internal_sensitive` setzt `ai_allowed` serverseitig immer auf `false`.
- **Strikte CSP bleibt:** TipTap injiziert sein Basis-CSS nicht (`injectCSS: false`); die nötigen Regeln
  stehen in `globals.css`.

## Konsequenzen

- Zwei gleichzeitig offene Editoren desselben Reports können nicht beide speichern – gewollt (kein stiller
  Datenverlust). Der zweite Tab muss neu laden.
- Code wird in Inkrement 2 ohne Syntax-Hervorhebung angezeigt (Monospace). Hervorhebung kommt mit der
  Portfolio-Darstellung, serverseitig und ohne `innerHTML`.
