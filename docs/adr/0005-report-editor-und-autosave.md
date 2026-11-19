# ADR 0005 – Report-Editor, Autosave und Versionen

- Status: angenommen (19.11.2026)

## Entscheidung

- **Hybrider Editor:** Formularfelder je Report-Typ (aus `report_types.field_schema`) plus eine Blockliste.
  Blöcke: Text (TipTap, nur erlaubte Knoten/Marks), Überschrift, Code, Link, Erkenntnis. Bild/Anhang folgen
  mit der Mediathek (Inkrement 3). Sortieren per Schaltflächen (↑/↓) statt Drag & Drop – tastaturbedienbar.
- **Autosave** 1,2 s nach der letzten Änderung über eine Server Action. Jede Speicherung trägt die
  Revision, auf der sie basiert. Weicht sie ab, wird **nicht** überschrieben: Der Editor meldet einen Konflikt
  und pausiert (zweiter Tab, zweites Gerät). Netzwerkfehler werden automatisch erneut versucht; beim
  Verlassen mit ungespeicherten Änderungen warnt der Browser.
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
