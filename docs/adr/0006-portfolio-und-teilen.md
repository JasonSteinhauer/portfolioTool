# ADR 0006 – Portfolio-Seiten, Freigabe und private Links

- Status: angenommen (19.11.2026)

## Kontext

Reports bleiben privat. Präsentiert wird nur, was der Owner ausdrücklich freigibt – und nur Personen, denen
er einen Link schickt. Die Seite darf sich nach der Freigabe nicht „von selbst“ ändern, wenn Report oder
Entwurf weiterbearbeitet werden.

## Entscheidung

- **Seiten sind Konfiguration, kein HTML:** eine Zod-validierte Liste fester Komponenten (Hero, Überblick,
  Ergebnisse, Code, Erkenntnisse) mit `sourceBlockIds` als Quellverweis. Gerendert wird nur über eigene
  Komponenten, nie per `innerHTML`.
- **Seite aus Report** wird deterministisch ohne KI vorbefüllt – nur aus vorhandenen Angaben und Blöcken.
  Eine Seite pro Report; der Owner überarbeitet sie im Editor mit Live-Vorschau.
- **Freigabe = Snapshot:** „Freigeben“ friert den Entwurf als neue Version in `published_snapshots` ein
  (Quellverweise werden entfernt). Betrachter sehen immer nur den aktuellen Snapshot. Blockiert ist die
  Freigabe bei Reports mit Einstufung `internal_sensitive` und bei Seiten ohne Hero.
- **Profil** (Über mich, Expertise, Kontakt) ist eine eigene Seite mit eigenem Snapshot.
- **Showcase:** geordnete Auswahl freigegebener Seiten. Favoriten markieren Reports/Seiten im Workspace.
  Collections (mehrere Auswahlen) folgen später; das Datenmodell ist vorhanden.
- **Freigabelinks:** Umfang „Showcase“ (Profil + Showcase) oder „eine Seite“, Ablauf 7/30/90 Tage oder
  unbegrenzt. Das Token (256 Bit) wird nur einmal angezeigt; gespeichert wird nur der SHA-256-Hash.
  Widerruf wirkt sofort, weil jeder Viewer-Request den Link neu prüft.
- **Token nicht in der URL halten:** `/s/<token>` prüft das Token (Rate-Limit pro IP), legt es in ein
  HttpOnly-Cookie mit `SameSite=Lax` und Pfad `/p` und leitet per 303 auf `/p` weiter. So steht es weder
  im Verlauf noch im Referer, und das Cookie wird nie an `/app` oder `/api` gesendet.
- **Isolation:** Der Viewer (`/p`, `/p/<slug>`) liest ausschließlich Snapshots des Link-Owners im
  Link-Umfang. Ungültig, abgelaufen, widerrufen oder außerhalb des Umfangs → 404 (keine Unterscheidung).
  Workspace und APIs verlangen weiterhin die Owner-Sitzung. Jede Viewer-Seite muss `getViewerLink()`
  aufrufen (per Test erzwungen). Viewer-Seiten sind `noindex`.

## Konsequenzen

- Änderungen werden erst mit der nächsten Freigabe sichtbar – das ist gewollt und im Editor angezeigt.
- Wer einen Link weiterleitet, gibt Zugriff weiter. Gegenmittel: Ablaufdatum, Zugriffszähler, Widerruf.
- Bilder in Seiten folgen mit der Mediathek (Inkrement 3); dafür gibt es `published_media`.
