# ADR 0010 – Projekte, Report-Verknüpfungen und Karte

- Status: angenommen (25.11.2026)

## Kontext

Die Reiter „Projekte“, „Entwicklung“ und „KI-Assistent“ waren bis hier Platzhalter. Gewünscht ist zusätzlich,
Reports untereinander zu verknüpfen und die Hierarchie bildlich als Karte von oben nach unten zu sehen –
inklusive Zugehörigkeit zu Projekten.

## Entscheidungen

- **Ein Report gehört zu höchstens einem Projekt** (`reports.project_id`, bestehendes Schema). Projekt löschen
  löst die Reports nur aus dem Projekt, sie bleiben erhalten.
- **Verknüpfungen sind gerichtet** (`report_links`: `source` oben, `target` baut darauf auf) und bilden einen
  **Graphen ohne Zyklen**. Beim Anlegen prüft eine rekursive Abfrage, ob der umgekehrte Weg schon existiert;
  Selbstverknüpfung verhindert zusätzlich ein CHECK. Mehrere Eltern sind erlaubt.
- **Karte = Ebenen nach längstem Weg**: Projekte bilden Ebene 0, jeder Report liegt eine Ebene unter seinem
  tiefsten Eltern-Report. Innerhalb einer Ebene nach Projekt gruppiert und unter die Eltern gezogen
  (Baryzentrum), ohne Überlappung. Reine Funktion (`src/ui/map/layout.ts`), unit-getestet.
- **Darstellung ohne Inline-Styles**: Die Produktions-CSP erlaubt keine `style`-Attribute. Die Karte ist
  ein SVG; Knoten sind HTML-Links in `foreignObject` (Tastatur, Screenreader), positioniert nur über
  SVG-Attribute. Auswahl über `?selected=` (Server-Rendering, kein Client-JS nötig). Zusätzlich gibt es eine
  Textliste als Alternative.
- **Entwicklung qualitativ**: Kompetenzen werden durch Reports belegt (optional mit Notiz), Timeline aus Reports
  und Projekt-Start/-Ende. Keine Prozentwerte oder Punktzahlen.
- **KI-Assistent** bündelt offene Vorschläge aller Reports und Seiten, Status und Budget; gestartet wird die KI
  weiterhin im jeweiligen Report bzw. auf der Seite.
