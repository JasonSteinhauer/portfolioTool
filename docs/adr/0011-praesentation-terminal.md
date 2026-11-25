# ADR 0011 – Präsentationsschicht „Terminal“, Betrachter-Vorschau, vollständige Berichte, KI-Rückfragen

- Status: angenommen (25.11.2026)

## Kontext

Zwei Ebenen: schlichte Rohdaten im Arbeitsbereich, darüber eine gestaltete, professionelle Präsentation für
Empfänger. Gewählt wurde aus drei Entwürfen die Stilrichtung A („Terminal“: dunkles Raster, Mono-Akzente,
Magenta). Wünsche: vor dem Freigeben genau sehen, was Empfänger sehen; ganze Berichte gestaltet teilen;
verknüpfte Berichte; Favoriten als Vorauswahl; KI fragt nach, wenn etwas fehlt.

## Entscheidungen

- **Eine Präsentationsschicht für Viewer und Vorschau** (`src/ui/viewer/*`): `/p` (Empfänger) und `/vorschau`
  (nur Owner) rendern dieselben Bausteine – die Vorschau ist damit exakt das, was Empfänger sehen.
  `/vorschau` zeigt die Startseite eines Showcase-Links (nur Freigegebenes) und jede Seite wahlweise als
  Entwurf oder freigegebenen Stand; eingefrorene Bilder liefert dafür `/api/media/published/[id]` (Owner).
- **Animationen nur per CSS-Klassen** (`pv-*` in `globals.css`), da die CSP keine Inline-Styles erlaubt:
  Einblenden beim Laden, scroll-gebundenes Einblenden und Lesefortschritt (`animation-timeline`, mit Fallback),
  Tipp-Effekt, Scan-Linie. „Bewegung reduzieren“ schaltet alle ab. Barrierefreiheitstests messen im Endzustand.
- **Vollständiger Bericht = Seitenkomponente `fullReport`**: Eckdaten, Schlagworte, Textfelder als Abschnitte und
  die Inhaltsblöcke des Reports – ohne Anhänge (bleiben privat). Bilder werden bei der Freigabe wie Galerien
  eingefroren. „Als Bericht teilen“ legt die Seite an bzw. ergänzt eine bestehende; „Aus Report aktualisieren“
  übernimmt den aktuellen Stand in den Entwurf.
- **Verknüpfungen im Snapshot**: Titel, Richtung und ggf. Seite des Ziels werden bei der Freigabe eingefroren
  („intern/sensibel“ wird ausgelassen). Klickbar ist ein Eintrag nur, wenn die Zielseite über DENSELBEN Link
  sichtbar ist – sonst erscheint nur der Titel („nicht freigegeben“).
- **Favoriten als Vorauswahl**: freigegebene Favoriten außerhalb des Showcase werden vorgeschlagen; aufgenommen wird
  nur, was der Owner hinzufügt.
- **KI-Rückfragen nur bei Bedarf**: Die KI-Fassung darf statt Vorschlägen bis zu 3 Rückfragen stellen, wenn
  Wesentliches fehlt oder unklar ist. Antworten gehen geschwärzt nur in diesen Auftrag (nicht gespeichert);
  danach fragt sie nicht erneut. Korrektur (proofread) fragt nie.
