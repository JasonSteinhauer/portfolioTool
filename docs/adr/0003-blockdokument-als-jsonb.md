# ADR 0003 – Report-Inhalt als validiertes JSONB-Blockdokument

- Status: angenommen (19.11.2026)

## Kontext

Die Spezifikation nennt `ContentBlock` als Entität. Reports brauchen Autosave, Versionierung mit
Wiederherstellung und Sortierung der Blöcke. Es darf kein ausführbares HTML gespeichert werden.

## Entscheidung

`ContentBlock` ist ein **Schematyp** (`src/content/blocks/schema.ts`), keine Tabelle. Ein Report speichert
`content` als JSONB `{ schemaVersion, blocks[] }`. Jeder Block hat eine stabile ID (`blk_…`).
Rich Text ist eingeschränktes TipTap/ProseMirror-JSON mit einer Allowlist (Absatz, Listen, fett, kursiv,
durchgestrichen, Code, Link). Alle Objekte sind `strict` – unbekannte Felder werden abgelehnt.

Abgeleitet beim Speichern (serverseitig):

- `plain_text` → generierte `search_vector`-Spalte (Volltextsuche, GIN-Index)
- `report_media` (Report ↔ Medium pro Block) → referenzielle Integrität und Autorisierung

## Begründung

Atomares Speichern (Autosave = eine Schreiboperation), Versionen als vollständige Snapshots,
Reihenfolge implizit im Array, Validierung an genau einer Stelle.

## Konsequenzen

- Abfragen auf einzelne Blöcke per SQL sind umständlich – bewusst in Kauf genommen.
- Inkompatible Schemaänderungen erfordern eine neue `schemaVersion` und eine Datenmigration.
