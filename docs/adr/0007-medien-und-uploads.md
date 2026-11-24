# ADR 0007 – Medien, Uploads und Auslieferung

- Status: angenommen (20.11.2026)

## Kontext

Screenshots sind der wichtigste Beleg in Reports und Fallstudien – und gleichzeitig die riskanteste
Eingabe: Bilder tragen Metadaten (Kamera, Software, teils GPS, Namen), Dateien können sich als etwas
anderes ausgeben, und ausgelieferte Dateien dürfen nie Skripte im Kontext der App ausführen.

## Entscheidung

- **Speicher-Port** (`src/lib/storage`): heute lokal (`MEDIA_STORAGE_DIR`, Standard `.data/media`), beim
  Deployment Cloudflare R2. Schlüssel sind inhaltsadressiert (`sha256/ab/<hash>`) und unveränderlich.
  Proton Drive ist als Live-Speicher ungeeignet (kein offizieller Drittanbieter-Zugang, Server bräuchte die
  Kontoschlüssel) und ist stattdessen für Backups vorgesehen.
- **Upload-Pipeline** (`src/modules/media/service.ts`):
  1. max. 10 MB, Typ per **Magic Bytes** (Dateiname/Content-Type zählen nicht)
  2. Bilder (PNG/JPEG/WebP) werden mit sharp **neu kodiert**: EXIF/GPS/Kamera entfernt, Ausrichtung
     angewandt, max. 3840 px, max. 50 MP Eingabe. Gespeichert und ausgeliefert wird nur das Ergebnis.
  3. PDFs ohne aktive Inhalte (JavaScript, Launch, eingebettete Dateien, XFA, Formular-Aktionen),
     Textdateien nur als gültiges UTF-8 mit erlaubter Endung. SVG/HTML werden abgelehnt.
  4. Erst dann wird gespeichert. Unvalidierte Bytes erreichen den Speicher nie („Quarantäne“ im Speicher
     des Prozesses statt in einem Ordner).
  - Deduplizierung pro Owner über den SHA-256 des bereinigten Inhalts.
- **Auslieferung** mit festem Content-Type, `nosniff`, eigener CSP `default-src 'none'; sandbox`,
  `Cross-Origin-Resource-Policy: same-origin`; Nicht-Bilder immer als Download; `Sec-Fetch-Site:
cross-site` → 403 (kein Hotlinking).
  - Workspace: `GET /api/media/<id>` nur mit Owner-Session.
  - Viewer: `GET /p/m/<id>` nur mit gültigem Link-Cookie und nur für Bilder des **aktuellen** Snapshots
    einer Seite im Link-Umfang.
- **Einfrieren bei der Freigabe:** Jedes Bild einer Seite bekommt eine `published_media`-Zeile mit neuer ID.
  Der Snapshot enthält nur diese IDs – Mediathek-IDs verlassen den Workspace nicht. Freigabe ist blockiert,
  solange ein Bild keine Bildbeschreibung hat oder nicht mehr in der Mediathek ist.
- **Löschen:** Papierkorb mit Wiederherstellung; solange ein Report die Datei verwendet, ist Löschen
  blockiert (Verwendungsnachweis). Dateien werden nie hart gelöscht, solange Snapshots sie referenzieren
  können – endgültiges Aufräumen folgt mit der erweiterten Verwaltung.

## Konsequenzen

- Die PDF-Prüfung ist eine Heuristik (komprimierte Objekt-Streams werden nicht entpackt). Der eigentliche
  Schutz ist die Auslieferung als Download mit Sandbox-CSP.
- Beim Wechsel auf R2 ändert sich nur der Adapter; Schlüssel und Datenmodell bleiben.
